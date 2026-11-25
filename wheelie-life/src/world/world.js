// Builds a district from a map definition and answers gameplay queries:
// terrain height, surface type, collisions, charger and pothole lookup.
//
// Rendering strategy for mobile:
//  * Roads, sidewalks, curbs and markings are one vertex-coloured mesh.
//  * Buildings are InstancedMeshes chunked per 2x2 blocks so frustum culling
//    and distance culling skip whole chunks (a cheap stand-in for occlusion
//    culling — WebGL has no hardware occlusion culling through Three.js).
//  * Trees and rooftop props use instanced LOD: two instanced meshes (high and
//    low detail) whose instance lists are re-bucketed by camera distance.
import * as THREE from '../../vendor/three.module.min.js';
import { GeoBuilder, mergeColored, mat4, radialTexture } from './geo.js';
import { makeRng } from '../core/rng.js';
import { PHYS } from '../config.js';

export const ROAD_Y = 0.06;
export const SLAB_Y = 0.2;
const CHUNK = 2;

export class World {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.B = map.block;
    this.N = map.blocks;
    this.W = this.N * this.B;
    this.half = this.W / 2;
    this.R = map.road;
    this.rng = makeRng(map.seed);
    this.cells = new Map();
    this.buildings = [];
    this.trees = [];
    this.lamps = [];
    this.potholes = [];
    this.chargers = [];
    this.spots = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bounds = { minX: -this.half - 30, maxX: this.half + 30, minZ: -this.half - 30, maxZ: this.half + 30 };
    this._lastPothole = -1;
    this._lodTimer = 0;
    this.night = 0;

