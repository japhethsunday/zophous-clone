-- Free Hugging Face Spaces sleep after ~48h without visits. Ping the worker's status page
-- every 6 hours so it keeps polling for clipping jobs. The page exposes no data.
-- Rollback: select cron.unschedule('worker-keepalive');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('worker-keepalive') where exists (select 1 from cron.job where jobname = 'worker-keepalive');

select cron.schedule(
  'worker-keepalive',
  '17 */6 * * *',
  $$ select net.http_get(url := 'https://recksdev-cloudnivo-worker.hf.space/health', timeout_milliseconds := 20000); $$
);
