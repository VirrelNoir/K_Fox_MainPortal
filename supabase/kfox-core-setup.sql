-- K-FOX core cloud setup
-- Run this file ONCE in Supabase Dashboard > SQL Editor for this project.
-- Safe to re-run: existing rows and uploaded objects are not deleted.
begin;

-- 1) Workspace: tasks, dossiers, calendar events and training sessions.
create table if not exists public.kfox_workspace_data (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null default '{"tasks":[],"dossiers":[],"events":[],"training":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.kfox_workspace_data enable row level security;
drop policy if exists "KFOX workspace select own" on public.kfox_workspace_data;
create policy "KFOX workspace select own" on public.kfox_workspace_data
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "KFOX workspace insert own" on public.kfox_workspace_data;
create policy "KFOX workspace insert own" on public.kfox_workspace_data
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "KFOX workspace update own" on public.kfox_workspace_data;
create policy "KFOX workspace update own" on public.kfox_workspace_data
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update on public.kfox_workspace_data to authenticated;

-- 2) Operational records: mission states, training/fitness metadata and journal reports.
create table if not exists public.kfox_operational_data (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  mission_states jsonb not null default '{}'::jsonb,
  reports jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.kfox_operational_data enable row level security;
drop policy if exists "KFOX operational select own" on public.kfox_operational_data;
create policy "KFOX operational select own" on public.kfox_operational_data
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "KFOX operational insert own" on public.kfox_operational_data;
create policy "KFOX operational insert own" on public.kfox_operational_data
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "KFOX operational update own" on public.kfox_operational_data;
create policy "KFOX operational update own" on public.kfox_operational_data
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update on public.kfox_operational_data to authenticated;

-- 3) Quotes: create only when missing; preserve all existing quotes.
create table if not exists public.kfox_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quote_text text not null check (char_length(quote_text) between 1 and 5000),
  author text,
  category text,
  created_at timestamptz not null default now()
);
alter table public.kfox_quotes enable row level security;
drop policy if exists "KFOX quotes select own" on public.kfox_quotes;
create policy "KFOX quotes select own" on public.kfox_quotes
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "KFOX quotes insert own" on public.kfox_quotes;
create policy "KFOX quotes insert own" on public.kfox_quotes
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "KFOX quotes delete own" on public.kfox_quotes;
create policy "KFOX quotes delete own" on public.kfox_quotes
  for delete to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "KFOX quotes update own" on public.kfox_quotes;
create policy "KFOX quotes update own" on public.kfox_quotes
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.kfox_quotes to authenticated;

-- 4) Private files: PDF library, archive uploads and gym progress photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal-archive','personal-archive',false,52428800,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=false,
    file_size_limit=52428800,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "KFOX personal archive select own" on storage.objects;
create policy "KFOX personal archive select own" on storage.objects
  for select to authenticated
  using (bucket_id='personal-archive' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists "KFOX personal archive insert own" on storage.objects;
create policy "KFOX personal archive insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id='personal-archive' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists "KFOX personal archive update own" on storage.objects;
create policy "KFOX personal archive update own" on storage.objects
  for update to authenticated
  using (bucket_id='personal-archive' and (storage.foldername(name))[1]=(select auth.uid()::text))
  with check (bucket_id='personal-archive' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists "KFOX personal archive delete own" on storage.objects;
create policy "KFOX personal archive delete own" on storage.objects
  for delete to authenticated
  using (bucket_id='personal-archive' and (storage.foldername(name))[1]=(select auth.uid()::text));

commit;
