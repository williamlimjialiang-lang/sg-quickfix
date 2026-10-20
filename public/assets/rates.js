/*
 * SG QuickFix pricing data and estimate engine.
 *
 * This one file is the single source of truth for prices. The browser imports
 * it to calculate estimates instantly, and the chat function imports it so the
 * assistant reasons from the same numbers.
 *
 * All amounts are Singapore dollars, labour only unless a job says otherwise,
 * for a typical HDB flat booked in normal working hours.
 *
 * Ranges were compiled in October 2026 from published price lists and guides:
 * town council term-contractor rate cards, MoneySmart, SingSaver, MissLobang,
 * Homejourney, Helpling, Urban Company and current Carousell listings.
 * Review them every quarter. Update RATES_UPDATED when you do.
 *
 * Job fields
 *   id          stable identifier, used in URLs and by the chat function
 *   cat         one of CATEGORIES
 *   name        what the homeowner sees
 *   low, high   price range for the first unit (or the whole job)
 *   unit        label for the quantity stepper, or null for one-off jobs
 *   unitNoun    optional plural noun for sentences ("3 indoor units")
 *   unitOne     optional singular, when dropping the final "s" doesn't work
 *   addLow/High price range for each additional unit
 *   kw          lowercase phrases that match the homeowner's description
 *   includes    what the price covers
 *   extras      things that push the price up
 *   ask         the first question the chat assistant asks
 *   search      Carousell search phrase
 *   trade       noun for map searches ("plumber")
 *   confidence  "published" (many price lists agree) or "indicative" (fewer data points)
 *   isDefault   fallback job when nothing in the description matches
 */

export const RATES_UPDATED = 'October 2026';

export const CATEGORIES = ['Plumbing', 'Electrical', 'Aircon', 'Carpentry', 'General Handyman'];

export const HOME_TYPES = {
  hdb: { label: 'HDB flat', low: 1, high: 1 },
  condo: { label: 'condo', low: 1.05, high: 1.15 },
  landed: { label: 'landed home', low: 1.15, high: 1.3 }
};

export const TIMINGS = {
  normal: { label: 'within a few days', low: 1, high: 1 },
  urgent: { label: 'today or after hours', low: 1.2, high: 1.5 }
};

