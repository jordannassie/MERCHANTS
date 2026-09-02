/**
 * Corporate chain detection for Merchant Radar lead scoring.
 *
 * Corporate chains (national/large-regional brands) are poor merchant-services
 * prospects: payment-processing decisions are made centrally, not by the local
 * manager. Detecting them early prevents wasted sales effort and keeps the
 * "Today's Best Leads" list focused on independent businesses.
 *
 * Detection strategy:
 *   - Normalize name: lowercase, collapse whitespace, strip punctuation
 *   - Check outlet_name and taxpayer_name for known chain keywords
 *   - Use word-boundary-safe prefix/phrase matching
 *
 * Score adjustment: −40 points; priority capped at 'good' (never 'hot').
 *
 * Corporate officers from these businesses are NOT verified local purchasing
 * authorities — display them with the appropriate disclaimer.
 */

export const CHAIN_SCORE_PENALTY = 40

/** Each entry: keyword to search for (normalized, no punctuation) + brand label */
const CHAINS: { keyword: string; brand: string }[] = [
  // ── Fast food / QSR ────────────────────────────────────────────────────────
  { keyword: 'mcdonalds',              brand: "McDonald's" },
  { keyword: 'mcdonald s',            brand: "McDonald's" },
  { keyword: 'burger king',           brand: 'Burger King' },
  { keyword: 'wendys',                brand: "Wendy's" },
  { keyword: 'wendy s',               brand: "Wendy's" },
  { keyword: 'taco bell',             brand: 'Taco Bell' },
  { keyword: 'subway',                brand: 'Subway' },
  { keyword: 'chipotle',              brand: 'Chipotle Mexican Grill' },
  { keyword: 'dominos',               brand: "Domino's" },
  { keyword: 'domino s',              brand: "Domino's" },
  { keyword: 'pizza hut',             brand: 'Pizza Hut' },
  { keyword: 'little caesars',        brand: "Little Caesar's" },
  { keyword: 'little caesar',         brand: "Little Caesar's" },
  { keyword: 'papa johns',            brand: "Papa John's" },
  { keyword: 'papa john',             brand: "Papa John's" },
  { keyword: 'marcos pizza',          brand: "Marco's Pizza" },
  { keyword: 'kfc',                   brand: 'KFC' },
  { keyword: 'kentucky fried chicken',brand: 'KFC' },
  { keyword: 'popeyes',               brand: 'Popeyes' },
  { keyword: 'chick fil a',           brand: 'Chick-fil-A' },
  { keyword: 'chickfila',             brand: 'Chick-fil-A' },
  { keyword: 'whataburger',           brand: 'Whataburger' },
  { keyword: 'jack in the box',       brand: 'Jack in the Box' },
  { keyword: 'sonic drive',           brand: 'Sonic Drive-In' },
  { keyword: 'sonic dr',              brand: 'Sonic Drive-In' },
  { keyword: 'dairy queen',           brand: 'Dairy Queen' },
  { keyword: 'arbys',                 brand: "Arby's" },
  { keyword: 'arby s',                brand: "Arby's" },
  { keyword: 'five guys',             brand: 'Five Guys' },
  { keyword: 'shake shack',           brand: 'Shake Shack' },
  { keyword: 'culvers',               brand: "Culver's" },
  { keyword: 'culver s',              brand: "Culver's" },
  { keyword: 'whataburger',           brand: 'Whataburger' },
  { keyword: 'panda express',         brand: 'Panda Express' },
  { keyword: 'wingstop',              brand: 'Wingstop' },
  { keyword: 'raising cane',          brand: "Raising Cane's" },
  { keyword: 'church s chicken',      brand: "Church's Chicken" },
  { keyword: 'churchs chicken',       brand: "Church's Chicken" },
  { keyword: 'el pollo loco',         brand: 'El Pollo Loco' },
  { keyword: 'freddy s',              brand: "Freddy's" },
  { keyword: 'freddys',               brand: "Freddy's" },
  { keyword: 'cook out',              brand: 'Cook Out' },
  { keyword: 'cookout',               brand: 'Cook Out' },
  { keyword: 'zaxbys',                brand: "Zaxby's" },
  { keyword: 'fuzzy s taco',          brand: "Fuzzy's Taco Shop" },
  { keyword: 'torchy s',              brand: "Torchy's Tacos" },
  { keyword: 'torchys',               brand: "Torchy's Tacos" },
  { keyword: 'velvet taco',           brand: 'Velvet Taco' },
  { keyword: 'mod pizza',             brand: 'Mod Pizza' },
  { keyword: 'blaze pizza',           brand: 'Blaze Pizza' },

  // ── Sit-down / casual dining ───────────────────────────────────────────────
  { keyword: 'applebees',             brand: "Applebee's" },
  { keyword: 'applebee s',            brand: "Applebee's" },
  { keyword: 'chilis',                brand: "Chili's" },
  { keyword: 'chili s',               brand: "Chili's" },
  { keyword: 'olive garden',          brand: 'Olive Garden' },
  { keyword: 'red lobster',           brand: 'Red Lobster' },
  { keyword: 'longhorn steakhouse',   brand: 'LongHorn Steakhouse' },
  { keyword: 'outback steakhouse',    brand: 'Outback Steakhouse' },
  { keyword: 'texas roadhouse',       brand: 'Texas Roadhouse' },
  { keyword: 'dennys',                brand: "Denny's" },
  { keyword: 'denny s',               brand: "Denny's" },
  { keyword: 'ihop',                  brand: 'IHOP' },
  { keyword: 'waffle house',          brand: 'Waffle House' },
  { keyword: 'cracker barrel',        brand: 'Cracker Barrel' },
  { keyword: 'golden corral',         brand: 'Golden Corral' },
  { keyword: 'hooters',               brand: 'Hooters' },
  { keyword: 'twin peaks',            brand: 'Twin Peaks' },
  { keyword: 'buffalo wild wings',    brand: 'Buffalo Wild Wings' },
  { keyword: 'bdubs',                 brand: 'Buffalo Wild Wings' },
  { keyword: 'dave buster',           brand: "Dave & Buster's" },
  { keyword: 'dave and buster',       brand: "Dave & Buster's" },
  { keyword: 'walk on s',             brand: "Walk-On's Sports Bistreaux" },
  { keyword: 'walk ons',              brand: "Walk-On's Sports Bistreaux" },
  { keyword: 'california pizza kitchen', brand: 'California Pizza Kitchen' },

  // ── Coffee / beverages ─────────────────────────────────────────────────────
  { keyword: 'starbucks',             brand: 'Starbucks' },
  { keyword: 'dutch bros',            brand: 'Dutch Bros' },
  { keyword: 'dunkin',                brand: "Dunkin'" },
  { keyword: 'tim hortons',           brand: 'Tim Hortons' },
  { keyword: 'krispy kreme',          brand: 'Krispy Kreme' },
  { keyword: 'tropical smoothie',     brand: 'Tropical Smoothie Cafe' },
  { keyword: 'smoothie king',         brand: 'Smoothie King' },
  { keyword: 'jamba',                 brand: 'Jamba' },
  { keyword: 'scooter s coffee',      brand: "Scooter's Coffee" },
  { keyword: 'scooters coffee',       brand: "Scooter's Coffee" },
  { keyword: 'dutch bros',            brand: 'Dutch Bros' },
  { keyword: 'cava',                  brand: 'CAVA' },

  // ── Fast casual / deli ─────────────────────────────────────────────────────
  { keyword: 'panera bread',          brand: 'Panera Bread' },
  { keyword: 'panera',                brand: 'Panera Bread' },
  { keyword: 'jason s deli',          brand: "Jason's Deli" },
  { keyword: 'jasons deli',           brand: "Jason's Deli" },
  { keyword: 'which wich',            brand: 'Which Wich' },
  { keyword: 'corner bakery',         brand: 'Corner Bakery Cafe' },
  { keyword: 'mcalister s deli',      brand: "McAlister's Deli" },
  { keyword: 'mcalisters deli',       brand: "McAlister's Deli" },
  { keyword: 'noodles company',       brand: 'Noodles & Company' },
  { keyword: 'noodles and company',   brand: 'Noodles & Company' },
  { keyword: 'firehouse subs',        brand: 'Firehouse Subs' },
  { keyword: 'jersey mikes',          brand: "Jersey Mike's" },
  { keyword: 'jersey mike s',         brand: "Jersey Mike's" },
  { keyword: 'jimmy johns',           brand: "Jimmy John's" },
  { keyword: 'jimmy john s',          brand: "Jimmy John's" },
  { keyword: 'potbelly',              brand: 'Potbelly' },
  { keyword: 'schlotzskys',           brand: "Schlotzsky's" },
  { keyword: 'schlotzsky s',          brand: "Schlotzsky's" },
  { keyword: 'einstein bros',         brand: 'Einstein Bros Bagels' },
  { keyword: 'cinnabon',              brand: 'Cinnabon' },
  { keyword: 'auntie anne',           brand: "Auntie Anne's" },
  { keyword: 'sbarro',                brand: 'Sbarro' },
  { keyword: 'first watch',           brand: 'First Watch' },

  // ── Retail — big-box / mass market ─────────────────────────────────────────
  { keyword: 'walmart',               brand: 'Walmart' },
  { keyword: 'wal mart',              brand: 'Walmart' },
  { keyword: 'sams club',             brand: "Sam's Club" },
  { keyword: 'sam s club',            brand: "Sam's Club" },
  { keyword: 'target',                brand: 'Target' },
  { keyword: 'costco',                brand: 'Costco' },
  { keyword: 'home depot',            brand: 'The Home Depot' },
  { keyword: 'lowes',                 brand: "Lowe's" },
  { keyword: 'lowe s',                brand: "Lowe's" },
  { keyword: 'best buy',              brand: 'Best Buy' },
  { keyword: 'gamestop',              brand: 'GameStop' },
  { keyword: 'petsmart',              brand: 'PetSmart' },
  { keyword: 'petco',                 brand: 'Petco' },
  { keyword: 'academy sports',        brand: 'Academy Sports + Outdoors' },
  { keyword: 'dick s sporting',       brand: "Dick's Sporting Goods" },
  { keyword: 'dicks sporting',        brand: "Dick's Sporting Goods" },
  { keyword: 'big lots',              brand: 'Big Lots' },

  // ── Grocery chains ─────────────────────────────────────────────────────────
  { keyword: 'kroger',                brand: 'Kroger' },
  { keyword: 'heb',                   brand: 'H-E-B' },
  { keyword: 'h e b',                 brand: 'H-E-B' },
  { keyword: 'tom thumb',             brand: 'Tom Thumb' },
  { keyword: 'randalls',              brand: 'Randalls' },
  { keyword: 'fiesta mart',           brand: 'Fiesta Mart' },
  { keyword: 'albertsons',            brand: "Albertson's" },
  { keyword: 'aldi',                  brand: 'Aldi' },
  { keyword: 'trader joes',           brand: "Trader Joe's" },
  { keyword: 'trader joe s',          brand: "Trader Joe's" },
  { keyword: 'whole foods',           brand: 'Whole Foods Market' },
  { keyword: 'sprouts',               brand: 'Sprouts Farmers Market' },

  // ── Dollar / discount stores ───────────────────────────────────────────────
  { keyword: 'dollar general',        brand: 'Dollar General' },
  { keyword: 'family dollar',         brand: 'Family Dollar' },
  { keyword: 'dollar tree',           brand: 'Dollar Tree' },
  { keyword: 'five below',            brand: 'Five Below' },

  // ── Drug stores ────────────────────────────────────────────────────────────
  { keyword: 'cvs',                   brand: 'CVS Pharmacy' },
  { keyword: 'walgreens',             brand: 'Walgreens' },
  { keyword: 'rite aid',              brand: 'Rite Aid' },

  // ── Convenience / fuel ─────────────────────────────────────────────────────
  { keyword: '7 eleven',              brand: '7-Eleven' },
  { keyword: '7eleven',               brand: '7-Eleven' },
  { keyword: 'circle k',              brand: 'Circle K' },
  { keyword: 'wawa',                  brand: 'Wawa' },
  { keyword: 'buc ee',                brand: "Buc-ee's" },
  { keyword: 'bucees',                brand: "Buc-ee's" },
  { keyword: 'stripes',               brand: 'Stripes / Sunoco' },
  { keyword: 'corner store',          brand: 'Corner Store' },

  // ── Auto services ──────────────────────────────────────────────────────────
  { keyword: 'jiffy lube',            brand: 'Jiffy Lube' },
  { keyword: 'firestone',             brand: 'Firestone Auto Care' },
  { keyword: 'midas',                 brand: 'Midas' },
  { keyword: 'autozone',              brand: 'AutoZone' },
  { keyword: 'auto zone',             brand: 'AutoZone' },
  { keyword: 'o reilly auto',         brand: "O'Reilly Auto Parts" },
  { keyword: 'oreilly auto',          brand: "O'Reilly Auto Parts" },
  { keyword: 'advance auto',          brand: 'Advance Auto Parts' },
  { keyword: 'napa auto',             brand: 'NAPA Auto Parts' },
  { keyword: 'take 5 oil',            brand: 'Take 5 Oil Change' },
  { keyword: 'valvoline',             brand: 'Valvoline Instant Oil Change' },
  { keyword: 'pep boys',              brand: 'Pep Boys' },
  { keyword: 'carmax',                brand: 'CarMax' },
  { keyword: 'carvana',               brand: 'Carvana' },

  // ── Salon / personal care chains ───────────────────────────────────────────
  { keyword: 'great clips',           brand: 'Great Clips' },
  { keyword: 'sport clips',           brand: 'Sport Clips' },
  { keyword: 'supercuts',             brand: 'Supercuts' },
  { keyword: 'fantastic sams',        brand: "Fantastic Sam's" },
  { keyword: 'fantastic sam s',       brand: "Fantastic Sam's" },
  { keyword: 'regis salon',           brand: 'Regis Salons' },
  { keyword: 'cost cutters',          brand: 'Cost Cutters' },
  { keyword: 'european wax',          brand: 'European Wax Center' },
  { keyword: 'drybar',                brand: 'Drybar' },
  { keyword: 'massage envy',          brand: 'Massage Envy' },
  { keyword: 'hand stone',            brand: 'Hand & Stone' },
  { keyword: 'elements massage',      brand: 'Elements Massage' },

  // ── Fitness chains ─────────────────────────────────────────────────────────
  { keyword: 'planet fitness',        brand: 'Planet Fitness' },
  { keyword: 'la fitness',            brand: 'LA Fitness' },
  { keyword: 'anytime fitness',       brand: 'Anytime Fitness' },
  { keyword: 'orange theory',         brand: 'Orangetheory Fitness' },
  { keyword: 'orangetheory',          brand: 'Orangetheory Fitness' },
  { keyword: 'f45',                   brand: 'F45 Training' },
  { keyword: '24 hour fitness',       brand: '24 Hour Fitness' },
  { keyword: 'gold s gym',            brand: "Gold's Gym" },
  { keyword: 'golds gym',             brand: "Gold's Gym" },
  { keyword: 'lifetime fitness',      brand: 'Life Time Fitness' },
  { keyword: 'life time fitness',     brand: 'Life Time Fitness' },

  // ── Entertainment / cinema ─────────────────────────────────────────────────
  { keyword: 'amc theater',           brand: 'AMC Theatres' },
  { keyword: 'regal cinema',          brand: 'Regal Cinemas' },
  { keyword: 'cinemark',              brand: 'Cinemark' },
  { keyword: 'alamo drafthouse',      brand: 'Alamo Drafthouse' },
  { keyword: 'main event',            brand: 'Main Event Entertainment' },
  { keyword: 'chuck e cheese',        brand: 'Chuck E. Cheese' },
  { keyword: 'dave buster',           brand: "Dave & Buster's" },

  // ── Hotels ─────────────────────────────────────────────────────────────────
  { keyword: 'marriott',              brand: 'Marriott' },
  { keyword: 'hilton',                brand: 'Hilton' },
  { keyword: 'holiday inn',           brand: 'Holiday Inn (IHG)' },
  { keyword: 'hampton inn',           brand: 'Hampton Inn (Hilton)' },
  { keyword: 'courtyard marriott',    brand: 'Courtyard by Marriott' },
  { keyword: 'hyatt',                 brand: 'Hyatt' },
  { keyword: 'westin',                brand: 'Westin (Marriott)' },
  { keyword: 'sheraton',              brand: 'Sheraton (Marriott)' },
  { keyword: 'doubletree',            brand: 'DoubleTree (Hilton)' },
  { keyword: 'best western',          brand: 'Best Western' },
  { keyword: 'motel 6',               brand: 'Motel 6' },
  { keyword: 'super 8',               brand: 'Super 8' },
  { keyword: 'la quinta',             brand: 'La Quinta Inns' },
  { keyword: 'drury inn',             brand: 'Drury Inn' },

  // ── Banking (almost always centralized payments) ───────────────────────────
  { keyword: 'chase bank',            brand: 'JPMorgan Chase' },
  { keyword: 'jpmorgan',              brand: 'JPMorgan Chase' },
  { keyword: 'wells fargo',           brand: 'Wells Fargo' },
  { keyword: 'bank of america',       brand: 'Bank of America' },
  { keyword: 'us bank',               brand: 'U.S. Bank' },
  { keyword: 'citibank',              brand: 'Citibank' },

  // ── Corporate parent companies / franchise operators ───────────────────────
  { keyword: 'yum brands',            brand: 'Yum! Brands (Taco Bell / KFC / Pizza Hut)' },
  { keyword: 'restaurant brands',     brand: 'Restaurant Brands International' },
  { keyword: 'darden restaurants',    brand: 'Darden Restaurants' },
  { keyword: 'inspire brands',        brand: 'Inspire Brands' },
  { keyword: 'bloomin brands',        brand: "Bloomin' Brands" },
  { keyword: 'wingstop industries',   brand: 'Wingstop Industries' },
]

