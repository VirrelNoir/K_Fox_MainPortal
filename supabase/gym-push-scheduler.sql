-- K-FOX GYM push scheduler
-- Run this only AFTER:
-- 1) Deploying the gym-reminders Edge Function.
-- 2) Creating a Supabase Vault secret named kfox_gym_push_service_role_key
--    containing the project's service_role key (never put that key in website code).

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name='kfox_gym_push_service_role_key'
  ) then
    raise exception 'Create the Vault secret kfox_gym_push_service_role_key before scheduling K-FOX reminders.';
  end if;
end $$;

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
