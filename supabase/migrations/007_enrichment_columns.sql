-- =============================================================
-- Merchant Radar — Migration 007: Enrichment metadata columns
--
-- Adds Google Places tracking columns to leads and richer
-- fields to contacts. All statements are ADD COLUMN IF NOT EXISTS
-- — safe to run multiple times and on existing data.
--
-- Apply in Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/phhczohqidgrvcmszets/sql/new
-- =============================================================

-- ── Leads: Google Places enrichment metadata ─────────────────
alter table public.leads add column if not exists google_place_id          text;
alter table public.leads add column if not exists international_phone      text;
alter table public.leads add column if not exists business_status          text;
alter table public.leads add column if not exists google_primary_type      text;
alter table public.leads add column if not exists contact_match_confidence integer;
alter table public.leads add column if not exists contact_source           text;
alter table public.leads add column if not exists contact_source_urls      jsonb;
alter table public.leads add column if not exists enrichment_error         text;

-- ── Contacts: richer decision-maker fields ───────────────────
alter table public.contacts add column if not exists linkedin_url          text;
alter table public.contacts add column if not exists source_urls           jsonb;
alter table public.contacts add column if not exists confidence            integer;
alter table public.contacts add column if not exists verification_status   text;
alter table public.contacts add column if not exists research_summary      text;

-- ── Indexes ─────────────────────────────────────────────────
create index if not exists leads_google_place_id          on public.leads(google_place_id);
create index if not exists leads_contact_source           on public.leads(contact_source);
create index if not exists leads_contact_match_confidence on public.leads(contact_match_confidence);
create index if not exists leads_enrichment_status        on public.leads(enrichment_status);
create index if not exists contacts_verification_status   on public.contacts(verification_status);
