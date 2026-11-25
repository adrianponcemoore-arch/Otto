// Delivery Rush: pick up a package, drop it off across the city, repeat
// before the shift clock runs out. Tips reward speed and cargo condition.
import { GameMode } from './GameMode.js';
import { makeRng } from '../core/rng.js';

const PICKUP_R = 4.2, DROP_R = 4.5, DROP_MAX_SPEED = 4.2, PICKUP_MAX_SPEED = 9;
const PAR_SPEED = 6.2; // m/s average expected for full speed tip

export class DeliveryRush extends GameMode {
  static id = 'delivery';
  static title = 'Delivery Rush';
  static icon = '📦';
  static available = true;
  static blurb = 'Pick up and drop off packages across the city before time runs out.';

  start() {
    const { world } = this.ctx;
    const rng = makeRng(this.level.seed);
    const spots = world.spots;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const pickNear = (from, lo, hi, avoid) => {
      let cands = spots.filter(s => !avoid.includes(s) && dist(s, from) >= lo && dist(s, from) <= hi);
      if (!cands.length) cands = spots.filter(s => !avoid.includes(s));
      return rng.pick(cands);
    };
    this.jobs = [];
    let at = world.start;
    const used = [];
    for (let i = 0; i < this.level.deliveries; i++) {
      const p = pickNear(at, i === 0 ? 40 : 30, i === 0 ? 130 : 160, used);
      used.push(p);
      const d = pickNear(p, 150, 300, used);
      used.push(d);
      this.jobs.push({ pickup: p, drop: d, dist: dist(p, d) });
      at = d;
    }
    this.jobIndex = 0;
    this.phase = 'pickup';
    this.timeLeft = this.level.timeLimit;
    this.elapsed = 0;
    this.cargo = 1;
    this.tips = 0;
    this.delivered = 0;
    this.damageTaken = 0;
    this.legTime = 0;
    this.tooFast = false;
    this.log = [];
    this.wheelieBonus = 0;
    this.bestWheelie = 0;
    this._showMarker();
  }

  get job() { return this.jobs[this.jobIndex]; }

  _showMarker() {
    const { markers } = this.ctx;
    if (!this.job) { markers.hide(); return; }
    const spot = this.phase === 'pickup' ? this.job.pickup : this.job.drop;
    markers.show(this.phase, spot.x, spot.z);
  }

