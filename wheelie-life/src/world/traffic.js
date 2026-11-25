// Pooled traffic. Cars are slots in two InstancedMeshes (body + lights), so
// all traffic costs two draw calls. Cars drive along road lines in the
// right-hand lane, brake for the player and for each other, and are recycled
// around the player when they get too far away.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeColored, mat4 } from './geo.js';
import { ROAD_Y } from './world.js';
import { Pool } from '../core/pool.js';

const COLORS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#f4f4f4', '#ff924c', '#52a675', '#2b2d42', '#4cc9f0'];
const LANE = 2.5;
const HALF_L = 2.1, HALF_W = 0.95;

function carGeometry() {
  const white = '#ffffff', glass = '#26313f', tire = '#1b1c20';
  return mergeColored([
    { geo: new THREE.BoxGeometry(1.9, 0.7, 4.2), color: white, matrix: mat4(0, 0.65, 0) },
    { geo: new THREE.BoxGeometry(1.7, 0.6, 2.2), color: white, matrix: mat4(0, 1.3, -0.25) },
    { geo: new THREE.BoxGeometry(1.72, 0.45, 2.0), color: glass, matrix: mat4(0, 1.3, -0.25) },
    { geo: new THREE.BoxGeometry(1.6, 0.42, 0.1), color: glass, matrix: mat4(0, 1.28, 0.86, -0.5) },
    ...[[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.35], [0.9, -1.35]].map(([x, z]) => (
      { geo: new THREE.CylinderGeometry(0.36, 0.36, 0.3, 8), color: tire, matrix: mat4(x, 0.36, z, 0, 0, Math.PI / 2) })),
  ]);
}

function lightGeometry() {
  return mergeColored([
    { geo: new THREE.BoxGeometry(0.4, 0.18, 0.05), color: '#fff6d0', matrix: mat4(-0.62, 0.75, 2.11) },
    { geo: new THREE.BoxGeometry(0.4, 0.18, 0.05), color: '#fff6d0', matrix: mat4(0.62, 0.75, 2.11) },
    { geo: new THREE.BoxGeometry(0.4, 0.16, 0.05), color: '#ff2a2a', matrix: mat4(-0.65, 0.78, -2.11) },
    { geo: new THREE.BoxGeometry(0.4, 0.16, 0.05), color: '#ff2a2a', matrix: mat4(0.65, 0.78, -2.11) },
  ]);
}

