// Local save (localStorage) with a versioned schema and safe fallbacks for
// private browsing / blocked storage.
const KEY = 'voltrider.save.v1';

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
    totalCoins: 0,
    upgrades: { battery: 0, motor: 0, tires: 0, suspension: 0, brakes: 0 },
    frame: 'city',
    equipped: { paint: 'volt', helmet: 'white', outfit: 'teal', trail: 'none' },
    owned: { paint: ['volt'], helmet: ['white'], outfit: ['teal'], trail: ['none'] },
    levels: {},   // levelId -> { stars, best }
    settings: { volume: 0.8, haptics: true, tilt: false, sensitivity: 1, quality: 'auto', leftHanded: false },
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    const b = base[k], o = over[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, o);
    else if (typeof o === typeof b || (Array.isArray(b) && Array.isArray(o))) base[k] = o;
  }
  // keep keys we don't know about in nested maps like levels
  if (base.levels && over.levels) base.levels = { ...over.levels };
  return base;
}

export class SaveStore {
  constructor() {
    this.data = defaultSave();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(defaultSave(), JSON.parse(raw));
    } catch (e) { /* storage unavailable: play without persistence */ }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  }
  reset() {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }
}
