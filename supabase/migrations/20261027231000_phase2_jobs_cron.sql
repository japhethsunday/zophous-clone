-- Phase 2: run jobs-tick every 20 seconds so jobs finish even when nobody has the app open.
--
-- PREREQUISITE (done once by the project owner in the Supabase dashboard, never in git):
--   SQL editor:  select vault.create_secret('<service_role key>', 'jobs_tick_service_key');
-- The key is read from Vault at run time; it is not stored in this file or in cron.job.
--
-- Rollback: select cron.unschedule('jobs-tick');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('jobs-tick') where exists (select 1 from cron.job where jobname = 'jobs-tick');

select cron.schedule(
  'jobs-tick',
  '20 seconds',
  $$
  select net.http_post(
    url := 'https://gapzawavgmsnfuekqudo.supabase.co/functions/v1/jobs-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_tick_service_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'jobs_tick_service_key');
  $$
);
