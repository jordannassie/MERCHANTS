import { Search, CheckCircle2, XCircle, Clock, HelpCircle } from 'lucide-react'

type EnrichStatus = 'pending' | 'running' | 'completed' | 'failed' | null | undefined

interface Props {
  status: EnrichStatus
  confidence?: number | null
  className?: string
}

const CONFIG: Record<
  NonNullable<EnrichStatus> | 'none',
  { label: string; icon: React.ElementType; classes: string }
> = {
  none:      { label: 'Not researched', icon: HelpCircle,    classes: 'bg-gray-100 text-gray-500' },
  pending:   { label: 'Review needed',  icon: Clock,         classes: 'bg-amber-50 text-amber-600 border border-amber-200' },
  running:   { label: 'Searching…',    icon: Search,        classes: 'bg-blue-50 text-blue-600 border border-blue-200' },
  completed: { label: 'Contact found', icon: CheckCircle2,  classes: 'bg-green-50 text-green-700 border border-green-200' },
  failed:    { label: 'Not found',     icon: XCircle,       classes: 'bg-red-50 text-red-600 border border-red-200' },
}

export function EnrichmentBadge({ status, confidence, className = '' }: Props) {
  const key = (status as string) in CONFIG ? (status as NonNullable<EnrichStatus>) : 'none'
  const { label, icon: Icon, classes } = CONFIG[key]
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${classes} ${className}`}
    >
      <Icon size={11} />
      {label}
      {status === 'completed' && confidence != null && (
        <span className="text-[10px] opacity-60 ml-0.5">{confidence}%</span>
      )}
    </span>
  )
}
