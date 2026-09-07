import { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtPhone } from '@/lib/utils'
import { Phone, ChevronRight, MessageSquare, FileCheck, Flame, Clock } from 'lucide-react'
import { SendNowButton } from '@/components/follow-ups/SendNowButton'

export const metadata: Metadata = { title: 'Follow-ups — Merchant Radar' }
export const dynamic = 'force-dynamic'

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function stepLabel(step: number | null | undefined): string {
  if (!step) return 'Follow-up #1'
  return `Follow-up #${step + 1}`
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function FollowUpsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filter = sp.filter ?? ''

  const db = createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const tomorrowIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const in48hIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  const in7dIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── A. NEEDS ATTENTION ────────────────────────────────────────────────────

  // 1. Agreement Requests
  const { data: agreementLeads } = await db
    .from('leads')
    .select('id,display_name,outlet_name,outlet_city,permit_phone,primary_phone,proposal_contact_name,proposal_contact_phone,agreement_requested_at,status')
    .in('proposal_status', ['agreement_requested', 'accepted'])
    .order('agreement_requested_at', { ascending: false })

  // 2. Replies (sms_needs_reply = true)
  const { data: replyLeads } = await db
    .from('leads')
    .select('id,display_name,outlet_name,outlet_city,permit_phone,primary_phone,sms_last_sent_at,status')
    .eq('sms_needs_reply', true)
    .order('sms_last_sent_at', { ascending: false })

  // 3. Hot Proposals (viewed, not needs-reply, not agreement/accepted)
  const { data: hotLeads } = await db
    .from('leads')
    .select('id,display_name,outlet_name,outlet_city,permit_phone,primary_phone,proposal_last_viewed_at,proposal_view_count,proposal_status')
    .eq('proposal_status', 'viewed')
    .not('sms_needs_reply', 'eq', true)
    .order('proposal_last_viewed_at', { ascending: false, nullsFirst: false })

  // ── B. DUE TODAY ──────────────────────────────────────────────────────────
  const { data: dueLeads } = await db
    .from('leads')
    .select('id,display_name,outlet_name,outlet_city,permit_phone,primary_phone,next_follow_up_at,followup_step,proposal_status,status')
    .lte('next_follow_up_at', nowIso)
    .is('followup_completed_at', null)
    .not('status', 'in', '(won,lost,do_not_contact)')
    .not('proposal_status', 'in', '(agreement_requested,accepted)')
    .order('next_follow_up_at', { ascending: true })

  // Filter out sms_needs_reply in JS (Supabase can't do `is false` easily)
  const dueTodayLeads = (dueLeads ?? []).filter(l => !(l as Record<string, unknown>).sms_needs_reply)

  // ── C. UPCOMING ───────────────────────────────────────────────────────────
  const { data: tomorrowLeads } = await db
    .from('leads')
    .select('id,display_name,outlet_name,outlet_city,permit_phone,primary_phone,next_follow_up_at,followup_step,proposal_status,status')
    .gt('next_follow_up_at', nowIso)
    .lte('next_follow_up_at', in48hIso)
    .is('followup_completed_at', null)
    .not('status', 'in', '(won,lost,do_not_contact)')
    .order('next_follow_up_at', { ascending: true })

  const { data: next7Leads } = await db
    .from('leads')
    .select('id,display_name,outlet_name,outlet_city,permit_phone,primary_phone,next_follow_up_at,followup_step,proposal_status,status')
    .gt('next_follow_up_at', in48hIso)
    .lte('next_follow_up_at', in7dIso)
    .is('followup_completed_at', null)
    .not('status', 'in', '(won,lost,do_not_contact)')
    .order('next_follow_up_at', { ascending: true })

  // ── Apply filter ──────────────────────────────────────────────────────────
  const showAgreements = !filter || filter === 'agreement'
  const showReplies = !filter || filter === 'replies'
  const showHot = !filter || filter === 'hot'
  const showDue = !filter || filter === 'due'
  const showUpcoming = !filter

  const totalAttention =
    (agreementLeads?.length ?? 0) +
    (replyLeads?.length ?? 0) +
    (hotLeads?.length ?? 0)

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Follow-ups</h1>
          {totalAttention > 0 && (
            <p className="text-sm text-orange-600 mt-0.5">
              {totalAttention} item{totalAttention !== 1 ? 's' : ''} need attention
            </p>
          )}
        </div>
        {filter && (
          <Link
            href="/follow-ups"
            className="text-xs text-blue-600 hover:underline"
          >
            Clear filter
          </Link>
        )}
      </div>

      <div className="space-y-8">

        {/* ── NEEDS ATTENTION ── */}
        {(showAgreements || showReplies || showHot) && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              Needs Attention
            </h2>
            <div className="space-y-2">

              {/* Agreement Requests */}
              {showAgreements && (agreementLeads ?? []).map(lead => {
                const phone = (lead.proposal_contact_phone || lead.permit_phone || lead.primary_phone) as string | null
                return (
                  <div key={lead.id} className="bg-white rounded-xl border border-green-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 uppercase tracking-wide">
                            <FileCheck size={9} /> Agreement Request
                          </span>
                        </div>
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-gray-900 hover:text-blue-600 block truncate">
                          {(lead.display_name || lead.outlet_name || '(Unnamed)') as string}
                          {lead.outlet_city ? <span className="text-gray-400 font-normal"> — {lead.outlet_city as string}</span> : null}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {lead.proposal_contact_name
                            ? `${lead.proposal_contact_name as string}${phone ? ` · ${fmtPhone(phone)}` : ''}`
                            : 'Agreement requested'}
                          {lead.agreement_requested_at
                            ? ` · ${timeAgo(lead.agreement_requested_at as string)}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            <Phone size={11} /> Call
                          </a>
                        )}
                        <Link
                          href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                          Open <ChevronRight size={11} />
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Replies */}
              {showReplies && (replyLeads ?? []).map(lead => {
                const phone = (lead.permit_phone || lead.primary_phone) as string | null
                return (
                  <div key={lead.id} className="bg-white rounded-xl border border-orange-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 uppercase tracking-wide">
                            <MessageSquare size={9} /> Reply
                          </span>
                        </div>
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-gray-900 hover:text-blue-600 block truncate">
                          {(lead.display_name || lead.outlet_name || '(Unnamed)') as string}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Replied {timeAgo(lead.sms_last_sent_at as string | null)}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                          Open <ChevronRight size={11} />
                        </Link>
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            <Phone size={11} /> Call
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Hot Proposals */}
              {showHot && (hotLeads ?? []).map(lead => {
                const phone = (lead.permit_phone || lead.primary_phone) as string | null
                const viewCount = (lead.proposal_view_count ?? 0) as number
                return (
                  <div key={lead.id} className="bg-white rounded-xl border border-blue-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-wide">
                            <Flame size={9} /> Hot Proposal
                          </span>
                        </div>
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-gray-900 hover:text-blue-600 block truncate">
                          {(lead.display_name || lead.outlet_name || '(Unnamed)') as string}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Viewed {viewCount}×
                          {lead.proposal_last_viewed_at
                            ? ` · Last viewed ${timeAgo(lead.proposal_last_viewed_at as string)}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            <Phone size={11} /> Call
                          </a>
                        )}
                        <Link
                          href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                          Open <ChevronRight size={11} />
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}

              {showAgreements && showReplies && showHot &&
                (agreementLeads ?? []).length === 0 &&
                (replyLeads ?? []).length === 0 &&
                (hotLeads ?? []).length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Nothing needs attention right now 🎉
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── DUE TODAY ── */}
        {showDue && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <Clock size={12} /> Due Today
              {dueTodayLeads.length > 0 && (
                <span className="text-yellow-600 normal-case font-semibold">
                  ({dueTodayLeads.length})
                </span>
              )}
            </h2>
            {dueTodayLeads.length === 0 ? (
              <p className="text-sm text-gray-400">No follow-ups due today.</p>
            ) : (
              <div className="space-y-2">
                {dueTodayLeads.map(lead => {
                  const phone = (lead.permit_phone || lead.primary_phone) as string | null
                  const step = (lead.followup_step ?? 0) as number
                  const proposalViewed = lead.proposal_status === 'viewed'
                  return (
                    <div key={lead.id} className="bg-white rounded-xl border border-yellow-200 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 uppercase tracking-wide">
                              Follow-up #{step + 1}
                            </span>
                            {proposalViewed && (
                              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                Proposal viewed
                              </span>
                            )}
                          </div>
                          <Link href={`/leads/${lead.id}`} className="font-semibold text-gray-900 hover:text-blue-600 block truncate">
                            {(lead.display_name || lead.outlet_name || '(Unnamed)') as string}
                            {lead.outlet_city ? <span className="text-gray-400 font-normal"> — {lead.outlet_city as string}</span> : null}
                          </Link>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Due {timeAgo(lead.next_follow_up_at as string | null) || 'today'}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <SendNowButton leadId={lead.id} />
                          <Link
                            href={`/leads/${lead.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                          >
                            Open <ChevronRight size={11} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ── UPCOMING ── */}
        {showUpcoming && (
          <>
            {(tomorrowLeads ?? []).length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Tomorrow
                </h2>
                <div className="space-y-2">
                  {(tomorrowLeads ?? []).map(lead => {
                    const phone = (lead.permit_phone || lead.primary_phone) as string | null
                    const step = (lead.followup_step ?? 0) as number
                    return (
                      <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 uppercase tracking-wide mb-1">
                              Follow-up #{step + 1}
                            </span>
                            <Link href={`/leads/${lead.id}`} className="font-semibold text-gray-900 hover:text-blue-600 block truncate">
                              {(lead.display_name || lead.outlet_name || '(Unnamed)') as string}
                              {lead.outlet_city ? <span className="text-gray-400 font-normal"> — {lead.outlet_city as string}</span> : null}
                            </Link>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {phone && (
                              <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                                <Phone size={10} />
                              </a>
                            )}
                            <Link href={`/leads/${lead.id}`} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                              Open <ChevronRight size={11} />
                            </Link>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {(next7Leads ?? []).length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Next 7 Days
                </h2>
                <div className="space-y-2">
                  {(next7Leads ?? []).map(lead => {
                    const phone = (lead.permit_phone || lead.primary_phone) as string | null
                    const step = (lead.followup_step ?? 0) as number
                    return (
                      <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 uppercase tracking-wide mb-1">
                              Follow-up #{step + 1}
                            </span>
                            <Link href={`/leads/${lead.id}`} className="font-semibold text-gray-900 hover:text-blue-600 block truncate">
                              {(lead.display_name || lead.outlet_name || '(Unnamed)') as string}
                              {lead.outlet_city ? <span className="text-gray-400 font-normal"> — {lead.outlet_city as string}</span> : null}
                            </Link>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Due {new Date(lead.next_follow_up_at as string).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {phone && (
                              <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                                <Phone size={10} />
                              </a>
                            )}
                            <Link href={`/leads/${lead.id}`} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
                              Open <ChevronRight size={11} />
                            </Link>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
