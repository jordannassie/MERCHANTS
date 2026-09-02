#!/usr/bin/env node
/**
 * Attempts to apply pending Supabase migrations at Netlify build time.
 * Uses Supabase Management API — requires SUPABASE_ACCESS_TOKEN (PAT) if set,
 * otherwise falls back to the service role key (works if project allows it).
 *
 * Build always continues even if migrations fail (exit 0).
 * Manual fallback SQL is printed to the build log for any failed migration.
 *
 * Migrations attempted (idempotent — safe to re-run):
 *   005_global_workspace.sql
 *   006_contact_enrichment.sql  (legacy — superceded by 007)
 *   007_enrichment_columns.sql
 */

const fs   = require('fs')
const path = require('path')
const https = require('https')

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
// PAT from Supabase dashboard → Account → Access Tokens (optional but preferred)
const ACCESS_TOKEN  = process.env.SUPABASE_ACCESS_TOKEN || SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping migrations')
  process.exit(0)
}

const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)
if (!match) { console.error('Cannot extract project ref from URL:', SUPABASE_URL); process.exit(0) }
const projectRef = match[1]
console.log(`[migrate] Supabase project: ${projectRef}`)

// ── Helpers ──────────────────────────────────────────────────────────────────

function readMigration(filename) {
  const p = path.join(__dirname, '../supabase/migrations', filename)
  if (!fs.existsSync(p)) { console.warn(`[migrate] File not found: ${p} — skipping`); return null }
  return fs.readFileSync(p, 'utf8')
}

function httpsPost(url, body, headers) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const data = typeof body === 'string' ? body : JSON.stringify(body)
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let out = ''
      res.on('data', c => out += c)
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: out }))
    })
    req.on('error', e => resolve({ ok: false, status: 0, body: e.message }))
    req.write(data); req.end()
  })
}

/** Try Supabase Management API /database/query */
async function tryManagementApi(sql) {
  const res = await httpsPost(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    { query: sql },
    { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
  )
  return res
}

/** Check if a column exists via PostgREST (proves migration applied) */
async function columnExists(table, column) {
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=0`)
    https.get({ hostname: url.hostname, path: url.pathname + url.search, headers: {
      'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
    }}, (res) => {
      resolve(res.statusCode === 200)
    }).on('error', () => resolve(false))
  })
}

/** Check if function migration_007_applied() exists via RPC */
async function rpc007Applied() {
  const res = await httpsPost(
    `${SUPABASE_URL}/rest/v1/rpc/migration_007_applied`,
    {},
    { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  )
  return res.ok && res.body === 'true'
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Fast-check: are migration 005 tables present?
  const tablesOk = await columnExists('leads', 'id')
  if (!tablesOk) {
    console.warn('[migrate] leads table not found — 005 migration may be needed')
    const sql = readMigration('005_global_workspace.sql')
    if (sql) await applyMigration('005_global_workspace.sql', sql)
  } else {
    console.log('[migrate] ✓ 005 tables present')
  }

  // Check if 007 columns exist (covers 006 too since 007 is a superset)
  const col007 = await columnExists('leads', 'google_place_id')
  if (!col007) {
    const sql007 = readMigration('007_enrichment_columns.sql')
    if (sql007) await applyMigration('007_enrichment_columns.sql', sql007)
  } else {
    console.log('[migrate] ✓ 007 enrichment columns present')
  }

  // Check if 008 columns exist (permit_phone + entity_records)
  const col008 = await columnExists('leads', 'permit_phone')
  if (!col008) {
    const sql008 = readMigration('008_permit_phone_and_entity.sql')
    if (sql008) await applyMigration('008_permit_phone_and_entity.sql', sql008)
  } else {
    console.log('[migrate] ✓ 008 permit_phone + entity_records present')
  }

  // Check if 009 table exists (sift_import_log)
  const tbl009 = await columnExists('sift_import_log', 'filename')
  if (!tbl009) {
    const sql009 = readMigration('009_sift_import_log.sql')
    if (sql009) await applyMigration('009_sift_import_log.sql', sql009)
  } else {
    console.log('[migrate] ✓ 009 sift_import_log present')
  }

  // Check if 010 chain detection is applied (leads.category = 'corporate_chain' may exist already)
  // Migration 010 is always re-run (it's idempotent) to catch any new leads since last run.
  // We detect whether it's needed by looking for any chain leads not yet categorized.
  const sql010 = readMigration('010_mark_chain_leads.sql')
  if (sql010) {
    console.log('[migrate] Applying 010_mark_chain_leads (idempotent)…')
    await applyMigration('010_mark_chain_leads.sql', sql010)
  }

  // Check if 012 support_requests table exists
  const tbl012 = await columnExists('support_requests', 'id')
  if (!tbl012) {
    const sql012 = readMigration('012_support_requests.sql')
    if (sql012) await applyMigration('012_support_requests.sql', sql012)
  } else {
    console.log('[migrate] ✓ 012 support_requests present')
  }
}

async function applyMigration(filename, sql) {
  console.log(`[migrate] Applying ${filename}…`)
  const result = await tryManagementApi(sql)

  if (result.ok) {
    console.log(`[migrate] ✓ ${filename} applied via Management API`)
    return true
  }

  // Likely 401 (PAT required) or 403 — provide manual instructions
  console.log(`[migrate] ⚠ Management API returned ${result.status} for ${filename}`)
  console.log(`[migrate]   (This is expected if SUPABASE_ACCESS_TOKEN is not set)`)
  console.log('')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  MANUAL MIGRATION REQUIRED                                  ║')
  console.log(`║  1. Open: https://supabase.com/dashboard/project/${projectRef}/sql/new`)
  console.log(`║  2. Paste the contents of: supabase/migrations/${filename}`)
  console.log('║  3. Click "Run"                                              ║')
  console.log('║  App works without this migration — it stores extra data     ║')
  console.log('║  in enrichment_jobs until these columns are added.           ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('')
  return false
}

main().catch(err => {
  console.error('[migrate] Script error:', err.message)
  process.exit(0) // Always continue the build
})
