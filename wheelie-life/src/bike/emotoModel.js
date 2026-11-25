// Light electric dirt bike in the style of a Sur-Ron, proportioned from a
// side-view reference photo: black open frame with the battery cells on show,
// round motor cover low in the middle, long thick swingarm, long flat seat
// running into an upswept tail, gold inverted fork with a long high front
// fender and a number-plate headlight. Unbranded and built in code.
// Facing +Z, ground at y = 0, wheel contact points at z = +/-halfWB.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeColored, mat4 } from '../world/geo.js';

export const EMOTO = { halfWB: 0.66, wheelR: 0.33 };
const R = EMOTO.wheelR, WB = EMOTO.halfWB;

const C = {
  frame: '#1c1d21', plastic: '#121316', seat: '#0d0e10', cell: '#2b2e34', rib: '#3a3e46',
  gold: '#c9952b', goldDark: '#9c7020', fork: '#141518', silver: '#c7cbd1', steel: '#8e959e',
  tire: '#151619', rim: '#202226', spoke: '#b8bec6', chain: '#3d4047',
};

/** Box beam between two side-view points [y, z], offset across by x. */
function beam(x, a, b, w, h, color) {
  const dz = b[1] - a[1], dy = b[0] - a[0];
  const g = new THREE.BoxGeometry(w, h, Math.hypot(dz, dy));
  return { geo: g, color, matrix: mat4(x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -Math.atan2(dy, dz)) };
}

function tube(a, b, r, color, seg = 8) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { geo: g, color, matrix: m };
}

/** A side-profile outline (points [y, z]) extruded across x, centred on x. */
function profile(points, width, color, x = 0) {
  const shape = new THREE.Shape();
  points.forEach(([y, z], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);          // outline x -> world z, extrusion -> world -x
  g.translate(x + width / 2, 0, 0);
  return { geo: g, color };
}

function knobbyWheel(rear) {
  const parts = [
    { geo: new THREE.TorusGeometry(R - 0.06, 0.06, 8, 30), color: C.tire, matrix: mat4(0, 0, 0, 0, Math.PI / 2) },
    { geo: new THREE.TorusGeometry(R - 0.115, 0.011, 4, 30), color: C.rim, matrix: mat4(0, 0, 0, 0, Math.PI / 2) },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.15, 10), color: C.steel, matrix: mat4(0, 0, 0, 0, 0, Math.PI / 2) },
  ];
  for (let i = 0; i < 30; i++) {          // knobs
    const a = (i / 30) * Math.PI * 2;
    parts.push({ geo: new THREE.BoxGeometry(i % 2 ? 0.11 : 0.075, 0.032, 0.034), color: C.tire,
      matrix: mat4(0, Math.cos(a) * (R - 0.004), Math.sin(a) * (R - 0.004), -a) });
  }
  for (let i = 0; i < 18; i++) {          // spokes
    const a = (i / 18) * Math.PI * 2, s = i % 2 ? 0.04 : -0.04;
    parts.push(tube([s, 0, 0], [0, Math.cos(a) * (R - 0.12), Math.sin(a) * (R - 0.12)], 0.0035, C.spoke, 3));
  }
  // brake disc on the left; big sprocket on the right of the rear
  parts.push({ geo: new THREE.CylinderGeometry(rear ? 0.09 : 0.11, rear ? 0.09 : 0.11, 0.006, 14), color: C.silver, matrix: mat4(0.08, 0, 0, 0, 0, Math.PI / 2) });
  if (rear) parts.push({ geo: new THREE.CylinderGeometry(0.13, 0.13, 0.012, 20), color: '#5a5e66', matrix: mat4(-0.075, 0, 0, 0, 0, Math.PI / 2) });
  const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/** Front fender in the fork's raked frame: level body, tip curving down. */
