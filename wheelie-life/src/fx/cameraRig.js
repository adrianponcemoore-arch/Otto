// Chase camera with speed-dependent distance, Turbo FOV kick, high-speed and
// impact shake. Also drives an orbit mode for the menu/garage background.
import * as THREE from '../../vendor/three.module.min.js';

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.trauma = 0;
    this.mode = 'orbit';
    this.orbitAngle = 0;
    this.baseFov = 62;
    this.fovKick = 0;
    this.shakeEnabled = true;
    this._tmp = new THREE.Vector3();
    this.framing = { x: 0, y: 0, r: 1 };
  }

  /** Shift the subject on screen (fractions of the viewport) and zoom the orbit. */
  setFraming(x = 0, y = 0, r = 1) { this.framing = { x, y, r }; }

  _applyOffset(x, y) {
    const cam = this.camera;
    if (!x && !y) { if (cam.view && cam.view.enabled) cam.clearViewOffset(); return; }
    const H = 1000, W = H * cam.aspect;
    cam.setViewOffset(W, H, x * W, y * H, W, H);
  }

  addTrauma(t) { this.trauma = Math.min(1, this.trauma + t); }

  snap(bike) {
    this._desired(bike, this.pos, this.look);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  _portrait() { return this.camera.aspect < 1; }

  _desired(b, outPos, outLook) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const portrait = this._portrait();
    const dist = (portrait ? 6.6 : 5.2) + b.speed * 0.09;
    const height = (portrait ? 3.4 : 2.4) + b.speed * 0.02;
    // swing out to the side during a wheelie so the lifted front wheel shows
    const side = (b.wheelie || 0) * 4.5;
    outPos.set(b.x - fx * dist - fz * side, b.y + height - (b.wheelie || 0) * 1.2, b.z - fz * dist + fx * side);
    // keep the camera above terrain/curbs
    const gy = this.world.groundAt(outPos.x, outPos.z).y + 1.2;
    if (outPos.y < gy) outPos.y = gy;
    const ahead = portrait ? 4.5 : 3.5;
    outLook.set(b.x + fx * ahead, b.y + 1.0, b.z + fz * ahead);
  }

  update(dt, bike, { turbo = false } = {}) {
    const cam = this.camera;
    if (this.mode === 'orbit') {
      this.orbitAngle += dt * 0.18;
      const r = (this._portrait() ? 5.6 : 4.4) * this.framing.r;
      this._applyOffset(this.framing.x, this.framing.y);
      const tx = bike.x, tz = bike.z, ty = bike.y;
      cam.position.set(tx + Math.sin(this.orbitAngle) * r, ty + 1.6, tz + Math.cos(this.orbitAngle) * r);
      this.look.set(tx, ty + 0.85, tz);
      cam.lookAt(this.look);
      this._setFov(this._portrait() ? 70 : 50);
      return;
    }
    this._applyOffset(0, 0);
    this._desired(bike, this._tmp, this.look);
    const k = 1 - Math.exp(-dt * 6);
    this.pos.lerp(this._tmp, k);
    cam.position.copy(this.pos);

    // shake: continuous at high speed + trauma from impacts
    const speedShake = Math.max(0, bike.speed - 9) * 0.004;
    const tr = this.trauma * this.trauma;
    const amp = this.shakeEnabled ? speedShake + tr * 0.25 : 0;
    if (amp > 0) {
      const t = performance.now() / 1000;
      cam.position.x += (Math.sin(t * 37.1) + Math.sin(t * 23.3)) * amp * 0.5;
      cam.position.y += (Math.sin(t * 41.7) + Math.sin(t * 19.9)) * amp * 0.5;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    cam.lookAt(this.look);
    cam.rotateZ(-bike.lean * 0.12);

    const portrait = this._portrait();
    this.fovKick += ((turbo && bike.speed > 6 ? 9 : 0) + Math.max(0, bike.speed - 8) * 0.5 - this.fovKick) * Math.min(1, dt * 3);
    this._setFov((portrait ? 72 : this.baseFov) + this.fovKick);
  }

  _setFov(f) {
    if (Math.abs(this.camera.fov - f) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }
}
