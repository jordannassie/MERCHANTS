export default function LeadDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 pb-24 md:pb-6 animate-pulse">
      {/* Back link */}
      <div className="h-4 w-20 bg-gray-200 rounded mb-4" />

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 mb-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="space-y-3 flex-1">
            <div className="h-7 w-64 bg-gray-200 rounded" />
            <div className="flex gap-2">
              <div className="h-5 w-14 bg-gray-200 rounded-full" />
              <div className="h-5 w-14 bg-gray-200 rounded-full" />
              <div className="h-5 w-20 bg-gray-200 rounded-full" />
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="h-9 w-28 bg-gray-200 rounded-lg" />
            <div className="h-9 w-16 bg-yellow-100 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Content sections */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <div className="h-10 bg-gray-50 border-b border-gray-100" />
          <div className="p-4 space-y-2">
            <div className="h-3.5 w-full bg-gray-100 rounded" />
            <div className="h-3.5 w-3/4 bg-gray-100 rounded" />
            <div className="h-3.5 w-1/2 bg-gray-100 rounded" />
          </div>
        </div>
      ))}

      {/* Main Note skeleton */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="h-12 bg-yellow-50 border-b border-yellow-200" />
        <div className="h-[300px] bg-[#fefce8]" />
      </div>
    </div>
  )
}
