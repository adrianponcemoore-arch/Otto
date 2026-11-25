// Geometry helpers: a vertex-coloured mesh builder that drapes quads over the
// terrain height function, plus a tiny merge utility (the vendored Three.js
// build doesn't include BufferGeometryUtils).
import * as THREE from '../../vendor/three.module.min.js';

const _c = new THREE.Color();

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.idx = [];
  }
  get vertexCount() { return this.pos.length / 3; }

  /**
   * Axis-aligned grid from (x0,z0) to (x1,z1), nx*nz cells, y from yFn(x,z).
   */
  grid(x0, z0, x1, z1, nx, nz, yFn, color) {
    _c.set(color);
    const base = this.vertexCount;
    for (let j = 0; j <= nz; j++) {
      const z = z0 + ((z1 - z0) * j) / nz;
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx;
        this.pos.push(x, yFn(x, z), z);
        this.col.push(_c.r, _c.g, _c.b);
      }
    }
    const row = nx + 1;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
        // CCW seen from above (+Y)
        this.idx.push(a, c, b, b, c, d);
      }
    }
  }

  /** A vertical wall strip between two xz points, from yLo(x,z) to yHi(x,z). */
  wall(xa, za, xb, zb, segs, yLo, yHi, color, flip = false) {
    _c.set(color);
    const base = this.vertexCount;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = xa + (xb - xa) * t, z = za + (zb - za) * t;
      this.pos.push(x, yLo(x, z), z, x, yHi(x, z), z);
      this.col.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (flip) this.idx.push(a, c, b, b, c, d);
      else this.idx.push(a, b, c, b, d, c);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Merge a list of { geo, color, matrix? } into one non-indexed geometry with a
 * per-vertex colour attribute. Used for bike, cars, trees and props.
 */
export function mergeColored(parts) {
  const pos = [], nor = [], col = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const m = p.matrix || new THREE.Matrix4();
    nm.getNormalMatrix(m);
    _c.set(p.color);
    const pa = g.attributes.position, na = g.attributes.normal;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      if (na) { n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); }
      else nor.push(0, 1, 0);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export const mat4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz));
  return m;
};

/** Soft radial gradient texture for fake light pools, glows and shadows. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
