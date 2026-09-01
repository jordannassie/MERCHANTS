-- =============================================================
-- Merchant Radar — Core Schema
-- Run in Supabase SQL editor or supabase db push
-- =============================================================

-- Shared updated_at trigger function
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
-- PROFILES
-- =============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"  on public.profiles for select  using (auth.uid() = id);
create policy "profiles_insert_own"  on public.profiles for insert  with check (auth.uid() = id);
create policy "profiles_update_own"  on public.profiles for update  using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own"  on public.profiles for delete  using (auth.uid() = id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create profile on new Auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, created_at, updated_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- TERRITORIES
-- =============================================================
create table if not exists public.territories (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null default 'Dallas–Fort Worth',
  county_codes    text[] not null default array['043','057','061','070','116','126','129','184','199','220','249'],
  days_to_import  integer not null default 14 check (days_to_import in (7,14,30)),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.territories enable row level security;

create policy "territories_select_own" on public.territories for select  using (auth.uid() = owner_id);
create policy "territories_insert_own" on public.territories for insert  with check (auth.uid() = owner_id);
create policy "territories_update_own" on public.territories for update  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "territories_delete_own" on public.territories for delete  using (auth.uid() = owner_id);

create trigger territories_updated_at
  before update on public.territories
  for each row execute function public.handle_updated_at();

-- =============================================================
-- LEADS
-- =============================================================
create table if not exists public.leads (
  -- Identity
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid not null references auth.users(id) on delete cascade,
  territory_id              uuid references public.territories(id) on delete set null,
  source                    text not null default 'texas_sales_tax_permits',

  -- Texas permit source fields (managed by importer)
  taxpayer_number           text not null,
  outlet_number             text not null,
  taxpayer_name             text,
  taxpayer_address          text,
  taxpayer_city             text,
  taxpayer_state            text,
  taxpayer_zip              text,
  taxpayer_county_code      text,
  taxpayer_organization_type text,
  outlet_name               text,
  outlet_address            text,
  outlet_city               text,
  outlet_state              text,
  outlet_zip                text,
  outlet_county_code        text,
  naics_code                text,
  inside_outside_city       text,
  permit_issue_date         date,
  first_sales_date          date,
  raw_record                jsonb,
  first_imported_at         timestamptz not null default now(),
  last_seen_at              timestamptz not null default now(),

  -- CRM fields (never overwritten by importer)
  display_name              text,
  category                  text,
  score                     integer not null default 0 check (score >= 0 and score <= 100),
  priority                  text not null default 'low' check (priority in ('hot','good','low','skip')),
  score_reasons             text[],
  status                    text not null default 'new' check (status in ('new','attempted','connected','follow_up','appointment','won','lost','do_not_contact')),
  starred                   boolean not null default false,
  primary_phone             text,
  primary_email             text,
  website                   text,
  owner_name                text,
  contact_title             text,
  google_maps_url           text,
  enrichment_status         text check (enrichment_status in ('pending','running','completed','failed')),
  enriched_at               timestamptz,
  last_contacted_at         timestamptz,
  next_follow_up_at         timestamptz,
  -- Estimate only — not a factual claim about actual card volume
  est_monthly_processing    text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint leads_unique_texas_identity unique (owner_id, source, taxpayer_number, outlet_number)
);

alter table public.leads enable row level security;

create policy "leads_select_own" on public.leads for select  using (auth.uid() = owner_id);
create policy "leads_insert_own" on public.leads for insert  with check (auth.uid() = owner_id);
create policy "leads_update_own" on public.leads for update  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "leads_delete_own" on public.leads for delete  using (auth.uid() = owner_id);

create index if not exists leads_owner_status       on public.leads(owner_id, status);
create index if not exists leads_owner_priority     on public.leads(owner_id, priority);
create index if not exists leads_owner_follow_up    on public.leads(owner_id, next_follow_up_at nulls last);
create index if not exists leads_owner_permit_date  on public.leads(owner_id, permit_issue_date desc nulls last);
create index if not exists leads_owner_first_sales  on public.leads(owner_id, first_sales_date desc nulls last);
create index if not exists leads_owner_city         on public.leads(owner_id, outlet_city);
create index if not exists leads_owner_naics        on public.leads(owner_id, naics_code);
create index if not exists leads_owner_score        on public.leads(owner_id, score desc);
create index if not exists leads_owner_starred      on public.leads(owner_id, starred) where starred = true;
create index if not exists leads_owner_county       on public.leads(owner_id, outlet_county_code);

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.handle_updated_at();

-- =============================================================
-- CONTACTS
-- =============================================================
create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  full_name        text not null,
  title            text,
  business_phone   text,
  mobile_phone     text,
  email            text,
  contact_type     text check (contact_type in ('owner','manager','decision_maker','other')),
  source_url       text,
  is_primary       boolean not null default false,
  source_type      text not null default 'manual' check (source_type in ('manual','enriched')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.contacts enable row level security;

create policy "contacts_select_own" on public.contacts for select  using (auth.uid() = owner_id);
create policy "contacts_insert_own" on public.contacts for insert  with check (auth.uid() = owner_id);
create policy "contacts_update_own" on public.contacts for update  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "contacts_delete_own" on public.contacts for delete  using (auth.uid() = owner_id);

create index if not exists contacts_lead_id on public.contacts(lead_id);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.handle_updated_at();

-- =============================================================
-- ACTIVITIES
-- =============================================================
create table if not exists public.activities (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete set null,
  activity_type    text not null check (activity_type in ('call','note','email','meeting','status_change')),
  call_outcome     text check (call_outcome in ('no_answer','voicemail','connected','call_back','not_interested','appointment','won')),
  notes            text,
  duration_seconds integer,
  occurred_at      timestamptz not null default now(),
  next_follow_up_at timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.activities enable row level security;

create policy "activities_select_own" on public.activities for select  using (auth.uid() = owner_id);
create policy "activities_insert_own" on public.activities for insert  with check (auth.uid() = owner_id);
create policy "activities_update_own" on public.activities for update  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "activities_delete_own" on public.activities for delete  using (auth.uid() = owner_id);

create index if not exists activities_lead_occurred  on public.activities(lead_id, occurred_at desc);
create index if not exists activities_owner_follow   on public.activities(owner_id, next_follow_up_at nulls last);

-- =============================================================
-- IMPORT RUNS
-- =============================================================
create table if not exists public.import_runs (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users(id) on delete cascade,
  territory_id         uuid references public.territories(id) on delete set null,
  source               text not null default 'texas_sales_tax_permits',
  status               text not null default 'running' check (status in ('running','completed','partial','failed')),
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

alter table public.import_runs enable row level security;

create policy "import_runs_select_own" on public.import_runs for select  using (auth.uid() = owner_id);
create policy "import_runs_insert_own" on public.import_runs for insert  with check (auth.uid() = owner_id);
create policy "import_runs_update_own" on public.import_runs for update  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index if not exists import_runs_owner_started on public.import_runs(owner_id, started_at desc);
