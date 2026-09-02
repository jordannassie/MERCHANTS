/**
 * GET /api/admin/migration-status
 * Reports which migration columns are present in production.
 * No auth required — single-workspace internal tool.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const db = createServiceClient()

  // Check for 007 columns via a probe SELECT (returns 200 if column exists, 400 if not)
  async function colExists(table: string, col: string): Promise<boolean> {
    const { error } = await db.from(table).select(col).limit(0)
    return !error
  }

  // Check for migration_007_applied() RPC function
  async function rpc007Applied(): Promise<boolean> {
    const { data, error } = await db.rpc('migration_007_applied')
    return !error && data === true
  }

  const [
    googlePlaceId,
    internationalPhone,
    contactMatchConfidence,
    contactSource,
    contactsLinkedinUrl,
    contactsConfidence,
    m007Applied,
  ] = await Promise.all([
    colExists('leads', 'google_place_id'),
    colExists('leads', 'international_phone'),
    colExists('leads', 'contact_match_confidence'),
    colExists('leads', 'contact_source'),
    colExists('contacts', 'linkedin_url'),
    colExists('contacts', 'confidence'),
    rpc007Applied(),
  ])

  const migration007 = googlePlaceId && internationalPhone && contactMatchConfidence && contactSource
  const migration007Contacts = contactsLinkedinUrl && contactsConfidence

  return NextResponse.json({
    migrations: {
      '005_global_workspace': true, // implied if API works at all
      '007_enrichment_columns': migration007 && migration007Contacts,
    },
    columns: {
      leads: {
        google_place_id: googlePlaceId,
        international_phone: internationalPhone,
        contact_match_confidence: contactMatchConfidence,
        contact_source: contactSource,
      },
      contacts: {
        linkedin_url: contactsLinkedinUrl,
        confidence: contactsConfidence,
      },
    },
    rpc_function_exists: m007Applied,
    manual_sql_url: 'https://supabase.com/dashboard/project/phhczohqidgrvcmszets/sql/new',
    migration_file: 'supabase/migrations/007_enrichment_columns.sql',
  })
}
