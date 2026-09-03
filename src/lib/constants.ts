export const DFW_COUNTIES: Record<string, string> = {
  '043': 'Collin',
  '057': 'Dallas',
  '061': 'Denton',
  '070': 'Ellis',
  '111': 'Hood',
  '116': 'Hunt',
  '126': 'Johnson',
  '129': 'Kaufman',
  '184': 'Parker',
  '199': 'Rockwall',
  '213': 'Somervell',
  '220': 'Tarrant',
  '249': 'Wise',
}

export const DEFAULT_DFW_COUNTY_CODES = ['043','057','061','070','116','126','129','184','199','220','249']

export const TEXAS_SOURCE = 'texas_sales_tax_permits'
export const TEXAS_API_BASE = 'https://data.texas.gov/resource/jrea-zgmq.json'
export const TEXAS_DATASET_ID = 'jrea-zgmq'
export const IMPORT_PAGE_SIZE = 1000
export const IMPORT_MAX_RECORDS = 10_000

export const ENRICHMENT_DAILY_CAP = 25

export const LEAD_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'connected', label: 'Connected' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
] as const

export const LEAD_PRIORITIES = [
  { value: 'hot', label: 'Hot' },
  { value: 'good', label: 'Good' },
  { value: 'low', label: 'Low' },
  { value: 'skip', label: 'Skip' },
] as const

// Human-readable county names for metro regions + DFW (extend as needed)
export const COUNTY_NAMES: Record<string, string> = {
  // DFW (subset already in DFW_COUNTIES)
  '043': 'Collin',
  '057': 'Dallas',
  '061': 'Denton',
  '070': 'Ellis',
  '111': 'Hood',
  '116': 'Hunt',
  '126': 'Johnson',
  '129': 'Kaufman',
  '184': 'Parker',
  '199': 'Rockwall',
  '213': 'Somervell',
  '220': 'Tarrant',
  '249': 'Wise',
  // Austin
  '011': 'Bastrop',
  '028': 'Caldwell',
  '105': 'Hays',
  '227': 'Travis',
  '246': 'Williamson',
  // Houston
  '020': 'Brazoria',
  '036': 'Chambers',
  '079': 'Fort Bend',
  '084': 'Galveston',
  '101': 'Harris',
  '146': 'Liberty',
  '170': 'Montgomery',
  '237': 'Waller',
  // San Antonio
  '007': 'Atascosa',
  '010': 'Bandera',
  '015': 'Bexar',
  '046': 'Comal',
  '094': 'Guadalupe',
  '130': 'Kendall',
  '163': 'Medina',
  '247': 'Wilson',
  // El Paso
  '071': 'El Paso',
}

export const CALL_OUTCOMES = [
  { value: 'no_answer', label: 'No Answer' },
  { value: 'voicemail', label: 'Left Voicemail' },
  { value: 'connected', label: 'Connected' },
  { value: 'call_back', label: 'Call Back Requested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'appointment', label: 'Appointment Set' },
  { value: 'won', label: 'Won' },
] as const

export const PIPELINE_STATUSES = ['new','attempted','connected','follow_up','appointment','won'] as const
