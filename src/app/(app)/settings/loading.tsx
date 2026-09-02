export default function SettingsLoading() {
  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto animate-pulse space-y-4">
      <div className="h-8 w-24 bg-gray-200 rounded" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="h-5 w-40 bg-gray-200 rounded mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-100 rounded" />
            <div className="h-4 w-2/3 bg-gray-100 rounded" />
          </div>
          <div className="h-9 w-32 bg-gray-200 rounded-lg mt-4" />
        </div>
      ))}
    </div>
  )
}
