-- ============================================================
-- Migration 026: New Outreach Automation System
-- Idempotent — safe to run multiple times on production data.
-- ============================================================
-- Seeds the four system_settings keys needed by the New Outreach engine.
-- No new tables or columns are required.
-- ============================================================

-- new_outreach_enabled: master on/off switch (defaults OFF for safety)
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('new_outreach_enabled', 'false', now())
ON CONFLICT (key) DO NOTHING;

-- new_outreach_batch_size: how many NEW leads to text per daily run
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('new_outreach_batch_size', '20', now())
ON CONFLICT (key) DO NOTHING;

-- new_outreach_send_time: 24h HH:MM in Central Time when the daily batch fires
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('new_outreach_send_time', '10:30', now())
ON CONFLICT (key) DO NOTHING;

-- new_outreach_last_run_date: YYYY-MM-DD of the last successful batch run (empty = never)
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('new_outreach_last_run_date', '', now())
ON CONFLICT (key) DO NOTHING;
