/**
 * POST /api/import/sweep/preflight
 *
 * Checks all prerequisites before allowing a sweep to start:
 *   1. GOOGLE_MAPS_API_KEY is set
 *   2. google_search_runs table exists (migration 017)
 *   3. lead_sources table exists (migration 017)
 *   4. leads.lead_source_label column exists (migration 017)
 *   5. google_sweeps table exists (migration 018)
 *   6. Optionally: fires one test Places API call to confirm the key is valid
 *
 * Returns:
 *   { ready: boolean, checks: Check[], error?: string, test_result?: { checked, callable } }
 *
 * If ready === false, the panel must NOT start the sweep and must show the errors.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { textSearchPlaces } from '@/lib/google-places'

export const maxDuration = 15

interface Check {
  id: string
  label: string
  ok: boolean
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

async function tableExists(db: AnyDb, table: string): Promise<boolean> {
  const { error } = await db.from(table).select('id').limit(0)
  // table doesn't exist → PostgREST returns an error (code 42P01 or PGRST...)
  return !error
}

async function columnExists(db: AnyDb, table: string, col: string): Promise<boolean> {
  const { error } = await db.from(table).select(col).limit(0)
  return !error
}

export async function POST(req: Request) {
  const db = createServiceClient()
  const body = await req.json().catch(() => ({})) as { testSearch?: boolean }
  const runTest = body.testSearch !== false  // default true

  const checks: Check[] = []

  // ── 1. API key ────────────────────────────────────────────────────────────
  const hasKey = !!process.env.GOOGLE_MAPS_API_KEY
  checks.push({
    id:    'api_key',
    label: 'GOOGLE_MAPS_API_KEY configured',
    ok:    hasKey,
    error: hasKey ? undefined : 'GOOGLE_MAPS_API_KEY environment variable is not set.',
  })

  // ── 2-5. DB tables/columns (run in parallel) ──────────────────────────────
  const [
    runsTableOk,
    sourcesTableOk,
    labelColOk,
    sweepsTableOk,
  ] = await Promise.all([
    tableExists(db, 'google_search_runs'),
    tableExists(db, 'lead_sources'),
    columnExists(db, 'leads', 'lead_source_label'),
    tableExists(db, 'google_sweeps'),
  ])

  const missingMigration = !runsTableOk || !sourcesTableOk || !labelColOk || !sweepsTableOk
  const migrationLabel   = 'Database migrations 017 + 018 applied'
  const missing: string[] = []
  if (!runsTableOk)    missing.push('google_search_runs table')
  if (!sourcesTableOk) missing.push('lead_sources table')
  if (!labelColOk)     missing.push('leads.lead_source_label column')
  if (!sweepsTableOk)  missing.push('google_sweeps table')

  checks.push({
    id:    'db_schema',
    label: migrationLabel,
    ok:    !missingMigration,
    error: missingMigration
      ? `Missing database objects: ${missing.join(', ')}. Click "Apply Migration" to fix this.`
      : undefined,
  })

  // ── 6. Test search (only if key and DB are both OK) ───────────────────────
  let testResult: { checked: number; callable: number } | undefined

  if (runTest && hasKey && !missingMigration) {
    try {
      const result = await textSearchPlaces('restaurants Houston TX', 1)
      if (result.error) {
        checks.push({
          id:    'api_test',
          label: 'Google Places API accessible',
          ok:    false,
          error: result.error.type === 'api_disabled'
            ? `Places API (New) is not enabled in Google Cloud Console. Enable it at: console.cloud.google.com/apis/library`
            : result.error.type === 'quota_exceeded'
              ? 'Google Places API quota exceeded. Wait before retrying.'
              : result.error.type === 'request_denied'
                ? 'API key denied — check Google Cloud Console for IP/API restrictions.'
                : `Google Places API error: ${(result.error as { message?: string }).message ?? result.error.type}`,
        })
      } else {
        const checked  = result.places.length
        const callable = result.places.filter(p => p.nationalPhoneNumber || p.internationalPhoneNumber).length
        testResult = { checked, callable }
        checks.push({
          id:    'api_test',
          label: 'Google Places API accessible',
          ok:    true,
          error: undefined,
        })
      }
    } catch (err) {
      checks.push({
        id:    'api_test',
        label: 'Google Places API accessible',
        ok:    false,
        error: String(err),
      })
    }
  }

  const ready = checks.every(c => c.ok)

  return NextResponse.json({ ready, checks, test_result: testResult })
}
