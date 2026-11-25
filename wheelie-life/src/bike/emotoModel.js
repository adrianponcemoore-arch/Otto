// Light electric dirt bike in the style of a Sur-Ron: tall inverted fork,
// battery in a slim aluminium frame, long flat seat, mid-mounted motor with a
// chain to the rear wheel, 19" knobby wheels and footpegs instead of pedals.
// Unbranded and built in code, so it ships with the game and loads instantly.
// Facing +Z, ground at y = 0, wheel contact points at z = +/-HALF_WB.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeColored, mat4 } from '../world/geo.js';

export const EMOTO = { halfWB: 0.62, wheelR: 0.34 };
const R = EMOTO.wheelR, WB = EMOTO.halfWB;

function tube(a, b, r, color, seg = 8) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { geo: g, color, matrix: m };
}

/** A wedge-ish panel: box with its top edge shorter than its bottom. */
function panel(w, h, lTop, lBot, color, matrix) {
  const g = new THREE.BoxGeometry(w, h, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (p.getY(i) > 0 ? lTop : lBot));
  g.computeVertexNormals();
  return { geo: g, color, matrix };
}

function knobbyWheel(rearSprocket) {
  const parts = [
    { geo: new THREE.TorusGeometry(R - 0.065, 0.062, 8, 28), color: '#1a1b1f', matrix: mat4(0, 0, 0, 0, Math.PI / 2) },
    { geo: new THREE.TorusGeometry(R - 0.115, 0.012, 4, 28), color: '#2a2d33', matrix: mat4(0, 0, 0, 0, Math.PI / 2) },   // rim
    { geo: new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10), color: '#8e959e', matrix: mat4(0, 0, 0, 0, 0, Math.PI / 2) },
  ];
  // knobs around the tread
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    parts.push({ geo: new THREE.BoxGeometry(i % 2 ? 0.1 : 0.07, 0.03, 0.035), color: '#141518',
      matrix: mat4(0, Math.cos(a) * (R - 0.005), Math.sin(a) * (R - 0.005), -a) });
  }
  // spokes
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, s = i % 2 ? 0.035 : -0.035;
    parts.push(tube([s, 0, 0], [0, Math.cos(a) * (R - 0.12), Math.sin(a) * (R - 0.12)], 0.004, '#c2c8d0', 3));
  }
  // brake disc, and the rear sprocket
  parts.push({ geo: new THREE.CylinderGeometry(0.1, 0.1, 0.006, 16), color: '#b9bec6', matrix: mat4(0.075, 0, 0, 0, 0, Math.PI / 2) });
  if (rearSprocket) parts.push({ geo: new THREE.CylinderGeometry(0.11, 0.11, 0.01, 18), color: '#3a3d44', matrix: mat4(-0.07, 0, 0, 0, 0, Math.PI / 2) });
  const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/**
 * Build the e-moto. paintMat colours the plastics (shrouds, number plate,
 * fenders) so the Shop paint colours apply to it too.
 */
