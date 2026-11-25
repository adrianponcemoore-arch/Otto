// Rigged rider (CC0 Quaternius character) posed on the bike with two-bone IK.
// The model's own "sitting" clip gives a natural base pose; each frame we
// reach the hands to the grips and the feet to the pegs or pedals.
import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/addons/libs/meshopt_decoder.module.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _t = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();

/** Rotate a bone by a world-space rotation r (keeps its parent intact). */
function rotateWorld(bone, r) {
  bone.getWorldQuaternion(_wq);
  bone.parent.getWorldQuaternion(_pq);
  _wq.premultiply(r);
  bone.quaternion.copy(_pq.invert().multiply(_wq));
  bone.updateMatrixWorld(true);
}

function angleBetween(u, v) {
  return Math.acos(THREE.MathUtils.clamp(u.dot(v) / (u.length() * v.length() || 1), -1, 1));
}

/**
 * Two-bone IK. upper/lower are bones; endOf() returns the current world
 * position of the chain's end (wrist or ankle). Bends toward `pole`.
 */
function solveTwoBone(upper, lower, endOf, target, pole) {
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  endOf(_c);
  const lab = _a.distanceTo(_b), lbc = _b.distanceTo(_c);
  const lat = THREE.MathUtils.clamp(_a.distanceTo(target), Math.abs(lab - lbc) + 1e-4, lab + lbc - 1e-4);

  // 1. bend the middle joint so the chain spans the target distance
  const cur = angleBetween(_v1.subVectors(_a, _b), _v2.subVectors(_c, _b));
  const want = Math.acos(THREE.MathUtils.clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
  _ax.crossVectors(_v1, _v2);
  if (_ax.lengthSq() < 1e-10) _ax.crossVectors(_v1, _t.subVectors(pole, _b)); // straight limb
  _ax.normalize();
  rotateWorld(lower, _q.setFromAxisAngle(_ax, want - cur));

  // 2. aim the chain at the target
  endOf(_c);
  _v1.subVectors(_c, _a); _v2.subVectors(target, _a);
  _ax.crossVectors(_v1, _v2);
  if (_ax.lengthSq() > 1e-12) rotateWorld(upper, _q.setFromAxisAngle(_ax.normalize(), angleBetween(_v1, _v2)));

  // 3. swing the elbow/knee toward the pole around the a->target axis
  const axis = _t.subVectors(target, _a).normalize();
  lower.getWorldPosition(_b);
  _v1.subVectors(_b, _a); _v1.addScaledVector(axis, -_v1.dot(axis));
  _v2.subVectors(pole, _a); _v2.addScaledVector(axis, -_v2.dot(axis));
  if (_v1.lengthSq() > 1e-10 && _v2.lengthSq() > 1e-10) {
    const s = Math.atan2(axis.dot(_ax.crossVectors(_v1, _v2)), _v1.dot(_v2));
    rotateWorld(upper, _q.setFromAxisAngle(axis, s));
  }
}

export async function loadRider(url) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  return new Rider(gltf);
}

