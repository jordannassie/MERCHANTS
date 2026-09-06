-- ──────────────────────────────────────────────────────────────────────────
-- Migration 020: Google enrichment tracking on leads
--
-- Adds two columns so the enrichment queue knows which leads have already
-- been searched (and when to retry them).
--
-- SAFE: ADD COLUMN IF NOT EXISTS — never drops, truncates, or resets data.
-- ──────────────────────────────────────────────────────────────────────────

alter table if exists public.leads
  add column if not exists google_enrichment_attempted_at timestamptz,
  add column if not exists google_enrichment_result       text
    check (google_enrichment_result in ('found', 'not_found', 'no_phone', 'error'));

-- Index for the enrichment queue query (State leads without phone, not recently attempted)
create index if not exists idx_leads_enrichment_queue
  on public.leads (google_enrichment_attempted_at nulls first, lead_source_label, source)
  where (permit_phone is null or permit_phone = '')
    and (primary_phone is null or primary_phone = '');
