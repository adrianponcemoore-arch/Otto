// Speed lines: streaks parented to the camera that fly past at high speed.
import * as THREE from '../../vendor/three.module.min.js';

export class SpeedLines {
  constructor(camera, count = 60) {
    this.count = count;
    this.lines = [];
    const pos = new Float32Array(count * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
    this.mesh = new THREE.LineSegments(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    camera.add(this.mesh);
    for (let i = 0; i < count; i++) this.lines.push(this._spawn({}, true));
  }

  _spawn(l, initial) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * 2.2;
    l.x = Math.cos(a) * r; l.y = Math.sin(a) * r * 0.7;
    l.z = initial ? -Math.random() * 20 : -20 - Math.random() * 4;
    l.len = 1 + Math.random() * 2;
    return l;
  }

  update(dt, speed, turbo) {
    const k = Math.max(0, Math.min(1, (speed - 9) / 7)) + (turbo && speed > 7 ? 0.25 : 0);
    this.mat.opacity = Math.min(0.55, k * 0.5);
    this.mesh.visible = this.mat.opacity > 0.01;
    if (!this.mesh.visible) return;
    const a = this.geo.attributes.position.array;
    const v = 18 + speed * 2.5;
    for (let i = 0; i < this.count; i++) {
      const l = this.lines[i];
      l.z += v * dt;
      if (l.z > -0.5) this._spawn(l, false);
      const o = i * 6;
      a[o] = l.x; a[o + 1] = l.y; a[o + 2] = l.z;
      a[o + 3] = l.x; a[o + 4] = l.y; a[o + 5] = l.z - l.len * (0.5 + k);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
