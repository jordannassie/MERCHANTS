-- ============================================================
-- Migration 025: Sales Follow-up Operating System
-- Idempotent — safe to run multiple times on production data.
-- ============================================================

-- 1. Add system_settings seed row for sales_followup_enabled
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('sales_followup_enabled', 'false', now())
ON CONFLICT (key) DO NOTHING;

-- 2. Add new columns to leads (all safe with IF NOT EXISTS)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_step          smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_started_at    timestamptz,
  ADD COLUMN IF NOT EXISTS followup_completed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_followup_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS proposal_view_count    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposal_last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_requested_at  timestamptz;

-- 3. Add proposal_contact fields (needed for accept route)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS proposal_contact_name  text,
  ADD COLUMN IF NOT EXISTS proposal_contact_email text,
  ADD COLUMN IF NOT EXISTS proposal_contact_phone text;

-- 4. Update proposal_status CHECK constraint to include 'agreement_requested'
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_proposal_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_proposal_status_check
  CHECK (proposal_status IN ('not_sent','sent','viewed','agreement_requested','accepted'));

-- 5. Update status CHECK constraint to include 'agreement_requested'
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new','attempted','connected','follow_up','appointment','agreement_requested','won','lost','do_not_contact'));

-- 6. Indexes for follow-up scheduling and agreement tracking
CREATE INDEX IF NOT EXISTS leads_next_follow_up_at_idx
  ON public.leads (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_agreement_requested_at_idx
  ON public.leads (agreement_requested_at)
  WHERE agreement_requested_at IS NOT NULL;

-- 7. Backfill: existing accepted proposals get agreement_requested_at
UPDATE public.leads
SET agreement_requested_at = COALESCE(proposal_accepted_at, now())
WHERE proposal_status = 'accepted'
  AND agreement_requested_at IS NULL;
