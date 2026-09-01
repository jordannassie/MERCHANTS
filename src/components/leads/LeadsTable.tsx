import Link from 'next/link'
import type { Lead } from '@/lib/types'
import { fmtDate, fmtPhone, STATUS_COLORS, PRIORITY_COLORS } from '@/lib/utils'
import { DFW_COUNTIES } from '@/lib/constants'
import { Star, Phone } from 'lucide-react'

interface Props { leads: Lead[] }

export function LeadsTable({ leads }: Props) {
  return (
    <>
      {/* ── Desktop table ──────────────────────────────────────────────── */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Business</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">City</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Phone</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Permit</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Opens</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Priority</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider w-12">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leads.map(lead => (
              <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {lead.starred && <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                    <Link href={`/leads/${lead.id}`} className="font-medium text-gray-900 hover:text-blue-600 truncate max-w-xs">
                      {lead.display_name || lead.outlet_name || lead.taxpayer_name || '(Unnamed)'}
                    </Link>
                  </div>
                  {lead.naics_code && <p className="text-xs text-gray-400 mt-0.5">NAICS {lead.naics_code}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <div>{lead.outlet_city}</div>
                  {lead.outlet_county_code && (
                    <div className="text-xs text-gray-400">{DFW_COUNTIES[lead.outlet_county_code] ?? lead.outlet_county_code} Co.</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {lead.primary_phone ? (
                    <a href={`tel:${lead.primary_phone}`} className="text-blue-600 hover:underline flex items-center gap-1">
                      <Phone size={11} />{fmtPhone(lead.primary_phone)}
                    </a>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(lead.permit_issue_date)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {lead.first_sales_date ? (
                    <span className={new Date(lead.first_sales_date) >= new Date() ? 'text-green-600 font-medium' : ''}>
                      {fmtDate(lead.first_sales_date)}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[lead.priority]}`}>
                    {lead.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                    {lead.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-900 font-medium">{lead.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ───────────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {leads.map(lead => (
          <Link key={lead.id} href={`/leads/${lead.id}`} className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 active:bg-gray-50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {lead.starred && <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                  <p className="font-medium text-gray-900 truncate">
                    {lead.display_name || lead.outlet_name || '(Unnamed)'}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{lead.outlet_city} · NAICS {lead.naics_code || '—'}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[lead.priority]}`}>{lead.priority}</span>
                <span className="text-xs font-semibold text-gray-700">{lead.score}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                {lead.status.replace('_', ' ')}
              </span>
              {lead.primary_phone && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <Phone size={11} />{fmtPhone(lead.primary_phone)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