export class Rider {
  constructor(gltf) {
    this.root = new THREE.Group();
    const scene = gltf.scene;
    this.model = scene;
    this.root.add(scene);
    this.bones = {};
    this.materials = {};
    scene.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;   // skinned bounds don't follow the pose
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) this.materials[m.name] = m;
      }
    });

    // Freeze the sitting clip as the base pose.
    const clip = gltf.animations.find(a => /Sitting/i.test(a.name)) || gltf.animations[0];
    this.mixer = new THREE.AnimationMixer(scene);
    if (clip) {
      const act = this.mixer.clipAction(clip);
      act.play();
      this.mixer.setTime(Math.min(clip.duration * 0.5, 1));
    }
    scene.updateMatrixWorld(true);

    // Normalise height to ~1.75 m standing (measured from the rest skeleton span)
    const head = this.bones.Head, foot = this.bones.FootL;
    const box = new THREE.Box3().setFromObject(scene);
    this.rawHeight = box.max.y - box.min.y;
    this.base = new Map();
    for (const b of Object.values(this.bones)) this.base.set(b, { q: b.quaternion.clone(), p: b.position.clone() });

    // Remember where each ankle sits relative to its lower leg, so the free
    // (IK-driven) foot bones can follow the solved shin.
    this.ankle = {};
    for (const s of ['L', 'R']) {
      const lower = this.bones[`LowerLeg${s}`], f = this.bones[`Foot${s}`];
      this.ankle[s] = lower.worldToLocal(f.getWorldPosition(new THREE.Vector3()));
    }
    this.wrist = {};
    for (const s of ['L', 'R']) this.wrist[s] = this.bones[`Palm${s}`];

    // Helmet (cosmetic colour) on the head bone
    this.helmetMat = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.35, metalness: 0.1 });
    this.helmet = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), this.helmetMat);
    this.helmet.castShadow = true;
    head.add(this.helmet);
    this.hasHelmetFit = false;
    this.scale = 0.4; // model units -> metres (about 1.8 m tall standing)
  }

  setColors({ outfit, helmet }) {
    if (outfit && this.materials.Shirt) this.materials.Shirt.color.set(outfit);
    if (helmet) this.helmetMat.color.set(helmet);
  }

  _fitHelmet() {
    // size the helmet in the head bone's (scaled) local space
    const head = this.bones.Head;
    head.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); head.getWorldScale(ws);
    const r = 0.135 / ws.x;
    this.helmet.scale.set(r, r * 1.0, r * 1.15);
    this.helmet.position.set(0, 0.11 / ws.y, 0.005 / ws.z);
    this.hasHelmetFit = true;
  }

  /**
   * Pose for this frame. hips, kneePole and elbowPole are in the parent's
   * local space; handL/handR/footL/footR are world positions (taken from grip,
   * peg and pedal markers on the bike). lean = torso pitch, bodyRoll = roll.
   */
  pose(parent, t) {
    // reset to the base pose
    for (const [b, s] of this.base) { b.quaternion.copy(s.q); b.position.copy(s.p); }
    const scene = this.model;

    // place the model so the hips sit on the seat
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    scene.scale.setScalar(this.scale || 1);
    parent.updateMatrixWorld(true);
    const hips = this.bones.Hips;
    const hp = hips.getWorldPosition(new THREE.Vector3());
    // move the model (in parent space) by the difference
    const local = parent.worldToLocal(hp.clone());
    scene.position.copy(t.hips).sub(local);
    scene.updateMatrixWorld(true);
    if (!this.hasHelmetFit) this._fitHelmet();

    // torso lean (forward pitch) and a little roll into turns
    const torso = this.bones.Abdomen || this.bones.Torso;
    const pw = new THREE.Quaternion(); parent.getWorldQuaternion(pw);
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(pw);
    const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(pw);
    rotateWorld(torso, _q.setFromAxisAngle(xAxis, t.lean || 0));
    if (t.bodyRoll) rotateWorld(torso, _q.setFromAxisAngle(zAxis, t.bodyRoll));

    const W = v => parent.localToWorld(v.clone());
    const elbowPole = W(t.elbowPole), kneePole = W(t.kneePole);
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 1 : -1;
      // arms: UpperArm -> LowerArm -> Palm
      const ua = this.bones[`UpperArm${s}`], la = this.bones[`LowerArm${s}`], palm = this.bones[`Palm${s}`];
      const hand = s === 'L' ? t.handL : t.handR;
      const ep = elbowPole.clone().add(new THREE.Vector3(side * 0.4, 0, 0).applyQuaternion(pw));
      solveTwoBone(ua, la, out => palm.getWorldPosition(out), hand, ep);
      // legs: UpperLeg -> LowerLeg -> (free) Foot
      const ul = this.bones[`UpperLeg${s}`], ll = this.bones[`LowerLeg${s}`], foot = this.bones[`Foot${s}`];
      const ank = this.ankle[s];
      const ft = s === 'L' ? t.footL : t.footR;
      const kp = kneePole.clone().add(new THREE.Vector3(side * 0.25, 0, 0).applyQuaternion(pw));
      solveTwoBone(ul, ll, out => out.copy(ank).applyMatrix4(ll.matrixWorld), ft, kp);
      // move the free foot bone to the solved ankle
      const ankleW = ank.clone().applyMatrix4(ll.matrixWorld);
      foot.position.copy(foot.parent.worldToLocal(ankleW));
      foot.updateMatrixWorld(true);
    }
  }
}
