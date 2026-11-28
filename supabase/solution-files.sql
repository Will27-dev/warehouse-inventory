-- =====================================================================
-- Photos and files on solution slips (Common Problems/Solutions).
-- Run once in the Supabase SQL editor, after setup.sql and activity-rules.sql. Safe to run again.
--
-- A private bucket, "solution-files". Every signed-in staff member can view the files;
-- the owner/admins and people with "Create solution sheets" add them (under slips/);
-- only the owner/admins delete them. Files are added, never replaced.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('solution-files', 'solution-files', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "staff view solution files" on storage.objects;
create policy "staff view solution files" on storage.objects for select to authenticated
  using (bucket_id = 'solution-files' and public.app_role() is not null);

drop policy if exists "permitted staff add solution files" on storage.objects;
create policy "permitted staff add solution files" on storage.objects for insert to authenticated
  with check (bucket_id = 'solution-files' and name like 'slips/%' and public.mgr_or_perm('solnew'));

drop policy if exists "managers delete solution files" on storage.objects;
create policy "managers delete solution files" on storage.objects for delete to authenticated
  using (bucket_id = 'solution-files' and public.app_role() in ('owner', 'admin'));
