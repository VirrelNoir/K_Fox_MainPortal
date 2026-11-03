-- K-FOX GYM background notifications
-- Run this file once in Supabase SQL Editor after deploying the gym-reminders Edge Function.
-- Nutrition rows are private to each authenticated account. Push subscriptions are service-role only.

create table if not exists public.kfox_gym_nutrition (
  owner_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  calories integer not null check (calories >= 0),
  protein numeric(8,1) not null check (protein >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, log_date)
);
alter table public.kfox_gym_nutrition enable row level security;
drop policy if exists "KFOX gym nutrition select own" on public.kfox_gym_nutrition;
drop policy if exists "KFOX gym nutrition insert own" on public.kfox_gym_nutrition;
drop policy if exists "KFOX gym nutrition update own" on public.kfox_gym_nutrition;
drop policy if exists "KFOX gym nutrition delete own" on public.kfox_gym_nutrition;
create policy "KFOX gym nutrition select own" on public.kfox_gym_nutrition for select to authenticated using (owner_id = (select auth.uid()));
create policy "KFOX gym nutrition insert own" on public.kfox_gym_nutrition for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "KFOX gym nutrition update own" on public.kfox_gym_nutrition for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "KFOX gym nutrition delete own" on public.kfox_gym_nutrition for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.kfox_gym_nutrition to authenticated;

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

-- Vault is used by the scheduled job to read the service_role key securely.
create extension if not exists supabase_vault with schema vault;

-- Before running the scheduler, create a Vault secret named exactly:
-- kfox_gym_push_service_role_key
-- Store the Supabase service_role key in Supabase Vault under this exact name:
-- kfox_gym_push_service_role_key
-- Then run the scheduler block below. The service_role key must never be placed in website code.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='kfox-gym-push-every-minute' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'kfox-gym-push-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://mbpqalbhdcikvruyadte.supabase.co/functions/v1/gym-reminders',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='kfox_gym_push_service_role_key' limit 1)
      ),
      body := '{"action":"send_due"}'::jsonb
    );
  $job$
);
