#!/usr/bin/env node
/**
 * Applies the global workspace migration to the Supabase project.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL   - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  - Service-role JWT (never exposed to browser)
 *
 * Usage:
 *   node scripts/apply-migration.js
 *
 * Or from Netlify build:
 *   The Netlify build environment has access to these env vars.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Set these environment variables and retry.')
  process.exit(1)
}

const migrationFile = path.join(__dirname, '../supabase/migrations/005_global_workspace.sql')
const sql = fs.readFileSync(migrationFile, 'utf8')

// Extract project ref from URL: https://REF.supabase.co
const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)
if (!match) {
  console.error('Cannot extract project ref from URL:', SUPABASE_URL)
  process.exit(1)
}
const projectRef = match[1]

console.log(`Applying migration to Supabase project: ${projectRef}`)
console.log('Migration file:', path.basename(migrationFile))

/**
 * Try the Supabase Management API (api.supabase.com).
 * Works with service-role key when the JWT matches the project ref.
 */
async function applyViaMgmtAPI() {
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
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ ok: true, data })
        } else {
          resolve({ ok: false, status: res.statusCode, data })
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * Fallback: split into individual statements and run each as an RPC call.
 * Only works for statements that map to PostgREST capabilities.
 */
async function checkTablesExist() {
  const checkUrl = `${SUPABASE_URL}/rest/v1/territories?select=id&limit=1`
  const res = await fetch(checkUrl, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  })
  // 200 means table exists, anything else means it doesn't
  return res.status === 200
}

async function main() {
  try {
    // First check if tables already exist
    const exists = await checkTablesExist()
    if (exists) {
      console.log('✓ Tables already exist in Supabase. Migration already applied.')
      process.exit(0)
    }

    console.log('Tables not found. Attempting to apply migration...')

    // Try Management API
    const result = await applyViaMgmtAPI()
    if (result.ok) {
      console.log('✓ Migration applied successfully via Management API.')
      process.exit(0)
    }

    console.log(`Management API returned ${result.status}: ${result.data}`)
    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('MANUAL STEP REQUIRED')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('The migration must be applied manually.')
    console.log('')
    console.log('1. Open: https://supabase.com/dashboard/project/' + projectRef + '/sql/new')
    console.log('2. Paste the contents of: supabase/migrations/005_global_workspace.sql')
    console.log('3. Click "Run"')
    console.log('')
    console.log('After applying the migration, re-deploy or restart the app.')
    console.log('═══════════════════════════════════════════════════════════')
    // Exit 0 so the Netlify build doesn't fail
    process.exit(0)
  } catch (err) {
    console.error('Migration script error:', err.message)
    process.exit(0) // Non-fatal — app will show setup page
  }
}

main()
