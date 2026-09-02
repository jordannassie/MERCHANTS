-- =============================================================
-- Merchant Radar — Migration 007: Enrichment metadata columns
--
-- Adds Google Places tracking columns to leads and richer fields
-- to contacts. All statements use ADD COLUMN IF NOT EXISTS so
-- this migration is idempotent — safe to run multiple times.
--
-- Apply in Supabase Dashboard → SQL Editor:
-- https://supabase.com/dashboard/project/phhczohqidgrvcmszets/sql/new
--
-- Or via Netlify build: the apply-migration.js script will
-- attempt this automatically on each deploy.
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

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists leads_google_place_id          on public.leads(google_place_id);
create index if not exists leads_contact_source           on public.leads(contact_source);
create index if not exists leads_contact_match_confidence on public.leads(contact_match_confidence);
create index if not exists leads_enrichment_status        on public.leads(enrichment_status);
create index if not exists contacts_verification_status   on public.contacts(verification_status);

-- ── Self-callable RPC wrapper (callable via supabase.rpc()) ──
-- Once this migration has been applied manually once, the app can
-- verify 007 is applied by calling: supabase.rpc('migration_007_applied')
create or replace function public.migration_007_applied()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leads'
      and column_name  = 'google_place_id'
  );
$$;
