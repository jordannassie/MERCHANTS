#!/usr/bin/env node
/**
 * Applies pending Supabase migrations at Netlify build time.
 *
 * Migrations applied (idempotent — safe to re-run):
 *   005_global_workspace.sql
 *   006_contact_enrichment.sql
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL   - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  - Service-role JWT (never exposed to browser)
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)
if (!match) {
  console.error('Cannot extract project ref from URL:', SUPABASE_URL)
  process.exit(1)
}
const projectRef = match[1]
console.log(`Applying migrations to Supabase project: ${projectRef}`)

const migrations = [
  '005_global_workspace.sql',
  '006_contact_enrichment.sql',
]

function readMigration(filename) {
  const p = path.join(__dirname, '../supabase/migrations', filename)
  if (!fs.existsSync(p)) {
    console.warn(`Migration file not found: ${p} — skipping`)
    return null
  }
  return fs.readFileSync(p, 'utf8')
}

async function runSQL(sql) {
  const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
  const body = JSON.stringify({ query: sql })

  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl)
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data })
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function tablesExist() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/territories?select=id&limit=1`, {
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }
    })
    return res.status === 200
  } catch {
    return false
  }
}

async function enrichmentColumnsExist() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leads?select=google_place_id&limit=0`, {
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }
    })
    return res.status === 200
  } catch {
    return false
  }
}

async function main() {
  const [tablesOk, enrichmentOk] = await Promise.all([tablesExist(), enrichmentColumnsExist()])

  const toApply = []
  if (!tablesOk) toApply.push('005_global_workspace.sql')
  if (!enrichmentOk) toApply.push('006_contact_enrichment.sql')

  if (!toApply.length) {
    console.log('✓ All migrations already applied.')
    return
  }

  for (const filename of migrations) {
    if (!toApply.includes(filename)) {
      console.log(`✓ ${filename} — already applied, skipping.`)
      continue
    }

    const sql = readMigration(filename)
    if (!sql) continue

    console.log(`Applying ${filename}…`)
    const result = await runSQL(sql)
    if (result.ok) {
      console.log(`✓ ${filename} applied.`)
    } else {
      console.log(`⚠ ${filename}: Management API returned ${result.status}: ${result.data}`)
      console.log('')
      console.log('═══════════════════════════════════════════════════════════')
      console.log('MANUAL STEP REQUIRED')
      console.log(`1. Open: https://supabase.com/dashboard/project/${projectRef}/sql/new`)
      console.log(`2. Paste: supabase/migrations/${filename}`)
      console.log('3. Click "Run"')
      console.log('═══════════════════════════════════════════════════════════')
    }
  }
}

main().catch(err => {
  console.error('Migration script error:', err.message)
  process.exit(0) // Non-fatal — build continues
})
