export default function DashboardLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-52 bg-gray-200 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 h-24" />
        ))}
      </div>

      {/* Today's Call List */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-9 w-9 rounded-full bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-48 bg-gray-200 rounded" />
                <div className="h-3 w-28 bg-gray-200 rounded" />
              </div>
              <div className="h-7 w-16 bg-gray-200 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Follow-ups */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="h-10 border-b border-gray-100 bg-gray-50" />
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 px-4 flex items-center gap-3">
              <div className="h-3.5 w-40 bg-gray-200 rounded" />
              <div className="h-3.5 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
