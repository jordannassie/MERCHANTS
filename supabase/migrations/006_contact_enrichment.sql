-- =============================================================
-- Merchant Radar — Contact Enrichment Columns
-- Migration 006: Add Google Places + enrichment metadata to leads.
--
-- Uses ADD COLUMN IF NOT EXISTS — safe to run on existing data.
-- Apply in Supabase Dashboard → SQL Editor.
-- =============================================================

-- Google Places fields
alter table public.leads add column if not exists google_place_id          text;
alter table public.leads add column if not exists international_phone      text;
alter table public.leads add column if not exists business_status          text;
alter table public.leads add column if not exists google_primary_type      text;

-- Match metadata
alter table public.leads add column if not exists contact_match_confidence integer;
alter table public.leads add column if not exists contact_source           text;
alter table public.leads add column if not exists contact_source_urls      jsonb;
alter table public.leads add column if not exists enrichment_error         text;

-- Indexes (only where they do not already exist)
create index if not exists leads_google_place_id          on public.leads(google_place_id);
create index if not exists leads_contact_source           on public.leads(contact_source);
create index if not exists leads_contact_match_confidence on public.leads(contact_match_confidence);
create index if not exists leads_enrichment_status        on public.leads(enrichment_status);
