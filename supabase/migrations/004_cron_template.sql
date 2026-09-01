-- =============================================================
-- Merchant Radar — Daily Import Cron Setup Template
--
-- DO NOT run this file automatically. It contains placeholders.
-- Follow docs/DAILY_IMPORT_SETUP.md for step-by-step instructions.
-- Replace every <PLACEHOLDER> before executing.
-- =============================================================

-- Step 1: Enable required extensions (run once per project)
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

-- Step 2: Store secrets in Vault (run in SQL editor — never commit real values)
-- select vault.create_secret('<YOUR_SUPABASE_PROJECT_URL>', 'merchant_radar_project_url');
-- select vault.create_secret('<YOUR_CRON_SECRET_32_CHARS_MIN>', 'merchant_radar_cron_secret');

-- Step 3: Schedule daily import at 06:00 UTC (01:00 CST / 02:00 CDT)
-- Supabase Cron uses UTC. CST is UTC-6; CDT is UTC-5.
-- Adjust the hour if you want a different local time.
--
-- select cron.schedule(
--   'merchant-radar-daily-import',  -- unique job name
--   '0 6 * * *',                     -- every day at 06:00 UTC
--   $$
--     select net.http_post(
--       url := (select decrypted_secret from vault.decrypted_secrets where name = 'merchant_radar_project_url') || '/functions/v1/import-texas-leads',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'merchant_radar_cron_secret')
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );

-- Step 4: Verify the job was created
-- select * from cron.job where jobname = 'merchant-radar-daily-import';

-- Step 5: Remove the job if you need to change it
-- select cron.unschedule('merchant-radar-daily-import');
-- Then re-run Step 3 with updated parameters.
