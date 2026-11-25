// Central tuning + content tables. Everything gameplay-facing that a designer
// would want to tweak lives here so modes, maps and bikes stay data-driven.

export const ASSIST_LEVELS = [
  // force: motor force multiplier, vmax: assist cut-off (m/s), drain: % of a
  // base (100-unit) battery per second at full motor load.
  { id: 'eco',   name: 'ECO',   force: 0.6, vmax: 7.0,  drain: 0.24, color: '#3ddc84' },
  { id: 'tour',  name: 'TOUR',  force: 1.0, vmax: 9.0,  drain: 0.45, color: '#3fa9ff' },
  { id: 'turbo', name: 'TURBO', force: 1.6, vmax: 12.0, drain: 1.0, color: '#ff5a36' },
];

export const PHYS = {
  g: 9.81,
  humanForce: 110,     // N at standstill (rider legs, low gear)
  humanVmax: 4.4,      // m/s where unassisted pedalling stops adding force (~16 km/h)
  motorForce: 120,     // N at Tour, before upgrades
  airDensity: 1.2,
  maxSpeed: 22,        // hard cap, m/s
  latAcc: 8.0,         // max lateral acceleration on dry asphalt, m/s^2
  maxYawLow: 1.8,      // rad/s at walking pace
  steerResp: 7.0,
  tractionRate: 10.0,  // how fast velocity follows heading (lower = more drift)
  wetGrip: 0.72,
  hopVelocity: 4.3,
  crashSpeed: 4.0,     // normal impact speed that counts as a crash
  coastRegen: 0.35,    // %/s on a decent downhill while coasting
  brakeRegen: 0.8,     // %/s while braking at 36 km/h
  chargeRate: 9.0,     // %/s at a charging station
  chargeRadius: 3.8,
};

export const SURFACES = {
  asphalt:  { grip: 1.00, roll: 0.008, label: 'Asphalt' },
  concrete: { grip: 0.95, roll: 0.010, label: 'Concrete' },
  gravel:   { grip: 0.70, roll: 0.022, label: 'Gravel' },
  dirt:     { grip: 0.80, roll: 0.028, label: 'Dirt' },
  grass:    { grip: 0.65, roll: 0.045, label: 'Grass' },
};

// ---------------------------------------------------------------- upgrades
const COSTS = [150, 320, 560, 900, 1400];
export const UPGRADES = [
  { id: 'battery',    name: 'Battery',    icon: '🔋', desc: '+20% capacity per level' },
  { id: 'motor',      name: 'Motor',      icon: '⚡', desc: '+12% torque, higher assist cut-off' },
  { id: 'tires',      name: 'Tires',      icon: '🛞', desc: 'More grip, less rolling drag' },
  { id: 'suspension', name: 'Suspension', icon: '🪀', desc: 'Softer landings, less cargo damage' },
  { id: 'brakes',     name: 'Brakes',     icon: '🛑', desc: 'Stronger stops, more regen' },
].map(u => ({ ...u, maxLevel: COSTS.length, cost: lvl => COSTS[lvl] }));

