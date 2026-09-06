-- Migration 023: Store submitter contact info on proposal acceptance
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS

alter table if exists public.leads
  add column if not exists proposal_contact_name  text,
  add column if not exists proposal_contact_email text,
  add column if not exists proposal_contact_phone text;
