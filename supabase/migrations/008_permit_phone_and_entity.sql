-- =============================================================
-- Merchant Radar — Migration 008: Permit Phone + Entity Records
--
-- Phase 1: Permit phone columns on leads (safe to add before SIFT import runs)
-- Phase 3: entity_records table for CPA franchise-tax API data
--
-- All idempotent — safe to run multiple times.
-- Apply in Supabase Dashboard → SQL Editor:
-- https://supabase.com/dashboard/project/phhczohqidgrvcmszets/sql/new
-- =============================================================

-- ── Phase 1: Permit phone on leads ───────────────────────────
-- Never overwrites CRM (primary_phone). Stored separately so
-- the source is always clear to the end user.
alter table public.leads add column if not exists permit_phone              text;
alter table public.leads add column if not exists permit_phone_source       text;  -- 'sift_weekly' | 'cpa_api'
alter table public.leads add column if not exists permit_phone_imported_at  timestamptz;

-- ── Phase 3: Entity records (CPA franchise-tax + SOS data) ───
create table if not exists public.entity_records (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null references public.leads(id) on delete cascade,
  taxpayer_id              text,            -- 11-digit TX Comptroller ID
  legal_entity_name        text,
  dba_name                 text,
  entity_type              text,            -- LLC, Corporation, LP, Sole Proprietor, etc.
  state_of_formation       text,
  sos_file_number          text,            -- TX Secretary of State file number
  sos_registration_status  text,            -- Active, Forfeited, etc.
  registered_agent_name    text,
  registered_office_street text,
  registered_office_city   text,
  registered_office_state  text,
  registered_office_zip    text,
  -- Officers/directors as returned by CPA franchise-tax API
  -- [{AGNT_NM, AGNT_TITL_TX, AGNT_ACTV_YR, AD_STR_POB_TX, CITY_NM, ST_CD, AD_ZP, SOURCE}]
  officers                 jsonb,
  -- Sole proprietor individual name (from sales-tax-payer endpoint)
  individual_first_name    text,
  individual_last_name     text,
  individual_full_name     text,
  -- Display fields (derived from officers array)
  primary_contact_name     text,    -- best-guess decision-maker name
  primary_contact_title    text,    -- their official title
  primary_contact_role     text,    -- 'sole_proprietor' | 'officer' | 'registered_agent'
  -- Source / confidence
  entity_source_url        text,    -- link to public CPA/SOS record
  entity_confidence        integer, -- 0-100
  -- Is the registered agent a commercial RA (skip for sales contact)?
  registered_agent_is_commercial boolean not null default false,
  researched_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists entity_records_lead_id    on public.entity_records(lead_id);
create index if not exists entity_records_taxpayer   on public.entity_records(taxpayer_id);
create index if not exists entity_records_sos_file   on public.entity_records(sos_file_number);
create index if not exists leads_permit_phone        on public.leads(permit_phone) where permit_phone is not null;

create trigger entity_records_updated_at
  before update on public.entity_records
  for each row execute function public.handle_updated_at();

-- ── Confirmation function ─────────────────────────────────────
create or replace function public.migration_008_applied()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'leads'
      and column_name  = 'permit_phone'
  );
$$;
