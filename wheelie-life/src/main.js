// App bootstrap + state machine: loading -> menus -> session -> results.
import * as THREE from '../vendor/three.module.min.js';
import { World } from './world/world.js';
import { Environment } from './world/environment.js';
import { Traffic } from './world/traffic.js';
import { getMap } from './world/maps/index.js';
import { BikeModel } from './bike/bikeModel.js';
import { loadRider } from './bike/rider.js';
import { createBikeState, createBattery, computeBikeParams, stepBike } from './bike/bikePhysics.js';
import { CameraRig } from './fx/cameraRig.js';
import { SpeedLines } from './fx/speedLines.js';
import { LightTrail } from './fx/trail.js';
import { Markers } from './fx/markers.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Haptics } from './core/haptics.js';
import { SaveStore } from './core/save.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Menus } from './ui/menus.js';
import { Session } from './game/session.js';
import { getLevel } from './data/levels.js';
import { COSMETICS } from './config.js';

const $ = id => document.getElementById(id);
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

const QUALITY = {
  low:  { maxRatio: 1.0, shadows: false, shadowSize: 512,  rainDrops: 250, antialias: false },
  auto: { maxRatio: 1.5, shadows: true,  shadowSize: 1024, rainDrops: 450, antialias: true },
  high: { maxRatio: 2.0, shadows: true,  shadowSize: 2048, rainDrops: 700, antialias: true },
};