export function buildEmoto(paintMat) {
  const group = new THREE.Group();
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  const alu = '#2b2e34', black = '#16171a', grey = '#5c626b';

  // ---- frame, battery, motor, swingarm, shock, seat (static, one mesh)
  const head = [0, 1.02, 0.28];      // steering head
  const pivot = [0, 0.44, -0.12];    // swingarm pivot
  const fixed = [
    // twin spars from the head down to the pivot, and up rails to the seat
    tube([0.09, 1.0, 0.26], [0.1, 0.5, -0.1], 0.03, alu),
    tube([-0.09, 1.0, 0.26], [-0.1, 0.5, -0.1], 0.03, alu),
    tube([0.08, 0.98, 0.24], [0.08, 0.8, -0.62], 0.022, alu),
    tube([-0.08, 0.98, 0.24], [-0.08, 0.8, -0.62], 0.022, alu),
    tube([0.08, 0.5, -0.1], [0.08, 0.78, -0.4], 0.02, alu),
    tube([-0.08, 0.5, -0.1], [-0.08, 0.78, -0.4], 0.02, alu),
    tube([0, 1.06, 0.3], [0, 0.94, 0.25], 0.045, alu),               // head tube
    // battery pack between the spars
    panel(0.16, 0.36, 0.42, 0.32, '#22252b', mat4(0, 0.68, 0.06, 0.18)),
    // motor (mid-mount) + chain run to the rear sprocket
    { geo: new THREE.CylinderGeometry(0.095, 0.095, 0.17, 14), color: grey, matrix: mat4(0, 0.4, 0.02, 0, 0, Math.PI / 2) },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), color: '#2a2c31', matrix: mat4(0, 0.4, 0.02, 0, 0, Math.PI / 2) },
    tube([-0.07, 0.45, 0.02], [-0.07, R + 0.1, -WB], 0.008, '#4a4d54', 4),
    tube([-0.07, 0.35, 0.02], [-0.07, R - 0.1, -WB], 0.008, '#4a4d54', 4),
    // swingarm (fixed at ride height)
    { geo: new THREE.BoxGeometry(0.035, 0.07, 0.56), color: alu, matrix: mat4(0.085, (pivot[1] + R) / 2, (pivot[2] - WB) / 2, Math.atan2(pivot[1] - R, pivot[2] + WB) * -1) },
    { geo: new THREE.BoxGeometry(0.035, 0.07, 0.56), color: alu, matrix: mat4(-0.085, (pivot[1] + R) / 2, (pivot[2] - WB) / 2, Math.atan2(pivot[1] - R, pivot[2] + WB) * -1) },
    // rear shock: body + spring
    tube([0, 0.82, -0.28], [0, 0.47, -0.36], 0.024, '#2a2c31'),
    tube([0, 0.78, -0.29], [0, 0.55, -0.34], 0.042, '#e8b21b', 10),
    // seat: long and flat, slightly higher at the back
    panel(0.24, 0.08, 0.72, 0.78, black, mat4(0, 0.86, -0.2, -0.04)),
    // footpegs
    { geo: new THREE.BoxGeometry(0.1, 0.025, 0.05), color: '#8e959e', matrix: mat4(0.17, 0.36, -0.02) },
    { geo: new THREE.BoxGeometry(0.1, 0.025, 0.05), color: '#8e959e', matrix: mat4(-0.17, 0.36, -0.02) },
    // tail light
    { geo: new THREE.BoxGeometry(0.1, 0.04, 0.03), color: '#d6161c', matrix: mat4(0, 0.97, -1.05, 0.3) },
  ];
  const frameMesh = new THREE.Mesh(mergeColored(fixed), lam);
  frameMesh.castShadow = true;

  // ---- painted plastics: side covers, tank shroud, rear fender
  const plastics = new THREE.Mesh(mergeColored([
    panel(0.025, 0.3, 0.36, 0.26, '#ffffff', mat4(0.105, 0.7, 0.08, 0.15)),
    panel(0.025, 0.3, 0.36, 0.26, '#ffffff', mat4(-0.105, 0.7, 0.08, 0.15)),
    panel(0.27, 0.14, 0.26, 0.34, '#ffffff', mat4(0, 0.93, 0.13, -0.12)),
    panel(0.17, 0.025, 0.52, 0.52, '#ffffff', mat4(0, 0.88, -0.8, 0.3)),
    panel(0.025, 0.12, 0.38, 0.3, '#ffffff', mat4(0.115, 0.8, -0.52, 0.15)),
    panel(0.025, 0.12, 0.38, 0.3, '#ffffff', mat4(-0.115, 0.8, -0.52, 0.15)),
  ]), paintMat);
  plastics.castShadow = true;

  // ---- wheels
  const rearWheel = knobbyWheel(true);
  rearWheel.position.set(0, R, -WB);

  // ---- steering: inverted fork with rake, bars, number plate, headlight, fender
  const rake = Math.atan2(WB - head[2], head[1] - R);   // fork reaches the front axle
  const forkLen = Math.hypot(WB - head[2], head[1] - R);
  const steer = new THREE.Group();
  steer.position.set(...head);
  steer.rotation.x = -rake;
  const steerInner = new THREE.Group();
  steer.add(steerInner);
  const forkParts = [
    // gold upper tubes (inverted fork) and black lower legs
    tube([0.1, 0.1, 0], [0.1, -0.38, 0], 0.03, '#d8a521'),
    tube([-0.1, 0.1, 0], [-0.1, -0.38, 0], 0.03, '#d8a521'),
    tube([0.1, -0.38, 0], [0.1, -forkLen, 0], 0.022, black),
    tube([-0.1, -0.38, 0], [-0.1, -forkLen, 0], 0.022, black),
    { geo: new THREE.BoxGeometry(0.28, 0.04, 0.08), color: alu, matrix: mat4(0, 0.06, 0) },    // top clamp
    { geo: new THREE.BoxGeometry(0.28, 0.05, 0.09), color: alu, matrix: mat4(0, -0.06, 0) },   // bottom clamp
    // risers + wide motocross bar + grips
    tube([0, 0.08, -0.02], [0, 0.18, -0.04], 0.02, black),
    tube([-0.36, 0.19, -0.06], [0.36, 0.19, -0.06], 0.013, '#2f3238'),
    tube([0.28, 0.19, -0.06], [0.39, 0.2, -0.07], 0.022, black),
    tube([-0.28, 0.19, -0.06], [-0.39, 0.2, -0.07], 0.022, black),
    tube([0, 0.19, -0.06], [0, 0.25, -0.12], 0.012, '#2f3238'),   // crossbar pad stem
    // small display
    { geo: new THREE.BoxGeometry(0.1, 0.05, 0.04), color: '#111317', matrix: mat4(0, 0.15, 0.02, -0.4) },
  ];
  const forkMesh = new THREE.Mesh(mergeColored(forkParts), lam);
  forkMesh.castShadow = true;
  steerInner.add(forkMesh);
  // number plate + front fender are plastics (paint)
  const front = new THREE.Mesh(mergeColored([
    panel(0.24, 0.26, 0.2, 0.26, '#ffffff', mat4(0, -0.02, 0.1, -0.15)),
    panel(0.15, 0.02, 0.36, 0.42, '#ffffff', mat4(0, -0.17, 0.12, rake * 0.6)),
  ]), paintMat);
  steerInner.add(front);
  const frontWheel = knobbyWheel(false);
  frontWheel.position.set(0, -forkLen, 0);
  steerInner.add(frontWheel);  // rake is about X, so spinning about X stays correct
  const headlightGlow = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), new THREE.MeshBasicMaterial({ color: '#fffbe0' }));
  headlightGlow.position.set(0, -0.02, 0.24);
  headlightGlow.rotation.x = -0.15;
  steerInner.add(headlightGlow);

  // markers for the rider IK
  const gripL = new THREE.Object3D(); gripL.position.set(0.34, 0.2, -0.065);
  const gripR = new THREE.Object3D(); gripR.position.set(-0.34, 0.2, -0.065);
  steerInner.add(gripL, gripR);
  const pegL = new THREE.Object3D(); pegL.position.set(0.17, 0.42, -0.04);
  const pegR = new THREE.Object3D(); pegR.position.set(-0.17, 0.42, -0.04);

  group.add(frameMesh, plastics, rearWheel, steer, pegL, pegR);
  return {
    group, rearWheel, frontWheel, steerInner, headlightGlow,
    grips: [gripL, gripR], feet: [pegL, pegR],
    halfWB: WB, wheelR: R,
    hips: new THREE.Vector3(0, 0.93, -0.2),
    cargo: new THREE.Vector3(0, 0.12, -0.2),   // offset of the delivery box from its city-rack spot
    lean: 0.42, pedals: false,
  };
}
