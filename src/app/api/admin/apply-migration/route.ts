/**
 * POST /api/admin/apply-migration
 *
 * Applies every pending additive migration that is not yet present
 * in production, in numeric file order.
 *
 * Never drops, truncates, or re-imports data.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  PENDING_MIGRATIONS,
  objectExists,
  probeMigrations,
  readMigrationSql,
} from '@/lib/migrations/pending-apply'

export const maxDuration = 60

async function runViaManagementApi(
  sql: string,
  projectRef: string,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(25_000),
    })
    if (res.ok) return { ok: true }
    const body = await res.text()
    return { ok: false, error: `Management API ${res.status}: ${body.slice(0, 300)}` }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function GET() {
  const db = createServiceClient()
  const probe = await probeMigrations(db)
  return NextResponse.json({
    ok: true,
    ...probe,
    supabase_url: 'https://supabase.com/dashboard/project/phhczohqidgrvcmszets/sql/new',
  })
}

export async function POST() {
  const db = createServiceClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? ''
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
  const projectRef = match?.[1] ?? ''
  const canUseApi = !!(accessToken && projectRef)

  const results: string[] = []
  const sqlBlocks: { label: string; sql: string }[] = []
  const errors: string[] = []

  for (const mig of PENDING_MIGRATIONS) {
    const present = await objectExists(db, mig.probe.table, mig.probe.column)
    if (present && !mig.alwaysApply) {
      results.push(`✓ ${mig.id} already applied`)
      continue
    }

    const sql = readMigrationSql(mig.file)
    if (!sql) {
      errors.push(`Could not read ${mig.file}`)
      continue
    }

    if (canUseApi) {
      const r = await runViaManagementApi(sql, projectRef, accessToken)
      if (r.ok) {
        results.push(`✓ ${mig.file} applied`)
        continue
      }
      errors.push(`${mig.file}: ${r.error}`)
    }

    sqlBlocks.push({ label: `Migration ${mig.file}`, sql })
  }

  if (sqlBlocks.length === 0 && errors.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'All tracked migrations are already applied.',
      results,
    })
  }

  return NextResponse.json({
    ok: sqlBlocks.length === 0,
    applied: results,
    errors,
    manual: sqlBlocks.length > 0,
    message: canUseApi
      ? 'Some migrations could not be applied automatically.'
      : 'SUPABASE_ACCESS_TOKEN is not set — apply these SQL blocks in the Supabase SQL Editor, in order.',
    supabase_url: `https://supabase.com/dashboard/project/${projectRef || 'phhczohqidgrvcmszets'}/sql/new`,
    sql_blocks: sqlBlocks,
  })
}
