-- =====================================================================
-- Tighter rules for the shared activity log (public.app_data, coll = 'activity').
-- Run once in the Supabase SQL editor, after setup.sql. Safe to run again.
--
-- Why: Greens counts and transfers, finished inspection sheets, pick lists and
-- App problems all sync as activity entries. setup.sql lets any signed-in person
-- add any entry, so the app's permission checks could be skipped by calling the
-- database directly. This makes the database enforce the same rules as the app:
--   - an entry's "by" must be the person adding it (the owner may upload others'
--     entries with "Upload this device's data");
--   - only the owner marks App problems resolved;
--   - only the owner/admins, or people with the permission, delete Greens records
--     and approve Greens transfers;
--   - only the owner/admins remove finished inspection sheets.
-- =====================================================================

-- Matches the app's permsOf() for grdel and grapprove: always on for the owner and admins.
create or replace function public.mgr_or_perm(p text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select public.app_role() in ('owner', 'admin') or public.has_perm(p)
$$;

create or replace function public.activity_ok(v jsonb) returns boolean
  language sql stable security definer set search_path = '' as $$
  select
    (public.app_role() = 'owner'
      or coalesce(v ->> 'by', '') = ''  -- made while signed out: names nobody
      or lower(v ->> 'by') = (select lower(email) from public.profiles where id = auth.uid()))
    and (not (v ? 'issueRes') or public.app_role() = 'owner')
    and (not (v ? 'grdel') or public.mgr_or_perm('grdel'))
    and (not (v ? 'gt') or (v -> 'gt' ->> 'of') is null or public.mgr_or_perm('grapprove'))
    and (not (v ? 'inspdel') or public.app_role() in ('owner', 'admin'))
$$;

drop policy if exists "permitted staff add data" on public.app_data;
create policy "permitted staff add data" on public.app_data for insert to authenticated
  with check (
    by_user = auth.uid()
    and public.can_write(coll)
    and (coll <> 'activity' or public.activity_ok(val))
  );