    this._layout();
    this._buildTerrain();
    this._buildGround();
    this._buildBuildings();
    this._buildTrees();
    this._buildLamps();
    this._buildChargers();
    this._buildPlaza();
    this._buildPotholes();
    this._buildHorizon();
  }

  // ------------------------------------------------------------ queries
  heightAt(x, z) {
    let h = 0;
    for (const k of this.map.hills) {
      const dx = x - k.x, dz = z - k.z;
      h += k.a * Math.exp(-(dx * dx + dz * dz) / (2 * k.s * k.s));
    }
    return h;
  }

  lineCoord(i) { return -this.half + i * this.B; }

  blockType(bx, bz) {
    return this.map.special[`${bx},${bz}`] || 'b';
  }

  /** Surface and vertical offset at a point. */
  surfaceInfo(x, z) {
    const lx = x + this.half, lz = z + this.half, r2 = this.R / 2, B = this.B;
    if (lx < -r2 || lz < -r2 || lx > this.W + r2 || lz > this.W + r2) return { surface: 'grass', off: 0 };
    const rx = ((lx % B) + B) % B, rz = ((lz % B) + B) % B;
    const dX = Math.min(rx, B - rx), dZ = Math.min(rz, B - rz);
    if (dX <= r2 || dZ <= r2) return { surface: 'asphalt', off: ROAD_Y };
    const bx = Math.floor(lx / B), bz = Math.floor(lz / B);
    const t = this.blockType(bx, bz);
    if (t !== 'p') return { surface: 'concrete', off: SLAB_Y };
    const u = rx - r2, w = rz - r2, s = B - this.R, sw = this.map.sidewalk;
    if (u < sw || w < sw || u > s - sw || w > s - sw) return { surface: 'concrete', off: SLAB_Y };
    if (Math.abs(u - s / 2) < 2 || Math.abs(w - s / 2) < 2) return { surface: 'dirt', off: SLAB_Y };
    const e = Math.min(u, w, s - u, s - w);
    if (e > 7 && e < 10) return { surface: 'gravel', off: SLAB_Y };
    return { surface: 'grass', off: SLAB_Y };
  }

  groundAt(x, z) {
    const s = this.surfaceInfo(x, z);
    return { y: this.heightAt(x, z) + s.off, surface: s.surface };
  }

  _cellKey(x, z) { return `${Math.floor((x + this.half) / this.B)},${Math.floor((z + this.half) / this.B)}`; }

  _addCollider(c) {
    const x0 = c.type === 'box' ? c.x0 : c.x - c.r, x1 = c.type === 'box' ? c.x1 : c.x + c.r;
    const z0 = c.type === 'box' ? c.z0 : c.z - c.r, z1 = c.type === 'box' ? c.z1 : c.z + c.r;
    const B = this.B, h = this.half;
    for (let i = Math.floor((x0 - 1 + h) / B); i <= Math.floor((x1 + 1 + h) / B); i++) {
      for (let j = Math.floor((z0 - 1 + h) / B); j <= Math.floor((z1 + 1 + h) / B); j++) {
        const k = `${i},${j}`;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(c);
      }
    }
  }

  /** Circle vs static colliders. Returns the deepest contact or null. */
  collide(x, z, r) {
    const list = this.cells.get(this._cellKey(x, z));
    if (!list) return null;
    let best = null;
    for (const c of list) {
      let nx, nz, depth;
      if (c.type === 'box') {
        const qx = Math.max(c.x0, Math.min(x, c.x1)), qz = Math.max(c.z0, Math.min(z, c.z1));
        const dx = x - qx, dz = z - qz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; depth = r - d;
        } else {
          // centre inside the box: push out through the nearest face
          const faces = [[x - c.x0, -1, 0], [c.x1 - x, 1, 0], [z - c.z0, 0, -1], [c.z1 - z, 0, 1]];
          faces.sort((a, b) => a[0] - b[0]);
          [depth, nx, nz] = faces[0];
          depth += r;
        }
      } else {
        const dx = x - c.x, dz = z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d; depth = rr - d;
      }
      if (!best || depth > best.depth) best = { depth, nx, nz };
    }
    return best;
  }

  chargerAt(x, z) {
    const r2 = PHYS.chargeRadius * PHYS.chargeRadius;
    for (const c of this.chargers) {
      const dx = x - c.padX, dz = z - c.padZ;
      if (dx * dx + dz * dz < r2) return c;
    }
    return null;
  }

  /** True once when the wheel first rolls over a pothole. */
  bumpAt(x, z) {
    for (let i = 0; i < this.potholes.length; i++) {
      const p = this.potholes[i];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) {
        if (this._lastPothole === i) return false;
        this._lastPothole = i;
        return true;
      }
    }
    this._lastPothole = -1;
    return false;
  }

  // ------------------------------------------------------------- layout
  _layout() {
    const { B, N, R, rng, map } = this;
    const sw = map.sidewalk;
    this.blocks = [];
    for (let bx = 0; bx < N; bx++) {
      for (let bz = 0; bz < N; bz++) {
        const x0 = this.lineCoord(bx) + R / 2, x1 = this.lineCoord(bx + 1) - R / 2;
        const z0 = this.lineCoord(bz) + R / 2, z1 = this.lineCoord(bz + 1) - R / 2;
        this.blocks.push({ bx, bz, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, type: this.blockType(bx, bz) });
      }
    }
    this.block = (bx, bz) => this.blocks[bx * N + bz];

    // Corner / edge helpers on a block's sidewalk
    const edgePoint = (b, edge, along = 0, inset = 1.8) => {
      switch (edge) {
        case 0: return { x: b.cx + along, z: b.z0 + inset, face: Math.PI };      // north side faces -Z
        case 1: return { x: b.x1 - inset, z: b.cz + along, face: Math.PI / 2 };  // east faces +X
        case 2: return { x: b.cx + along, z: b.z1 - inset, face: 0 };
        default: return { x: b.x0 + inset, z: b.cz + along, face: -Math.PI / 2 };
      }
    };
    this.edgePoint = edgePoint;

    // Chargers
    for (const c of map.chargers) {
      const b = this.block(c.bx, c.bz);
      const cx = c.corner === 1 || c.corner === 2 ? b.x1 - 5 : b.x0 + 5;
      const cz = c.corner >= 2 ? b.z1 - 1.6 : b.z0 + 1.6;
      this.chargers.push({ x: cx, z: cz, padX: cx, padZ: cz + (c.corner >= 2 ? -0.2 : 0.2) });
    }

    // Start pose
    const sb = this.block(map.start.bx, map.start.bz);
    const sp = edgePoint(sb, map.start.edge, -10, 2.6);
    this.start = { x: sp.x, z: sp.z, yaw: Math.PI / 2 };

    // Delivery spots: one per non-start block, named shops
    const order = this.blocks.filter(b => !(b.bx === map.start.bx && b.bz === map.start.bz));
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.slice(0, map.shopNames.length).forEach((b, i) => {
      const edge = rng.int(0, 3);
      const p = edgePoint(b, edge, rng.range(-12, 12), 1.8);
      this.spots.push({ id: i, name: map.shopNames[i], x: p.x, z: p.z, block: b });
    });

    // Buildings
    for (const b of this.blocks) {
      if (b.type !== 'b') continue;
      const L = { x0: b.x0 + sw, x1: b.x1 - sw, z0: b.z0 + sw, z1: b.z1 - sw };
      const dCentre = Math.hypot(b.cx, b.cz) / this.half;
      const tall = Math.max(0, 1 - dCentre);
      const lots = [];
      const r = rng.next();
      if (r < 0.25) lots.push(L);
      else if (r < 0.6) {
        const gap = 4, alongX = rng.chance(0.5);
        if (alongX) {
          const m = (L.x0 + L.x1) / 2 + rng.range(-6, 6);
          lots.push({ ...L, x1: m - gap / 2 }, { ...L, x0: m + gap / 2 });
        } else {
          const m = (L.z0 + L.z1) / 2 + rng.range(-6, 6);
          lots.push({ ...L, z1: m - gap / 2 }, { ...L, z0: m + gap / 2 });
        }
      } else {
        const gap = 3.5;
        const mx = (L.x0 + L.x1) / 2 + rng.range(-5, 5), mz = (L.z0 + L.z1) / 2 + rng.range(-5, 5);
        lots.push(
          { x0: L.x0, x1: mx - gap / 2, z0: L.z0, z1: mz - gap / 2 },
          { x0: mx + gap / 2, x1: L.x1, z0: L.z0, z1: mz - gap / 2 },
          { x0: L.x0, x1: mx - gap / 2, z0: mz + gap / 2, z1: L.z1 },
          { x0: mx + gap / 2, x1: L.x1, z0: mz + gap / 2, z1: L.z1 },
        );
        if (rng.chance(0.3)) lots.splice(rng.int(0, 3), 1); // a little parking court
      }
      for (const lot of lots) {
        const ins = () => rng.range(0, 1.5);
        const bl = { x0: lot.x0 + ins(), x1: lot.x1 - ins(), z0: lot.z0 + ins(), z1: lot.z1 - ins() };
        const h = Math.max(7, (8 + 55 * tall * tall) * rng.range(0.6, 1.35));
        const pal = tall > 0.55 ? map.palette.downtown : map.palette.buildings;
        const corners = [[bl.x0, bl.z0], [bl.x1, bl.z0], [bl.x0, bl.z1], [bl.x1, bl.z1]].map(([x, z]) => this.heightAt(x, z));
        const base = Math.min(...corners) - 0.5;
        const top = Math.max(...corners) + h;
        const bd = { ...bl, base, top, color: rng.pick(pal), bx: b.bx, bz: b.bz };
        this.buildings.push(bd);
        this._addCollider({ type: 'box', x0: bl.x0, x1: bl.x1, z0: bl.z0, z1: bl.z1 });
      }
    }

    // Keep-out zones for props: chargers, spots, start
    const keepOut = [...this.chargers, ...this.spots, this.start].map(p => ({ x: p.x, z: p.z }));
    const clear = (x, z, r) => keepOut.every(k => (k.x - x) ** 2 + (k.z - z) ** 2 > r * r);

    // Street trees + lamps along sidewalks
    for (const b of this.blocks) {
      // lamps sit back from the corner along the curb, out of the turning line
      const inset = 0.7, back = 6;
      for (const [x, z] of [[b.x0 + back, b.z0 + inset], [b.x1 - inset, b.z0 + back], [b.x1 - back, b.z1 - inset], [b.x0 + inset, b.z1 - back]]) {
        this.lamps.push({ x, z });
        this._addCollider({ type: 'circle', x, z, r: 0.15 });
      }
      if (b.type === 'z') continue;
      for (let e = 0; e < 4; e++) {
        for (let a = -16; a <= 16; a += 16) {
          if (b.type === 'b' && rng.chance(0.25)) continue;
          const p = edgePoint(b, e, a + rng.range(-1.5, 1.5), 1.0);
          if (!clear(p.x, p.z, 6)) continue;
          this.trees.push({ x: p.x, z: p.z, s: rng.range(0.8, 1.1), kind: 0 });
          this._addCollider({ type: 'circle', x: p.x, z: p.z, r: 0.3 });
        }
      }
    }

    // Park trees
    for (const b of this.blocks) {
      if (b.type !== 'p') continue;
      let placed = 0, tries = 0;
      while (placed < 22 && tries++ < 300) {
        const x = rng.range(b.x0 + 5, b.x1 - 5), z = rng.range(b.z0 + 5, b.z1 - 5);
        if (this.surfaceInfo(x, z).surface !== 'grass') continue;
        if (this.trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 16)) continue;
        this.trees.push({ x, z, s: rng.range(0.9, 1.5), kind: rng.chance(0.4) ? 1 : 0 });
        this._addCollider({ type: 'circle', x, z, r: 0.4 });
        placed++;
      }
    }

    // Countryside ring
    const outer = this.half + this.map.outer;
    let n = 0, tries = 0;
    while (n < 420 && tries++ < 4000) {
      const x = rng.range(-outer, outer), z = rng.range(-outer, outer);
      const m = Math.max(Math.abs(x), Math.abs(z));
      if (m < this.half + 12) continue;
      this.trees.push({ x, z, s: rng.range(0.9, 1.8), kind: rng.chance(0.6) ? 1 : 0 });
      if (m < this.half + 40) this._addCollider({ type: 'circle', x, z, r: 0.45 });
      n++;
    }

    // Potholes on lanes
    let p = 0; tries = 0;
    while (p < 36 && tries++ < 500) {
      const i = rng.int(0, N), along = rng.range(-this.half, this.half);
      const lat = rng.pick([-1, 1]) * rng.range(1.0, 6.2);
      const c = this.lineCoord(i);
      // skip intersections
      const rel = ((along + this.half) % B + B) % B;
      if (rel < R / 2 + 3 || rel > B - R / 2 - 3) continue;
      const horiz = rng.chance(0.5);
      const x = horiz ? along : c + lat, z = horiz ? c + lat : along;
      this.potholes.push({ x, z, r: rng.range(0.45, 0.7) });
      p++;
    }
  }

  // ------------------------------------------------------------ meshes
  _buildTerrain() {
    const size = this.W + this.map.outer * 2 + 60;
    const seg = 96;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position;
    const cols = [];
    const a = new THREE.Color(this.map.palette.grassOuter), b = new THREE.Color('#5fae55'), c = new THREE.Color();
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i);
      const h = this.heightAt(x, z);
      pa.setY(i, h - 0.02);
      const n = (Math.sin(x * 0.05) * Math.cos(z * 0.043) + 1) * 0.5;
      c.copy(a).lerp(b, n * 0.6 + Math.min(0.4, h / 60));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  _buildGround() {
    const g = new GeoBuilder();
    const P = this.map.palette, R = this.R, h = this.half, B = this.B;
    const H = (off) => (x, z) => this.heightAt(x, z) + off;
    const roadY = H(ROAD_Y), markY = H(ROAD_Y + 0.015), slabY = H(SLAB_Y), pathY = H(SLAB_Y + 0.02);
    const ext = h + R / 2;

    // Roads
    for (let i = 0; i <= this.N; i++) {
      const c = this.lineCoord(i);
      const segs = Math.ceil((ext * 2) / 4);
      g.grid(-ext, c - R / 2, ext, c + R / 2, segs, 2, roadY, P.road);
      g.grid(c - R / 2, -ext, c + R / 2, ext, 2, segs, roadY, P.road);
    }

    // Markings, segment by segment between intersections
    for (let i = 0; i <= this.N; i++) {
      const c = this.lineCoord(i);
      for (let j = 0; j < this.N; j++) {
        const a0 = this.lineCoord(j) + R / 2, a1 = this.lineCoord(j + 1) - R / 2;
        for (const horiz of [true, false]) {
          const quad = (along0, along1, lat0, lat1, col, nAlong = 1) => {
            if (horiz) g.grid(along0, c + lat0, along1, c + lat1, nAlong, 1, markY, col);
            else g.grid(c + lat0, along0, c + lat1, along1, 1, nAlong, markY, col);
          };
          // centre dashes
          for (let a = a0 + 4; a < a1 - 4; a += 6) quad(a, a + 3, -0.12, 0.12, '#f3d36b');
          // bike lanes (green) + edge lines
          const nA = Math.ceil((a1 - a0) / 5);
          for (const s of [-1, 1]) {
            const lo = s > 0 ? 4.8 : -6.8, hi = s > 0 ? 6.8 : -4.8;
            quad(a0, a1, lo, hi, '#4f9d6f', nA);
            const e0 = s > 0 ? 4.65 : -4.8, e1 = s > 0 ? 4.8 : -4.65;
            quad(a0, a1, e0, e1, '#f1f1f1', nA);
          }
          // zebra crossings at both ends
          for (const [z0, z1] of [[a0 + 0.4, a0 + 3.2], [a1 - 3.2, a1 - 0.4]]) {
            for (let l = -6.2; l < 6.2; l += 1.25) quad(z0, z1, l, l + 0.65, '#f4f4f4');
          }
        }
      }
    }

    // Blocks: slabs + curbs + park paths
    for (const b of this.blocks) {
      const { x0, x1, z0, z1 } = b;
      const sw = this.map.sidewalk;
      if (b.type === 'p') {
        // sidewalk ring
        g.grid(x0, z0, x1, z0 + sw, 10, 1, slabY, P.sidewalk);
        g.grid(x0, z1 - sw, x1, z1, 10, 1, slabY, P.sidewalk);
        g.grid(x0, z0 + sw, x0 + sw, z1 - sw, 1, 9, slabY, P.sidewalk);
        g.grid(x1 - sw, z0 + sw, x1, z1 - sw, 1, 9, slabY, P.sidewalk);
        g.grid(x0 + sw, z0 + sw, x1 - sw, z1 - sw, 9, 9, slabY, P.grass);
        // dirt cross + gravel ring
        const cx = b.cx, cz = b.cz;
        g.grid(cx - 2, z0 + sw, cx + 2, z1 - sw, 1, 9, pathY, P.dirt);
        g.grid(x0 + sw, cz - 2, x1 - sw, cz + 2, 9, 1, pathY, P.dirt);
        const r0 = 7, r1 = 10;
        g.grid(x0 + r0, z0 + r0, x1 - r0, z0 + r1, 7, 1, pathY, P.gravel);
        g.grid(x0 + r0, z1 - r1, x1 - r0, z1 - r0, 7, 1, pathY, P.gravel);
        g.grid(x0 + r0, z0 + r1, x0 + r1, z1 - r1, 1, 6, pathY, P.gravel);
        g.grid(x1 - r1, z0 + r1, x1 - r0, z1 - r1, 1, 6, pathY, P.gravel);
      } else {
        g.grid(x0, z0, x1, z1, 10, 10, slabY, b.type === 'z' ? P.plaza : P.sidewalk);
      }
      const segs = 12;
      g.wall(x0, z0, x1, z0, segs, roadY, slabY, P.curb);
      g.wall(x1, z0, x1, z1, segs, roadY, slabY, P.curb);
      g.wall(x1, z1, x0, z1, segs, roadY, slabY, P.curb);
      g.wall(x0, z1, x0, z0, segs, roadY, slabY, P.curb);
    }

    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.ground = new THREE.Mesh(g.build(), this.groundMat);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  _buildingMaterial() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.userData.uNight = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = mat.userData.uNight;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 vwp = vec4(transformed, 1.0);
          vec3 vwn = objectNormal;
          #ifdef USE_INSTANCING
            vwp = instanceMatrix * vwp;
            vwn = mat3(instanceMatrix) * vwn;
          #endif
          vWPos = (modelMatrix * vwp).xyz;
          vWN = normalize(mat3(modelMatrix) * vwn);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWN; uniform float uNight;
          float vHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float winMask = 0.0; float winLit = 0.0;
          if (abs(vWN.y) < 0.5) {
            float u = abs(vWN.x) > 0.5 ? vWPos.z : vWPos.x;
            vec2 cell = vec2(u / 3.0, vWPos.y / 3.4);
            vec2 f = fract(cell);
            winMask = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.82);
            winLit = step(0.55, vHash(floor(cell)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.45, 0.58), winMask * 0.75);
            diffuseColor.rgb *= 1.0 - 0.08 * step(f.y, 0.08);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += winMask * winLit * uNight * vec3(1.0, 0.8, 0.5) * 0.55;`);
    };
    return mat;
  }

  _buildBuildings() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.buildingMat = this._buildingMaterial();
    this.chunks = [];
    const nC = Math.ceil(this.N / CHUNK);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (let cx = 0; cx < nC; cx++) {
      for (let cz = 0; cz < nC; cz++) {
        const list = this.buildings.filter(b => Math.floor(b.bx / CHUNK) === cx && Math.floor(b.bz / CHUNK) === cz);
        if (!list.length) continue;
        const mesh = new THREE.InstancedMesh(geo, this.buildingMat, list.length);
        list.forEach((b, i) => {
          m.makeScale(b.x1 - b.x0, b.top - b.base, b.z1 - b.z0);
          m.setPosition((b.x0 + b.x1) / 2, b.base, (b.z0 + b.z1) / 2);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, col.set(b.color));
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        const c = mesh.boundingSphere.center;
        this.chunks.push({ mesh, x: c.x, z: c.z, r: mesh.boundingSphere.radius });
        this.group.add(mesh);
      }
    }

    // Rooftop props (AC units, water tanks): LOD'd, only drawn near camera
    this.roofProps = [];
    const rng = makeRng(this.map.seed + 7);
    for (const b of this.buildings) {
      const n = rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        this.roofProps.push({
          x: rng.range(b.x0 + 2, b.x1 - 2), z: rng.range(b.z0 + 2, b.z1 - 2), y: b.top,
          sx: rng.range(1.5, 3.5), sy: rng.range(1, 2.2), sz: rng.range(1.5, 3.5),
        });
      }
    }
    const pg = new THREE.BoxGeometry(1, 1, 1); pg.translate(0, 0.5, 0);
    this.roofMesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: '#c9ced6' }), this.roofProps.length);
    this.roofMesh.count = 0;
    this.roofMesh.frustumCulled = false;
    this.group.add(this.roofMesh);
  }

  _treeGeometry(high, kind) {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.15, 0.22, 1.6, high ? 6 : 4);
    parts.push({ geo: trunk, color: '#8a5a3b', matrix: mat4(0, 0.8, 0) });
    if (kind === 0) {
      // round broadleaf
      const crown = new THREE.IcosahedronGeometry(1.4, high ? 1 : 0);
      parts.push({ geo: crown, color: '#ffffff', matrix: mat4(0, 2.6, 0) });
      if (high) parts.push({ geo: new THREE.IcosahedronGeometry(0.9, 0), color: '#ffffff', matrix: mat4(0.6, 3.3, 0.3) });
    } else {
      // pine
      if (high) {
        parts.push({ geo: new THREE.ConeGeometry(1.5, 2.2, 7), color: '#ffffff', matrix: mat4(0, 2.2, 0) });
        parts.push({ geo: new THREE.ConeGeometry(1.15, 1.8, 7), color: '#ffffff', matrix: mat4(0, 3.3, 0) });
        parts.push({ geo: new THREE.ConeGeometry(0.75, 1.4, 7), color: '#ffffff', matrix: mat4(0, 4.2, 0) });
      } else {
        parts.push({ geo: new THREE.ConeGeometry(1.5, 4.0, 5), color: '#ffffff', matrix: mat4(0, 3.0, 0) });
      }
    }
    return mergeColored(parts);
  }

  _buildTrees() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.treeMeshes = [];
    const greens = ['#4caf50', '#66bb3a', '#3f9a4a', '#7cc04a', '#2f8f5b'];
    const rng = makeRng(this.map.seed + 3);
    for (const t of this.trees) {
      t.y = this.groundAt(t.x, t.z).y;
      t.color = new THREE.Color(rng.pick(greens));
      t.rot = rng.range(0, Math.PI * 2);
    }
    for (const kind of [0, 1]) {
      const list = this.trees.filter(t => t.kind === kind);
      const hi = new THREE.InstancedMesh(this._treeGeometry(true, kind), mat, list.length);
      const lo = new THREE.InstancedMesh(this._treeGeometry(false, kind), mat, list.length);
      for (const m of [hi, lo]) {
        m.count = 0; m.frustumCulled = false; m.castShadow = m === hi;
        // allocate colour buffer
        m.setColorAt(0, new THREE.Color());
        this.group.add(m);
      }
      this.treeMeshes.push({ list, hi, lo });
    }
    this.updateLOD(new THREE.Vector3(this.start.x, 0, this.start.z), true);
  }

  _buildLamps() {
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 5, 5); pole.translate(0, 2.5, 0);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 1.2); arm.translate(0, 5, 0.5);
    const poleGeo = mergeColored([{ geo: pole, color: '#3c4350' }, { geo: arm, color: '#3c4350' }]);
    const headGeo = new THREE.BoxGeometry(0.5, 0.15, 0.3); headGeo.translate(0, 4.9, 1.05);
    const n = this.lamps.length;
    this.lampPoles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: '#8a8f99' });
    this.lampHeads = new THREE.InstancedMesh(headGeo, this.lampHeadMat, n);
    const poolGeo = new THREE.PlaneGeometry(9, 9); poolGeo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(255,210,140,0.9)', 'rgba(255,210,140,0)'), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.lampPools = new THREE.InstancedMesh(poolGeo, this.poolMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    this.lamps.forEach((l, i) => {
      // point arm toward the nearest road (block centre is away from road)
      const b = this.blocks.find(bb => l.x >= bb.x0 - 0.1 && l.x <= bb.x1 + 0.1 && l.z >= bb.z0 - 0.1 && l.z <= bb.z1 + 0.1);
      const ang = b ? Math.atan2(l.x - b.cx, l.z - b.cz) : 0;
      const y = this.groundAt(l.x, l.z).y;
      q.setFromAxisAngle(up, ang);
      m.compose(new THREE.Vector3(l.x, y, l.z), q, new THREE.Vector3(1, 1, 1));
      this.lampPoles.setMatrixAt(i, m);
      this.lampHeads.setMatrixAt(i, m);
      const px = l.x + Math.sin(ang) * 1.6, pz = l.z + Math.cos(ang) * 1.6;
      m.makeTranslation(px, this.heightAt(px, pz) + ROAD_Y + 0.05, pz);
      this.lampPools.setMatrixAt(i, m);
    });
    this.lampPools.renderOrder = 2;
    this.lampPoles.castShadow = true;
    this.group.add(this.lampPoles, this.lampHeads, this.lampPools);
  }

  _buildChargers() {
    const parts = [];
    const glowParts = [];
    const ring = new THREE.RingGeometry(PHYS.chargeRadius - 0.5, PHYS.chargeRadius, 32);
    ring.rotateX(-Math.PI / 2);
    for (const c of this.chargers) {
      const y = this.groundAt(c.x, c.z).y;
      c.y = y;
      parts.push({ geo: new THREE.BoxGeometry(0.9, 0.2, 0.6), color: '#2c3440', matrix: mat4(c.x, y + 0.1, c.z) });
      parts.push({ geo: new THREE.BoxGeometry(0.5, 1.6, 0.35), color: '#f4f6f8', matrix: mat4(c.x, y + 1.0, c.z) });
      parts.push({ geo: new THREE.BoxGeometry(0.56, 0.3, 0.4), color: '#22c55e', matrix: mat4(c.x, y + 1.85, c.z) });
      parts.push({ geo: new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4), color: '#1a1d22', matrix: mat4(c.x + 0.3, y + 0.9, c.z, 0, 0, 0.4) });
      glowParts.push({ geo: ring, color: '#39ff88', matrix: mat4(c.padX, this.heightAt(c.padX, c.padZ) + SLAB_Y + 0.04, c.padZ) });
      this._addCollider({ type: 'circle', x: c.x, z: c.z, r: 0.4 });
    }
    this.chargerMesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.chargerMesh.castShadow = true;
    this.chargerGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.chargerGlow = new THREE.Mesh(mergeColored(glowParts), this.chargerGlowMat);
    this.group.add(this.chargerMesh, this.chargerGlow);
  }

  _buildPlaza() {
    for (const b of this.blocks) {
      if (b.type !== 'z') continue;
      const y = this.groundAt(b.cx, b.cz).y;
      const parts = [
        { geo: new THREE.CylinderGeometry(5, 5.3, 0.7, 16), color: '#bfb6a6', matrix: mat4(b.cx, y + 0.35, b.cz) },
        { geo: new THREE.CylinderGeometry(4.5, 4.5, 0.1, 16), color: '#5ec8e8', matrix: mat4(b.cx, y + 0.66, b.cz) },
        { geo: new THREE.CylinderGeometry(0.5, 0.8, 2.4, 8), color: '#d8d0c0', matrix: mat4(b.cx, y + 1.5, b.cz) },
        { geo: new THREE.CylinderGeometry(1.4, 0.4, 0.4, 10), color: '#bfb6a6', matrix: mat4(b.cx, y + 2.8, b.cz) },
      ];
      // planters
      for (const [dx, dz] of [[-14, -14], [14, -14], [14, 14], [-14, 14]]) {
        parts.push({ geo: new THREE.BoxGeometry(3, 0.8, 3), color: '#a0907a', matrix: mat4(b.cx + dx, y + 0.4, b.cz + dz) });
        parts.push({ geo: new THREE.IcosahedronGeometry(1.3, 0), color: '#58b35a', matrix: mat4(b.cx + dx, y + 1.5, b.cz + dz) });
        this._addCollider({ type: 'box', x0: b.cx + dx - 1.5, x1: b.cx + dx + 1.5, z0: b.cz + dz - 1.5, z1: b.cz + dz + 1.5 });
      }
      const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      this._addCollider({ type: 'circle', x: b.cx, z: b.cz, r: 5.2 });
    }
  }

  _buildPotholes() {
    const geo = new THREE.CircleGeometry(1, 7); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
      color: '#2a2b30', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }), this.potholes.length);
    const m = new THREE.Matrix4();
    this.potholes.forEach((p, i) => {
      m.makeScale(p.r, 1, p.r * 0.8);
      m.setPosition(p.x, this.heightAt(p.x, p.z) + ROAD_Y + 0.03, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _buildHorizon() {
    // Distant low-poly mountains, fog-free so they read as a silhouette
    const parts = [];
    const rng = makeRng(this.map.seed + 11);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const r = rng.range(520, 600), h = rng.range(60, 150), w = rng.range(90, 160);
      parts.push({ geo: new THREE.ConeGeometry(w, h, 5), color: rng.pick(['#8fb3c9', '#9dbccf', '#a9c6d6']), matrix: mat4(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r, 0, rng.range(0, 3)) });
    }
    this.horizonMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.horizon = new THREE.Mesh(mergeColored(parts), this.horizonMat);
    this.group.add(this.horizon);
  }

  // ------------------------------------------------------------ per frame
  /** Re-bucket instanced LOD meshes and cull far chunks. */
  updateLOD(cam, force = false, dt = 0, focus = null) {
    this._lodTimer -= dt;
    if (!force && this._lodTimer > 0) return;
    this._lodTimer = 0.1;
    const NEAR = 70 * 70, FAR = 330 * 330;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const tm of this.treeMeshes) {
      let nh = 0, nl = 0;
      for (const t of tm.list) {
        const d2 = (t.x - cam.x) ** 2 + (t.z - cam.z) ** 2;
        // skip far trees, and trees that would block the view of the rider
        if (d2 > FAR || d2 < 20 * t.s * t.s) continue;
        if (focus && d2 < 196 && this._blocksView(t, cam, focus)) continue;
        q.setFromAxisAngle(up, t.rot);
        s.set(t.s, t.s, t.s);
        m.compose(p.set(t.x, t.y, t.z), q, s);
        const mesh = d2 < NEAR ? tm.hi : tm.lo;
        const idx = d2 < NEAR ? nh++ : nl++;
        mesh.setMatrixAt(idx, m);
        mesh.setColorAt(idx, t.color);
      }
      tm.hi.count = nh; tm.lo.count = nl;
      for (const mesh of [tm.hi, tm.lo]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    let nr = 0;
    for (const r of this.roofProps) {
      if ((r.x - cam.x) ** 2 + (r.z - cam.z) ** 2 > 110 * 110) continue;
      m.makeScale(r.sx, r.sy, r.sz); m.setPosition(r.x, r.y, r.z);
      this.roofMesh.setMatrixAt(nr++, m);
    }
    this.roofMesh.count = nr;
    this.roofMesh.instanceMatrix.needsUpdate = true;
    for (const c of this.chunks) {
      c.mesh.visible = Math.hypot(c.x - cam.x, c.z - cam.z) - c.r < 360;
    }
  }

  /** Is tree t close to the horizontal segment camera -> rider? */
  _blocksView(t, cam, f) {
    const ax = cam.x, az = cam.z, bx = f.x, bz = f.z;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((t.x - ax) * dx + (t.z - az) * dz) / L2));
    const px = ax + dx * u - t.x, pz = az + dz * u - t.z;
    return px * px + pz * pz < (1.8 * t.s) ** 2;
  }

  setNight(n, wet) {
    this.night = n;
    this.buildingMat.userData.uNight.value = n;
    this.poolMat.opacity = n * 0.6;
    this.lampHeadMat.color.set(n > 0.3 ? '#ffe2a8' : '#8a8f99');
    this.groundMat.color.setScalar(wet ? 0.78 : 1);
  }

  update(dt, t) {
    this.chargerGlowMat.opacity = 0.45 + 0.35 * Math.sin(t * 3);
  }
}
