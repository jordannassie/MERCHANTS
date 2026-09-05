/**
 * Internal merchant category + Google Places phrase library.
 *
 * The user never sees or selects these. They run automatically in the background
 * during All Texas Sweep and Single City searches.
 *
 * To add more coverage: append phrases or categories here.
 * The sweep will automatically include them on the next run.
 */

export interface MerchantCategory {
  id: string
  label: string
  /** Google Text Search phrases used for this category. Multiple = broader coverage. */
  phrases: string[]
}

export const MERCHANT_CATEGORIES: MerchantCategory[] = [
  {
    id: 'food',
    label: 'Restaurants & Food',
    phrases: ['restaurants', 'cafes and diners', 'food trucks'],
  },
  {
    id: 'retail',
    label: 'Retail',
    phrases: ['retail clothing store', 'gift shop', 'hardware store'],
  },
  {
    id: 'beauty',
    label: 'Beauty & Personal Care',
    phrases: ['nail salon', 'hair salon', 'barber shop'],
  },
  {
    id: 'auto',
    label: 'Auto Services',
    phrases: ['auto repair shop', 'car dealership', 'auto body shop'],
  },
  {
    id: 'home',
    label: 'Contractors & Home Services',
    phrases: ['general contractor', 'plumbing electrical company', 'HVAC roofing company'],
  },
  {
    id: 'medical',
    label: 'Medical & Wellness',
    phrases: ['medical clinic', 'dentist office', 'physical therapy chiropractor'],
  },
  {
    id: 'professional',
    label: 'Professional Services',
    phrases: ['accounting firm', 'law firm', 'insurance real estate agency'],
  },
]

// ── Texas metros covered by the standard weekly sweep ───────────────────────
// Ordered by population (largest first for best early results)
export const TX_SWEEP_METROS: string[] = [
  'Houston',
  'San Antonio',
  'Dallas',
  'Austin',
  'Fort Worth',
  'El Paso',
  'Arlington',
  'Corpus Christi',
  'Lubbock',
  'Amarillo',
  'McAllen',
  'Waco',
  'Midland',
  'Beaumont',
  'College Station',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** All unique search phrases across every category (flattened). */
export function getAllPhrases(): string[] {
  return MERCHANT_CATEGORIES.flatMap(c => c.phrases)
}

export interface SweepTask {
  metro: string     // e.g. "Houston"
  phrase: string    // e.g. "restaurants"
  state: string     // e.g. "TX"
  /** Full Google Text Search query string */
  textQuery: string
}

/**
 * Generate the full ordered task list for a sweep.
 * Order: metro (outer) × phrase (inner) — ensures each city gets
 * coverage across all categories before moving to the next city.
 *
 * The list is deterministic so taskIndex alone is sufficient to resume.
 */
export function generateSweepTasks(
  metros: string[] = TX_SWEEP_METROS,
  phrases: string[] = getAllPhrases(),
  state = 'TX',
): SweepTask[] {
  const tasks: SweepTask[] = []
  for (const metro of metros) {
    for (const phrase of phrases) {
      tasks.push({
        metro,
        phrase,
        state,
        textQuery: `${phrase} ${metro} ${state}`,
      })
    }
  }
  return tasks
}

/**
 * Total task count for the default full sweep.
 * 15 metros × 21 phrases = 315 tasks per full sweep.
 * Estimated cost: ~$10 in Google Places API charges per full run.
 */
export const DEFAULT_TASK_COUNT = TX_SWEEP_METROS.length * getAllPhrases().length