  update(dt, bike) {
    if (this.finished) return;
    this.elapsed += dt;
    this.legTime += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this._finish(false); return; }
    const job = this.job;
    const spot = this.phase === 'pickup' ? job.pickup : job.drop;
    const d = Math.hypot(bike.x - spot.x, bike.z - spot.z);
    const { hud, audio, haptics, bikeModel } = this.ctx;
    if (this.phase === 'pickup') {
      if (d < PICKUP_R && bike.speed < PICKUP_MAX_SPEED) {
        this.phase = 'drop';
        this.cargo = 1;
        this.legTime = 0;
        bikeModel.cargo.visible = true;
        audio.sfx('pickup'); haptics.play('pickup');
        hud.popup(`📦 Picked up for ${job.drop.name}`, 'good');
        this._showMarker();
      }
    } else {
      this.tooFast = d < DROP_R + 3 && bike.speed >= DROP_MAX_SPEED;
      if (d < DROP_R && bike.speed < DROP_MAX_SPEED) this._deliver();
    }
  }

  _deliver() {
    const job = this.job;
    const { hud, audio, haptics, bikeModel } = this.ctx;
    const par = job.dist / PAR_SPEED + 6;
    const speedBonus = Math.round(Math.max(0, Math.min(1, (par * 1.5 - this.legTime) / (par * 0.75))) * 60);
    const condBonus = Math.round(this.cargo * 50);
    const tip = 40 + speedBonus + condBonus;
    this.tips += tip;
    this.delivered++;
    this.log.push({ to: job.drop.name, time: this.legTime, cargo: this.cargo, tip });
    audio.sfx('deliver'); haptics.play('deliver');
    hud.popup(`+${tip} tip · ⚡${speedBonus} speed · 📦${condBonus} care`, 'tip');
    bikeModel.cargo.visible = false;
    this.jobIndex++;
    this.phase = 'pickup';
    this.tooFast = false;
    if (this.jobIndex >= this.jobs.length) { this._finish(true); return; }
    this.timeLeft += 15; // bonus time for each completed delivery
    hud.popup('+15s', 'time');
    this._showMarker();
  }

  onEvent(ev, bike) {
    if (ev.type === 'wheelie' && !this.finished) {
      // 1 point per 2 m of wheelie, anywhere, any time
      const pts = Math.floor(ev.dist / 2);
      this.bestWheelie = Math.max(this.bestWheelie, ev.dist);
      if (pts > 0) { this.wheelieBonus += pts; this.ctx.hud.popup(`Wheelie ${Math.floor(ev.dist)} m · +${pts}`, 'good'); }
      return;
    }
    if (this.phase !== 'drop' || this.finished) return;
    const dm = this.ctx.params.damageMult;
    let dmg = 0;
    if (ev.type === 'crash') dmg = 0.12 + (ev.strength - 4) * 0.04;
    else if (ev.type === 'pothole') dmg = 0.04 * ev.strength;
    else if (ev.type === 'bump') dmg = ev.strength > 0.55 ? 0.03 * ev.strength : 0;
    else if (ev.type === 'land') dmg = ev.strength > 5.5 ? (ev.strength - 5.5) * 0.05 : 0;
    else if (ev.type === 'scrape') dmg = 0.01;
    dmg *= dm;
    if (dmg <= 0) return;
    this.cargo = Math.max(0, this.cargo - dmg);
    this.damageTaken += dmg;
    if (dmg >= 0.03) this.ctx.hud.popup(`Cargo −${Math.round(dmg * 100)}%`, 'bad');
  }

  objective() {
    if (this.finished || !this.job) return null;
    if (this.phase === 'pickup') {
      return { title: `Pick up at ${this.job.pickup.name}`, sub: `Delivery ${this.jobIndex + 1}/${this.jobs.length}`, target: this.job.pickup, kind: 'pickup' };
    }
    return {
      title: this.tooFast ? 'Slow down to hand over!' : `Deliver to ${this.job.drop.name}`,
      sub: `Delivery ${this.jobIndex + 1}/${this.jobs.length}`, target: this.job.drop, kind: 'drop', cargo: this.cargo, warn: this.tooFast,
    };
  }

  clock() { return this.timeLeft; }

  _finish(completed) {
    this.finished = true;
    this.ctx.markers.hide();
    this.ctx.bikeModel.cargo.visible = false;
    const timeBonus = completed ? Math.round(this.timeLeft) : 0;
    const score = this.tips + timeBonus + this.wheelieBonus;
    const k = this.ctx.params.starScale || 1;
    const s2 = Math.round(this.level.stars[1] * k), s3 = Math.round(this.level.stars[2] * k);
    const stars = completed ? 1 + (score >= s2 ? 1 : 0) + (score >= s3 ? 1 : 0) : 0;
    this.result = {
      completed, stars, score,
      coins: score,
      rows: [
        ['Deliveries', `${this.delivered}/${this.jobs.length}`],
        ['Tips', `${this.tips}`],
        ['Time bonus', completed ? `${timeBonus}` : '—'],
        ['Wheelie bonus', `${this.wheelieBonus}${this.bestWheelie >= 4 ? ` (best ${Math.floor(this.bestWheelie)} m)` : ''}`],
        ['Shift time', fmtTime(this.elapsed)],
      ],
      thresholds: [0, s2, s3],
      title: completed ? 'Shift complete!' : "Time's up!",
    };
  }

  dispose() { this.ctx.markers.hide(); this.ctx.bikeModel.cargo.visible = false; }
}

export function fmtTime(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
