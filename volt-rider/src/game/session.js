// One play-through of a level: owns the bike state, battery and mode
// instance, runs fixed-step physics and routes gameplay events to audio,
// haptics, camera and HUD.
import { createBikeState, createBattery, computeBikeParams, stepBike } from '../bike/bikePhysics.js';
import { ASSIST_LEVELS } from '../config.js';
import { getMode } from '../modes/index.js';

const STEP = 1 / 120;

export class Session {
  constructor(app, level) {
    this.app = app;
    this.level = level;
    const { world, store } = app;
    this.params = computeBikeParams(store.data.upgrades, store.data.frame);
    this.battery = createBattery(this.params.capMult);
    this.assist = 1;
    this.events = [];
    this.acc = 0;
    this.state = 'countdown';
    this.countdown = 3.2;
    this.doneTimer = 0;
    this._batWarn = { 25: false, 10: false, 0: false };
    this._wasCharging = false;
    this.time = 0;

    const ModeClass = getMode(level.mode);
    this.mode = new ModeClass({
      world, markers: app.markers, hud: app.hud, audio: app.audio, haptics: app.haptics,
      bikeModel: app.bikeModel, params: this.params, session: this,
    }, level);
    const pose = this.mode.startPose();
    this.bike = createBikeState(pose.x, pose.z, pose.yaw);

    app.env.setConditions(level);
    app.traffic.reset(this.bike, level.traffic ?? 1);
    app.trail.reset();

    const env = app.env;
    this.physEnv = {
      heightAt: (x, z) => world.heightAt(x, z),
      groundAt: (x, z) => world.groundAt(x, z),
      collide: (x, z, r) => world.collide(x, z, r),
      chargerAt: (x, z) => world.chargerAt(x, z),
      bumpAt: (x, z) => world.bumpAt(x, z),
      bounds: world.bounds,
      get wet() { return env.wet; },
      get windX() { return env.windX; },
      get windZ() { return env.windZ; },
    };
    this.mode.start();
    app.hud.setAssist(this.assist);
  }

  cycleAssist() {
    this.assist = (this.assist + 1) % ASSIST_LEVELS.length;
    this.app.hud.setAssist(this.assist);
    this.app.audio.sfx('assist', this.assist);
    this.app.haptics.play('tap');
  }

  get turbo() { return this.assist === 2 && this.bike.motorOn; }

  update(dt) {
    const app = this.app;
    this.time += dt;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== before) app.showCountdown(now > 0 ? String(now) : 'GO!');
      if (this.countdown <= 0) { this.state = 'riding'; app.input.enabled = true; }
      stepBike(this.bike, { steer: 0, throttle: false, brake: true, assist: this.assist }, this.params, this.physEnv, this.battery, dt, []);
      return;
    }

    const input = this.state === 'riding' ? app.input.read() : { steer: 0, throttle: false, brake: true };
    input.assist = this.assist;

    this.acc += dt;
    let hopUsed = false;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const inp = hopUsed ? { ...input, hop: false } : input;
      stepBike(this.bike, inp, this.params, this.physEnv, this.battery, STEP, this.events);
      hopUsed = true;
      this._traffic();
      if (this.state === 'riding') this.mode.update(STEP, this.bike);
    }
    for (const ev of this.events) this._event(ev);
    this.events.length = 0;

    this._batteryAlerts();

    if (this.state === 'riding' && this.mode.finished) {
      this.state = 'done';
      app.input.enabled = false;
      app.input.clear();
      app.audio.sfx(this.mode.result.completed ? 'deliver' : 'fail');
    }
    if (this.state === 'done') {
      this.doneTimer += dt;
      if (this.doneTimer > 1.4) { this.state = 'over'; app.onSessionEnd(this.mode.result, this.level); }
    }
  }

  _traffic() {
    const b = this.bike;
    const hit = this.app.traffic.collideBike(b.x, b.z, 0.45);
    if (!hit) return;
    b.x += hit.nx * hit.depth;
    b.z += hit.nz * hit.depth;
    const c = hit.car;
    const bvx = Math.sin(b.velYaw) * b.speed, bvz = Math.cos(b.velYaw) * b.speed;
    const rel = -((bvx - c.fx * c.speed) * hit.nx + (bvz - c.fz * c.speed) * hit.nz);
    if (rel > 2.5) {
      this.events.push({ type: 'crash', strength: rel + 2, car: true });
      b.speed *= 0.2;
      b.stun = 1.0;
      c.speed = 0;
      c.wait = -3;
    } else {
      b.speed *= 0.9;
    }
  }

  _event(ev) {
    const { audio, haptics, camRig, hud } = this.app;
    switch (ev.type) {
      case 'crash':
        audio.sfx('crash', ev.strength / 6); haptics.play('crash'); camRig.addTrauma(0.7);
        hud.popup(ev.car ? '💥 Hit a car!' : '💥 Crash!', 'bad');
        break;
      case 'scrape': audio.sfx('scrape'); haptics.play('bump'); camRig.addTrauma(0.15); break;
      case 'bump':
        if (ev.strength > 0.15) { audio.sfx('bump', ev.strength); haptics.play('bump', ev.strength); camRig.addTrauma(0.12 * ev.strength); }
        break;
      case 'pothole': audio.sfx('bump', 1); haptics.play('pothole'); camRig.addTrauma(0.3); hud.popup('Pothole!', 'bad'); break;
      case 'land':
        if (ev.strength > 1.5) { audio.sfx('land', ev.strength / 5); haptics.play('land', ev.strength / 5); camRig.addTrauma(Math.min(0.5, ev.strength * 0.05)); }
        break;
      case 'hop': audio.sfx('hop'); break;
    }
    this.mode.onEvent(ev, this.bike);
  }

  _batteryAlerts() {
    const { audio, haptics, hud } = this.app;
    const pct = (this.battery.charge / this.battery.capacity) * 100;
    for (const th of [25, 10]) {
      if (pct < th && !this._batWarn[th]) { this._batWarn[th] = true; audio.sfx('lowbat'); haptics.play('empty'); hud.popup(`🔋 Battery ${th}% — find a ⚡ charger`, 'bad'); }
      if (pct > th + 5) this._batWarn[th] = false;
    }
    if (pct <= 0 && !this._batWarn[0]) { this._batWarn[0] = true; audio.sfx('empty'); haptics.play('empty'); }
    if (pct > 3) this._batWarn[0] = false;

    const b = this.bike;
    if (b.charging && !this._wasCharging) { audio.sfx('charge'); haptics.play('tap'); }
    this._wasCharging = b.charging;
    if (b.charging) hud.banner(`⚡ Charging ${Math.round(pct)}%`, 'charge');
    else if (pct <= 0 && this.state === 'riding') hud.banner('Battery empty — pedal, coast downhill or find ⚡');
    else hud.banner(null);
  }
}