function fender(rake) {
  const a = rake + 0.05, b = a + 0.4;
  const cy = -0.32, cz = 0.2, half = 0.24;
  const ey = cy - Math.sin(a) * half, ez = cz + Math.cos(a) * half;
  return [
    { geo: new THREE.BoxGeometry(0.17, 0.03, half * 2), color: C.plastic, matrix: mat4(0, cy, cz, a) },
    { geo: new THREE.BoxGeometry(0.16, 0.026, 0.14), color: C.plastic, matrix: mat4(0, ey - Math.sin(b) * 0.065, ez + Math.cos(b) * 0.065, b) },
    { geo: new THREE.BoxGeometry(0.2, 0.05, 0.1), color: C.plastic, matrix: mat4(0, cy + Math.sin(a) * half * 0.9, cz - Math.cos(a) * half * 0.9, a) },
  ];
}

/**
 * Build the e-moto. paintMat colours the accent graphics (side and tail
 * stripes, tank flash, number-plate trim) so Shop paints apply to it.
 */
export function buildEmoto(paintMat) {
  const group = new THREE.Group();
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true });

  // key points from the reference photo, as [y, z] in metres
  const head = [1.0, 0.25];       // top of the steering head
  const pivot = [0.4, -0.17];     // swingarm pivot
  const rearAxle = [R, -WB];

  const parts = [
    // --- frame: twin top beams, down beams to the motor, rear uprights, seat rails
    ...[0.085, -0.085].flatMap(x => [
      beam(x, [0.96, 0.24], [0.78, -0.26], 0.035, 0.07, C.frame),       // top beam
      beam(x, [0.92, 0.24], [0.42, 0.06], 0.035, 0.075, C.frame),       // down beam
      beam(x, [0.42, 0.06], [0.36, -0.14], 0.035, 0.07, C.frame),       // cradle under the motor
      beam(x, [0.80, -0.27], [0.40, -0.17], 0.035, 0.07, C.frame),      // rear upright
      beam(x, [0.80, -0.27], [0.80, -0.62], 0.025, 0.04, C.frame),      // seat rail
      beam(x, [0.56, -0.22], [0.79, -0.55], 0.022, 0.035, C.frame),     // subframe strut
      beam(x, [0.68, 0.16], [0.52, -0.2], 0.02, 0.03, C.frame),         // brace across the battery
    ]),
    tube([0, 1.06, 0.27], [0, 0.88, 0.22], 0.045, C.frame),             // head tube

    // --- battery: dark block with vertical ribs, visible through the frame
    { geo: new THREE.BoxGeometry(0.15, 0.32, 0.34), color: C.cell, matrix: mat4(0, 0.62, 0.02, -0.12) },
    ...[-0.12, -0.06, 0, 0.06, 0.12].flatMap(z => [0.078, -0.078].map(x =>
      ({ geo: new THREE.BoxGeometry(0.008, 0.28, 0.022), color: C.rib, matrix: mat4(x, 0.62, 0.02 + z, -0.12) }))),
    { geo: new THREE.BoxGeometry(0.12, 0.2, 0.08), color: '#202227', matrix: mat4(0, 0.6, 0.22, -0.3) },   // controller

    // --- motor: black housing with a round silver cover, low and central
    { geo: new THREE.CylinderGeometry(0.105, 0.105, 0.2, 18), color: '#1a1b1f', matrix: mat4(0, 0.39, -0.02, 0, 0, Math.PI / 2) },
    { geo: new THREE.CylinderGeometry(0.085, 0.085, 0.02, 18), color: C.silver, matrix: mat4(0.105, 0.39, -0.02, 0, 0, Math.PI / 2) },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), color: '#6b7079', matrix: mat4(0.115, 0.39, -0.02, 0, 0, Math.PI / 2) },
    { geo: new THREE.BoxGeometry(0.16, 0.08, 0.22), color: '#1a1b1f', matrix: mat4(0, 0.33, 0.05, 0.25) },  // skid plate

    // --- swingarm: long and thick, plus the chain run on the right
    beam(0.085, pivot, rearAxle, 0.04, 0.09, C.frame),
    beam(-0.085, pivot, rearAxle, 0.04, 0.09, C.frame),
    beam(-0.075, [0.46, -0.08], [rearAxle[0] + 0.13, -WB], 0.008, 0.012, C.chain),
    beam(-0.075, [0.33, -0.08], [rearAxle[0] - 0.13, -WB], 0.008, 0.012, C.chain),
    beam(-0.11, [0.47, -0.3], [0.43, -0.5], 0.006, 0.05, '#2a2c31'),          // chain guard

    // --- rear shock: gold body + black coil, almost upright under the seat
    tube([0, 0.78, -0.33], [0, 0.48, -0.27], 0.03, C.gold, 10),
    tube([0, 0.7, -0.315], [0, 0.52, -0.28], 0.046, '#17181b', 10),
    { geo: new THREE.BoxGeometry(0.05, 0.13, 0.05), color: '#c4372b', matrix: mat4(0.06, 0.7, -0.36) },   // reservoir

    // --- footpegs
    { geo: new THREE.BoxGeometry(0.1, 0.022, 0.05), color: C.steel, matrix: mat4(0.17, 0.35, -0.12) },
    { geo: new THREE.BoxGeometry(0.1, 0.022, 0.05), color: C.steel, matrix: mat4(-0.17, 0.35, -0.12) },

    // --- seat: long, flat, thick foam, slightly higher at the tank end
    profile([[0.83, 0.18], [0.9, 0.16], [0.9, 0.0], [0.875, -0.3], [0.86, -0.6], [0.82, -0.62], [0.8, -0.3], [0.8, 0.1]], 0.24, C.seat),
    // tank shroud in front of the seat, down to the head
    profile([[0.92, 0.17], [0.97, 0.26], [0.88, 0.32], [0.72, 0.28], [0.74, 0.12], [0.84, 0.1]], 0.27, C.plastic),
    // rear side covers under the seat, sweeping into the upswept tail
    profile([[0.82, -0.05], [0.85, -0.6], [0.9, -0.9], [0.86, -0.92], [0.78, -0.62], [0.66, -0.36], [0.62, -0.12]], 0.2, C.plastic),
    { geo: new THREE.BoxGeometry(0.08, 0.035, 0.03), color: '#d6161c', matrix: mat4(0, 0.86, -0.9, 0.3) },   // tail light
  ];
  const body = new THREE.Mesh(mergeColored(parts), lam);
  body.castShadow = true;

  const stripe = [[0.8, -0.02], [0.82, -0.6], [0.86, -0.86], [0.83, -0.87], [0.77, -0.6], [0.75, -0.04]];
  const flash = [[0.9, 0.2], [0.94, 0.25], [0.86, 0.29], [0.82, 0.24]];
  const graphics = new THREE.Mesh(mergeColored([
    profile(stripe, 0.008, '#ffffff', 0.104), profile(stripe, 0.008, '#ffffff', -0.104),
    profile(flash, 0.006, '#ffffff', 0.139), profile(flash, 0.006, '#ffffff', -0.139),
  ]), paintMat);

  const rearWheel = knobbyWheel(true);
  rearWheel.position.set(0, R, -WB);

  // --- steering: gold inverted fork, clamps, wide bar, number plate, high fender
  const rake = Math.atan2(WB - head[1], head[0] - R);
  const forkLen = Math.hypot(WB - head[1], head[0] - R);
  const steer = new THREE.Group();
  steer.position.set(0, head[0], head[1]);
  steer.rotation.x = -rake;
  const steerInner = new THREE.Group();
  steer.add(steerInner);
  const goldEnd = -0.45;            // gold upper tubes, black lower legs
  const forkParts = [
    tube([0.09, 0.12, 0], [0.09, goldEnd, 0], 0.033, C.gold, 10),
    tube([-0.09, 0.12, 0], [-0.09, goldEnd, 0], 0.033, C.gold, 10),
    tube([0.09, goldEnd, 0], [0.09, -forkLen + 0.03, 0], 0.024, C.fork),
    tube([-0.09, goldEnd, 0], [-0.09, -forkLen + 0.03, 0], 0.024, C.fork),
    { geo: new THREE.BoxGeometry(0.06, 0.07, 0.07), color: C.fork, matrix: mat4(0.09, -forkLen, 0) },
    { geo: new THREE.BoxGeometry(0.06, 0.07, 0.07), color: C.fork, matrix: mat4(-0.09, -forkLen, 0) },
    { geo: new THREE.BoxGeometry(0.27, 0.035, 0.08), color: C.goldDark, matrix: mat4(0, 0.1, 0) },    // top clamp
    { geo: new THREE.BoxGeometry(0.27, 0.05, 0.09), color: C.goldDark, matrix: mat4(0, -0.09, 0) },   // bottom clamp
    tube([0, 0.12, -0.01], [0, 0.18, -0.04], 0.02, C.fork),                                           // riser
    tube([-0.37, 0.19, -0.06], [0.37, 0.19, -0.06], 0.012, '#26282d'),                                // wide bar
    tube([0.28, 0.19, -0.06], [0.39, 0.2, -0.07], 0.021, C.fork),                                     // grips
    tube([-0.28, 0.19, -0.06], [-0.39, 0.2, -0.07], 0.021, C.fork),
    { geo: new THREE.BoxGeometry(0.03, 0.03, 0.08), color: '#26282d', matrix: mat4(0.25, 0.2, -0.02) },  // levers
    { geo: new THREE.BoxGeometry(0.03, 0.03, 0.08), color: '#26282d', matrix: mat4(-0.25, 0.2, -0.02) },
    { geo: new THREE.BoxGeometry(0.09, 0.05, 0.05), color: '#0b0c0e', matrix: mat4(0, 0.16, 0.03, -0.5) }, // display
    // number plate with the headlight, in front of the fork top
    profile([[0.14, 0.1], [0.16, 0.16], [-0.06, 0.2], [-0.14, 0.15], [-0.12, 0.09]], 0.25, C.plastic),
    // long, high front fender, level in world space although the fork is raked
    ...fender(rake),
  ];
  const forkMesh = new THREE.Mesh(mergeColored(forkParts), lam);
  forkMesh.castShadow = true;
  steerInner.add(forkMesh);
  const plateTrim = new THREE.Mesh(mergeColored([
    profile([[0.15, 0.135], [0.16, 0.165], [0.02, 0.19], [0.01, 0.16]], 0.252, '#ffffff'),
  ]), paintMat);
  steerInner.add(plateTrim);
  const frontWheel = knobbyWheel(false);
  frontWheel.position.set(0, -forkLen, 0);
  steerInner.add(frontWheel);   // rake is about X, so spinning about X stays correct
  const headlightGlow = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshBasicMaterial({ color: '#fffbe0' }));
  headlightGlow.position.set(0, 0.02, 0.192);
  steerInner.add(headlightGlow);

  // markers for the rider IK
  const gripL = new THREE.Object3D(); gripL.position.set(0.34, 0.2, -0.065);
  const gripR = new THREE.Object3D(); gripR.position.set(-0.34, 0.2, -0.065);
  steerInner.add(gripL, gripR);
  const pegL = new THREE.Object3D(); pegL.position.set(0.17, 0.41, -0.14);
  const pegR = new THREE.Object3D(); pegR.position.set(-0.17, 0.41, -0.14);

  group.add(body, graphics, rearWheel, steer, pegL, pegR);
  return {
    group, rearWheel, frontWheel, steerInner, headlightGlow,
    grips: [gripL, gripR], feet: [pegL, pegR],
    halfWB: WB, wheelR: R,
    hips: new THREE.Vector3(0, 0.96, -0.2),
    cargo: new THREE.Vector3(0, 0.08, -0.2),   // offset of the delivery box from its city-rack spot
    lean: 0.4, pedals: false,
  };
}
