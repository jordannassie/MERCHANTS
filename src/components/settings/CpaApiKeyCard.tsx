import { ExternalLink, Key } from 'lucide-react'

const CPA_KEY_URL = 'https://data-secure.comptroller.texas.gov/main/view'

/** Reusable link fragment — also used inside ContactPanel error messages. */
export function CpaApiKeyLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={CPA_KEY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium ${className}`}
    >
      Get or manage your Texas CPA API key
      <ExternalLink size={12} className="shrink-0" />
    </a>
  )
}

/** Settings-page card for CPA API key setup. */
export function CpaApiKeyCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <Key size={14} className="text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium text-gray-900">LLC / Entity Research — CPA API Key</h2>
          <p className="text-sm text-gray-500 mt-1">
            The LLC / Entity Research feature calls the Texas Comptroller public API to look up
            franchise-tax records, officer names, and SOS file numbers.
            A free API key is required.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <CpaApiKeyLink />
          </div>

          <p className="text-xs text-gray-400 mt-1.5">
            Select <span className="font-medium text-gray-500">Tax Accounts (formerly FTAS)</span> when creating the API key.
          </p>

          <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-1 text-xs text-gray-500">
            <p>
              Once you have a key, add it to your Netlify site&apos;s environment variables:
            </p>
            <p>
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-mono">CPA_API_KEY</code>
              {' '}→ Netlify → Site configuration → Environment variables
            </p>
            <p className="text-gray-400">
              Never use <code className="bg-gray-100 px-1 rounded font-mono">NEXT_PUBLIC_</code> prefix — the key must stay server-side only.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
