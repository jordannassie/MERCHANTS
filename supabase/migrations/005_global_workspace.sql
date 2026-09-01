-- =============================================================
-- Merchant Radar — Global Single-Workspace Schema
-- Migration 005: Remove ALL auth.users dependencies.
--
-- Merchant Radar is a single-workspace tool. There is no login,
-- no multi-user auth, and no owner_id tied to auth.users.
-- All DB access happens server-side via the service-role key.
--
-- Apply in Supabase Dashboard → SQL Editor, or via supabase db push.
-- Safe to run on a fresh project (IF NOT EXISTS everywhere).
-- =============================================================

-- Drop legacy objects from prior auth-dependent migrations
-- (safe no-ops if they don't exist)
drop trigger  if exists on_auth_user_created     on auth.users;
drop function if exists public.handle_new_user()  cascade;
drop table    if exists public.enrichment_jobs     cascade;
drop table    if exists public.import_runs         cascade;
drop table    if exists public.activities          cascade;
drop table    if exists public.contacts            cascade;
drop table    if exists public.leads               cascade;
drop table    if exists public.territories         cascade;
drop table    if exists public.profiles            cascade;

-- =============================================================
-- Shared trigger: keep updated_at current
-- =============================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
-- TERRITORIES — one global active territory
-- =============================================================
create table public.territories (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default 'Dallas–Fort Worth',
  county_codes    text[] not null default array[
    '043','057','061','070','116','126','129','184','199','220','249'
  ],
  days_to_import  integer not null default 14
                  check (days_to_import in (7, 14, 30)),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger territories_updated_at
  before update on public.territories
  for each row execute function public.handle_updated_at();

-- =============================================================
-- LEADS — unique on (source, taxpayer_number, outlet_number)
-- =============================================================
create table public.leads (
  -- Identity
  id                         uuid primary key default gen_random_uuid(),
  territory_id               uuid references public.territories(id) on delete set null,
  source                     text not null default 'texas_sales_tax_permits',

  -- Texas permit source fields (managed by importer, never erase CRM fields)
  taxpayer_number            text not null,
  outlet_number              text not null,
  taxpayer_name              text,
  taxpayer_address           text,
  taxpayer_city              text,
  taxpayer_state             text,
  taxpayer_zip               text,
  taxpayer_county_code       text,
  taxpayer_organization_type text,
  outlet_name                text,
  outlet_address             text,
  outlet_city                text,
  outlet_state               text,
  outlet_zip                 text,
  outlet_county_code         text,
  naics_code                 text,
  inside_outside_city        text,
  permit_issue_date          date,
  first_sales_date           date,
  raw_record                 jsonb,
  first_imported_at          timestamptz not null default now(),
  last_seen_at               timestamptz not null default now(),

  -- CRM fields (user-managed, never overwritten by importer)
  display_name               text,
  category                   text,
  score                      integer not null default 0 check (score >= 0 and score <= 100),
  priority                   text not null default 'low'
                             check (priority in ('hot', 'good', 'low', 'skip')),
  score_reasons              text[],
  status                     text not null default 'new'
                             check (status in (
                               'new','attempted','connected','follow_up',
                               'appointment','won','lost','do_not_contact'
                             )),
  starred                    boolean not null default false,
  primary_phone              text,
  primary_email              text,
  website                    text,
  owner_name                 text,
  contact_title              text,
  google_maps_url            text,
  enrichment_status          text check (enrichment_status in ('pending','running','completed','failed')),
  enriched_at                timestamptz,
  last_contacted_at          timestamptz,
  next_follow_up_at          timestamptz,
  -- Estimate only — not a factual claim about actual card volume
  est_monthly_processing     text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint leads_unique_texas_identity unique (source, taxpayer_number, outlet_number)
);

-- Indexes (no owner_id prefix — single workspace)
create index leads_status        on public.leads(status);
create index leads_priority      on public.leads(priority);
create index leads_follow_up     on public.leads(next_follow_up_at nulls last);
create index leads_permit_date   on public.leads(permit_issue_date desc nulls last);
create index leads_first_sales   on public.leads(first_sales_date desc nulls last);
create index leads_city          on public.leads(outlet_city);
create index leads_naics         on public.leads(naics_code);
create index leads_score         on public.leads(score desc);
create index leads_starred       on public.leads(starred) where starred = true;
create index leads_county        on public.leads(outlet_county_code);
create index leads_territory_id  on public.leads(territory_id);

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.handle_updated_at();

-- =============================================================
-- CONTACTS — associated via lead_id only
-- =============================================================
create table public.contacts (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  full_name      text not null,
  title          text,
  business_phone text,
  mobile_phone   text,
  email          text,
  contact_type   text check (contact_type in ('owner','manager','decision_maker','other')),
  source_url     text,
  is_primary     boolean not null default false,
  source_type    text not null default 'manual' check (source_type in ('manual','enriched')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index contacts_lead_id on public.contacts(lead_id);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.handle_updated_at();

-- =============================================================
-- ACTIVITIES — call history and notes, associated via lead_id
-- =============================================================
create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.leads(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete set null,
  activity_type    text not null check (activity_type in ('call','note','email','meeting','status_change')),
  call_outcome     text check (call_outcome in (
    'no_answer','voicemail','connected','call_back','not_interested','appointment','won'
  )),
  notes            text,
  duration_seconds integer,
  occurred_at      timestamptz not null default now(),
  next_follow_up_at timestamptz,
  created_at       timestamptz not null default now()
);

create index activities_lead_occurred on public.activities(lead_id, occurred_at desc);
create index activities_follow        on public.activities(next_follow_up_at nulls last);

-- =============================================================
-- IMPORT_RUNS — tracks each Texas permit import
-- =============================================================
create table public.import_runs (
  id                   uuid primary key default gen_random_uuid(),
  territory_id         uuid references public.territories(id) on delete set null,
  source               text not null default 'texas_sales_tax_permits',
  status               text not null default 'running'
                       check (status in ('running','completed','partial','failed')),
  requested_start_date date,
  county_codes         text[],
  fetched_count        integer not null default 0,
  inserted_count       integer not null default 0,
  updated_count        integer not null default 0,
  duplicate_count      integer not null default 0,
  skipped_count        integer not null default 0,
  error_message        text,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz
);

create index import_runs_started   on public.import_runs(started_at desc);
create index import_runs_territory on public.import_runs(territory_id);

-- =============================================================
-- ENRICHMENT_JOBS — optional Phase 4 AI enrichment (no owner_id)
-- =============================================================
create table public.enrichment_jobs (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.leads(id) on delete cascade,
  status              text not null default 'pending'
                      check (status in ('pending','running','completed','failed')),
  ai_score_adjustment integer check (ai_score_adjustment >= -10 and ai_score_adjustment <= 10),
  ai_score_reason     text,
  raw_response        jsonb,
  proposed_data       jsonb,
  accepted_fields     text[],
  sources             jsonb,
  input_tokens        integer,
  output_tokens       integer,
  error_message       text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index enrichment_jobs_lead   on public.enrichment_jobs(lead_id);
create index enrichment_jobs_status on public.enrichment_jobs(status);

create trigger enrichment_jobs_updated_at
  before update on public.enrichment_jobs
  for each row execute function public.handle_updated_at();