// --------------------------------------------------------------- frames
// Only the city frame ships in the vertical slice; the rest are data stubs so
// the garage UI and physics already understand them.
// motor/vmax/drain/human/wheelie/brake scale the shared assist tables.
export const FRAMES = [
  { id: 'emoto',    name: 'Trail E-Moto',  available: true,  mass: 125, grip: 1.10, roll: 1.15, cda: 0.62, turn: 0.95,
    motor: 2.0, vmax: 1.4, drain: 1.3, human: 0.35, wheelie: 1.15, brake: 1.4, starScale: 1.3,
    blurb: 'Sur-Ron-style electric dirt bike. Fast, heavy on charge, no pedals.',
    stats: { speed: 5, handling: 3, offroad: 5, cargo: 3 } },
  { id: 'city',     name: 'City Commuter', available: true,  mass: 95,  grip: 1.00, roll: 1.00, cda: 0.55, turn: 1.00,
    blurb: 'Pedal-assist e-bike. Sips battery, pedals home when it runs flat.',
    stats: { speed: 3, handling: 4, offroad: 2, cargo: 3 } },
  { id: 'mountain', name: 'Trail MTB',     available: false, mass: 98,  grip: 1.15, roll: 1.25, cda: 0.58, turn: 1.05,
    stats: { speed: 3, handling: 4, offroad: 5, cargo: 2 } },
  { id: 'cargo',    name: 'Longtail Cargo',available: false, mass: 120, grip: 1.00, roll: 1.10, cda: 0.62, turn: 0.80,
    stats: { speed: 2, handling: 2, offroad: 2, cargo: 5 } },
  { id: 'fat',      name: 'Fat Tire',      available: false, mass: 105, grip: 1.25, roll: 1.45, cda: 0.60, turn: 0.90,
    stats: { speed: 2, handling: 3, offroad: 5, cargo: 3 } },
  { id: 'folding',  name: 'Folder',        available: false, mass: 85,  grip: 0.90, roll: 0.95, cda: 0.52, turn: 1.25,
    stats: { speed: 3, handling: 5, offroad: 1, cargo: 1 } },
];

// ------------------------------------------------------------ cosmetics
export const COSMETICS = {
  paint: [
    { id: 'volt',     name: 'Volt Lime',    color: '#c6ff3d', cost: 0 },
    { id: 'ocean',    name: 'Ocean',        color: '#1fa2ff', cost: 200 },
    { id: 'sunset',   name: 'Sunset',       color: '#ff6b3d', cost: 200 },
    { id: 'bubble',   name: 'Bubblegum',    color: '#ff5fa8', cost: 250 },
    { id: 'graphite', name: 'Graphite',     color: '#3a3f4a', cost: 300 },
    { id: 'pearl',    name: 'Pearl',        color: '#f4f1ea', cost: 300 },
  ],
  helmet: [
    { id: 'white',  name: 'Classic White', color: '#f2f2f2', cost: 0 },
    { id: 'red',    name: 'Racing Red',    color: '#e8343a', cost: 150 },
    { id: 'yellow', name: 'Hi-Vis',        color: '#ffd21f', cost: 150 },
    { id: 'black',  name: 'Stealth',       color: '#1d1f24', cost: 200 },
  ],
  outfit: [
    { id: 'teal',   name: 'Courier Teal',  color: '#16a59a', cost: 0 },
    { id: 'orange', name: 'Safety Orange', color: '#ff8a1f', cost: 180 },
    { id: 'purple', name: 'Night Purple',  color: '#7b4dff', cost: 180 },
    { id: 'denim',  name: 'Denim',         color: '#3b5b8c', cost: 220 },
  ],
  trail: [
    { id: 'none',    name: 'None',         color: null,      cost: 0 },
    { id: 'cyan',    name: 'Cyan Streak',  color: '#29f0ff', cost: 300 },
    { id: 'magenta', name: 'Neon Magenta', color: '#ff3df2', cost: 300 },
    { id: 'gold',    name: 'Gold Rush',    color: '#ffc93d', cost: 450 },
  ],
};

export const COSMETIC_SLOTS = [
  { id: 'paint',  name: 'Paint' },
  { id: 'helmet', name: 'Helmet' },
  { id: 'outfit', name: 'Outfit' },
  { id: 'trail',  name: 'Light trail' },
];

export function upgradeEffects(up) {
  const l = k => up[k] || 0;
  return {
    capMult:    1 + 0.20 * l('battery'),
    motorMult:  1 + 0.12 * l('motor'),
    vmaxAdd:    0.35 * l('motor'),
    gripMult:   1 + 0.07 * l('tires'),
    rollMult:   1 - 0.06 * l('tires'),
    damageMult: 1 - 0.12 * l('suspension'),
    suspDamp:   1 + 0.15 * l('suspension'),
    brakeMult:  1 + 0.15 * l('brakes'),
    regenMult:  1 + 0.25 * l('brakes'),
  };
}
