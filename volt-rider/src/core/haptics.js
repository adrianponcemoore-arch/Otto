// Haptic feedback through the Vibration API (Android Chrome/Firefox). iOS
// Safari does not expose vibration to web pages, so calls are no-ops there;
// a native wrapper can swap this module for a Taptic Engine bridge.
const PATTERNS = {
  bump: 12,
  pothole: [18, 20, 12],
  land: 22,
  crash: [60, 40, 90],
  pickup: [15, 50, 25],
  deliver: [20, 40, 20, 40, 40],
  tap: 8,
  empty: [80, 60, 80],
};

export class Haptics {
  constructor() {
    this.enabled = true;
    this.supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    this._last = 0;
  }
  play(name, scale = 1) {
    if (!this.enabled || !this.supported) return;
    const now = performance.now();
    if (now - this._last < 60 && name !== 'crash') return;
    this._last = now;
    let p = PATTERNS[name] ?? 10;
    if (typeof p === 'number') p = Math.round(p * Math.min(2, Math.max(0.5, scale)));
    try { navigator.vibrate(p); } catch (e) { /* ignore */ }
  }
}