export const JOBS = [
  /* Plumbing */
  {
    id: 'plumb-inspect', cat: 'Plumbing', isDefault: true,
    name: 'Plumber visit to inspect and fix a small issue',
    low: 60, high: 150, unit: null,
    kw: [],
    includes: 'Call-out, inspection and up to about an hour of minor repair.',
    extras: ['Parts and replacement fittings', 'Work that needs a PUB-licensed plumber to lodge a submission'],
    ask: 'What exactly is happening, and where in the home is it?',
    search: 'plumber', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-choke-sink', cat: 'Plumbing',
    name: 'Clear a choked sink, basin or floor trap',
    low: 60, high: 150, unit: null,
    kw: ['choke', 'choked', 'chok', 'clog', 'block', 'slow', 'drain', 'sink', 'basin', 'floor trap', 'backs up', 'backing up', 'standing water', 'not draining'],
    includes: 'Labour to clear the blockage with a plunger, snake or pump.',
    extras: ['Repeated chokes that need a pipe section replaced', 'Blockages in the common stack, which your town council handles for HDB flats'],
    ask: 'Is it just this one drain, or are other drains in the home slow too?',
    search: 'clear choke', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-choke-toilet', cat: 'Plumbing',
    name: 'Clear a choked toilet bowl',
    low: 70, high: 180, unit: null,
    kw: ['toilet', 'toilet bowl', 'wc', 'choke', 'choked', 'clog', 'block', 'overflow', 'not flushing', "won't flush", 'wont flush'],
    includes: 'Labour to clear the toilet with a plunger, auger or pump.',
    extras: ['Removing and refitting the bowl to reach the blockage', 'Objects stuck deep in the trap'],
    ask: 'Does the water rise and drain away slowly, or not drain at all?',
    search: 'toilet choke', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-cistern', cat: 'Plumbing',
    name: 'Fix a running or leaking toilet cistern',
    low: 70, high: 150, unit: null,
    kw: ['cistern', 'flush', 'running', 'keeps running', 'refill', 'siphon', 'flush button', 'flush valve', 'ballcock', 'fill valve'],
    includes: 'Labour plus standard replacement fittings inside the cistern.',
    extras: ['Concealed cisterns behind a wall panel', 'Replacing the whole cistern'],
    ask: 'Is the cistern exposed behind the toilet, or hidden inside the wall?',
    search: 'toilet cistern repair', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-tap', cat: 'Plumbing',
    name: 'Replace a leaking or broken tap',
    low: 60, high: 150, unit: 'Taps', addLow: 40, addHigh: 90,
    kw: ['tap', 'faucet', 'mixer', 'dripping', 'drip', 'spout', 'tap leak', 'leaking tap', 'shower set', 'shower head', 'bidet'],
    includes: 'Labour and a basic replacement tap.',
    extras: ['Designer or branded mixer taps you choose', 'Seized fittings that need cutting out'],
    ask: 'Is it a simple tap, or a hot-and-cold mixer or shower set?',
    search: 'tap replacement plumber', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-hose', cat: 'Plumbing',
    name: 'Replace a flexible hose or bottle trap under a sink',
    low: 40, high: 120, unit: null,
    kw: ['hose', 'flexible hose', 'bottle trap', 'under sink', 'under the sink', 'pipe under', 'connector', 'leaking under', 'cabinet wet'],
    includes: 'Labour and a standard hose or trap.',
    extras: ['Corroded isolation valves that also need replacing'],
    ask: 'Is the water coming from a hose connection, or from the pipe below the sink?',
    search: 'plumber bottle trap', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-heater-instant', cat: 'Plumbing',
    name: 'Install or replace an instant water heater',
    low: 100, high: 200, unit: null,
    kw: ['heater', 'water heater', 'instant heater', 'instant', 'hot water', 'no hot water', 'shower heater', 'heater not working'],
    includes: 'Labour to remove the old unit and fit yours. The heater itself is not included.',
    extras: ['A new 15A power point if there is none, about S$180 to S$250 from an electrician', 'Rerouting pipes to a new position'],
    ask: 'Are you replacing an existing heater in the same spot, or installing one in a new position?',
    search: 'water heater installation', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-heater-storage', cat: 'Plumbing',
    name: 'Install or replace a storage water heater',
    low: 250, high: 500, unit: null,
    kw: ['storage heater', 'storage water heater', 'storage', 'tank heater', 'storage tank', 'litre', 'liter'],
    includes: 'Labour, connection pipework and the PUB submission a storage heater needs. The heater itself is not included.',
    extras: ['Mounting brackets for false ceilings', 'Disposal of the old tank'],
    ask: 'Is this a replacement in the same position, and do you know the tank size in litres?',
    search: 'storage heater installation', trade: 'plumber', confidence: 'published'
  },
  {
    id: 'plumb-leak', cat: 'Plumbing',
    name: 'Find and fix a hidden pipe leak',
    low: 120, high: 450, unit: null,
    kw: ['leak', 'leaking', 'seepage', 'seep', 'ceiling leak', 'downstairs', 'neighbour', 'neighbor', 'damp', 'wet wall', 'water bill', 'concealed pipe', 'hidden pipe', 'burst', 'pipe burst', 'water stain'],
    includes: 'Leak detection and a localised repair.',
    extras: ['Hacking tiles or walls to reach the pipe, plus retiling', 'Rerouting a long section of pipe', 'For ceiling seepage between HDB flats, HDB can inspect first'],
    ask: 'Where do you see the water: a wet wall or floor, a stain on the ceiling below, or a higher water bill?',
    search: 'water leak plumber', trade: 'plumber', confidence: 'indicative'
  },
  {
    id: 'plumb-toilet-install', cat: 'Plumbing',
    name: 'Supply and install a new toilet bowl',
    low: 250, high: 600, unit: null,
    kw: ['new toilet', 'replace toilet', 'toilet replacement', 'change toilet', 'install toilet', 'cracked toilet', 'toilet bowl crack'],
    includes: 'A basic two-piece toilet bowl, removal of the old one, and installation.',
    extras: ['Wall-hung or branded bowls', 'Moving the outlet position', 'Hacking to fit a different outlet type'],
    ask: 'Do you want a basic replacement, or do you already have a particular model in mind?',
    search: 'toilet bowl installation', trade: 'plumber', confidence: 'published'
  },

  /* Electrical */
  {
    id: 'elec-inspect', cat: 'Electrical', isDefault: true,
    name: 'Electrician visit to check a fault',
    low: 60, high: 150, unit: null,
    kw: [],
    includes: 'Call-out, fault finding and a small repair.',
    extras: ['Replacement parts', 'Rewiring a circuit'],
    ask: 'What stopped working, and did anything happen just before, such as a trip, spark or smell?',
    search: 'electrician', trade: 'electrician', confidence: 'published'
  },
  {
    id: 'elec-socket', cat: 'Electrical',
    name: 'Replace a power socket',
    low: 60, high: 120, unit: 'Sockets', addLow: 40, addHigh: 60,
    kw: ['socket', 'power point', 'powerpoint', 'plug point', 'outlet', 'spark', 'sparks', 'sparking', 'burnt', 'burn mark', 'melted', '3-pin', 'three pin', 'plug'],
    includes: 'Labour and a standard 13A socket.',
    extras: ['Burnt wiring behind the socket that needs replacing', 'Waterproof or USB sockets'],
    ask: 'How many sockets need replacing, and is there any burn mark or melting?',
    search: 'replace power socket', trade: 'electrician', confidence: 'published'
  },
  {
    id: 'elec-light', cat: 'Electrical',
    name: 'Replace a light, light point or switch',
    low: 40, high: 100, unit: 'Lights or switches', unitOne: 'light or switch', addLow: 30, addHigh: 60,
    kw: ['light', 'lights', 'lamp', 'bulb', 'downlight', 'ceiling light', 'switch', 'flicker', 'flickering', 'led', 'light point', 'chandelier', 'pendant'],
    includes: 'Labour to swap a fitting or switch on an existing point.',
    extras: ['Heavy chandeliers or high ceilings', 'New light points, about S$80 to S$180 each', 'Smart switches that need a neutral wire'],
    ask: 'How many lights or switches, and are you replacing like for like on existing points?',
    search: 'electrician light installation', trade: 'electrician', confidence: 'published'
  },
  {
    id: 'elec-trip', cat: 'Electrical',
    name: 'Find the cause of a power trip',
    low: 60, high: 150, unit: null,
    kw: ['trip', 'trips', 'tripping', 'tripped', 'power trip', 'no power', 'power cut', 'blackout', 'power keeps', 'half the house', 'elcb', 'rccb', 'keeps cutting'],
    includes: 'Fault tracing to find which circuit or appliance causes the trip. Parts are extra.',
    extras: ['Replacing a faulty breaker, about S$120 to S$250', 'Repairing damaged wiring in the wall'],
    ask: 'Does it trip immediately when you switch it back on, or only when a particular appliance is running?',
    search: 'power trip electrician', trade: 'electrician', confidence: 'published'
  },
  {
    id: 'elec-breaker', cat: 'Electrical',
    name: 'Replace a circuit breaker (MCB or RCCB)',
    low: 120, high: 250, unit: null,
    kw: ['mcb', 'circuit breaker', 'breaker', 'replace breaker', 'change breaker', 'breaker faulty', 'breaker broken', 'breaker spoil'],
    includes: 'Labour and a standard replacement breaker.',
    extras: ['Replacing the whole distribution board'],
    ask: 'Has an electrician already confirmed the breaker itself is faulty?',
    search: 'circuit breaker replacement', trade: 'electrician', confidence: 'published'
  },
  {
    id: 'elec-fan', cat: 'Electrical',
    name: 'Install a ceiling fan on an existing point',
    low: 80, high: 200, unit: 'Fans', addLow: 70, addHigh: 150,
    kw: ['fan', 'ceiling fan', 'wall fan', 'install fan', 'fan installation', 'dc fan'],
    includes: 'Assembly and installation on an existing fan point. The fan itself is not included.',
    extras: ['No existing fan point', 'High or sloped ceilings', 'Removing an old fan'],
    ask: 'How many fans, and is there already a fan point where each one goes?',
    search: 'ceiling fan installation', trade: 'electrician', confidence: 'published'
  },
  {
    id: 'elec-new-point', cat: 'Electrical',
    name: 'Add a new power point',
    low: 120, high: 220, unit: 'Points', addLow: 80, addHigh: 150,
    kw: ['new socket', 'new point', 'new power point', 'additional socket', 'extra socket', 'add socket', 'add a socket', 'add power point', 'more sockets', 'extend'],
    includes: 'A new 13A point run in surface trunking, without hacking.',
    extras: ['Concealed wiring that needs hacking and patching', 'A 15A point for an aircon or storage heater, about S$180 to S$250'],
    ask: 'How far is the new point from the nearest existing socket, and is surface trunking acceptable?',
    search: 'new power point electrician', trade: 'electrician', confidence: 'published'
  },
  {
    id: 'elec-db', cat: 'Electrical',
    name: 'Replace the distribution board (DB box)',
    low: 200, high: 450, unit: null,
    kw: ['db box', 'db', 'distribution board', 'fuse box', 'main switch', 'upgrade db', 'rewire db'],
    includes: 'Labour and a standard DB with breakers for a typical flat.',
    extras: ['Load upgrades that need an application to SP', 'Full or partial rewiring, quoted separately'],
    ask: 'Is the DB being replaced because it is old, damaged, or because you are adding more circuits?',
    search: 'db box replacement', trade: 'electrician', confidence: 'indicative'
  },

  /* Aircon */
  {
    id: 'ac-inspect', cat: 'Aircon', isDefault: true,
    name: 'Aircon technician visit to diagnose a problem',
    low: 50, high: 120, unit: null,
    kw: [],
    includes: 'Call-out and diagnosis. Many technicians waive this if you go ahead with the repair.',
    extras: ['Gas top-up, chemical wash or parts, depending on the fault'],
    ask: 'What is the unit doing: leaking, not cold, noisy, smelly, or not turning on?',
    search: 'aircon repair', trade: 'aircon technician', confidence: 'published'
  },
  {
    id: 'ac-general', cat: 'Aircon',
    name: 'Aircon general servicing',
    low: 35, high: 65, unit: 'Aircon units (indoor)', unitNoun: 'indoor units', addLow: 15, addHigh: 40,
    kw: ['service', 'servicing', 'general service', 'general servicing', 'routine', 'maintenance', 'clean', 'cleaning', 'filter', 'dusty', 'quarterly'],
    includes: 'Filter wash, coil and tray cleaning, drain flush and a performance check.',
    extras: ['Ceiling cassette units, which cost roughly double', 'Hard-to-reach units above 3 metres'],
    ask: 'How many indoor units, and roughly when were they last serviced?',
    search: 'aircon servicing', trade: 'aircon servicing', confidence: 'published'
  },
  {
    id: 'ac-chemwash', cat: 'Aircon',
    name: 'Aircon chemical wash',
    low: 70, high: 120, unit: 'Aircon units (indoor)', unitNoun: 'indoor units', addLow: 60, addHigh: 100,
    kw: ['chemical wash', 'chem wash', 'chemical', 'weak', 'not cold', 'not cool', 'not cooling', 'smell', 'smelly', 'musty', 'mould', 'mold', 'dirty', 'black spots'],
    includes: 'Partial dismantling and chemical cleaning of the coil and blower, then reassembly and testing.',
    extras: ['Ceiling cassette units', 'A gas top-up if pressure is low afterwards'],
    ask: 'How many indoor units need it, and are they wall-mounted or ceiling cassette?',
    search: 'aircon chemical wash', trade: 'aircon servicing', confidence: 'published'
  },
  {
    id: 'ac-overhaul', cat: 'Aircon',
    name: 'Aircon chemical overhaul (full dismantle)',
    low: 150, high: 220, unit: 'Aircon units (indoor)', unitNoun: 'indoor units', addLow: 130, addHigh: 200,
    kw: ['overhaul', 'chemical overhaul', 'dismantle', 'very dirty', 'never serviced', 'years without'],
    includes: 'Full removal and dismantling of the indoor unit, chemical soak of all parts, reinstall and test.',
    extras: ['Ceiling cassette units, about S$340 to S$350 each', 'Replacing corroded parts found during the overhaul'],
    ask: 'How many units, and how many years since they were last chemically cleaned?',
    search: 'aircon chemical overhaul', trade: 'aircon servicing', confidence: 'published'
  },
  {
    id: 'ac-gas', cat: 'Aircon',
    name: 'Aircon gas top-up',
    low: 80, high: 150, unit: 'Aircon units (indoor)', unitNoun: 'indoor units', addLow: 70, addHigh: 140,
    kw: ['gas', 'top up', 'top-up', 'topup', 'refrigerant', 'r32', 'r410', 'r22', 'freon', 'ice', 'icing', 'frost', 'warm air'],
    includes: 'Pressure check and refrigerant top-up for one fan coil.',
    extras: ['Finding and sealing a refrigerant leak', 'A full recharge after a leak repair'],
    ask: 'Has a technician already measured low gas pressure, or is the unit just not cooling well?',
    search: 'aircon gas top up', trade: 'aircon technician', confidence: 'published'
  },
  {
    id: 'ac-leak', cat: 'Aircon',
    name: 'Fix water leaking from the indoor unit',
    low: 60, high: 150, unit: 'Aircon units (indoor)', unitNoun: 'indoor units', addLow: 40, addHigh: 100,
    kw: ['leak', 'leaking', 'drip', 'dripping', 'water drip', 'water leaking', 'drain pipe', 'choked pipe', 'water coming out', 'water dripping'],
    includes: 'Flushing or vacuuming the drain pipe and cleaning the tray.',
    extras: ['A chemical wash if the coil is clogged', 'Re-sloping or replacing a sagging drain pipe'],
    ask: 'How many units are dripping, and when were they last serviced?',
    search: 'aircon water leaking', trade: 'aircon technician', confidence: 'published'
  },
  {
    id: 'ac-fault', cat: 'Aircon',
    name: 'Fix an error code, blinking light or unit that won\u2019t start',
    low: 60, high: 180, unit: null,
    kw: ['blink', 'blinking', 'error', 'code', "won't turn on", 'wont turn on', 'not turning on', 'remote', 'not working', 'dead', 'compressor', 'noisy', 'noise', 'rattling', 'buzzing'],
    includes: 'Diagnosis and a simple fix such as a sensor or capacitor.',
    extras: ['Circuit board replacement, often several hundred dollars', 'Compressor faults, where replacing the unit may be cheaper'],
    ask: 'Which brand is it, roughly how old, and does it show an error code or blink pattern?',
    search: 'aircon repair', trade: 'aircon technician', confidence: 'indicative'
  },

  /* Carpentry */
  {
    id: 'carp-inspect', cat: 'Carpentry', isDefault: true,
    name: 'Carpenter visit to assess a repair',
    low: 60, high: 150, unit: null,
    kw: [],
    includes: 'Call-out, assessment and a minor fix.',
    extras: ['Replacement panels, laminate or hardware'],
    ask: 'What is damaged, and is it built-in carpentry or loose furniture?',
    search: 'carpentry repair', trade: 'carpenter', confidence: 'indicative'
  },
  {
    id: 'carp-hinge', cat: 'Carpentry',
    name: 'Replace cabinet or wardrobe hinges',
    low: 40, high: 100, unit: 'Doors', addLow: 20, addHigh: 40,
    kw: ['hinge', 'hinges', 'cabinet door', 'kitchen cabinet', 'cupboard', 'wardrobe door', 'cabinet', 'sagging', "won't close", 'wont close', 'misaligned', 'soft close', 'soft-close', 'door drop'],
    includes: 'Labour and standard concealed hinges.',
    extras: ['Soft-close hinges, about S$20 to S$50 more', 'Screw holes that are stripped and need the panel repaired'],
    ask: 'How many doors are affected, and do you want soft-close hinges?',
    search: 'cabinet hinge repair', trade: 'carpenter', confidence: 'published'
  },
  {
    id: 'carp-door', cat: 'Carpentry',
    name: 'Fix a sagging, sticking or misaligned room door',
    low: 45, high: 150, unit: null,
    kw: ['door', 'room door', 'bedroom door', 'main door', 'toilet door', 'sticking', 'scraping', "won't latch", 'wont latch', 'swollen', 'alignment', 'door frame'],
    includes: 'Rehanging, planing or realigning the door, and tightening or replacing hinges.',
    extras: ['A new door leaf', 'Frame repairs from termites or water damage'],
    ask: 'Is the door scraping the floor or frame, or not closing at all?',
    search: 'door repair carpenter', trade: 'carpenter', confidence: 'published'
  },
  {
    id: 'carp-sliding', cat: 'Carpentry',
    name: 'Repair a sliding wardrobe door (rollers or track)',
    low: 80, high: 200, unit: null,
    kw: ['sliding', 'slide', 'roller', 'rollers', 'track', 'off track', 'sliding door', 'sliding wardrobe'],
    includes: 'Labour and replacement roller set.',
    extras: ['A bent track or warped door panel', 'Mirror panel replacement'],
    ask: 'Has the door come off its track, or does it just drag and stick?',
    search: 'sliding door repair', trade: 'carpenter', confidence: 'indicative'
  },
  {
    id: 'carp-drawer', cat: 'Carpentry',
    name: 'Replace drawer runners',
    low: 50, high: 130, unit: 'Drawers', addLow: 30, addHigh: 60,
    kw: ['drawer', 'drawers', 'runner', 'runners', 'drawer stuck', 'drawer fell', 'drawer slide'],
    includes: 'Labour and standard ball-bearing runners.',
    extras: ['Soft-close or full-extension runners', 'Rebuilding a broken drawer box'],
    ask: 'How many drawers, and is the drawer box itself still solid?',
    search: 'drawer runner replacement', trade: 'carpenter', confidence: 'indicative'
  },
  {
    id: 'carp-laminate', cat: 'Carpentry',
    name: 'Repair peeling laminate or edging',
    low: 80, high: 250, unit: null,
    kw: ['laminate', 'peeling', 'peel', 'edging', 'edge banding', 'swollen', 'water damage', 'veneer', 'chipped', 'bubbling'],
    includes: 'Regluing or replacing the damaged laminate or edging on one area.',
    extras: ['Panels swollen from water that need replacing', 'Matching a discontinued laminate'],
    ask: 'Roughly how big is the damaged area, and is the board underneath swollen?',
    search: 'laminate repair', trade: 'carpenter', confidence: 'indicative'
  },
  {
    id: 'carp-new', cat: 'Carpentry',
    name: 'New built-in carpentry (laminate, priced per foot run)',
    low: 200, high: 320, unit: 'Width in feet', unitNoun: 'feet', unitOne: 'foot', addLow: 200, addHigh: 320, defaultQty: 6,
    kw: ['new wardrobe', 'build', 'built-in', 'built in', 'custom', 'carpentry work', 'new cabinet', 'tv console', 'shoe cabinet', 'foot run', 'feet'],
    includes: 'Plywood with laminate finish and standard hardware, made to measure and installed.',
    extras: ['Sliding doors, about S$250 to S$400 per foot run', 'Spray paint, veneer or glass finishes', 'Internal accessories and lighting'],
    ask: 'What piece is it, and roughly how many feet wide?',
    search: 'carpentry wardrobe', trade: 'carpenter', confidence: 'published'
  },

  /* General Handyman */
  {
    id: 'hm-inspect', cat: 'General Handyman', isDefault: true,
    name: 'Handyman visit for small jobs (first hour)',
    low: 60, high: 120, unit: null,
    kw: [],
    includes: 'Call-out and about an hour of small jobs.',
    extras: ['Materials', 'Additional hours'],
    ask: 'What jobs are on the list? Batching a few into one visit usually saves money.',
    search: 'handyman', trade: 'handyman', confidence: 'published'
  },
  {
    id: 'hm-tv', cat: 'General Handyman',
    name: 'Mount a TV on the wall',
    low: 80, high: 150, unit: 'TVs', addLow: 60, addHigh: 120,
    kw: ['tv', 'television', 'tv mount', 'mount', 'bracket', 'wall mount', 'tv bracket', 'inch'],
    includes: 'Drilling and mounting on a concrete wall. The bracket is usually yours.',
    extras: ['Gypsum or feature walls that need reinforcement', 'Hiding cables in trunking', 'TVs over 75 inches'],
    ask: 'How big is the TV, and is the wall concrete or a board partition?',
    search: 'tv mounting', trade: 'handyman', confidence: 'published'
  },
  {
    id: 'hm-curtain', cat: 'General Handyman',
    name: 'Install curtain rods, tracks or blinds',
    low: 50, high: 100, unit: 'Sets', addLow: 25, addHigh: 50,
    kw: ['curtain', 'curtains', 'rod', 'track', 'blind', 'blinds', 'roller blind', 'venetian'],
    includes: 'Drilling and mounting per window. Rods or blinds are yours.',
    extras: ['Ceiling-mounted tracks on false ceilings', 'Motorised blinds'],
    ask: 'How many windows, and is it rods, ceiling tracks or blinds?',
    search: 'curtain installation', trade: 'handyman', confidence: 'published'
  },
  {
    id: 'hm-furniture', cat: 'General Handyman',
    name: 'Assemble furniture',
    low: 50, high: 120, unit: 'Items', addLow: 40, addHigh: 110,
    kw: ['assemble', 'assembly', 'ikea', 'taobao', 'furniture', 'flat pack', 'flatpack', 'bed frame', 'desk', 'table', 'chair', 'bookshelf'],
    includes: 'Assembly of one standard flat-pack item.',
    extras: ['Large wardrobes, beds or bunk beds, about S$90 to S$200 each', 'Items without an English manual', 'Fixing to the wall'],
    ask: 'What items are they, and roughly how large?',
    search: 'furniture assembly', trade: 'handyman', confidence: 'published'
  },
  {
    id: 'hm-drill', cat: 'General Handyman',
    name: 'Drill and mount shelves, mirrors or frames',
    low: 40, high: 100, unit: 'Items', addLow: 15, addHigh: 40,
    kw: ['drill', 'drilling', 'hang', 'hanging', 'mirror', 'frame', 'painting', 'shelf', 'shelves', 'hooks', 'holes', 'pegboard', 'pull-up bar', 'towel rail'],
    includes: 'Drilling, wall plugs and mounting for a few small items.',
    extras: ['Tiles or glass that need special bits', 'Heavy items over about 20 kg'],
    ask: 'How many items, and what wall surface: concrete, tile or board?',
    search: 'drilling service', trade: 'handyman', confidence: 'published'
  },
  {
    id: 'hm-laundry', cat: 'General Handyman',
    name: 'Install a laundry rack',
    low: 60, high: 150, unit: null,
    kw: ['laundry rack', 'clothes rack', 'ceiling rack', 'drying rack', 'pole holder', 'bamboo pole', 'laundry pole'],
    includes: 'Drilling and installing a manual rack you supply.',
    extras: ['Automated racks that need a power point', 'Replacing rusted pole holders outside the window'],
    ask: 'Is it a manual rack or an automated one?',
    search: 'laundry rack installation', trade: 'handyman', confidence: 'indicative'
  },
  {
    id: 'hm-lock', cat: 'General Handyman',
    name: 'Replace a door lock or handle',
    low: 60, high: 150, unit: null,
    kw: ['lock', 'handle', 'knob', 'lockset', 'key', 'deadbolt', 'door handle', 'locked out', 'digital lock'],
    includes: 'Labour to fit a lock or handle you supply.',
    extras: ['Digital locks that need the door bored or modified', 'Emergency lockout call-outs'],
    ask: 'Is it a room door, the main door, or a digital lock?',
    search: 'lock replacement', trade: 'locksmith', confidence: 'indicative'
  },
  {
    id: 'hm-patch', cat: 'General Handyman',
    name: 'Patch wall holes or touch up paint',
    low: 60, high: 200, unit: null,
    kw: ['patch', 'hole', 'holes in wall', 'crack', 'cracks', 'paint', 'touch up', 'touch-up', 'plaster', 'dent', 'peeling paint'],
    includes: 'Filling, sanding and painting a few small areas.',
    extras: ['Repainting a whole wall to match colour', 'Cracks from water seepage, which need the leak fixed first'],
    ask: 'How many patches, and roughly how big is each one?',
    search: 'wall patching', trade: 'handyman', confidence: 'indicative'
  }
];