/** Normalize a name for consistent matching: lowercase, collapse spaces, strip punctuation */
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .replace(/[''`]/g, '') // remove apostrophes first so "mcdonald's" → "mcdonalds"
    .replace(/[^a-z0-9\s]/g, ' ') // replace other punctuation with space
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ChainDetectionResult {
  isChain: boolean
  chainName: string | null
}

/**
 * Detect whether an outlet or taxpayer name belongs to a known corporate chain.
 *
 * @param outletName   - The business's outlet/location name (e.g. "CHIPOTLE MEXICAN GRILL #6249")
 * @param taxpayerName - The taxpayer/legal entity name (e.g. "CHIPOTLE MEXICAN GRILL, INC")
 */
export function detectChain(
  outletName: string | null | undefined,
  taxpayerName: string | null | undefined
): ChainDetectionResult {
  const outletNorm = normalizeName(outletName)
  const taxpayerNorm = normalizeName(taxpayerName)

  for (const { keyword, brand } of CHAINS) {
    if (
      (outletNorm && outletNorm.includes(keyword)) ||
      (taxpayerNorm && taxpayerNorm.includes(keyword))
    ) {
      return { isChain: true, chainName: brand }
    }
  }

  return { isChain: false, chainName: null }
}

/**
 * Build the SQL ILIKE conditions for the migration that marks existing
 * chain leads in the database. Used by migration 010.
 *
 * Returns a list of SQL ILIKE patterns suitable for:
 *   outlet_name ILIKE ANY(ARRAY[...]) OR taxpayer_name ILIKE ANY(ARRAY[...])
 */
export function chainSqlPatterns(): string[] {
  // Use the raw keywords, re-adding wildcards; return deduplicated patterns
  const seen = new Set<string>()
  return CHAINS
    .map(c => `%${c.keyword}%`)
    .filter(p => { if (seen.has(p)) return false; seen.add(p); return true })
}
