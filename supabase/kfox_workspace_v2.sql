-- K-FOX Workspace 2.0
-- Run once in Supabase SQL Editor. Creates a private per-user JSON workspace.
create table if not exists public.kfox_workspace_data (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null default '{"tasks":[],"dossiers":[],"events":[],"training":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.kfox_workspace_data enable row level security;
drop policy if exists "Users can read own KFOX workspace" on public.kfox_workspace_data;
drop policy if exists "Users can insert own KFOX workspace" on public.kfox_workspace_data;
drop policy if exists "Users can update own KFOX workspace" on public.kfox_workspace_data;
create policy "Users can read own KFOX workspace" on public.kfox_workspace_data for select to authenticated using (auth.uid() = owner_id);
create policy "Users can insert own KFOX workspace" on public.kfox_workspace_data for insert to authenticated with check (auth.uid() = owner_id);
create policy "Users can update own KFOX workspace" on public.kfox_workspace_data for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
