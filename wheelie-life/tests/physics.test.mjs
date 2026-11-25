// Run with: node --test wheelie-life/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBikeState, createBattery, computeBikeParams, stepBike } from '../src/bike/bikePhysics.js';
import { PHYS } from '../src/config.js';

const DT = 1 / 120;

function flatEnv(extra = {}) {
  return {
    heightAt: () => 0,
    groundAt: () => ({ y: 0, surface: 'asphalt' }),
    collide: () => null,
    wet: false, windX: 0, windZ: 0,
    ...extra,
  };
}

function slopeEnv(grade) {
  // terrain rising along +Z (the bike's forward at yaw 0)
  const h = (x, z) => grade * z;
  return flatEnv({ heightAt: h, groundAt: (x, z) => ({ y: h(x, z), surface: 'asphalt' }) });
}

function ride(seconds, input, { env = flatEnv(), params = computeBikeParams(), bat = createBattery(), s = createBikeState() } = {}) {
  const events = [];
  for (let t = 0; t < seconds; t += DT) stepBike(s, { assist: 1, ...input }, params, env, bat, DT, events);
  return { s, bat, events };
}

test('assist levels have increasing top speed and battery drain', () => {
  const res = [0, 1, 2].map(assist => ride(30, { throttle: true, assist }));
  const speeds = res.map(r => r.s.speed);
  const used = res.map(r => 100 - r.bat.charge);
  assert.ok(speeds[0] < speeds[1] && speeds[1] < speeds[2], `speeds ${speeds}`);
  assert.ok(used[0] < used[1] && used[1] < used[2], `drain ${used}`);
  // Eco ~25 km/h, Turbo ~40+ km/h
  assert.ok(speeds[0] * 3.6 > 20 && speeds[0] * 3.6 < 28, `eco ${speeds[0] * 3.6}`);
  assert.ok(speeds[2] * 3.6 > 38, `turbo ${speeds[2] * 3.6}`);
});

test('an empty battery leaves only slow leg power', () => {
  const bat = createBattery(); bat.charge = 0;
  const { s } = ride(30, { throttle: true, assist: 2 }, { bat });
  const kmh = s.speed * 3.6;
  assert.ok(kmh > 10 && kmh < 18, `human-only speed ${kmh}`);
  assert.equal(bat.charge, 0);
});

test('braking regenerates a little charge and stops the bike', () => {
  const bat = createBattery();
  const s = createBikeState();
  s.speed = 10;
  bat.charge = 50;
  ride(4, { brake: true }, { s, bat });
  assert.equal(s.speed, 0);
  assert.ok(bat.charge > 50 && bat.charge < 55, `charge ${bat.charge}`);
});

test('coasting downhill regenerates charge and gains speed', () => {
  const bat = createBattery(); bat.charge = 40;
  const s = createBikeState();
  s.speed = 5;
  ride(10, {}, { env: slopeEnv(-0.08), s, bat });
  assert.ok(s.speed > 8, `speed ${s.speed}`);
  assert.ok(bat.charge > 41, `charge ${bat.charge}`);
});

test('tucking is faster than sitting up on a descent', () => {
  const a = ride(20, {}, { env: slopeEnv(-0.1) }).s.speed;
  const b = ride(20, { tuck: true }, { env: slopeEnv(-0.1) }).s.speed;
  assert.ok(b > a + 0.5, `tuck ${b} vs upright ${a}`);
});

test('Tour can still climb a 10% grade, leg power alone crawls', () => {
  const tour = ride(20, { throttle: true, assist: 1 }, { env: slopeEnv(0.1) }).s.speed;
  const bat = createBattery(); bat.charge = 0;
  const legs = ride(20, { throttle: true, assist: 1 }, { env: slopeEnv(0.1), bat }).s.speed;
  assert.ok(tour * 3.6 > 8, `tour climb ${tour * 3.6}`);
  assert.ok(legs * 3.6 < 6 && legs > 0, `legs climb ${legs * 3.6}`);
});

test('charging station refills while stopped', () => {
  const bat = createBattery(); bat.charge = 10;
  ride(5, { brake: true }, { bat, env: flatEnv({ chargerAt: () => true }) });
  assert.ok(bat.charge >= 10 + PHYS.chargeRate * 4.5, `charge ${bat.charge}`);
});

test('steering right turns toward -X and leans right', () => {
  const s = createBikeState(); s.speed = 6;
  ride(1, { throttle: true, steer: 1 }, { s });
  assert.ok(s.x < -0.5, `x ${s.x}`);
  assert.ok(s.lean > 0.1, `lean ${s.lean}`);
});

test('wet roads reduce cornering (wider turn)', () => {
  const dry = createBikeState(); dry.speed = 8;
  const wet = createBikeState(); wet.speed = 8;
  ride(1.5, { throttle: true, steer: 1 }, { s: dry });
  ride(1.5, { throttle: true, steer: 1 }, { s: wet, env: flatEnv({ wet: true }) });
  assert.ok(Math.abs(wet.yaw) < Math.abs(dry.yaw), `wet ${wet.yaw} dry ${dry.yaw}`);
});

