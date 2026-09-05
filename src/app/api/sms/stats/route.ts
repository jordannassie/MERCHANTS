import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const DAILY_LIMIT = 50

function todayMidnightUTC(): string {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString()
}

export async function GET() {
  const db = createServiceClient()
  const todayStart = todayMidnightUTC()

  const [
    { count: sent },
    { count: delivered },
    { count: failed },
    { count: replies },
    { count: optedOut },
    { count: needsReply },
  ] = await Promise.all([
    // Sent today (outbound submitted + delivered)
    db.from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('sent_at', todayStart),

    // Delivered today
    db.from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('status', 'delivered')
      .gte('sent_at', todayStart),

    // Failed today
    db.from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('status', 'failed')
      .gte('sent_at', todayStart),

    // Inbound replies today
    db.from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .gte('sent_at', todayStart),

    // Opted-out leads
    db.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('sms_status', 'opted_out'),

    // Leads needing reply
    db.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('sms_needs_reply', true),
  ])

  const sentCount = sent ?? 0
  const dailyLimit = DAILY_LIMIT

  return NextResponse.json({
    today: {
      sent:      sentCount,
      delivered: delivered ?? 0,
      failed:    failed ?? 0,
      replies:   replies ?? 0,
      opted_out: optedOut ?? 0,
    },
    needs_reply_count: needsReply ?? 0,
    daily_limit:       dailyLimit,
    remaining_today:   Math.max(0, dailyLimit - sentCount),
    is_paused:         process.env.SMS_PAUSED === 'true',
  })
}
