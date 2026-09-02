/**
 * Texas Comptroller SIFT (Secure Information and File Transfer) API client.
 *
 * Endpoints (documented at https://api-doc.comptroller.texas.gov/):
 *   GET /sift/v1/sift/public/list-files        — list available files
 *   GET /sift/v1/sift/public/get-link          — get signed download URL
 *
 * Authentication: x-api-key header (CPA_SIFT_API_KEY env var).
 * This is separate from CPA_API_KEY (franchise-tax API).
 * Neither key is ever exposed to the browser.
 */

const SIFT_BASE = 'https://api.comptroller.texas.gov'

export interface SiftFile {
  filePath: string      // e.g. "sift/public/stp09-01ph.zip"
  fileSize: string      // bytes as string
  getLinkEndpoint: string
}

export interface SiftListResponse {
  success: boolean
  data: SiftFile[]
}

function getKey(): string {
  const key = process.env.CPA_SIFT_API_KEY
  if (!key) throw new Error('CPA_SIFT_API_KEY is not configured.')
  return key
}

/**
 * List all files available in the SIFT system.
 * Throws if the API key is missing or the request fails.
 */
export async function siftListFiles(): Promise<SiftFile[]> {
  const key = getKey()
  const res = await fetch(`${SIFT_BASE}/sift/v1/sift/public/list-files`, {
    headers: { 'x-api-key': key },
    // Short timeout — Netlify functions have a 10-second default
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('SIFT API key is invalid or missing permission. Check CPA_SIFT_API_KEY.')
  }
  if (!res.ok) {
    throw new Error(`SIFT list-files failed: HTTP ${res.status}`)
  }
  const json = (await res.json()) as SiftListResponse
  return json.data ?? []
}

/**
 * Find the most recent stpMM-DDph.zip in the file list.
 * Returns the best match or null if none found.
 *
 * Searches by filename regardless of path prefix, so both
 * sift/stp/stp09-01ph.zip and sift/public/stp09-01ph.zip match.
 *
 * NOTE: This function returns null when the SIFT API key does not have
 * STP (Sales Tax Permit) section access — i.e. only GISSS files are visible.
 * The caller should detect this and return a stp_access_missing error.
 */
export function findLatestPermitPhoneFile(files: SiftFile[]): SiftFile | null {
  const phoneFiles = files.filter(f => {
    const name = f.filePath.split('/').pop() ?? ''
    // Accepts stp09-01ph.zip and also stpMM-DD-YYYYph.zip, stpYYYY-MM-DDph.zip variants
    return /^stp[^.]*ph\.zip$/i.test(name)
  })
  if (!phoneFiles.length) return null

  // Sort descending — most recent file last lexicographically should be newest
  phoneFiles.sort((a, b) => {
    const na = a.filePath.split('/').pop() ?? ''
    const nb = b.filePath.split('/').pop() ?? ''
    return nb.localeCompare(na)
  })
  return phoneFiles[0]
}

/** True when the file list contains at least one non-GISSS section */
export function hasSTPAccess(files: SiftFile[]): boolean {
  return files.some(f => !f.filePath.startsWith('sift/gisss/'))
}

/**
 * Get a signed download URL for the given file path.
 * Returns the final download URL (following the 307 redirect if needed).
 */
export async function siftGetDownloadUrl(filePath: string): Promise<string> {
  const key = getKey()
  const params = new URLSearchParams({ 'file-path': filePath })
  const res = await fetch(`${SIFT_BASE}/sift/v1/sift/public/get-link?${params}`, {
    headers: { 'x-api-key': key },
    redirect: 'manual', // capture the Location header ourselves
    signal: AbortSignal.timeout(15_000),
  })

  if (res.status === 307 || res.status === 302 || res.status === 301) {
    const location = res.headers.get('Location')
    if (!location) throw new Error('SIFT get-link returned redirect with no Location header')
    return location
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('SIFT API key is invalid or missing permission. Check CPA_SIFT_API_KEY.')
  }
  if (!res.ok) {
    throw new Error(`SIFT get-link failed: HTTP ${res.status}`)
  }

  // Some implementations return 200 with the URL in the body
  const body = await res.json().catch(() => null)
  if (body?.headers?.Location) return body.headers.Location
  if (body?.url) return body.url
  throw new Error('SIFT get-link: could not parse signed URL from response')
}

/**
 * Download a file from a signed URL and return its bytes as Uint8Array.
 * Follows redirects automatically.
 */
export async function downloadFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000), // 2-minute timeout for potentially large files
  })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${url}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}