/* Lookups */

export function jobById(id) {
  return JOBS.find(function (j) { return j.id === id; }) || null;
}

export function jobsFor(cat) {
  return JOBS.filter(function (j) { return j.cat === cat; });
}

export function defaultJobFor(cat) {
  return JOBS.find(function (j) { return j.cat === cat && j.isDefault; }) || jobsFor(cat)[0] || null;
}

/* Matching */

/*
 * Keywords match at the start of a word, so "leak" matches "leaking" but
 * "ice" does not match "service" and "lock" does not match "blocked".
 * Multi-word phrases score double because they are more specific.
 */
var patterns = new Map();
function patternFor(k) {
  if (!patterns.has(k)) {
    var escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.set(k, new RegExp('(^|[^a-z0-9])' + escaped));
  }
  return patterns.get(k);
}

function scoreJob(job, text) {
  var score = 0;
  for (var i = 0; i < job.kw.length; i++) {
    var k = job.kw[i];
    if (patternFor(k).test(text)) score += k.indexOf(' ') !== -1 ? 2 : 1;
  }
  return score;
}

/*
 * Returns { job, score, suggestCat } for a category and free-text description.
 * suggestCat is set when the description fits another category clearly better.
 */
export function matchJob(cat, description) {
  var text = ' ' + String(description || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ') + ' ';
  var bestInCat = null;
  var bestInCatScore = 0;
  var bestAny = null;
  var bestAnyScore = 0;

  JOBS.forEach(function (job) {
    var s = scoreJob(job, text);
    if (job.cat === cat && s > bestInCatScore) { bestInCat = job; bestInCatScore = s; }
    if (s > bestAnyScore) { bestAny = job; bestAnyScore = s; }
  });

  var job = bestInCat || defaultJobFor(cat);

  // Suggest another category when the words clearly name it and not this one.
  var suggestCat = null;
  var signals = {};
  CATEGORIES.forEach(function (c) {
    signals[c] = CATEGORY_SIGNALS[c].filter(function (k) { return patternFor(k).test(text); }).length;
  });
  if (signals[cat] === 0) {
    var top = CATEGORIES.filter(function (c) { return c !== cat && signals[c] > 0; })
      .sort(function (a, b) { return signals[b] - signals[a]; })[0];
    if (top) suggestCat = top;
  }
  if (!suggestCat && bestAny && bestAny.cat !== cat && bestAnyScore >= bestInCatScore + 2) suggestCat = bestAny.cat;

  return { job: job, score: bestInCatScore, suggestCat: suggestCat };
}

/* Words that name a trade outright, used only for category suggestions. */
var CATEGORY_SIGNALS = {
  'Plumbing': ['plumb', 'pipe', 'toilet', 'sink', 'basin', 'tap', 'faucet', 'floor trap', 'water heater', 'cistern'],
  'Electrical': ['electric', 'socket', 'power point', 'wiring', 'breaker', 'db box', 'power trip', 'tripping'],
  'Aircon': ['aircon', 'air con', 'air-con', 'aircond', 'air conditioner', 'ac unit', 'fan coil', 'cassette'],
  'Carpentry': ['carpent', 'wardrobe', 'cabinet', 'cupboard', 'laminate', 'drawer', 'tv console', 'console', 'built-in', 'built in', 'hinge'],
  'General Handyman': ['handyman', 'tv', 'curtain', 'blind', 'assemble', 'ikea', 'taobao', 'drill', 'laundry rack']
};

/* Quantities */

export function unitNoun(job, qty) {
  if (!job || !job.unit) return '';
  var plural = job.unitNoun || job.unit.replace(/\s*\(.*\)/, '');
  if (!/^[A-Z]{2,}s$/.test(plural)) plural = plural.toLowerCase();
  if (qty !== 1) return plural;
  return job.unitOne || plural.replace(/s$/, '');
}

var NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/*
 * Picks up "3 units", "two aircons", "4 sockets", "8 ft" and similar from the
 * description so the quantity stepper starts in the right place.
 */
export function guessQty(job, description) {
  if (!job || !job.unit) return 1;
  var text = String(description || '').toLowerCase();
  var re = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(\s*(?:x\s*)?(?:nos?\.?\s*)?(?:[a-z-]+\s+){0,2}?)(units?|aircons?|air ?cons?|fan ?coils?|fans?|sockets?|power ?points?|points?|taps?|doors?|drawers?|items?|pieces?|pcs|tvs?|windows?|sets?|lights?|switch(?:es)?|ft|feet|foot|shelves|mirrors?|frames?|beds?|wardrobes?|tables?|chairs?)\b/g;
  // Sizes and ages are not quantities: "55-inch TV", "4-room flat", "10 year old unit".
  var notCount = /^\s*(-|inch|in\b|"|cm\b|mm\b|m\b|kg\b|l\b|litre|liter|year|yr|month|week|day|hour|storey|room|bedroom|sq)/;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (notCount.test(m[2])) continue;
    var n = NUMBER_WORDS[m[1]] || parseInt(m[1], 10);
    return clampQty(job, n);
  }
  return job.defaultQty || 1;
}

/* Estimate */

function floorTo(n, step) { return Math.floor(n / step) * step; }
function ceilTo(n, step) { return Math.ceil(n / step) * step; }

export function clampQty(job, qty) {
  if (!job || !job.unit) return 1;
  var n = parseInt(qty, 10);
  if (!isFinite(n) || n < 1) n = job.defaultQty || 1;
  return Math.min(n, 40);
}

export function estimate(job, opts) {
  opts = opts || {};
  var qty = clampQty(job, opts.qty);
  var home = HOME_TYPES[opts.home] || HOME_TYPES.hdb;
  var timing = TIMINGS[opts.timing] || TIMINGS.normal;

  var low = job.low;
  var high = job.high;
  if (job.unit && qty > 1) {
    low += (qty - 1) * job.addLow;
    high += (qty - 1) * job.addHigh;
  }
  low *= home.low * timing.low;
  high *= home.high * timing.high;

  var step = high >= 1000 ? 50 : 5;
  return {
    low: floorTo(low, step),
    high: ceilTo(high, step),
    qty: qty,
    home: opts.home in HOME_TYPES ? opts.home : 'hdb',
    timing: opts.timing in TIMINGS ? opts.timing : 'normal'
  };
}

export function formatSGD(n) {
  return 'S$' + Math.round(n).toLocaleString('en-SG');
}

export function formatRange(low, high) {
  return formatSGD(low) + '\u2013' + formatSGD(high).replace('S$', '');
}

/* The chat assistant's opening line, shared by the page and the server. */
export function greetingFor(job) {
  var name = job.name.charAt(0).toLowerCase() + job.name.slice(1);
  return 'I\u2019ve matched this to \u201c' + name + '\u201d. ' + job.ask;
}

/* A compact price table for one category, used in the chat system prompt. */
export function priceTableFor(cat) {
  return jobsFor(cat).map(function (j) {
    var line = '- ' + j.name + ': S$' + j.low + '\u2013' + j.high;
    if (j.unit) line += ' for the first (' + j.unit.toLowerCase() + '), then S$' + j.addLow + '\u2013' + j.addHigh + ' each';
    line += '. Includes: ' + j.includes + ' Extra: ' + j.extras.join('; ') + '.';
    if (j.confidence === 'indicative') line += ' (Fewer published prices; treat as indicative.)';
    return line;
  }).join('\n');
}
