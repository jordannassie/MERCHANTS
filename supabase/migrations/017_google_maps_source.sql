-- ──────────────────────────────────────────────────────────────────────────
-- Migration 017: Google Maps as a second lead source
--
-- Adds:
--   1. lead_source_label column on leads ('state' | 'google' | 'both')
--   2. Unique index on leads(google_place_id) for Google dedup
--   3. lead_sources table — one row per (lead, source_type), tracks each
--      source independently so a lead can have STATE + GOOGLE simultaneously
--   4. google_search_runs table — audit log for every Google search+import
--
-- SAFE: all statements are idempotent (IF NOT EXISTS / IF EXISTS).
--       Never truncates, deletes, or resets existing data.
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. lead_source_label on leads ────────────────────────────────────────
alter table if exists public.leads
  add column if not exists lead_source_label text
    check (lead_source_label in ('state', 'google', 'both'));

-- Backfill existing Texas state leads
update public.leads
  set lead_source_label = 'state'
  where lead_source_label is null
    and source = 'texas_sales_tax_permits';

-- Any Texas lead that was already enriched with a Google Place ID → 'both'
update public.leads
  set lead_source_label = 'both'
  where lead_source_label = 'state'
    and google_place_id is not null
    and google_place_id <> '';

-- Remaining nulls that already have a google_place_id (pure Google enrichment)
update public.leads
  set lead_source_label = 'google'
  where lead_source_label is null
    and google_place_id is not null
    and google_place_id <> '';

-- Catch-all: anything still null → 'state' (conservative default)
update public.leads
  set lead_source_label = 'state'
  where lead_source_label is null;

-- ── 2. Unique index on google_place_id ───────────────────────────────────
-- Prevents duplicate Google Place IDs when a place is searched multiple times
create unique index if not exists leads_google_place_id_unique
  on public.leads(google_place_id)
  where google_place_id is not null and google_place_id <> '';

-- ── 3. lead_sources table ────────────────────────────────────────────────
create table if not exists public.lead_sources (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  source_type     text not null
                    check (source_type in ('texas_sales_tax_permits', 'google_places')),
  external_id     text,           -- taxpayer_number (state) or place_id (google)
  source_url      text,           -- Google Maps URL or Socrata record URL
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  search_run_id   uuid,           -- references google_search_runs.id (nullable for state)
  metadata        jsonb,          -- source-specific payload for auditing
  unique (lead_id, source_type)
);

create index if not exists idx_lead_sources_lead_id
  on public.lead_sources(lead_id);

create index if not exists idx_lead_sources_source_type
  on public.lead_sources(source_type);

create index if not exists idx_lead_sources_external_id
  on public.lead_sources(external_id);

alter table public.lead_sources enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lead_sources' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.lead_sources
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ── 4. google_search_runs table ──────────────────────────────────────────
create table if not exists public.google_search_runs (
  id              uuid primary key default gen_random_uuid(),
  state           text not null default 'TX',
  location        text,               -- metro / city / county entered by user
  query           text not null,      -- business category / search phrase
  zip             text,
  results_found   int  not null default 0,
  new_leads       int  not null default 0,
  enriched_leads  int  not null default 0,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  error_message   text,
  raw_results     jsonb               -- full Places API response for debugging
);

alter table public.google_search_runs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'google_search_runs' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.google_search_runs
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ── 5. Backfill lead_sources for existing state leads ────────────────────
-- Insert a STATE row for every existing Texas lead that doesn't have one yet
insert into public.lead_sources (lead_id, source_type, external_id, first_seen_at, last_seen_at)
select
  id,
  'texas_sales_tax_permits',
  taxpayer_number,
  first_imported_at,
  last_seen_at
from public.leads
where source = 'texas_sales_tax_permits'
on conflict (lead_id, source_type) do nothing;
