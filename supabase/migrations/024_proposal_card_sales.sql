-- Migration 024: Estimated monthly card sales on proposal
-- Safe to re-run: ADD COLUMN IF NOT EXISTS

alter table if exists public.leads
  add column if not exists estimated_monthly_card_sales numeric;
