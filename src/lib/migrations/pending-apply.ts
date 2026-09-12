import fs from 'fs'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PendingMigration {
  id: string
  file: string
  /** PostgREST probe — if this object exists, the migration is considered applied. */
  probe: { table: string; column: string }
  alwaysApply?: boolean
}

/** Numeric order. Only additive / idempotent SQL. */
export const PENDING_MIGRATIONS: PendingMigration[] = [
  { id: '007', file: '007_enrichment_columns.sql', probe: { table: 'leads', column: 'google_place_id' } },
  { id: '009', file: '009_sift_import_log.sql', probe: { table: 'sift_import_log', column: 'filename' } },
  { id: '014', file: '014_add_industry.sql', probe: { table: 'contacts', column: 'industry' } },
  { id: '015', file: '015_add_lead_fields.sql', probe: { table: 'leads', column: 'industry' } },
  { id: '017', file: '017_google_maps_source.sql', probe: { table: 'leads', column: 'lead_source_label' } },
  { id: '018', file: '018_google_sweeps.sql', probe: { table: 'google_sweeps', column: 'id' } },
  { id: '019', file: '019_sms_integration.sql', probe: { table: 'leads', column: 'sms_status' } },
  { id: '020', file: '020_enrichment_tracking.sql', probe: { table: 'leads', column: 'google_enrichment_attempted_at' } },
  { id: '023', file: '023_proposal_contact_fields.sql', probe: { table: 'leads', column: 'proposal_contact_name' } },
  { id: '024', file: '024_proposal_card_sales.sql', probe: { table: 'leads', column: 'estimated_monthly_card_sales' } },
  { id: '025', file: '025_sales_followup_system.sql', probe: { table: 'leads', column: 'followup_step' } },
  { id: '026', file: '026_new_outreach_system.sql', probe: { table: 'system_settings', column: 'key' }, alwaysApply: true },
  { id: '027', file: '027_proposal_calculator.sql', probe: { table: 'leads', column: 'proposal_selected_option' } },
  { id: '028', file: '028_dnc_optin.sql', probe: { table: 'leads', column: 'opted_out_at' } },
  { id: '029', file: '029_perf_indexes.sql', probe: { table: 'leads', column: 'status' }, alwaysApply: true },
  { id: '030', file: '030_proposal_payment_acceptance.sql', probe: { table: 'leads', column: 'proposal_payment_acceptance' } },
]

export function readMigrationSql(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'supabase', 'migrations', filename),
    path.join(process.cwd(), 'MERCHANTS', 'supabase', 'migrations', filename),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
  }
  return null
}

export async function objectExists(
  db: SupabaseClient,
  table: string,
  column: string,
): Promise<boolean> {
  const { error } = await db.from(table).select(column).limit(0)
  return !error
}

export async function probeMigrations(db: SupabaseClient): Promise<{
  applied: string[]
  missing: string[]
  columns: Record<string, boolean>
}> {
  const columns: Record<string, boolean> = {}
  const applied: string[] = []
  const missing: string[] = []

  for (const mig of PENDING_MIGRATIONS) {
    const ok = await objectExists(db, mig.probe.table, mig.probe.column)
    columns[`${mig.probe.table}.${mig.probe.column}`] = ok
    if (ok && !mig.alwaysApply) applied.push(mig.id)
    else if (!ok) missing.push(mig.id)
    else applied.push(`${mig.id} (seed/index)`)
  }

  return { applied, missing, columns }
}
