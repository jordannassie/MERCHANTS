import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// PATCH /api/leads/[id]/note
// Body: { main_note: string }
// Saves the persistent main notepad for a lead. Returns the updated row for
// verification before the client shows "Saved".
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  let body: { main_note?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.main_note !== 'string') {
    return NextResponse.json({ error: 'main_note must be a string' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data, error } = await db
    .from('leads')
    .update({
      // Store null for empty — avoids "Note saved" indicator on blank notes
      main_note: body.main_note.trim() || null,
      main_note_updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, main_note, main_note_updated_at')
    .single()

  if (error) {
    // Migration 011 not yet applied — give the user a clear message
    if (
      error.message.toLowerCase().includes('main_note') &&
      error.message.toLowerCase().includes('does not exist')
    ) {
      return NextResponse.json(
        {
          error: 'migration_missing',
          message:
            'Apply migration 011 (supabase/migrations/011_main_note.sql) in your Supabase project to enable main notes.',
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lead: data })
}
