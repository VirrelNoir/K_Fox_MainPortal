-- K-FOX quote archive: run once in Supabase SQL Editor.
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
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.kfox_quotes to authenticated;
