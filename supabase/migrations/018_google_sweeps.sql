-- ──────────────────────────────────────────────────────────────────────────
-- Migration 018: Server-side Google Maps sweep persistence
--
-- Adds:
--   1. google_sweeps table — tracks one sweep session per row
--      (task list, progress index, metrics, status)
--
-- SAFE: idempotent — CREATE TABLE IF NOT EXISTS, no truncation/deletion.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.google_sweeps (
  id              uuid        primary key default gen_random_uuid(),
  status          text        not null default 'running'
                    check (status in ('running', 'paused', 'done', 'error')),
  sweep_type      text        not null default 'statewide'
                    check (sweep_type in ('statewide', 'city')),
  city            text,                         -- null for statewide
  state           text        not null default 'TX',
  task_index      int         not null default 0,
  tasks_total     int         not null default 0,
  tasks           jsonb,                        -- full ordered task list for resumability
  -- Live metrics (updated after each task)
  checked         int         not null default 0,  -- raw Google results seen
  callable        int         not null default 0,  -- results with valid US phone
  new_leads       int         not null default 0,
  enriched        int         not null default 0,
  dup_skipped     int         not null default 0,
  no_phone        int         not null default 0,
  errors          int         not null default 0,
  api_calls       int         not null default 0,  -- for cost estimation
  -- Timestamps
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  -- Debug
  last_error      text,
  last_task_metro text,
  last_task_phrase text
);

-- Fast lookup: latest sweep by status
create index if not exists idx_google_sweeps_status
  on public.google_sweeps(status, started_at desc);

alter table public.google_sweeps enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'google_sweeps' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.google_sweeps
      for all to service_role using (true) with check (true);
  end if;
end $$;
