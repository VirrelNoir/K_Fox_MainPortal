-- K-FOX background Push notifications for Calendar and Training.
-- Run once in Supabase SQL Editor. Existing reminders and subscriptions are preserved.
-- Push subscriptions are service-role only; notification rows are private to each account.

create table if not exists public.kfox_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  title text not null,
  body text not null default '',
  scheduled_at timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.kfox_notifications enable row level security;
alter table public.kfox_notifications drop constraint if exists kfox_notifications_module_check;
alter table public.kfox_notifications add constraint kfox_notifications_module_check
  check (module = any (array['personal','calendar','training','finance','dentistry','gym','nutrition']::text[]));
alter table public.kfox_notifications drop constraint if exists kfox_notifications_title_check;
alter table public.kfox_notifications add constraint kfox_notifications_title_check
  check (char_length(title) between 1 and 140);
alter table public.kfox_notifications drop constraint if exists kfox_notifications_body_check;
alter table public.kfox_notifications add constraint kfox_notifications_body_check
  check (char_length(body) <= 500);
alter table public.kfox_notifications drop constraint if exists kfox_notifications_status_check;
alter table public.kfox_notifications add constraint kfox_notifications_status_check
  check (status = any (array['pending','sent','cancelled','failed']::text[]));
drop policy if exists "Users manage their own K-FOX notifications" on public.kfox_notifications;
drop policy if exists "KFOX notifications manage own" on public.kfox_notifications;
create policy "KFOX notifications manage own" on public.kfox_notifications
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
grant select, insert, update, delete on public.kfox_notifications to authenticated;
grant all on public.kfox_notifications to service_role;
create index if not exists kfox_notifications_due_idx on public.kfox_notifications (scheduled_at) where status='pending';

create table if not exists public.kfox_gym_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  last_19_sent_on date,
  last_22_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kfox_gym_push_subscriptions enable row level security;
revoke all on public.kfox_gym_push_subscriptions from anon, authenticated;
grant all on public.kfox_gym_push_subscriptions to service_role;
create index if not exists kfox_gym_push_subscriptions_owner_idx on public.kfox_gym_push_subscriptions(owner_id);

-- Enable Supabase extensions used by the background scheduler.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Keep the Vault-backed VAPID material accessible only to service_role.
create or replace function public.kfox_get_vapid_config()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'publicKey', (select decrypted_secret from vault.decrypted_secrets where name='kfox_vapid_public_key' limit 1),
    'privateKey', (select decrypted_secret from vault.decrypted_secrets where name='kfox_vapid_private_key' limit 1)
  );
$$;
revoke all on function public.kfox_get_vapid_config() from public, anon, authenticated;
grant execute on function public.kfox_get_vapid_config() to service_role;
