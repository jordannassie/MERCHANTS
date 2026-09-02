export default function LeadsLoading() {
  return (
    <div className="px-4 md:px-8 py-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="h-8 w-24 bg-gray-200 rounded-lg" />
        <div className="h-3.5 w-32 bg-gray-200 rounded" />
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
        <div className="h-8 flex-1 bg-gray-100 rounded-lg" />
        <div className="h-8 w-24 bg-gray-100 rounded-lg" />
        <div className="h-8 w-24 bg-gray-100 rounded-lg" />
      </div>

      {/* Result count */}
      <div className="h-4 w-36 bg-gray-200 rounded mb-3" />

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center gap-4 px-4">
          {[120, 80, 60, 80, 60].map((w, i) => (
            <div key={i} className={`h-3 bg-gray-200 rounded`} style={{ width: w }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-gray-100 px-4 flex items-center gap-4"
          >
            <div className="h-4 w-44 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-28 bg-gray-200 rounded ml-auto" />
            <div className="h-7 w-14 bg-gray-200 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
