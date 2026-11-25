// Cosmetic light trail: a flat additive ribbon that follows the rear wheel.
import * as THREE from '../../vendor/three.module.min.js';

export class LightTrail {
  constructor(scene, n = 40) {
    this.n = n;
    this.points = [];
    const pos = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.color = new THREE.Color();
    this._acc = 0;
    scene.add(this.mesh);
  }

  setColor(hex) {
    this.enabled = !!hex;
    if (hex) this.color.set(hex);
    this.mesh.visible = this.enabled;
    this.points.length = 0;
  }

  reset() { this.points.length = 0; }

  update(dt, b) {
    if (!this.enabled) return;
    this._acc += dt;
    const rx = b.x - Math.sin(b.yaw) * 0.6, rz = b.z - Math.cos(b.yaw) * 0.6;
    if (this._acc > 0.03) {
      this._acc = 0;
      this.points.unshift({ x: rx, y: b.y + 0.45, z: rz, yaw: b.yaw });
      if (this.points.length > this.n) this.points.pop();
    }
    const pos = this.geo.attributes.position.array, col = this.geo.attributes.color.array;
    const fade = Math.min(1, b.speed / 8);
    for (let i = 0; i < this.n; i++) {
      const p = this.points[Math.min(i, this.points.length - 1)] || { x: rx, y: b.y, z: rz, yaw: b.yaw };
      const w = 0.18 * (1 - i / this.n);
      const ox = Math.cos(p.yaw) * w, oz = -Math.sin(p.yaw) * w;
      const o = i * 6;
      pos[o] = p.x - ox; pos[o + 1] = p.y; pos[o + 2] = p.z - oz;
      pos[o + 3] = p.x + ox; pos[o + 4] = p.y; pos[o + 5] = p.z + oz;
      const a = (1 - i / this.n) * fade * (i < this.points.length ? 1 : 0);
      for (const k of [0, 3]) { col[o + k] = this.color.r * a; col[o + k + 1] = this.color.g * a; col[o + k + 2] = this.color.b * a; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
