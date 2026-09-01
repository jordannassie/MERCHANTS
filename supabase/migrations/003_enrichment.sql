-- =============================================================
-- Merchant Radar — Enrichment Jobs (Phase 4)
-- Run after 002_merchant_radar.sql
-- =============================================================

create table if not exists public.enrichment_jobs (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  lead_id             uuid not null references public.leads(id) on delete cascade,
  status              text not null default 'pending' check (status in ('pending','running','completed','failed')),

  -- AI score adjustment stored separately from deterministic score
  ai_score_adjustment integer check (ai_score_adjustment >= -10 and ai_score_adjustment <= 10),
  ai_score_reason     text,

  -- Raw Claude response for auditing
  raw_response        jsonb,

  -- Proposed values pending user review
  proposed_data       jsonb,

  -- Fields the user chose to accept
  accepted_fields     text[],

  -- Source URLs provided by Claude
  sources             jsonb,

  -- Token usage for cost tracking
  input_tokens        integer,
  output_tokens       integer,

  error_message       text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.enrichment_jobs enable row level security;

create policy "enrichment_jobs_select_own" on public.enrichment_jobs for select  using (auth.uid() = owner_id);
create policy "enrichment_jobs_insert_own" on public.enrichment_jobs for insert  with check (auth.uid() = owner_id);
create policy "enrichment_jobs_update_own" on public.enrichment_jobs for update  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "enrichment_jobs_delete_own" on public.enrichment_jobs for delete  using (auth.uid() = owner_id);

create index if not exists enrichment_jobs_lead        on public.enrichment_jobs(lead_id);
create index if not exists enrichment_jobs_owner_status on public.enrichment_jobs(owner_id, status);

create trigger enrichment_jobs_updated_at
  before update on public.enrichment_jobs
  for each row execute function public.handle_updated_at();
