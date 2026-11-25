// Menu screens: main, map select, garage (upgrades + frames), shop
// (cosmetics), settings, pause and results. Rendered from data so new modes,
// maps, upgrades and cosmetics appear automatically.
import { UPGRADES, FRAMES, COSMETICS, COSMETIC_SLOTS } from '../config.js';
import { MAPS } from '../world/maps/index.js';
import { MODES } from '../modes/index.js';
import { levelsFor, LEVELS } from '../data/levels.js';

const $ = id => document.getElementById(id);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const starStr = n => [0, 1, 2].map(i => `<span class="${i < n ? '' : 'off'}">★</span>`).join('');

export class Menus {
  constructor(app) {
    this.app = app;
    this.current = null;
    this.sel = { map: 'downtown', mode: 'delivery' };
    this.stack = [];
  }

  get save() { return this.app.store.data; }

  show(name, { push = true } = {}) {
    if (push && this.current && this.current !== name && !['pause', 'results'].includes(this.current)) this.stack.push(this.current);
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    this.current = name;
    if (!name) return;
    const el = $(`screen-${name}`);
    this[`_render_${name}`]?.(el);
    el.classList.add('show');
    this.app.onScreen?.(name);
  }

  back() {
    const prev = this.stack.pop() || 'main';
    this.show(prev, { push: false });
  }

  hideAll() { this.show(null, { push: false }); this.stack = []; }

