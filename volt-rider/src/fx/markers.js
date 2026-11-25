// Objective markers (light beam + floating icon + ground ring) and the
// navigation arrow that hovers ahead of the rider. Marker meshes are pooled.
import * as THREE from '../../vendor/three.module.min.js';
import { Pool } from '../core/pool.js';

const COLORS = { pickup: '#ffb020', drop: '#22d3ee' };

export class Markers {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.t = 0;
    const beamGeo = new THREE.CylinderGeometry(1.4, 1.4, 60, 16, 1, true);
    beamGeo.translate(0, 30, 0);
    const ringGeo = new THREE.RingGeometry(3.6, 4.4, 32); ringGeo.rotateX(-Math.PI / 2);
    const boxGeo = new THREE.BoxGeometry(1, 0.8, 1);
    this.pool = new Pool(() => {
      const g = new THREE.Group();
      const beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
      const iconMat = new THREE.MeshLambertMaterial({ emissiveIntensity: 0.6 });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const icon = new THREE.Mesh(boxGeo, iconMat);
      icon.position.y = 2.4;
      g.add(beam, ring, icon);
      g.userData = { beam, ring, icon };
      scene.add(g);
      return g;
    }, { reset: g => { g.visible = false; } });
    this.active = null;

    // nav arrow
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.9); shape.lineTo(0.55, 0); shape.lineTo(0.2, 0); shape.lineTo(0.2, -0.6);
    shape.lineTo(-0.2, -0.6); shape.lineTo(-0.2, 0); shape.lineTo(-0.55, 0); shape.closePath();
    const ag = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    ag.rotateX(Math.PI / 2);   // lie flat, tip pointing +Z
    ag.translate(0, 0.06, 0);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.92, depthTest: false });
    this.arrow = new THREE.Mesh(ag, this.arrowMat);
    this.arrow.renderOrder = 10;
    this.arrow.visible = false;
    scene.add(this.arrow);
  }

  show(kind, x, z) {
    if (this.active) this.pool.release(this.active);
    const g = this.pool.acquire();
    const c = new THREE.Color(COLORS[kind] || '#ffffff');
    const { beam, ring, icon } = g.userData;
    beam.material.color.copy(c);
    ring.material.color.copy(c);
    icon.material.color.copy(c);
    icon.material.emissive.copy(c).multiplyScalar(0.4);
    icon.scale.set(1, kind === 'drop' ? 0.3 : 1, 1);
    g.position.set(x, this.world.groundAt(x, z).y + 0.03, z);
    g.visible = true;
    this.active = g;
    this.kind = kind;
    this.target = { x, z };
    this.arrowMat.color.copy(c);
    this.arrow.visible = true;
  }

  hide() {
    if (this.active) this.pool.release(this.active);
    this.active = null;
    this.target = null;
    this.arrow.visible = false;
  }

  update(dt, bike) {
    this.t += dt;
    if (!this.active) return;
    const { icon, ring, beam } = this.active.userData;
    icon.rotation.y += dt * 1.8;
    icon.position.y = 2.4 + Math.sin(this.t * 2.5) * 0.25;
    const s = 1 + Math.sin(this.t * 4) * 0.06;
    ring.scale.set(s, 1, s);
    const d = Math.hypot(bike.x - this.target.x, bike.z - this.target.z);
    beam.material.opacity = Math.min(0.35, 0.08 + d / 300);

    // arrow above the bike pointing at the target
    const ang = Math.atan2(this.target.x - bike.x, this.target.z - bike.z);
    this.arrow.position.set(bike.x + Math.sin(bike.yaw) * 2.6, bike.y + 2.2, bike.z + Math.cos(bike.yaw) * 2.6);
    this.arrow.rotation.set(0, ang, 0);
    const sc = d < 12 ? 0.6 : 1;
    this.arrow.scale.setScalar(sc);
    this.arrow.visible = d > 6;
  }
}
