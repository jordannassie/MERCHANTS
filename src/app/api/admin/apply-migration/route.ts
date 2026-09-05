/**
 * POST /api/admin/apply-migration
 *
 * Applies pending Google Maps migrations (017, 018) to production Supabase.
 *
 * Strategy:
 *   1. Check which objects already exist (idempotent table/column checks)
 *   2. If SUPABASE_ACCESS_TOKEN is set → use Supabase Management API to run SQL
 *   3. If not → return the SQL blocks the user must paste manually into Supabase SQL Editor
 *
 * This route is server-only. It never exposes keys to the browser.
 * Auth: accepts any request (internal admin tool — restrict via Netlify IP if needed).
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 30

// ── Migration SQL ─────────────────────────────────────────────────────────────
const MIGRATION_017 = `
-- ── Migration 017: Google Maps source tracking ──────────────────────────────
alter table if exists public.leads
  add column if not exists lead_source_label text
    check (lead_source_label in ('state', 'google', 'both'));

update public.leads
  set lead_source_label = 'state'
  where lead_source_label is null
    and source = 'texas_sales_tax_permits';

update public.leads
  set lead_source_label = 'both'
  where lead_source_label = 'state'
    and google_place_id is not null
    and google_place_id <> '';

update public.leads
  set lead_source_label = 'google'
  where lead_source_label is null
    and google_place_id is not null
    and google_place_id <> '';

update public.leads
  set lead_source_label = 'state'
  where lead_source_label is null;

create unique index if not exists leads_google_place_id_unique
  on public.leads(google_place_id)
  where google_place_id is not null and google_place_id <> '';

create table if not exists public.lead_sources (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  source_type     text not null check (source_type in ('texas_sales_tax_permits', 'google_places')),
  external_id     text,
  source_url      text,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  search_run_id   uuid,
  metadata        jsonb,
  unique (lead_id, source_type)
);

create index if not exists idx_lead_sources_lead_id on public.lead_sources(lead_id);
create index if not exists idx_lead_sources_source_type on public.lead_sources(source_type);
create index if not exists idx_lead_sources_external_id on public.lead_sources(external_id);

alter table public.lead_sources enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'lead_sources' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.lead_sources
      for all to service_role using (true) with check (true);
  end if;
end $$;

create table if not exists public.google_search_runs (
  id              uuid primary key default gen_random_uuid(),
  state           text not null default 'TX',
  location        text,
  query           text not null,
  zip             text,
  results_found   int  not null default 0,
  new_leads       int  not null default 0,
  enriched_leads  int  not null default 0,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  error_message   text,
  raw_results     jsonb
);

alter table public.google_search_runs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'google_search_runs' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.google_search_runs
      for all to service_role using (true) with check (true);
  end if;
end $$;

insert into public.lead_sources (lead_id, source_type, external_id, first_seen_at, last_seen_at)
select id, 'texas_sales_tax_permits', taxpayer_number, coalesce(first_imported_at, now()), coalesce(last_seen_at, now())
from public.leads
where source = 'texas_sales_tax_permits'
on conflict (lead_id, source_type) do nothing;
`.trim()

const MIGRATION_018 = `
-- ── Migration 018: Server-side Google Maps sweep persistence ────────────────
create table if not exists public.google_sweeps (
  id              uuid        primary key default gen_random_uuid(),
  status          text        not null default 'running'
                    check (status in ('running', 'paused', 'done', 'error')),
  sweep_type      text        not null default 'statewide'
                    check (sweep_type in ('statewide', 'city')),
  city            text,
  state           text        not null default 'TX',
  task_index      int         not null default 0,
  tasks_total     int         not null default 0,
  tasks           jsonb,
  checked         int         not null default 0,
  callable        int         not null default 0,
  new_leads       int         not null default 0,
  enriched        int         not null default 0,
  dup_skipped     int         not null default 0,
  no_phone        int         not null default 0,
  errors          int         not null default 0,
  api_calls       int         not null default 0,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz,
  last_error      text,
  last_task_metro text,
  last_task_phrase text
);

create index if not exists idx_google_sweeps_status
  on public.google_sweeps(status, started_at desc);

alter table public.google_sweeps enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'google_sweeps' and policyname = 'service_role_all'
  ) then
    create policy "service_role_all" on public.google_sweeps
      for all to service_role using (true) with check (true);
  end if;
end $$;
`.trim()

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/** Check if a table exists via the service client. */
async function tableExists(db: AnyDb, table: string): Promise<boolean> {
  const { error } = await db.from(table).select('id').limit(0)
  // If the table doesn't exist, PostgREST returns a 42P01 / "relation does not exist" error
  return !error
}

/** Check if a column exists on a table. */
async function columnExists(db: AnyDb, table: string, column: string): Promise<boolean> {
  const { error } = await db.from(table).select(column).limit(0)
  return !error
}

/** Call Supabase Management API to run arbitrary SQL. */
async function runViaManagementApi(sql: string, projectRef: string, accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body:    JSON.stringify({ query: sql }),
      signal:  AbortSignal.timeout(25_000),
    })
    if (res.ok) return { ok: true }
    const body = await res.text()
    return { ok: false, error: `Management API ${res.status}: ${body.slice(0, 300)}` }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST() {
  const db          = createServiceClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? ''

  const match      = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
  const projectRef = match?.[1] ?? ''
  const canUseApi  = !!(accessToken && projectRef)

  // ── Detect what's missing ─────────────────────────────────────────────────
  const [
    has017RunsTable,
    has017SourcesTable,
    has017LabelCol,
    has018SweepsTable,
  ] = await Promise.all([
    tableExists(db, 'google_search_runs'),
    tableExists(db, 'lead_sources'),
    columnExists(db, 'leads', 'lead_source_label'),
    tableExists(db, 'google_sweeps'),
  ])

  const needs017 = !has017RunsTable || !has017SourcesTable || !has017LabelCol
  const needs018 = !has018SweepsTable

  if (!needs017 && !needs018) {
    return NextResponse.json({ ok: true, message: 'All migrations already applied. Database is ready.' })
  }

  // ── Try Management API ────────────────────────────────────────────────────
  if (canUseApi) {
    const results: string[] = []

    if (needs017) {
      const r = await runViaManagementApi(MIGRATION_017, projectRef, accessToken)
      if (r.ok) results.push('✓ Migration 017 applied (google_search_runs, lead_sources, lead_source_label)')
      else       return NextResponse.json({ ok: false, error: `Migration 017 failed: ${r.error}` }, { status: 500 })
    }

    if (needs018) {
      const r = await runViaManagementApi(MIGRATION_018, projectRef, accessToken)
      if (r.ok) results.push('✓ Migration 018 applied (google_sweeps)')
      else       return NextResponse.json({ ok: false, error: `Migration 018 failed: ${r.error}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, applied: results })
  }

  // ── No Management API token — return SQL for manual application ───────────
  const sqlBlocks: { label: string; sql: string }[] = []
  if (needs017) sqlBlocks.push({ label: 'Migration 017 — Google Maps source tracking', sql: MIGRATION_017 })
  if (needs018) sqlBlocks.push({ label: 'Migration 018 — Google sweeps table',         sql: MIGRATION_018 })

  return NextResponse.json({
    ok:           false,
    manual:       true,
    message:      'SUPABASE_ACCESS_TOKEN is not set — apply these SQL blocks manually in the Supabase SQL Editor.',
    supabase_url: `https://supabase.com/dashboard/project/${projectRef}/sql/new`,
    sql_blocks:   sqlBlocks,
  }, { status: 200 }) // 200 so the UI can render the SQL
}
