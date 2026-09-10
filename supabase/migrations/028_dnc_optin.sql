-- ============================================================
-- Migration 028: DNC / Opt-Out Tracking
-- Idempotent — safe to run multiple times on production data.
-- ============================================================

-- ── 1. Add opt-out tracking columns to leads ──────────────────────────────────
-- do_not_contact status is already tracked via status = 'do_not_contact'
-- These columns capture WHEN / WHY / HOW the lead opted out.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS opted_out_at   timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_reason text,
  ADD COLUMN IF NOT EXISTS opt_out_source text;
  -- opt_out_source values: 'admin' | 'stop_reply' | 'webhook'

-- ── 2. Index for opted_out_at (fast suppression queries) ─────────────────────
CREATE INDEX IF NOT EXISTS leads_opted_out_at_idx
  ON public.leads (opted_out_at)
  WHERE opted_out_at IS NOT NULL;

-- ── 3. Backfill: existing do_not_contact leads get a placeholder opted_out_at ─
-- Sets opted_out_at = updated_at (best approximation) for leads that are already
-- do_not_contact but don't yet have opted_out_at.
UPDATE public.leads
SET
  opted_out_at   = COALESCE(followup_completed_at, updated_at, now()),
  opt_out_source = 'stop_reply'
WHERE
  status = 'do_not_contact'
  AND opted_out_at IS NULL;

-- ── 4. Suppression check trigger ─────────────────────────────────────────────
-- When a phone (permit_phone or primary_phone) is added/updated on a lead,
-- automatically mark the lead as do_not_contact if that phone exists in
-- sms_suppression. This ensures DNC status survives re-imports.

CREATE OR REPLACE FUNCTION public.fn_check_phone_suppression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  suppressed_permit  BOOLEAN := FALSE;
  suppressed_primary BOOLEAN := FALSE;
BEGIN
  -- Only act when a phone column actually changed and the lead is not already DNC
  IF NEW.status = 'do_not_contact' THEN
    RETURN NEW;
  END IF;

  -- Check permit_phone if it changed
  IF NEW.permit_phone IS NOT NULL AND (OLD.permit_phone IS DISTINCT FROM NEW.permit_phone) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.sms_suppression
      WHERE normalized_phone = regexp_replace(NEW.permit_phone, '[^0-9]', '', 'g')
      LIMIT 1
    ) INTO suppressed_permit;
  END IF;

  -- Check primary_phone if it changed
  IF NOT suppressed_permit AND NEW.primary_phone IS NOT NULL AND (OLD.primary_phone IS DISTINCT FROM NEW.primary_phone) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.sms_suppression
      WHERE normalized_phone = regexp_replace(NEW.primary_phone, '[^0-9]', '', 'g')
      LIMIT 1
    ) INTO suppressed_primary;
  END IF;

  IF suppressed_permit OR suppressed_primary THEN
    NEW.status          := 'do_not_contact';
    NEW.opted_out_at    := COALESCE(NEW.opted_out_at, now());
    NEW.opt_out_source  := COALESCE(NEW.opt_out_source, 'stop_reply');
    NEW.opt_out_reason  := COALESCE(NEW.opt_out_reason, 'Suppressed phone re-imported');
    NEW.next_follow_up_at := NULL;
    NEW.followup_completed_at := COALESCE(NEW.followup_completed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_phone_suppression ON public.leads;
CREATE TRIGGER trg_check_phone_suppression
  BEFORE INSERT OR UPDATE OF permit_phone, primary_phone
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_phone_suppression();

-- ── 5. Verify sms_suppression has all expected columns ────────────────────────
-- sms_suppression was created in migration 019 with:
--   id, normalized_phone (UNIQUE), lead_id, opt_out_reason, opted_out_at
-- No additional columns needed.

-- Done.
