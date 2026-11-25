// Low-poly e-bike + rider built from primitives. Exposes the animated parts
// (wheels, fork, cranks, legs, torso) and applies a BikeState every frame.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeColored, mat4, radialTexture } from '../world/geo.js';

const WR = 0.35;   // wheel radius
const WB = 0.55;   // half wheelbase

function tube(a, b, r, color) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  m.compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { geo: g, color, matrix: m };
}

function wheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WR - 0.04, 0.045, 6, 18), new THREE.MeshLambertMaterial({ color: '#1d1f24' }));
  tire.rotation.y = Math.PI / 2;
  const spokes = new THREE.Mesh(mergeColored([
    { geo: new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), color: '#9aa3ad', matrix: mat4(0, 0, 0, 0, 0, Math.PI / 2) },
    ...[0, 1, 2, 3, 4, 5].map(i => ({ geo: new THREE.BoxGeometry(0.01, (WR - 0.08) * 2, 0.012), color: '#c9d0d8', matrix: mat4(0, 0, 0, (i / 6) * Math.PI) })),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(tire, spokes);
  return g;
}

export class BikeModel {
  constructor() {
    this.root = new THREE.Group();          // position + yaw
    this.lean = new THREE.Group();          // roll + pitch
    this.body = new THREE.Group();          // suspension offset
    this.wheelieGroup = new THREE.Group();  // pivots on the rear tyre contact
    this.wheelieGroup.position.set(0, 0, -WB);
    this.root.add(this.lean);
    this.lean.add(this.wheelieGroup);
    this.wheelieGroup.add(this.body);
    this.body.position.z = WB;

    this.paintMat = new THREE.MeshLambertMaterial({ color: '#c6ff3d' });
    this.helmetMat = new THREE.MeshLambertMaterial({ color: '#f2f2f2' });
    this.outfitMat = new THREE.MeshLambertMaterial({ color: '#16a59a' });
    const dark = new THREE.MeshLambertMaterial({ vertexColors: true });

    // --- frame (painted)
    const paint = '#ffffff';
    const frameGeo = mergeColored([
      tube([0, 0.95, 0.38], [0, 0.42, -0.05], 0.045, paint),    // down tube
      tube([0, 0.95, 0.36], [0, 0.98, -0.18], 0.04, paint),     // top tube
      tube([0, 0.42, -0.05], [0, 1.02, -0.22], 0.04, paint),    // seat tube
      tube([0, 0.42, -0.05], [0.08, WR, -WB], 0.025, paint),    // chainstays
      tube([0, 0.98, -0.2], [0.08, WR, -WB], 0.025, paint),     // seatstays
      tube([0, 0.42, -0.05], [-0.08, WR, -WB], 0.025, paint),
      tube([0, 0.98, -0.2], [-0.08, WR, -WB], 0.025, paint),
      tube([0, 0.95, 0.38], [0, 0.8, 0.42], 0.05, paint),       // head tube
    ]);
    const frame = new THREE.Mesh(frameGeo, this.paintMat);
    frame.castShadow = true;

    // --- non-painted bits: battery, motor hub, seat, rack, mudguards
    const bits = new THREE.Mesh(mergeColored([
      { geo: new THREE.BoxGeometry(0.11, 0.12, 0.42), color: '#20242b', matrix: mat4(0, 0.72, 0.18, -Math.atan2(0.53, 0.43) + Math.PI / 2) },
      { geo: new THREE.BoxGeometry(0.115, 0.03, 0.3), color: '#39ff88', matrix: mat4(0, 0.76, 0.22, -Math.atan2(0.53, 0.43) + Math.PI / 2) },
      { geo: new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10), color: '#2e333b', matrix: mat4(0, WR, -WB, 0, 0, Math.PI / 2) },
      { geo: new THREE.BoxGeometry(0.16, 0.06, 0.28), color: '#1b1d22', matrix: mat4(0, 1.06, -0.24) },
      { geo: new THREE.CylinderGeometry(0.018, 0.018, 0.12, 5), color: '#555', matrix: mat4(0, 1.0, -0.23) },
      { geo: new THREE.BoxGeometry(0.3, 0.025, 0.45), color: '#2b2f36', matrix: mat4(0, 0.78, -0.55) },
      tube([0.13, 0.78, -0.35], [0.08, WR, -WB], 0.012, '#2b2f36'),
      tube([-0.13, 0.78, -0.35], [-0.08, WR, -WB], 0.012, '#2b2f36'),
      { geo: new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12, 1, true, -0.2, 1.8), color: '#2b2f36', matrix: mat4(0, WR, -WB, 0, 0, Math.PI / 2) },
    ]), dark);
    bits.castShadow = true;

    // --- cargo box on the rack (shown when carrying a delivery)
    this.cargo = new THREE.Mesh(mergeColored([
      { geo: new THREE.BoxGeometry(0.42, 0.32, 0.42), color: '#d9a45a', matrix: mat4(0, 0.96, -0.55) },
      { geo: new THREE.BoxGeometry(0.43, 0.05, 0.1), color: '#b5803a', matrix: mat4(0, 1.12, -0.55) },
    ]), dark);
    this.cargo.castShadow = true;
    this.cargo.visible = false;

    // --- wheels
    this.rearWheel = wheel();
    this.rearWheel.position.set(0, WR, -WB);
    this.frontWheel = wheel();

    // --- steering assembly (fork + bars + headlight)
    this.fork = new THREE.Group();
    this.fork.position.set(0, 0.95, 0.38);
    this.fork.rotation.x = 0.3;  // head angle
    const forkInner = new THREE.Group();
    this.fork.add(forkInner);
    forkInner.rotation.x = -0.3;
    const forkMesh = new THREE.Mesh(mergeColored([
      tube([0.06, 0, 0.04], [0.06, -0.6, 0.17], 0.022, '#2b2f36'),
      tube([-0.06, 0, 0.04], [-0.06, -0.6, 0.17], 0.022, '#2b2f36'),
      tube([0, 0, 0], [0, 0.18, -0.05], 0.025, '#2b2f36'),
      tube([-0.3, 0.2, -0.08], [0.3, 0.2, -0.08], 0.018, '#2b2f36'),
      { geo: new THREE.BoxGeometry(0.1, 0.06, 0.06), color: '#f5f5f5', matrix: mat4(0, 0.05, 0.1) },
    ]), dark);
    forkInner.add(forkMesh);
    this.frontWheel.position.set(0, -0.6, 0.17);
    forkInner.add(this.frontWheel);
    this.headlightGlow = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), new THREE.MeshBasicMaterial({ color: '#fffbe0' }));
    this.headlightGlow.position.set(0, 0.05, 0.135);
    forkInner.add(this.headlightGlow);
    this.forkInner = forkInner;

    // --- cranks
    this.crank = new THREE.Group();
    this.crank.position.set(0, 0.42, -0.05);
    const crankMesh = new THREE.Mesh(mergeColored([
      { geo: new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), color: '#9aa3ad', matrix: mat4(0.09, 0, 0, 0, 0, Math.PI / 2) },
      { geo: new THREE.BoxGeometry(0.02, 0.17, 0.03), color: '#3a3f47', matrix: mat4(0.11, -0.085, 0) },
      { geo: new THREE.BoxGeometry(0.02, 0.17, 0.03), color: '#3a3f47', matrix: mat4(-0.11, 0.085, 0) },
      { geo: new THREE.BoxGeometry(0.09, 0.02, 0.06), color: '#1b1d22', matrix: mat4(0.16, -0.17, 0) },
      { geo: new THREE.BoxGeometry(0.09, 0.02, 0.06), color: '#1b1d22', matrix: mat4(-0.16, 0.17, 0) },
    ]), dark);
    this.crank.add(crankMesh);

    this.body.add(frame, bits, this.cargo, this.rearWheel, this.fork, this.crank);

    // --- rider
    this.rider = new THREE.Group();
    this.rider.position.set(0, 1.08, -0.22);
    this.body.add(this.rider);
    const skin = new THREE.MeshLambertMaterial({ color: '#f1c27d' });
    const pants = new THREE.MeshLambertMaterial({ color: '#2d3340' });
    this.torso = new THREE.Group();
    this.rider.add(this.torso);
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.22), this.outfitMat);
    torsoMesh.position.y = 0.3;
    torsoMesh.castShadow = true;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.12), new THREE.MeshLambertMaterial({ color: '#30343c' }));
    pack.position.set(0, 0.34, -0.16);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), skin);
    head.position.y = 0.72;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), this.helmetMat);
    helmet.position.y = 0.74;
    helmet.scale.set(1, 1, 1.2);
    helmet.castShadow = true;
    this.torso.add(torsoMesh, pack, head, helmet);
    this.torso.rotation.x = 0.75;
    // arms reach the bars
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), this.outfitMat);
      arm.position.set(0.2 * s, 0.48, 0.2);
      arm.rotation.x = 0.9;
      this.torso.add(arm);
    }
    // legs: thigh pivots at hip, shin pivots at knee
    this.legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(0.1 * s, 0, 0);
      const tm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.13), pants);
      tm.position.y = -0.21;
      thigh.add(tm);
      const shin = new THREE.Group();
      shin.position.y = -0.42;
      const sm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.11), pants);
      sm.position.y = -0.21;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), new THREE.MeshLambertMaterial({ color: '#f5f5f5' }));
      shoe.position.set(0, -0.43, 0.04);
      shin.add(sm, shoe);
      thigh.add(shin);
      this.rider.add(thigh);
      this.legs.push({ thigh, shin, phase: s > 0 ? 0 : Math.PI });
    }

    // fake contact shadow (cheap, always on, helps on low quality)
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.blob.rotation.x = -Math.PI / 2;
    this.root.add(this.blob);

    // headlight
    this.headlight = new THREE.SpotLight('#fff4d6', 0, 45, 0.55, 0.5, 1.6);
    this.headlight.position.set(0, 1.0, 0.5);
    this.headlight.target.position.set(0, 0, 9);
    this.root.add(this.headlight, this.headlight.target);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 12, 1, true), new THREE.MeshBasicMaterial({
      color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.beam.rotation.x = Math.PI / 2 + 0.12;
    this.beam.position.set(0, 0.6, 5.2);
    this.root.add(this.beam);
  }

  setCosmetics({ paint, helmet, outfit }) {
    if (paint) this.paintMat.color.set(paint);
    if (helmet) this.helmetMat.color.set(helmet);
    if (outfit) this.outfitMat.color.set(outfit);
  }

  setLights(night) {
    this.headlight.intensity = night * 60;
    this.beam.material.opacity = night * 0.07;
    this.headlightGlow.material.color.set(night > 0.2 ? '#ffffff' : '#d8d8c8');
  }

  apply(s, dt, t) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.yaw;
    const wobble = s.stun > 0 ? Math.sin(t * 40) * 0.12 * s.stun : 0;
    this.lean.rotation.set(s.pitch, 0, s.lean + wobble, 'YXZ');
    this.body.position.y = s.susp * 0.6;
    this.wheelieGroup.rotation.x = -s.wheelie;
    this.rearWheel.rotation.x = s.wheel;
    this.frontWheel.rotation.x = s.wheel;
    this.forkInner.rotation.y = s.steerVis;
    this.crank.rotation.x = s.crank;

    // rider posture: tuck lowers torso, braking sits back, airborne stands up
    const tuck = s.tuck ? 1 : 0;
    const tt = 0.75 + tuck * 0.45 - (s.braking ? 0.12 : 0) - s.wheelie * 0.9;
    this.torso.rotation.x += (tt - this.torso.rotation.x) * Math.min(1, dt * 8);
    const riderY = 1.08 - tuck * 0.06 + (!s.grounded ? 0.08 : 0) - s.susp * 0.4;
    this.rider.position.y += (riderY - this.rider.position.y) * Math.min(1, dt * 10);
    this.rider.rotation.z = -s.lean * 0.25;

    // legs follow the crank (approximate 2-bone pedal motion)
    for (const l of this.legs) {
      const a = s.crank + l.phase;
      l.thigh.rotation.x = -1.15 + 0.38 * Math.cos(a);
      l.shin.rotation.x = 1.35 + 0.45 * Math.sin(a + 0.6) - 0.1 * Math.cos(a);
    }

    // blob shadow stays on the ground under the bike
    this.blob.position.y = -(s.y - s.groundY) + 0.03;
    this.blob.material.opacity = Math.max(0.2, 1 - (s.y - s.groundY) * 0.8);
  }
}
