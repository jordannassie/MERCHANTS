-- ============================================================
-- Migration 027: Proposal Calculator — two-option pricing
-- Idempotent — safe to run multiple times on production data.
-- ============================================================

-- Part A: New lead columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS proposal_selected_option text,
  ADD COLUMN IF NOT EXISTS proposal_calc_snapshot   jsonb;

-- Optional: constrain proposal_selected_option to valid values
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_proposal_selected_option_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_proposal_selected_option_check
  CHECK (proposal_selected_option IN ('wholesale', 'customer_pay'));

-- Part B: System settings seeds for proposal calculator defaults
INSERT INTO public.system_settings (key, value, updated_at) VALUES
  ('proposal_compare_rate_default',        '3.0',    now()),
  ('proposal_wholesale_cost_default',      '1.60',   now()),
  ('proposal_markup_rate_default',         '0.75',   now()),
  ('proposal_customer_pay_percent_default','4.0',    now()),
  ('proposal_slider_default',              '50000',  now()),
  ('proposal_slider_min',                  '5000',   now()),
  ('proposal_slider_max',                  '250000', now()),
  ('proposal_slider_step',                 '5000',   now())
ON CONFLICT (key) DO NOTHING;
