// Arcade e-bike physics. Pure math, no rendering imports, so it can be unit
// tested in Node and reused by every game mode.
//
// Coordinate frame: Y up, heading `yaw` rotates +Z toward +X, so the forward
// vector is (sin yaw, cos yaw). Steering right (+1) turns toward -X.

import { ASSIST_LEVELS, PHYS, SURFACES, FRAMES, upgradeEffects } from '../config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createBattery(capMult = 1) {
  const capacity = 100 * capMult;
  return { capacity, charge: capacity, get pct() { return this.charge / this.capacity; } };
}

export function computeBikeParams(upgrades = {}, frameId = 'city') {
  const fr = FRAMES.find(f => f.id === frameId) || FRAMES[0];
  const u = upgradeEffects(upgrades);
  return {
    mass: fr.mass,
    cda: fr.cda,
    turnMult: fr.turn,
    gripMult: fr.grip * u.gripMult,
    rollMult: fr.roll * u.rollMult,
    motorMult: u.motorMult,
    vmaxAdd: u.vmaxAdd,
    brakeForce: 620 * u.brakeMult,
    regenMult: u.regenMult,
    damageMult: u.damageMult,
    suspDamp: u.suspDamp,
    capMult: u.capMult,
  };
}

export function createBikeState(x = 0, z = 0, yaw = 0) {
  return {
    x, z, y: 0, groundY: 0, yaw, velYaw: yaw, speed: 0, vy: 0, yawRate: 0,
    lean: 0, pitch: 0, grounded: true, airTime: 0,
    susp: 0, suspVel: 0, crank: 0, wheel: 0, steerVis: 0,
    surface: 'asphalt', prevGY: null, stun: 0, tuck: false,
    braking: false, pedaling: false, motorLoad: 0, motorOn: false,
    regen: 0, charging: false, slope: 0, wind: 0,
  };
}

/**
 * Advance the bike one fixed step.
 * @param s      bike state (mutated)
 * @param input  { steer -1..1, throttle bool, brake bool, tuck bool, hop bool, assist index }
 * @param p      params from computeBikeParams
 * @param env    { heightAt(x,z), groundAt(x,z) -> {y, surface}, collide(x,z,r) -> {depth,nx,nz}|null,
 *                 wet bool, windX, windZ, chargerAt(x,z) -> bool }
 * @param bat    battery from createBattery
 * @param events array that receives {type, strength} gameplay events
 */
