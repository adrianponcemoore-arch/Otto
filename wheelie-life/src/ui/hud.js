// In-ride HUD. DOM writes are cached so unchanged values cost nothing.
import { ASSIST_LEVELS, SURFACES } from '../config.js';
import { fmtTime } from '../modes/DeliveryRush.js';
import { Pool } from '../core/pool.js';

const $ = id => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      root: $('hud'), batFill: $('bat-fill'), batPct: $('bat-pct'), batState: $('bat-state'),
      clock: $('clock'), objTitle: $('obj-title'), objSub: $('obj-sub'), objDist: $('obj-dist'), objective: $('objective'),
      cargo: $('cargo'), cargoFill: $('cargo-fill'), speed: $('speed'), surface: $('surface'),
      assist: $('btn-assist'), assistLabel: $('assist-label'), pips: [...document.querySelectorAll('#assist-pips i')],
      popups: $('popups'), wheelie: $('wheelie-meter'), banner: $('banner'), windArrow: $('wind-arrow'), windText: $('wind-text'), wind: $('wind'),
    };
    this._cache = {};
    this.popPool = new Pool(() => {
      const d = document.createElement('div');
      d.addEventListener('animationend', () => { d.remove(); this.popPool.release(d); });
      return d;
    });
  }

  _set(key, el, prop, val) {
    if (this._cache[key] === val) return;
    this._cache[key] = val;
    if (prop === 'text') el.textContent = val;
    else if (prop === 'class') el.className = val;
    else if (prop === 'transform') el.style.transform = val;
    else if (prop === 'display') el.classList.toggle('hidden', !val);
  }

  show(on) { this.el.root.classList.toggle('hidden', !on); }

  setAssist(i) {
    const a = ASSIST_LEVELS[i];
    this.el.assistLabel.textContent = a.name;
    this.el.assist.className = `ctl-btn assist ${a.id}`;
    this.el.pips.forEach((p, k) => p.classList.toggle('on', k <= i));
  }

  popup(text, cls = 'info') {
    const d = this.popPool.acquire();
    d.className = `popup ${cls}`;
    d.textContent = text;
    this.el.popups.appendChild(d);
    while (this.el.popups.children.length > 3) this.el.popups.firstChild.remove();
  }

  banner(text, cls = '') {
    if (!text) { this._set('banner', this.el.banner, 'class', 'banner hidden'); return; }
    this._set('banner', this.el.banner, 'class', `banner ${cls}`);
    this._set('bannerT', this.el.banner, 'text', text);
  }

  update({ bike, battery, objective, clock, wind }) {
    const pct = battery.charge / battery.capacity;
    const p100 = Math.round(pct * 100);
    this._set('batW', this.el.batFill, 'transform', `scaleX(${Math.max(0.001, pct).toFixed(3)})`);
    this._set('batT', this.el.batPct, 'text', `${p100}%`);
    this._set('batC', this.el.batFill, 'class', `bat-fill${pct < 0.1 ? ' crit' : pct < 0.25 ? ' low' : ''}`);
    let st = '', sc = 'bat-state';
    if (bike.charging) { st = '⚡ CHARGING'; sc += ' charging'; }
    else if (battery.charge <= 0) { st = 'EMPTY · LEG POWER'; sc += ' empty'; }
    else if (bike.regen > 0) { st = '↺ REGEN'; sc += ' regen'; }
    else if (bike.motorOn) st = `ASSIST ${bike.motorLoad > 0.6 ? '▮▮▮' : bike.motorLoad > 0.3 ? '▮▮' : '▮'}`;
    else st = 'COASTING';
    this._set('bs', this.el.batState, 'text', st);
    this._set('bsc', this.el.batState, 'class', sc);

    this._set('spd', this.el.speed, 'text', String(Math.round(bike.speed * 3.6)));
    this._set('whV', this.el.wheelie, 'display', bike.inWheelie);
    if (bike.inWheelie) this._set('whT', this.el.wheelie, 'text', `WHEELIE ${Math.floor(bike.wheelieDist)} m`);
    const wet = wind && wind.wet;
    this._set('surf', this.el.surface, 'text', `${SURFACES[bike.surface]?.label || ''}${wet ? ' · wet' : ''}${bike.tuck ? ' · tuck' : ''}`);

    if (clock != null) {
      this._set('clock', this.el.clock, 'text', fmtTime(Math.ceil(clock)));
      this._set('clockC', this.el.clock, 'class', `clock${clock < 30 ? ' warn' : ''}`);
    }
    if (objective) {
      this._set('objT', this.el.objTitle, 'text', objective.title);
      this._set('objC', this.el.objTitle, 'class', `obj-title ${objective.warn ? 'warn' : objective.kind}`);
      this._set('objS', this.el.objSub, 'text', objective.sub);
      const d = objective.target ? Math.hypot(objective.target.x - bike.x, objective.target.z - bike.z) : 0;
      this._set('objD', this.el.objDist, 'text', d > 999 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 5) * 5} m`);
      const hasCargo = objective.cargo != null;
      this._set('cargoV', this.el.cargo, 'display', hasCargo);
      if (hasCargo) {
        this._set('cargoW', this.el.cargoFill, 'transform', `scaleX(${Math.max(0.001, objective.cargo).toFixed(2)})`);
        const col = objective.cargo > 0.6 ? 'var(--volt)' : objective.cargo > 0.3 ? 'var(--amber)' : 'var(--red)';
        if (this._cache.cargoCol !== col) { this._cache.cargoCol = col; this.el.cargoFill.style.background = col; }
      }
    }
    if (wind) {
      const ws = Math.hypot(wind.x, wind.z);
      this._set('windV', this.el.wind, 'display', ws > 0.5);
      if (ws > 0.5) {
        // arrow relative to heading: up = blowing from behind (tailwind)
        const sy = Math.sin(bike.yaw), cy = Math.cos(bike.yaw);
        const f = wind.x * sy + wind.z * cy, r = -wind.x * cy + wind.z * sy;
        const deg = Math.round((Math.atan2(-f, r) * 180) / Math.PI);
        this._set('windA', this.el.windArrow, 'transform', `rotate(${deg}deg)`);
        this._set('windT', this.el.windText, 'text', `${Math.round(ws * 3.6)} km/h ${bike.wind > 0.5 ? 'tail' : bike.wind < -0.5 ? 'head' : 'cross'}`);
      }
    }
  }
}
