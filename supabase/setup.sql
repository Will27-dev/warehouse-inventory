-- =====================================================================
-- Warehouse inventory: cloud setup (Supabase). Safe to read; run once.
-- Delivery trips (public.manifests) were created earlier.
-- =====================================================================

-- ---------- People: one profile per sign-in account ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  role text not null default 'user' check (role in ('owner', 'admin', 'user')),
  perms jsonb,                                   -- {"qty":true,...}; null = role default
  prefs jsonb not null default '{}'::jsonb,      -- nickname, bio, photo, dark mode
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Role / permission checks used by the security rules (match the app's permsOf()).
create or replace function public.app_role() returns text
  language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.has_perm(p text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when role = 'owner' then true
                when perms ? p then (perms ->> p)::boolean
                else role = 'admin' end
    from public.profiles where id = auth.uid()), false)
$$;

-- A new sign-in account gets a profile automatically (role "user").
create or replace function public.new_profile() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.new_profile();

-- People may edit their own nickname/bio/photo/dark mode; only managers change
-- roles, permissions, names and emails (and admins only for regular users).
create or replace function public.profiles_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare me text := public.app_role();
begin
  new.updated_at := now();
  if auth.uid() is null then return new; end if;              -- server-side function
  if me is distinct from 'owner' and me is distinct from 'admin' then
    new.role := old.role; new.perms := old.perms; new.name := old.name; new.email := old.email;
  elsif me = 'admin' and old.id <> auth.uid() and old.role <> 'user' then
    raise exception 'Admins can only change regular users';
  elsif me = 'admin' then
    new.role := old.role;                                       -- only the owner changes roles
  end if;
  if old.role = 'owner' then new.role := 'owner'; end if;       -- the owner stays owner
  if old.id <> auth.uid() then new.prefs := old.prefs; end if;  -- prefs are personal
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

drop policy if exists "staff read people" on public.profiles;
create policy "staff read people" on public.profiles for select to authenticated using (true);
drop policy if exists "people update self, managers update staff" on public.profiles;
create policy "people update self, managers update staff" on public.profiles for update to authenticated
  using (id = auth.uid() or public.app_role() in ('owner', 'admin'))
  with check (id = auth.uid() or public.app_role() in ('owner', 'admin'));
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- Existing accounts get profiles; you are the owner.
insert into public.profiles (id, email, name)
  select id, lower(email), split_part(email, '@', 1) from auth.users
  on conflict (id) do nothing;
update public.profiles set role = 'owner', name = 'Owner' where email = 'wmashburn@uss.com';

-- ---------- Shared app data: quantities, quantity log, contacts, EWOs, activity ----------
-- coll: 'inventory' (item edits/added/removed), 'qlog' (quantity log), 'contacts',
--       'ewos', 'activity' (who-did-what log). val null = removed.
create table if not exists public.app_data (
  coll text not null check (coll in ('inventory', 'qlog', 'contacts', 'ewos', 'activity')),
  key text not null,
  val jsonb,
  by_user uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (coll, key)
);
create index if not exists app_data_updated_at on public.app_data (updated_at);
alter table public.app_data enable row level security;

create or replace function public.can_write(c text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select case c
    when 'inventory' then public.has_perm('qty')
    when 'qlog' then public.has_perm('qty')
    when 'ewos' then public.has_perm('qty')
    when 'contacts' then public.has_perm('contacts')
    when 'activity' then public.app_role() is not null
    else false end
$$;

drop policy if exists "staff read data" on public.app_data;
create policy "staff read data" on public.app_data for select to authenticated using (true);
drop policy if exists "permitted staff add data" on public.app_data;
create policy "permitted staff add data" on public.app_data for insert to authenticated
  with check (by_user = auth.uid() and public.can_write(coll));
-- Logs are add-only: only item edits, contacts and EWOs can be changed later.
drop policy if exists "permitted staff change data" on public.app_data;
create policy "permitted staff change data" on public.app_data for update to authenticated
  using (coll in ('inventory', 'contacts', 'ewos') and public.can_write(coll))
  with check (by_user = auth.uid() and public.can_write(coll));

create or replace function public.touch_app_data() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.by_user := auth.uid();
  return new;
end $$;
drop trigger if exists app_data_touch on public.app_data;
create trigger app_data_touch before insert or update on public.app_data
  for each row execute function public.touch_app_data();

revoke all on public.app_data from anon;
revoke all on public.app_data from authenticated;
grant select, insert, update on public.app_data to authenticated;

-- ---------- Photo and PDF storage ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('delivery-photos', 'delivery-photos', false, 20971520),
       ('inspection-pdfs', 'inspection-pdfs', false, 31457280)
on conflict (id) do nothing;

drop policy if exists "staff view warehouse files" on storage.objects;
create policy "staff view warehouse files" on storage.objects for select to authenticated
  using (bucket_id in ('delivery-photos', 'inspection-pdfs'));
drop policy if exists "managers upload warehouse files" on storage.objects;
create policy "managers upload warehouse files" on storage.objects for insert to authenticated
  with check (bucket_id in ('delivery-photos', 'inspection-pdfs') and (public.app_role() in ('owner', 'admin')
    or (bucket_id = 'delivery-photos' and public.has_perm('dlphotos'))));
-- Finished inspection sheets: any staff member may add the pages of their sheet under sheets/ (add only).
drop policy if exists "staff add inspection sheet pages" on storage.objects;
create policy "staff add inspection sheet pages" on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-pdfs' and name like 'sheets/%' and public.app_role() is not null);
drop policy if exists "managers replace warehouse files" on storage.objects;
create policy "managers replace warehouse files" on storage.objects for update to authenticated
  using (bucket_id in ('delivery-photos', 'inspection-pdfs') and (public.app_role() in ('owner', 'admin')
    or (bucket_id = 'delivery-photos' and public.has_perm('dlphotos'))));
drop policy if exists "managers delete warehouse files" on storage.objects;
create policy "managers delete warehouse files" on storage.objects for delete to authenticated
  using (bucket_id in ('delivery-photos', 'inspection-pdfs') and (public.app_role() in ('owner', 'admin')
    or (bucket_id = 'delivery-photos' and public.has_perm('dlphotos'))));