  _click(el, sel, fn) {
    el.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => { this.app.audio.sfx('click'); this.app.haptics.play('tap'); fn(b, e); }));
  }

  _topbar(title) {
    return `<div class="topbar"><button class="back" data-back aria-label="Back">‹</button><h2>${title}</h2><div class="coins">${this.save.coins}</div></div>`;
  }

  _wireBack(el) { this._click(el, '[data-back]', () => this.back()); }

  // ----------------------------------------------------------------- main
  _render_main(el) {
    const totalStars = Object.values(this.save.levels).reduce((a, l) => a + (l.stars || 0), 0);
    el.innerHTML = '';
    el.append(h(`<div class="main-layout">
      <div class="main-head">
        <div><div class="logo"><span>⚡</span>WHEELIE LIFE</div><div class="tagline">Ride smart. Save charge. Deliver fast.</div></div>
        <div class="coins">${this.save.coins}</div>
      </div>
      <div class="main-menu">
        <button class="btn primary big" data-go="map">▶&nbsp; RIDE</button>
        <button class="btn" data-go="garage">🔧 Garage</button>
        <button class="btn" data-go="shop">🎨 Shop</button>
        <button class="btn" data-go="settings">⚙️ Settings</button>
        <div class="btn" style="pointer-events:none">⭐ ${totalStars}/${LEVELS.length * 3}</div>
      </div>
    </div>`));
    this._click(el, '[data-go]', b => this.show(b.dataset.go));
  }

  // ------------------------------------------------------------ map select
  _levelUnlocked(levels, i) {
    if (i === 0) return true;
    const prev = this.save.levels[levels[i - 1].id];
    return !!(prev && prev.stars > 0);
  }

  _render_map(el) {
    const s = this.sel;
    const levels = levelsFor(s.mode, s.map);
    el.innerHTML = this._topbar('Choose a ride') + `
      <div class="section-title">District</div>
      <div class="row-scroll">${MAPS.map(m => `<button class="chip ${m.id === s.map ? 'sel' : ''} ${m.available ? '' : 'locked'}" data-map="${m.id}">${m.icon} ${esc(m.name)}${m.available ? '' : ' <span class="tag">SOON</span>'}</button>`).join('')}</div>
      <div class="section-title">Mode</div>
      <div class="row-scroll">${MODES.map(m => `<button class="chip ${m.id === s.mode ? 'sel' : ''} ${m.available ? '' : 'locked'}" data-mode="${m.id}">${m.icon} ${esc(m.title)}${m.available ? '' : ' <span class="tag">SOON</span>'}</button>`).join('')}</div>
      <div class="section-title">${esc((MODES.find(m => m.id === s.mode) || {}).blurb || '')}</div>
      <div class="levels">${levels.length ? levels.map((l, i) => {
        const rec = this.save.levels[l.id] || {};
        const open = this._levelUnlocked(levels, i);
        const cond = [l.rain ? '🌧️ Rain' : '☀️ Dry', l.timeOfDay > 19 || l.timeOfDay < 6 ? '🌙 Night' : '🕗 Day', `📦 ×${l.deliveries}`].join(' · ');
        return `<button class="card level ${open ? '' : 'locked'}" data-level="${l.id}" ${open ? '' : 'disabled'}>
          <h3>${i + 1}. ${esc(l.name)}</h3><p>${esc(l.blurb)}</p><p>${cond}</p>
          <div class="meta"><span class="stars">${starStr(rec.stars || 0)}</span><span>${open ? (rec.best ? `Best ${rec.best}` : 'New') : '🔒 Earn ★ on previous'}</span></div>
        </button>`;
      }).join('') : `<div class="card"><p class="muted">Coming in a future update. Delivery Rush in Downtown is playable now.</p></div>`}</div>`;
    this._wireBack(el);
    this._click(el, '[data-map]', b => { const m = MAPS.find(x => x.id === b.dataset.map); if (m.available) { s.map = m.id; this._render_map(el); } else this.app.audio.sfx('empty'); });
    this._click(el, '[data-mode]', b => { s.mode = b.dataset.mode; this._render_map(el); });
    this._click(el, '[data-level]', b => this.app.startLevel(b.dataset.level));
  }

  // --------------------------------------------------------------- garage
  _render_garage(el) {
    const sv = this.save;
    const frames = FRAMES.map(f => `<div class="card frame-card ${f.id === sv.frame ? 'sel' : ''}" style="${f.id === sv.frame ? 'border-color:var(--volt)' : ''}">
        <h4>${esc(f.name)}</h4>
        ${Object.entries(f.stats).map(([k, v]) => `<div class="stat"><span>${k}</span><span class="bar"><i style="width:${v * 20}%"></i></span></div>`).join('')}
        <span class="tag" style="align-self:flex-start;margin-top:4px">${f.available ? (f.id === sv.frame ? 'EQUIPPED' : 'OWNED') : 'COMING SOON'}</span>
      </div>`).join('');
    const ups = UPGRADES.map(u => {
      const lvl = sv.upgrades[u.id] || 0, max = lvl >= u.maxLevel, cost = max ? 0 : u.cost(lvl);
      return `<div class="upgrade"><div class="ic">${u.icon}</div>
        <div><h4>${u.name} <span class="muted" style="font-size:12px">Lv ${lvl}</span></h4><p>${u.desc}</p>
        <div class="lvl-pips">${Array.from({ length: u.maxLevel }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="buy" data-up="${u.id}" ${max || sv.coins < cost ? 'disabled' : ''}>${max ? 'MAX' : `🪙 ${cost}`}</button></div>`;
    }).join('');
    const equip = COSMETIC_SLOTS.map(slot => `<div class="section-title">${slot.name}</div><div class="swatches">${COSMETICS[slot.id]
      .filter(c => sv.owned[slot.id].includes(c.id))
      .map(c => `<button class="swatch ${sv.equipped[slot.id] === c.id ? 'sel' : ''}" data-slot="${slot.id}" data-id="${c.id}" title="${esc(c.name)}" style="background:${c.color || 'repeating-linear-gradient(45deg,#333 0 6px,#555 6px 12px)'}"></button>`).join('')}</div>`).join('');
    el.innerHTML = this._topbar('Garage') + `<div class="garage-layout">
        <div class="garage-stage"></div>
        <div class="garage-panel">
          <div class="card"><div class="section-title" style="margin-top:0">Upgrades</div>${ups}</div>
          <div class="section-title">Frames</div><div class="row-scroll">${frames}</div>
          <div class="card" style="margin-top:10px">${equip}<p class="muted" style="font-size:12px;margin-top:10px">Buy more colours, helmets, outfits and trails in the Shop.</p></div>
        </div></div>`;
    this._wireBack(el);
    this._click(el, '[data-up]', b => {
      const u = UPGRADES.find(x => x.id === b.dataset.up);
      const lvl = sv.upgrades[u.id] || 0;
      if (lvl >= u.maxLevel || sv.coins < u.cost(lvl)) return;
      sv.coins -= u.cost(lvl);
      sv.upgrades[u.id] = lvl + 1;
      this.app.store.save();
      this.app.audio.sfx('coin');
      this._render_garage(el);
    });
    this._click(el, '[data-slot]', b => {
      sv.equipped[b.dataset.slot] = b.dataset.id;
      this.app.store.save();
      this.app.applyCosmetics();
      this._render_garage(el);
    });
  }

  // ----------------------------------------------------------------- shop
  _render_shop(el) {
    const sv = this.save;
    el.innerHTML = this._topbar('Shop') + `<div class="side-panel"><p class="muted" style="margin:-4px 2px 8px;font-weight:700">Spend the coins you earn from tips. No real money, ever.</p>` +
      COSMETIC_SLOTS.map(slot => `<div class="card" style="margin-bottom:10px"><div class="section-title" style="margin-top:0">${slot.name}</div><div class="swatches">${COSMETICS[slot.id].map(c => {
        const owned = sv.owned[slot.id].includes(c.id), eq = sv.equipped[slot.id] === c.id;
        return `<button class="swatch ${eq ? 'sel' : ''}" data-slot="${slot.id}" data-id="${c.id}" title="${esc(c.name)}" style="background:${c.color || 'repeating-linear-gradient(45deg,#333 0 6px,#555 6px 12px)'}">${owned ? '' : `<span class="price">${c.cost}</span>`}</button>`;
      }).join('')}</div><p class="muted" style="font-size:12px;margin-top:8px" data-name="${slot.id}">${esc(COSMETICS[slot.id].find(c => c.id === sv.equipped[slot.id])?.name || '')}</p></div>`).join('') + '</div>';
    this._wireBack(el);
    this._click(el, '[data-slot]', b => {
      const slot = b.dataset.slot, c = COSMETICS[slot].find(x => x.id === b.dataset.id);
      const owned = sv.owned[slot].includes(c.id);
      if (!owned) {
        if (sv.coins < c.cost) { this.app.audio.sfx('empty'); b.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 200); return; }
        sv.coins -= c.cost;
        sv.owned[slot].push(c.id);
        this.app.audio.sfx('coin');
      }
      sv.equipped[slot] = c.id;
      this.app.store.save();
      this.app.applyCosmetics();
      this._render_shop(el);
    });
  }

  // ------------------------------------------------------------- settings
  _render_settings(el) {
    const st = this.save.settings;
    const tog = (k, label, sub) => `<div class="setting"><label>${label}<small>${sub}</small></label><button class="toggle ${st[k] ? 'on' : ''}" data-tog="${k}" aria-label="${label}"></button></div>`;
    el.innerHTML = this._topbar('Settings') + `<div class="card">
      <div class="setting"><label>Sound volume</label><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-range="volume"></div>
      ${tog('haptics', 'Haptics', this.app.haptics.supported ? 'Vibrate on bumps, crashes and pickups' : 'Not supported by this browser')}
      ${tog('tilt', 'Tilt to steer', 'Steer by tilting the phone; left side becomes throttle too')}
      <div class="setting"><label>Steering sensitivity</label><input type="range" min="0.6" max="1.8" step="0.1" value="${st.sensitivity}" data-range="sensitivity"></div>
      ${tog('leftHanded', 'Swap sides', 'Steer on the right, ride on the left')}
      <div class="setting"><label>Graphics<small>Auto adapts resolution to hold 60 fps</small></label><div class="seg">${['auto', 'low', 'high'].map(q => `<button class="${st.quality === q ? 'sel' : ''}" data-q="${q}">${q.toUpperCase()}</button>`).join('')}</div></div>
      <div class="setting"><label>Reset progress<small>Coins, upgrades, cosmetics and stars</small></label><button class="btn" data-reset style="min-height:48px;color:var(--red)">Reset</button></div>
    </div>
    <p class="muted" style="text-align:center;margin-top:14px;font-size:12px">Wheelie Life · vertical slice · v0.1</p>`;
    this._wireBack(el);
    this._click(el, '[data-tog]', async b => {
      const k = b.dataset.tog;
      if (k === 'tilt' && !st.tilt) {
        const ok = await this.app.requestTilt();
        if (!ok) { this.app.audio.sfx('empty'); return; }
      }
      st[k] = !st[k];
      this.app.applySettings();
      this._render_settings(el);
    });
    el.querySelectorAll('[data-range]').forEach(r => r.addEventListener('input', () => { st[r.dataset.range] = parseFloat(r.value); this.app.applySettings(); }));
    this._click(el, '[data-q]', b => { st.quality = b.dataset.q; this.app.applySettings(); this._render_settings(el); });
    this._click(el, '[data-reset]', b => {
      if (b.dataset.confirm) { this.app.store.reset(); this.app.applyCosmetics(); this._render_settings(el); return; }
      b.dataset.confirm = '1'; b.textContent = 'Tap again';
    });
  }

  // ---------------------------------------------------------------- pause
  _render_pause(el) {
    el.innerHTML = `<div class="card modal">
      <h2>Paused</h2>
      <p class="muted">${esc(this.app.session?.level.name || '')}</p>
      <button class="btn primary" data-a="resume">▶ Resume</button>
      <button class="btn" data-a="restart">↻ Restart</button>
      <button class="btn" data-a="quit">⌂ Quit to menu</button>
    </div>`;
    this._click(el, '[data-a]', b => this.app[b.dataset.a]());
  }

  // -------------------------------------------------------------- results
  _render_results(el) {
    const r = this.app.lastResult;
    if (!r) return;
    const lv = this.app.lastLevel;
    const levels = levelsFor(lv.mode, lv.map);
    const idx = levels.findIndex(l => l.id === lv.id);
    const next = levels[idx + 1];
    const nextOpen = next && r.stars > 0;
    el.innerHTML = `<div class="card modal">
      <h2>${esc(r.title)}</h2>
      <div class="res-stars">${[0, 1, 2].map(i => `<span class="${i < r.stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('')}</div>
      <div class="res-rows">${r.rows.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
        <div><span>Score</span><span>${r.score}</span></div></div>
      <div class="res-coins">+${r.coins} 🪙</div>
      <div class="thresholds">★ finish all deliveries · ★★ ${r.thresholds[1]} · ★★★ ${r.thresholds[2]}${r.newBest ? ' · NEW BEST!' : ''}</div>
      ${nextOpen ? `<button class="btn primary" data-a="next">Next: ${esc(next.name)} ›</button>` : ''}
      <button class="btn ${nextOpen ? '' : 'primary'}" data-a="restart">↻ Ride again</button>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <button class="btn" data-a="garage">🔧 Garage</button>
        <button class="btn" data-a="quit">⌂ Menu</button>
      </div>
    </div>`;
    r.stars && [0, 1, 2].slice(0, r.stars).forEach(i => setTimeout(() => this.app.audio.sfx('star', i), 200 + i * 250));
    this._click(el, '[data-a]', b => {
      const a = b.dataset.a;
      if (a === 'next') this.app.startLevel(next.id);
      else if (a === 'garage') { this.app.quit(); this.show('garage'); }
      else this.app[a]();
    });
  }
}
