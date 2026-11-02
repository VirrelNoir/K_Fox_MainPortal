-- K-FOX operational cloud sync: run once in Supabase SQL Editor.
-- Stores mission statuses and journal reports per authenticated user.
create table if not exists public.kfox_operational_data (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  mission_states jsonb not null default '{}'::jsonb,
  reports jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kfox_operational_data enable row level security;

drop policy if exists "KFOX operational data select own" on public.kfox_operational_data;
create policy "KFOX operational data select own"
on public.kfox_operational_data for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "KFOX operational data insert own" on public.kfox_operational_data;
create policy "KFOX operational data insert own"
on public.kfox_operational_data for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "KFOX operational data update own" on public.kfox_operational_data;
create policy "KFOX operational data update own"
on public.kfox_operational_data for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

grant select, insert, update on public.kfox_operational_data to authenticated;