export class Traffic {
  constructor(scene, world, max = 16) {
    this.world = world;
    this.max = max;
    this.bodies = new THREE.InstancedMesh(carGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), max);
    this.lights = new THREE.InstancedMesh(lightGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), max);
    for (const m of [this.bodies, this.lights]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    this.bodies.castShadow = true;
    this.bodies.setColorAt(0, new THREE.Color());
    let slot = 0;
    this.pool = new Pool(() => ({ slot: slot++, color: new THREE.Color() }), { initial: max });
    this.cars = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this.density = 1;
    this.honk = null; // callback
  }

  reset(focus, density = 1) {
    for (const c of this.cars) this.pool.release(c);
    this.cars.length = 0;
    this.density = density;
    const target = Math.round(this.max * density);
    for (let i = 0; i < target * 3 && this.cars.length < target; i++) this._spawn(focus, true);
  }

  _spawn(focus, initial) {
    if (!this.pool.free.length) return;
    const w = this.world, h = w.half;
    const i = Math.floor(Math.random() * (w.N + 1));
    const horiz = Math.random() < 0.5;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const line = w.lineCoord(i);
    const focusAlong = horiz ? focus.x : focus.z;
    const focusLat = horiz ? focus.z : focus.x;
    if (Math.abs(line - focusLat) > 190) return;
    const off = (initial ? 25 : 70) + Math.random() * 110;
    const along = THREE.MathUtils.clamp(focusAlong + (Math.random() < 0.5 ? -off : off), -h - 10, h + 10);
    // right-hand lane: right vector of heading (fx,fz) is (-fz, fx)
    const fx = horiz ? dir : 0, fz = horiz ? 0 : dir;
    const x = horiz ? along : line - fz * LANE;
    const z = horiz ? line + fx * LANE : along;
    if (Math.hypot(x - focus.x, z - focus.z) < 30) return;
    for (const c of this.cars) if (Math.hypot(c.x - x, c.z - z) < 14) return;
    const car = this.pool.acquire();
    Object.assign(car, { x, z, fx, fz, horiz, dir, speed: 9, cruise: 8 + Math.random() * 4, wait: 0, yaw: Math.atan2(fx, fz) });
    car.color.set(COLORS[Math.floor(Math.random() * COLORS.length)]);
    this.cars.push(car);
  }

  update(dt, bike) {
    const w = this.world, h = w.half;
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      // what's ahead?
      let gap = Infinity;
      const bdx = bike.x - c.x, bdz = bike.z - c.z;
      const bAhead = bdx * c.fx + bdz * c.fz, bLat = Math.abs(bdx * c.fz - bdz * c.fx);
      // only yield to a bike that is in front of the bumper, not one already alongside
      if (bAhead > HALF_L - 0.3 && bLat < 1.9) gap = bAhead - HALF_L - 0.6;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        const ahead = dx * c.fx + dz * c.fz, lat = Math.abs(dx * c.fz - dz * c.fx);
        if (ahead > 0 && ahead < 30) {
          if (lat < 1.5 && (o.fx * c.fx + o.fz * c.fz) > 0.5) gap = Math.min(gap, ahead - HALF_L * 2 - 1);
          // crossing car already inside the intersection ahead
          else if (lat < 7 && ahead < 14 && Math.abs(o.fx * c.fx + o.fz * c.fz) < 0.5 && ahead > 4) gap = Math.min(gap, ahead - 7.5);
        }
      }
      const want = gap < 3 ? 0 : gap < 16 ? c.cruise * ((gap - 3) / 13) : c.cruise;
      c.speed += THREE.MathUtils.clamp(want - c.speed, -9 * dt, 3 * dt);
      if (c.speed < 0) c.speed = 0;
      c.wait = gap < 6 && bAhead > 0 && bAhead < 9 && bLat < 1.9 ? c.wait + dt : 0;
      if (c.wait > 1.6 && this.honk) { this.honk(c); c.wait = -4; }
      c.x += c.fx * c.speed * dt;
      c.z += c.fz * c.speed * dt;
      const along = c.horiz ? c.x : c.z;
      const far = Math.hypot(c.x - bike.x, c.z - bike.z) > 210;
      if (far || along * c.dir > h + 12) {
        this.pool.release(c);
        this.cars.splice(k, 1);
      }
    }
    const target = Math.round(this.max * this.density);
    if (this.cars.length < target) this._spawn(bike, false);
    this._writeInstances();
  }

  _writeInstances() {
    const w = this.world, m = this._m;
    this.cars.forEach((c, i) => {
      const y0 = w.heightAt(c.x, c.z);
      const yF = w.heightAt(c.x + c.fx * 1.6, c.z + c.fz * 1.6), yR = w.heightAt(c.x - c.fx * 1.6, c.z - c.fz * 1.6);
      this._e.set(-Math.atan2(yF - yR, 3.2), c.yaw, 0);
      this._q.setFromEuler(this._e);
      m.compose(this._v.set(c.x, y0 + ROAD_Y, c.z), this._q, this._one);
      this.bodies.setMatrixAt(i, m);
      this.lights.setMatrixAt(i, m);
      this.bodies.setColorAt(i, c.color);
    });
    this.bodies.count = this.lights.count = this.cars.length;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  /** Bike (circle r) vs car OBBs. Returns { nx, nz, depth, car } or null. */
  collideBike(x, z, r = 0.45) {
    for (const c of this.cars) {
      const dx = x - c.x, dz = z - c.z;
      const a = dx * c.fx + dz * c.fz;          // along car
      const l = dx * -c.fz + dz * c.fx;         // across (right vector)
      const pa = HALF_L + r - Math.abs(a), pl = HALF_W + r - Math.abs(l);
      if (pa > 0 && pl > 0) {
        if (pa < pl) return { nx: c.fx * Math.sign(a), nz: c.fz * Math.sign(a), depth: pa, car: c };
        return { nx: -c.fz * Math.sign(l), nz: c.fx * Math.sign(l), depth: pl, car: c };
      }
    }
    return null;
  }
}
