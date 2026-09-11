import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '../vendor/three.module.js';
import { Simulation } from '../src/physics.js';
import { ExtraSimulation, EXTRA_LIMITS } from '../src/extras.js';

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const tower = { id: 'tower', min: v(10, 0, -30), max: v(20, 200, 30) };
const target = { point: v(10, 80, 0), buildingId: 'tower' };
const tick = (sim, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds * 120); i++) sim.step(1 / 120, input); };

test('absent extra controls produce exactly the original free-flight and cable trajectories', () => {
  for (const cable of [false, true]) {
    const base = new Simulation([tower], { damping: 0, airControl: 0 });
    const extra = new ExtraSimulation([tower], { damping: 0, airControl: 0 });
    for (const sim of [base, extra]) {
      sim.reset(v(-20, 70, 0), v(2, 1, 8));
      if (cable) assert.ok(sim.attach(target));
      tick(sim, 0.5);
    }
    assert.deepEqual(extra.position, base.position);
    assert.deepEqual(extra.velocity, base.velocity);
    assert.equal(extra.ropeLength, base.ropeLength);
  }
});

test('zip rejects invented, obstructed and distant surfaces without consuming charge or changing momentum', () => {
  const sim = new ExtraSimulation([tower]);
  sim.reset(v(0, 80, 0), v(3, 2, 1));
  for (const hit of [null, { point: v(15, 80, 0), buildingId: 'tower' }, { point: v(20, 80, 0), buildingId: 'tower' }, { point: v(10, 120, 0), buildingId: 'tower' }, { ...target, buildingId: 'sky' }]) assert.equal(sim.startZip(hit), false);
  assert.equal(sim.zipReady, true);
  assert.deepEqual(sim.velocity, v(3, 2, 1));
  assert.ok(sim.startZip(target));
  assert.deepEqual(sim.velocity, v(3, 2, 1));
  assert.equal(sim.anchor, null);
});

test('zip adds bounded acceleration for only 0.35 seconds, preserves transverse momentum and cannot recharge in air', () => {
  const sim = new ExtraSimulation([tower], { gravity: 0, damping: 0, airControl: 0 });
  sim.reset(v(-20, 80, 0), v(0, 0, 3));
  assert.ok(sim.startZip(target));
  let poweredDelta = 0;
  for (let i = 0; i < 120 * 3; i++) {
    const previous = sim.velocity.clone();
    sim.step(1 / 120);
    const delta = sim.velocity.distanceTo(previous);
    if (i < 42) {
      assert.ok(delta <= EXTRA_LIMITS.zipAcceleration / 120 + 1e-8);
      poweredDelta += delta;
    } else if (!sim.wallNormal) assert.ok(delta < 1e-8);
  }
  assert.ok(poweredDelta <= 17.5 + 1e-7);
  assert.ok(sim.velocity.z > 2, 'Zip must retain transverse momentum');
  assert.equal(sim.zipRemaining, 0);
  assert.equal(sim.zipTarget, null);
  assert.equal(sim.zipCooldown, 0);
  assert.equal(sim.zipReady, false);
  assert.equal(sim.startZip(target), false);
  sim.position.set(-20, 1, 0);
  sim.velocity.set(0, -1, 0);
  tick(sim, 1 / 120);
  assert.ok(sim.grounded && sim.zipReady);
});

test('zip approach limit adds no impulse above 32 m/s and swept collision stops the motor at the real wall', () => {
  const sim = new ExtraSimulation([tower], { gravity: 0, damping: 0, airControl: 0 });
  sim.reset(v(0, 80, 0), v(40, 0, 0));
  assert.ok(sim.startZip(target));
  sim.step(1 / 120);
  assert.equal(sim.velocity.x, 40);
  tick(sim, 0.3);
  assert.ok(sim.position.x <= 9.55001);
  assert.equal(sim.velocity.x, 0);
  assert.equal(sim.zipTarget, null);
  sim.reset(v(0, 80, 0), v(2000, 0, 0));
  assert.ok(sim.startZip(target));
  sim.step(1 / 120);
  assert.ok(sim.wallNormal && sim.position.x <= 9.55001);
  assert.equal(sim.zipTarget, null, 'An impact inside one fixed step must stop the motor');
});

test('wall controls cannot support a character in empty space or while a cable is attached', () => {
  const free = new ExtraSimulation([tower], { damping: 0 });
  const base = new Simulation([tower], { damping: 0 });
  for (const sim of [free, base]) { sim.reset(v(0, 80, 0)); tick(sim, 0.25, { wall: true, climb: 1 }); }
  assert.deepEqual(free.position, base.position);
  assert.equal(free.wallActive, false);
  free.reset(v(9.5, 80, 0));
  assert.ok(free.attach({ point: v(10, 100, 0), buildingId: 'tower' }));
  tick(free, 0.1, { wall: true, climb: 1 });
  assert.equal(free.wallActive, false);
  assert.equal(free.wallStamina, EXTRA_LIMITS.wallDuration);
});

test('actual walls allow capped climb and lateral run only for the finite stamina period', () => {
  const sim = new ExtraSimulation([tower], { damping: 0, airControl: 0 });
  sim.reset(v(9.5, 80, 0));
  for (let i = 0; i < 180; i++) {
    sim.step(1 / 120, { wall: true, climb: 1, move: v(0, 0, 1) });
    assert.ok(sim.position.x < tower.min.x - 0.45);
    assert.ok(sim.velocity.y <= 5 + 1e-8);
    assert.ok(sim.velocity.z <= 10 + 1e-8);
  }
  assert.equal(sim.wallStamina, 0);
  assert.ok(sim.position.y > 85);
  tick(sim, 0.5, { wall: true, climb: 1 });
  assert.equal(sim.wallActive, false);
  assert.ok(sim.velocity.y < 0);
  assert.equal(sim.wallStamina, 0);
});

test('wall jump applies one bounded outward impulse and consumes all airborne wall assistance', () => {
  const sim = new ExtraSimulation([tower], { gravity: 0, damping: 0, airControl: 0 });
  sim.reset(v(9.5, 80, 0));
  sim.step(1 / 120, { wall: true, jump: true });
  assert.equal(sim.velocity.x, -6);
  assert.equal(sim.velocity.y, 10);
  assert.equal(sim.wallStamina, 0);
  const launch = sim.velocity.clone();
  tick(sim, 0.1, { wall: true, jump: true });
  assert.deepEqual(sim.velocity, launch);
});