class App {
  async boot() {
    this.store = new SaveStore();
    const st = this.store.data.settings;
    this.qualityName = st.quality;
    this.quality = QUALITY[st.quality] || QUALITY.auto;
    const progress = async (p, t) => { $('loading-fill').style.width = `${p * 100}%`; $('loading-text').textContent = t; await frame(); };

    await progress(0.1, 'Spinning up the motor…');
    const canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
    this.scene.add(this.camera);

    await progress(0.3, 'Paving the streets…');
    this.world = new World(this.scene, getMap('downtown'));
    await progress(0.65, 'Planting trees…');
    this.env = new Environment(this.scene, this.quality);
    this.traffic = new Traffic(this.scene, this.world, 16);
    this.bikeModel = new BikeModel();
    this.scene.add(this.bikeModel.root);
    await progress(0.75, 'Suiting up the rider…');
    try {
      this.bikeModel.attachRider(await this._loadRider());
    } catch (e) {
      console.warn('Rider model failed to load, using the simple rider', e);
    }
    this.markers = new Markers(this.scene, this.world);
    this.speedLines = new SpeedLines(this.camera);
    this.trail = new LightTrail(this.scene);
    this.camRig = new CameraRig(this.camera, this.world);

    await progress(0.85, 'Charging batteries…');
    this.audio = new Audio();
    this.haptics = new Haptics();
    this.hud = new Hud();
    this.minimap = new Minimap($('minimap'), this.world);
    this.input = new Input($('touch-layer'), { onPause: () => this.togglePause(), onAssist: () => this.session?.cycleAssist() });
    this.menus = new Menus(this);
    this.traffic.honk = () => this.audio.sfx('honk');

    // menu "idle" bike sitting at the start pose
    const s = this.world.start;
    this.idleBike = createBikeState(s.x, s.z, s.yaw);
    this.idleParams = computeBikeParams();
    this.idleBat = createBattery();
    this.idleEnv = {
      heightAt: (x, z) => this.world.heightAt(x, z), groundAt: (x, z) => this.world.groundAt(x, z),
      collide: () => null, wet: false,
    };
    stepBike(this.idleBike, { steer: 0, brake: true }, this.idleParams, this.idleEnv, this.idleBat, 0.016, []);
    this.env.setConditions({ timeOfDay: 17.2, todSpeed: 0.5 });
    this.traffic.reset(this.idleBike, 0.7);

    this._wireButtons();
    this.applySettings();
    this.applyCosmetics();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.session && !this.paused && this.session.state !== 'over') this.pause(); this.audio.suspend(); }
      else if (!this.session || this.paused) this.audio.resume();
    });
    window.addEventListener('pagehide', () => this.store.save());
    // unlock audio on first gesture (required on iOS)
    const unlock = () => { this.audio.unlock(); this.audio.setVolume(this.store.data.settings.volume); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    this._fpsT = 0; this._fpsN = 0; this._goodSecs = 0;
    this.last = performance.now();
    this.time = 0;
    await progress(1, 'Ready');
    this.menus.show('main');
    this.renderer.setAnimationLoop(() => this._loop());
    window.__volt = this; // debug / automated test hook
  }

  async _loadRider() {
    try {
      return await loadRider('./assets/models/rider.glb');
    } catch (e) {
      // hosts that won't serve .glb get an embedded base64 copy (rider-glb.js)
      const { default: b64 } = await import('../assets/models/rider-glb.js');
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return loadRider(bin.buffer);
    }
  }

  _wireButtons() {
    const assist = $('btn-assist');
    assist.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.session?.cycleAssist(); });
    $('btn-pause').addEventListener('click', () => this.togglePause());
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.minimap?.resize();
    if (this.camRig) this._applyFraming();
  }

  // ------------------------------------------------------------ settings
  applySettings() {
    const st = this.store.data.settings;
    this.audio.setVolume(st.volume);
    this.haptics.enabled = st.haptics;
    this.input.tilt = st.tilt;
    this.input.sensitivity = st.sensitivity;
    this.input.leftHanded = st.leftHanded;
    if (st.quality !== this.qualityName) {
      this.qualityName = st.quality;
      this.quality = QUALITY[st.quality] || QUALITY.auto;
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxRatio);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.env.sun.castShadow = this.quality.shadows;
      this._resize();
    }
    this.store.save();
  }

  async requestTilt() { return Input.requestTiltPermission(); }

  applyCosmetics() {
    const eq = this.store.data.equipped;
    const col = (slot) => COSMETICS[slot].find(c => c.id === eq[slot])?.color;
    this.bikeModel.setCosmetics({ paint: col('paint'), helmet: col('helmet'), outfit: col('outfit') });
    this.bikeModel.setFrame(this.store.data.frame);
    this.trail.setColor(col('trail'));
  }

  // ------------------------------------------------------------ sessions
  startLevel(id) {
    const level = getLevel(id);
    if (!level) return;
    this.audio.unlock();
    this.session?.mode.dispose();
    this.menus.hideAll();
    this.paused = false;
    this.session = new Session(this, level);
    this.lastLevel = level;
    this.input.clear();
    this.input.enabled = false;
    this.hud.show(true);
    $('controls').classList.remove('hidden', 'hints-off');
    this._hintTimer = 7;
    this.camRig.mode = 'chase';
    this.camRig.snap(this.session.bike);
  }

  showCountdown(text) {
    const el = $('countdown');
    el.classList.remove('hidden');
    el.innerHTML = `<span>${text}</span>`;
    this.audio.sfx(text === 'GO!' ? 'go' : 'tick');
    if (text === 'GO!') setTimeout(() => el.classList.add('hidden'), 900);
  }

  onSessionEnd(result, level) {
    const sv = this.store.data;
    const rec = sv.levels[level.id] || { stars: 0, best: 0 };
    result.newBest = result.score > (rec.best || 0) && rec.best > 0;
    rec.stars = Math.max(rec.stars || 0, result.stars);
    rec.best = Math.max(rec.best || 0, result.score);
    sv.levels[level.id] = rec;
    sv.coins += result.coins;
    sv.totalCoins += result.coins;
    this.store.save();
    this.lastResult = result;
    this._exitRide();
    this.menus.show('results', { push: false });
  }

  _exitRide() {
    this.input.enabled = false;
    this.input.clear();
    this.hud.show(false);
    this.hud.banner(null);
    $('controls').classList.add('hidden');
    $('countdown').classList.add('hidden');
    this.audio.silenceRide();
  }

  pause() {
    if (!this.session || this.session.state === 'over') return;
    this.paused = true;
    this.input.clear();
    this.audio.silenceRide();
    this.menus.show('pause', { push: false });
  }
  resume() {
    this.paused = false;
    this.menus.hideAll();
    this.audio.resume();
    this.last = performance.now();
  }
  togglePause() { if (this.paused) this.resume(); else this.pause(); }
  restart() { if (this.lastLevel) this.startLevel(this.lastLevel.id); }
  quit() {
    this.session?.mode.dispose();
    this.session = null;
    this.paused = false;
    this._exitRide();
    this.camRig.mode = 'orbit';
    const s = this.world.start;
    Object.assign(this.idleBike, createBikeState(s.x, s.z, s.yaw));
    stepBike(this.idleBike, { steer: 0, brake: true }, this.idleParams, this.idleEnv, this.idleBat, 0.016, []);
    this.env.setConditions({ timeOfDay: 17.2, todSpeed: 0.5 });
    this.traffic.reset(this.idleBike, 0.7);
    this.menus.stack = [];
    this.menus.show('main', { push: false });
  }

  onScreen(name) {
    // frame the bike in the free part of the screen behind each menu
    if (this.session && (name === 'pause' || name === 'results')) return;
    this.camRig.mode = 'orbit';
    this._framingFor = name;
    this._applyFraming();
  }

  _applyFraming() {
    const name = this._framingFor, portrait = this.camera.aspect < 1;
    if (this.camRig.mode !== 'orbit') return;
    if (name === 'garage' || name === 'shop') this.camRig.setFraming(portrait ? 0 : 0.24, portrait ? 0.28 : 0, portrait ? 0.62 : 0.85);
    else if (name === 'main') this.camRig.setFraming(portrait ? 0 : 0.2, portrait ? -0.05 : 0, 1);
    else this.camRig.setFraming(0, 0, 1.1);
  }

  // ---------------------------------------------------------------- loop
  _adaptQuality(dt) {
    if (this.qualityName !== 'auto') return;
    this._fpsT += dt; this._fpsN++;
    if (this._fpsT < 1) return;
    const fps = this._fpsN / this._fpsT;
    this._fpsT = 0; this._fpsN = 0;
    this.fps = fps;
    const max = Math.min(window.devicePixelRatio || 1, this.quality.maxRatio);
    if (fps < 50 && this.pixelRatio > 0.65) {
      this.pixelRatio = Math.max(0.65, this.pixelRatio - 0.15);
      this.renderer.setPixelRatio(this.pixelRatio); this._resize(); this._goodSecs = 0;
    } else if (fps < 45 && this.env.sun.castShadow) {
      this.env.sun.castShadow = false;
    } else if (fps > 58) {
      if (++this._goodSecs > 4 && this.pixelRatio < max) {
        this.pixelRatio = Math.min(max, this.pixelRatio + 0.1);
        this.renderer.setPixelRatio(this.pixelRatio); this._resize(); this._goodSecs = 0;
      }
    } else this._goodSecs = 0;
  }

  _loop() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    this._adaptQuality(dt);

    const ses = this.session;
    let bike = this.idleBike;
    if (ses && !this.paused) {
      ses.update(dt);
      bike = ses.bike;
    } else if (ses) bike = ses.bike;

    const running = !ses || !this.paused;
    if (running) {
      this.env.update(dt, this.bikeModel.root.position);
      this.traffic.update(dt, bike);
      this.world.update(dt, this.time);
      this.markers.update(dt, bike);
    }
    this.world.setNight(this.env.night, this.env.wet);
    this.world.updateLOD(this.camera.position, false, dt, bike);
    this.bikeModel.apply(bike, dt, this.time);
    this.bikeModel.setLights(this.env.night);
    this.camRig.update(running ? dt : 0, bike, { turbo: ses?.turbo });
    this.speedLines.update(dt, ses ? bike.speed : 0, ses?.turbo);
    if (running) this.trail.update(dt, bike);

    if (ses && !this.paused) {
      this.hud.update({
        bike, battery: ses.battery, objective: ses.mode.objective(), clock: ses.mode.clock(),
        wind: { x: this.env.windX, z: this.env.windZ, wet: this.env.wet },
      });
      const obj = ses.mode.objective();
      this.minimap.draw(bike, obj?.target, obj?.kind, this.traffic.cars);
      this.audio.updateRide({
        speed: bike.speed, motorLoad: bike.motorLoad, motorOn: bike.motorOn, turbo: ses.turbo,
        surface: bike.surface, wet: this.env.wet, rain: this.env.rain, charging: bike.charging, airborne: !bike.grounded,
      });
      if (this._hintTimer > 0) {
        this._hintTimer -= dt;
        if (this._hintTimer <= 0) $('controls').classList.add('hints-off');
      }
    } else if (!ses) {
      this.audio.setAmbientRain(this.env.rain);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

new App().boot().catch(err => {
  console.error(err);
  const t = document.getElementById('loading-text');
  if (t) t.textContent = `Failed to start: ${err.message}. WebGL may be unavailable.`;
});
