-- ──────────────────────────────────────────────────────────────────────────
-- Migration 021: Google Daily Leads — sweep state tables
--
-- Purpose:
--   1. system_settings: ON/OFF toggle for daily automation (defaults OFF)
--   2. google_places_seen: permanent dedup store — records every Place ID
--      encountered so the sweep never re-processes the same business
--   3. Add daily-tracking columns to google_sweeps for date-rollover resets
--
-- SAFE:
--   - All statements are idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)
--   - Never touches, drops, or modifies leads, sift_import_log, import_runs,
--     texas_sales_tax_permits data, or any existing column
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. system_settings (key-value config) ───────────────────────────────────
create table if not exists public.system_settings (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'system_settings' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.system_settings
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- Default: automation is OFF — user must explicitly enable it
insert into public.system_settings (key, value)
  values ('google_daily_search_enabled', 'false')
  on conflict (key) do nothing;

-- ── 2. google_places_seen (permanent Place ID dedup store) ──────────────────
-- Stores every Google Place ID encountered, including phone-less results.
-- Prevents the sweep from re-fetching and re-processing the same business.
-- Phone-less results are re-eligible after recheck_after (30 days by default).
create table if not exists public.google_places_seen (
  id               uuid        primary key default gen_random_uuid(),
  place_id         text        not null unique,
  name             text,
  normalized_phone text,                          -- null when phone-less
  had_phone        boolean     not null default false,
  lead_id          uuid        references public.leads(id) on delete set null,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  -- phone-less results become eligible for re-check after this date
  recheck_after    timestamptz
);

create index if not exists idx_places_seen_place_id on public.google_places_seen(place_id);
create index if not exists idx_places_seen_recheck
  on public.google_places_seen(recheck_after)
  where recheck_after is not null;

alter table public.google_places_seen enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'google_places_seen' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.google_places_seen
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ── 3. Daily tracking columns on google_sweeps ──────────────────────────────
-- These columns reset each calendar day so the UI can show "X of 90 today".
alter table if exists public.google_sweeps
  add column if not exists new_leads_today           int  not null default 0,
  add column if not exists searches_today            int  not null default 0,
  add column if not exists last_run_date             date,
  add column if not exists last_complete_cycle_at    timestamptz,
  add column if not exists last_run_at               timestamptz;
