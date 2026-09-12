-- ============================================================
-- Migration 030: How the merchant wants to accept payments
-- Idempotent — safe to run multiple times on production data.
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS proposal_payment_acceptance text;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_proposal_payment_acceptance_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_proposal_payment_acceptance_check
  CHECK (proposal_payment_acceptance IN ('in_person', 'online', 'both'));
