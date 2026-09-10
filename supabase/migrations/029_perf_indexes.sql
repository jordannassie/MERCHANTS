-- Migration 029: Performance indexes for common leads queries
-- Reduces sequential scans on high-traffic filter columns.
-- leads_next_follow_up_at_idx already exists (migration 025).

CREATE INDEX IF NOT EXISTS leads_status_idx
  ON public.leads(status);

CREATE INDEX IF NOT EXISTS leads_sms_last_sent_at_idx
  ON public.leads(sms_last_sent_at);