test('headwind slows the bike, tailwind helps', () => {
  const head = ride(20, { throttle: true, assist: 0 }, { env: flatEnv({ windZ: -6 }) }).s.speed;
  const tail = ride(20, { throttle: true, assist: 0 }, { env: flatEnv({ windZ: 6 }) }).s.speed;
  const calm = ride(20, { throttle: true, assist: 0 }).s.speed;
  assert.ok(head < calm && calm < tail, `${head} ${calm} ${tail}`);
});

test('hitting a wall fast is a crash, a glancing hit is a scrape', () => {
  // wall across +Z at z = 2
  const wall = flatEnv({ collide: (x, z, r) => (z + r > 2 ? { depth: z + r - 2, nx: 0, nz: -1 } : null) });
  const s = createBikeState(); s.speed = 8;
  const { events } = ride(1, { throttle: true }, { s, env: wall });
  assert.ok(events.some(e => e.type === 'crash'));
  assert.ok(s.stun > 0 || s.speed < 3);

  const g = createBikeState(0, 0, 1.3); g.speed = 6; // ~16° to the wall
  const r2 = ride(1, { throttle: true }, { s: g, env: wall });
  assert.ok(!r2.events.some(e => e.type === 'crash'), 'glancing hit should not crash');
});

test('bunny hop leaves the ground and lands', () => {
  const s = createBikeState(); s.speed = 5;
  const events = [];
  const p = computeBikeParams(), bat = createBattery(), env = flatEnv();
  stepBike(s, { hop: true, assist: 1 }, p, env, bat, DT, events);
  let maxAir = 0;
  for (let i = 0; i < 240; i++) { stepBike(s, { assist: 1 }, p, env, bat, DT, events); maxAir = Math.max(maxAir, s.y); }
  assert.ok(maxAir > 0.7, `hop height ${maxAir}`);
  assert.ok(events.some(e => e.type === 'land'));
  assert.ok(s.grounded);
});

test('upgrades improve capacity, speed and brakes', () => {
  const base = computeBikeParams({});
  const up = computeBikeParams({ battery: 5, motor: 5, brakes: 5, tires: 5, suspension: 5 });
  assert.ok(up.capMult > base.capMult);
  assert.ok(up.motorMult > base.motorMult && up.vmaxAdd > 0);
  assert.ok(up.brakeForce > base.brakeForce && up.regenMult > base.regenMult);
  assert.ok(up.gripMult > base.gripMult && up.rollMult < base.rollMult);
  assert.ok(up.damageMult < base.damageMult);
  assert.equal(createBattery(up.capMult).capacity, 200);
});

test('holding wheelie lifts the front, pedals, and pays out distance when it drops', () => {
  const s = createBikeState(); s.speed = 6;
  const { events } = ride(3, { wheelie: true }, { s });
  assert.ok(s.wheelie > 0.3 && s.inWheelie, `angle ${s.wheelie}`);
  assert.ok(s.pedaling && s.speed > 5, 'wheelie button also pedals');
  const after = ride(1, {}, { s });
  assert.ok(!s.inWheelie && s.wheelie < 0.12);
  const ev = after.events.find(e => e.type === 'wheelie');
  assert.ok(ev && ev.dist > 10, `dist ${ev && ev.dist}`);
  assert.ok(!events.some(e => e.type === 'wheelie'), 'no payout while still up');
});

test('no wheelie when stopped or braking, and a crash cancels the bonus', () => {
  const still = ride(2, { wheelie: true, brake: true }).s;
  assert.ok(still.wheelie < 0.05);
  const wall = flatEnv({ collide: (x, z, r) => (z + r > 12 ? { depth: z + r - 12, nx: 0, nz: -1 } : null) });
  const s = createBikeState(); s.speed = 7;
  const { events } = ride(4, { wheelie: true }, { s, env: wall });
  assert.ok(events.some(e => e.type === 'crash'));
  assert.ok(!events.some(e => e.type === 'wheelie'), 'crashed wheelie pays nothing');
});

test('the e-moto is faster and thirstier than the city e-bike, and barely moves on leg power', () => {
  const city = computeBikeParams({}, 'city'), moto = computeBikeParams({}, 'emoto');
  const c = ride(30, { throttle: true, assist: 1 }, { params: city });
  const m = ride(30, { throttle: true, assist: 1 }, { params: moto });
  assert.ok(m.s.speed > c.s.speed + 2, `moto ${m.s.speed * 3.6} vs city ${c.s.speed * 3.6} km/h`);
  assert.ok(100 - m.bat.charge > 100 - c.bat.charge, 'moto drains more');
  const flat = createBattery(); flat.charge = 0;
  const paddle = ride(20, { throttle: true }, { params: moto, bat: flat }).s.speed;
  assert.ok(paddle * 3.6 < 12, `paddling ${paddle * 3.6}`);
  assert.ok(moto.starScale > 1);
});