export function stepBike(s, input, p, env, bat, dt, events) {
  const g = PHYS.g;
  const v = s.speed;
  const surf = SURFACES[s.surface] || SURFACES.asphalt;
  const grip = surf.grip * p.gripMult * (env.wet ? PHYS.wetGrip : 1);
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const assist = ASSIST_LEVELS[input.assist] || ASSIST_LEVELS[1];

  if (s.stun > 0) s.stun -= dt;
  s.tuck = !!input.tuck && s.grounded && s.stun <= 0;

  // ---- slope along heading (terrain only, curbs are handled as bumps)
  const hF = env.heightAt(s.x + fx * 0.55, s.z + fz * 0.55);
  const hR = env.heightAt(s.x - fx * 0.55, s.z - fz * 0.55);
  const slope = (hF - hR) / 1.1;
  s.slope = slope;

  // ---- propulsion
  const pedaling = !!input.throttle && s.stun <= 0 && !s.tuck;
  s.pedaling = pedaling;
  const humanF = pedaling ? PHYS.humanForce * clamp(1 - v / PHYS.humanVmax, 0, 1) : 0;
  let motorF = 0;
  const motorPeak = PHYS.motorForce * assist.force * p.motorMult;
  if (pedaling && bat.charge > 0) {
    const vmax = assist.vmax + p.vmaxAdd;
    const taper = clamp((vmax - v) / (vmax * 0.18), 0, 1);
    motorF = motorPeak * taper;
    const load = motorPeak > 0 ? motorF / motorPeak : 0;
    bat.charge = Math.max(0, bat.charge - assist.drain * (0.35 + 0.65 * load) * dt);
  }
  s.motorOn = motorF > 0;
  s.motorLoad = motorF / (PHYS.motorForce * 1.6 * p.motorMult);

  // ---- resistive forces
  const windAlong = (env.windX || 0) * fx + (env.windZ || 0) * fz; // + = tailwind
  s.wind = windAlong;
  const vRel = v - windAlong;
  const cda = p.cda * (s.tuck ? 0.6 : 1);
  const drag = 0.5 * PHYS.airDensity * cda * vRel * Math.abs(vRel);
  const roll = v > 0.05 ? surf.roll * p.rollMult * p.mass * g : 0;
  const gravF = s.grounded ? -p.mass * g * slope / Math.sqrt(1 + slope * slope) : 0;
  s.braking = !!input.brake;
  const brakeF = input.brake && v > 0 ? Math.min(p.brakeForce, grip * p.mass * g * 0.9) : 0;

  let force;
  if (s.grounded) force = humanF + motorF + gravF - drag - roll - brakeF;
  else force = -drag;
  let nv = v + (force / p.mass) * dt;
  if (input.brake && nv < 0.15) nv = 0;
  s.speed = clamp(nv, 0, PHYS.maxSpeed);

  // ---- regeneration
  let regen = 0;
  if (s.grounded && !pedaling && slope < -0.015 && s.speed > 3) {
    regen += PHYS.coastRegen * Math.min(1, -slope / 0.08) * p.regenMult;
  }
  if (input.brake && s.speed > 1.5) {
    regen += PHYS.brakeRegen * Math.min(1, s.speed / 10) * p.regenMult;
  }
  s.charging = false;
  if (env.chargerAt && s.speed < 2.5 && env.chargerAt(s.x, s.z)) {
    regen += PHYS.chargeRate;
    s.charging = true;
  }
  s.regen = regen;
  if (regen > 0) bat.charge = Math.min(bat.capacity, bat.charge + regen * dt);

  // ---- steering
  const vEff = Math.max(s.speed, 1.5);
  let maxYaw = Math.min(PHYS.maxYawLow * p.turnMult, (PHYS.latAcc * grip) / vEff);
  if (!s.grounded) maxYaw *= 0.35;
  if (s.stun > 0) maxYaw *= 0.3;
  const target = -clamp(input.steer || 0, -1, 1) * maxYaw;
  const resp = PHYS.steerResp * (0.4 + 0.6 * grip);
  s.yawRate += (target - s.yawRate) * Math.min(1, resp * dt);
  const yawEff = s.yawRate * Math.min(1, s.speed / 1.2);
  s.yaw = wrapAngle(s.yaw + yawEff * dt);

  // velocity direction lags heading on low grip -> slides on wet roads/grass
  const slip = wrapAngle(s.yaw - s.velYaw);
  s.velYaw = wrapAngle(s.velYaw + slip * Math.min(1, PHYS.tractionRate * grip * dt));
  s.speed *= 1 - Math.min(0.5, Math.abs(slip) * 0.8 * dt);

  // ---- integrate position
  const px = s.x, pz = s.z;
  s.x += Math.sin(s.velYaw) * s.speed * dt;
  s.z += Math.cos(s.velYaw) * s.speed * dt;

  // ---- static collisions
  const hit = env.collide ? env.collide(s.x, s.z, 0.45) : null;
  if (hit && hit.depth > 0) {
    s.x += hit.nx * hit.depth;
    s.z += hit.nz * hit.depth;
    const dx = Math.sin(s.velYaw), dz = Math.cos(s.velYaw);
    const dn = dx * hit.nx + dz * hit.nz;
    const vn = -dn * s.speed;
    if (vn > PHYS.crashSpeed) {
      events.push({ type: 'crash', strength: vn });
      s.speed *= 0.15;
      s.stun = 0.8;
      s.yawRate = 0;
      s.suspVel -= 1.2;
    } else if (vn > 0) {
      // slide along the wall
      const tx = dx - hit.nx * dn, tz = dz - hit.nz * dn;
      if (tx * tx + tz * tz > 1e-4) {
        const ny = Math.atan2(tx, tz);
        s.velYaw = ny;
        s.yaw = wrapAngle(s.yaw + wrapAngle(ny - s.yaw) * 0.5);
      }
      s.speed *= 1 - 0.6 * (vn / PHYS.crashSpeed);
      if (vn > 1.2) events.push({ type: 'scrape', strength: vn });
    }
  }
  if (env.bounds) {
    const b = env.bounds;
    if (s.x < b.minX) { s.x = b.minX; s.speed *= 0.5; }
    if (s.x > b.maxX) { s.x = b.maxX; s.speed *= 0.5; }
    if (s.z < b.minZ) { s.z = b.minZ; s.speed *= 0.5; }
    if (s.z > b.maxZ) { s.z = b.maxZ; s.speed *= 0.5; }
  }

  // ---- vertical: ground follow, hops, landings, curbs
  const ground = env.groundAt(s.x, s.z);
  const gY = ground.y;
  s.surface = ground.surface;
  s.groundY = gY;
  if (s.prevGY === null) { s.prevGY = gY; s.y = gY; }

  if (input.hop && s.grounded && s.stun <= 0) {
    s.vy = PHYS.hopVelocity + Math.max(0, (gY - s.prevGY) / dt);
    s.grounded = false;
    s.airTime = 0;
    s.suspVel += 1.4;
    events.push({ type: 'hop', strength: 1 });
  }

  if (s.grounded) {
    const dy = gY - s.y;
    if (dy > 0.06) {
      // stepped up a curb
      events.push({ type: 'bump', strength: Math.min(1, s.speed / 9) * (dy / 0.14) });
      s.suspVel -= 0.6 + s.speed * 0.12;
    } else if (dy < -0.06) {
      s.suspVel -= 0.3 + s.speed * 0.05;
    }
    s.y = gY;
    s.vy = 0;
  } else {
    s.airTime += dt;
    s.vy -= g * dt;
    s.y += s.vy * dt;
    if (s.y <= gY) {
      const impact = -s.vy;
      s.y = gY;
      s.vy = 0;
      s.grounded = true;
      s.suspVel -= impact * 0.45;
      events.push({ type: 'land', strength: impact, air: s.airTime });
    }
  }
  s.prevGY = gY;

  // potholes and other spot bumps
  if (s.grounded && env.bumpAt) {
    const b = env.bumpAt(s.x, s.z, px, pz);
    if (b) {
      s.suspVel -= 0.8 + s.speed * 0.15;
      events.push({ type: 'pothole', strength: Math.min(1.5, s.speed / 8) });
    }
  }

  // ---- visual state
  const k = 180, c = 14 * p.suspDamp;
  s.suspVel += (-k * s.susp - c * s.suspVel) * dt;
  s.susp = clamp(s.susp + s.suspVel * dt, -0.13, 0.08);

  const leanTarget = clamp(-Math.atan((s.speed * yawEff) / g), -0.75, 0.75);
  s.lean += (leanTarget - s.lean) * Math.min(1, 8 * dt);
  const gF = env.groundAt(s.x + fx * 0.55, s.z + fz * 0.55).y;
  const gR = env.groundAt(s.x - fx * 0.55, s.z - fz * 0.55).y;
  const pitchT = s.grounded ? -Math.atan2(gF - gR, 1.1) : s.pitch * 0.98;
  s.pitch += (pitchT - s.pitch) * Math.min(1, 14 * dt);
  s.wheel += (s.speed / 0.35) * dt;
  if (pedaling) s.crank += Math.max(3, s.speed * 1.1) * dt;
  s.steerVis += ((input.steer || 0) * 0.45 * (1 - Math.min(0.75, s.speed / 14)) - s.steerVis) * Math.min(1, 12 * dt);
}
