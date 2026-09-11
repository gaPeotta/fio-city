import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '../vendor/three.module.js';
import { Simulation } from '../src/physics.js';

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const box = (id, min, max) => ({ id, min: v(...min), max: v(...max) });

const simulate = (sim, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) sim.step(1 / 120, input);
};

test('diving reduces vertical air drag without adding horizontal impulse', () => {
  const normal = new Simulation([], { damping: 0, airControl: 0 });
  const diving = new Simulation([], { damping: 0, airControl: 0 });
  normal.reset(v(0, 120, 0), v(10, 0, -3));
  diving.reset(normal.position, normal.velocity);

  simulate(normal, 2);
  simulate(diving, 2, { dive: true });

  assert.ok(Math.abs(diving.velocity.y) > Math.abs(normal.velocity.y) + 2);
  assert.equal(diving.velocity.x, 10);
  assert.equal(diving.velocity.z, -3);
});

test('dive posture does not affect a tethered swing', () => {
  const beam = box('beam', [-2, 100, -2], [2, 102, 2]);
  const normal = new Simulation([beam], { damping: 0, airControl: 0 });
  const diving = new Simulation([beam], { damping: 0, airControl: 0 });
  normal.reset(v(0, 60, 30), v(20, 0, 0));
  diving.reset(normal.position, normal.velocity);
  assert.ok(normal.attach({ point: v(0, 100, 0), buildingId: 'beam' }));
  assert.ok(diving.attach({ point: v(0, 100, 0), buildingId: 'beam' }));

  simulate(normal, 1);
  simulate(diving, 1, { dive: true });

  assert.ok(diving.position.distanceTo(normal.position) < 1e-9);
  assert.ok(diving.velocity.distanceTo(normal.velocity) < 1e-9);
});
