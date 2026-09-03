import { DEFAULT_DFW_COUNTY_CODES } from './constants'

export type RegionKey = 'DFW' | 'Houston' | 'Austin' | 'San Antonio' | 'El Paso' | 'All Texas' | 'Other Texas'

// Region definitions — maps region keys to arrays of county codes (strings).
// DFW is populated from existing constant. Other regions can be filled later.
export const REGION_DEFINITIONS: Record<RegionKey, string[]> = {
  'DFW': DEFAULT_DFW_COUNTY_CODES,
  // TODO: populate these with county codes for the metros
  'Houston': ['020','036','079','084','101','146','170','237'],
  'Austin': ['011','028','105','227','246'],
  'San Antonio': ['007','010','015','046','094','130','163','247'],
  'El Paso': ['071'],
  'All Texas': [],
  'Other Texas': [],
}

export function getRegionCounties(region?: string): string[] {
  if (!region) return REGION_DEFINITIONS.DFW
  const key = (region as RegionKey)
  if (key === 'All Texas') return []
  return REGION_DEFINITIONS[key] ?? []
}

