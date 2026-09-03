import { DEFAULT_DFW_COUNTY_CODES } from './constants'

export type RegionKey = 'DFW' | 'Houston' | 'Austin' | 'San Antonio' | 'El Paso' | 'All Texas' | 'Other Texas'

// Region definitions — maps region keys to arrays of county codes (strings).
// DFW is populated from existing constant. Other regions can be filled later.
export const REGION_DEFINITIONS: Record<RegionKey, string[]> = {
  'DFW': DEFAULT_DFW_COUNTY_CODES,
  // TODO: populate these with county codes for the metros
  'Houston': [],
  'Austin': [],
  'San Antonio': [],
  'El Paso': [],
  'All Texas': [],
  'Other Texas': [],
}

export function getRegionCounties(region?: string): string[] {
  if (!region) return REGION_DEFINITIONS.DFW
  const key = (region as RegionKey)
  if (key === 'All Texas') return []
  return REGION_DEFINITIONS[key] ?? []
}

