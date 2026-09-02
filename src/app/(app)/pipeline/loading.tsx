export default function PipelineLoading() {
  return (
    <div className="px-4 md:px-8 py-6 animate-pulse">
      {/* Header */}
      <div className="h-7 w-24 bg-gray-200 rounded mb-1" />
      <div className="h-4 w-72 bg-gray-200 rounded mb-4" />

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-16 bg-gray-200 rounded" />
        <div className="h-8 w-28 bg-blue-100 rounded-full" />
        <div className="h-8 w-20 bg-gray-100 rounded-full" />
      </div>

      {/* Columns */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-64">
            <div className="h-8 bg-gray-200 rounded-lg mb-3" />
            <div className="space-y-2">
              {Array.from({ length: i === 0 ? 4 : i === 1 ? 3 : 2 }).map((_, j) => (
                <div key={j} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                  <div className="h-4 w-36 bg-gray-200 rounded" />
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                  <div className="h-3 w-28 bg-gray-100 rounded" />
                  <div className="flex gap-1.5">
                    <div className="flex-1 h-7 bg-blue-100 rounded-lg" />
                    <div className="flex-1 h-7 bg-yellow-100 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
