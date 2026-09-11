import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '../vendor/three.module.js';
import { Simulation, raycastBuildings, selectAnchor } from '../src/physics.js';

const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const box = (id, min, max) => ({ id, min: v(...min), max: v(...max) });
const tower = box('tower', [-6, 0, -6], [6, 100, 6]);
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
const simulate = (sim, seconds, input = {}, fps = 120) => {
  for (let i = 0; i < Math.round(seconds * fps); i++) sim.step(1 / fps, input);
};
const suspended = (position = v(6, 60, 30), velocity = v(15, 0, 0)) => {
  const sim = new Simulation([tower], { damping: 0, airControl: 0, fallDrag: 0 });
  sim.reset(position, velocity);
  assert.ok(sim.attach({ point: v(0, 90, 6), buildingId: 'tower' }));
  return sim;
};

test('raycast returns real nearest surface and face normal; sky has no anchor', () => {
  const hit = raycastBuildings(v(0, 40, 30), v(0, 0, -1), 115, [tower]);
  assert.equal(hit.buildingId, 'tower');
  close(hit.point.z, 6);
  assert.deepEqual(hit.normal.toArray(), [0, 0, 1]);
  assert.equal(selectAnchor(v(0, 120, 30), v(0, 1, 0), [tower]), null);
  assert.equal(raycastBuildings(v(0, 40, 30), v(), 115, [tower]), null);
});

test('attach rejects invented points, out-of-range surfaces and occluded back faces', () => {
  const sim = new Simulation([tower]);
  sim.reset(v(0, 40, 30));
  assert.equal(sim.attach({ point: v(1, 40, 1), buildingId: 'tower' }), false);
  assert.equal(sim.attach({ point: v(0, 40, 6), buildingId: 'fake' }), false);
  assert.equal(sim.attach({ point: v(0, 40, -6), buildingId: 'tower' }), false);
  assert.equal(sim.attach({ point: v(0, 40, 6), buildingId: 'tower' }), true);
  sim.reset(v(0, 40, 180));
  assert.equal(sim.attach({ point: v(0, 40, 6), buildingId: 'tower' }), false);
});

test('another building blocks attachment and aim assist remains on actual geometry', () => {
  const blocker = box('blocker', [-4, 0, 14], [4, 60, 19]);
  const sim = new Simulation([tower, blocker]);
  sim.reset(v(0, 40, 30));
  assert.equal(sim.attach({ point: v(0, 40, 6), buildingId: 'tower' }), false);
  const anchor = selectAnchor(sim.position, v(0.15, 0.15, -1), [tower, blocker]);
  assert.ok(anchor);
  assert.equal(sim.attach(anchor), true);
});

test('a slack cable never pushes and produces the same free flight as no cable', () => {
  const connected = suspended(v(6, 60, 30), v(0, 5, 0));
  connected.ropeLength = 80;
  const free = new Simulation([tower], { damping: 0, airControl: 0, fallDrag: 0 });
  free.reset(connected.position, connected.velocity);
  simulate(connected, 0.3);
  simulate(free, 0.3);
  assert.ok(connected.position.distanceTo(free.position) < 1e-9);
  assert.ok(connected.velocity.distanceTo(free.velocity) < 1e-9);
  close(connected.tension, 0);
});

test('releasing preserves every velocity component exactly and follows ballistic flight', () => {
  const sim = suspended();
  simulate(sim, 0.5);
  const velocity = sim.velocity.clone();
  const position = sim.position.clone();
  sim.release();
  assert.deepEqual(sim.velocity.toArray(), velocity.toArray());
  simulate(sim, 0.2);
  const expected = position.addScaledVector(velocity, 0.2).add(v(0, -0.5 * 24 * 0.2 ** 2, 0));
  assert.ok(sim.position.distanceTo(expected) < 1e-7);
});

test('taut pendulum obeys maximum length and conserves energy without damping/control', () => {
  // Underside of an overhead test beam allows a complete unobstructed pendulum arc.
  const beam = box('beam', [-2, 100, -2], [2, 102, 2]);
  const sim = new Simulation([beam], { damping: 0, airControl: 0, fallDrag: 0 });
  sim.reset(v(0, 60, 30), v(20, 0, 0));
  assert.ok(sim.attach({ point: v(0, 100, 0), buildingId: 'beam' }));
  const energy = () => sim.velocity.lengthSq() / 2 + 24 * (sim.position.y - 50);
  const initial = energy();
  let largestError = 0;
  for (let i = 0; i < 120 * 30; i++) {
    sim.step(1 / 120);
    assert.ok(sim.anchor, 'cable unexpectedly released');
    assert.ok(sim.position.distanceTo(sim.anchor.point) <= sim.ropeLength + 0.002);
    largestError = Math.max(largestError, Math.abs(energy() - initial));
  }
  assert.ok(largestError / initial < 0.001, `energy drift ${(largestError / initial * 100).toFixed(3)}%`);
});

test('releasing at the bottom gives the maximum horizontal launch of the downhill arc', () => {
  const beam = box('beam', [-2, 100, -2], [2, 102, 2]);
  const sim = new Simulation([beam], { damping: 0, airControl: 0, fallDrag: 0 });
  sim.reset(v(30, 60, 0));
  assert.ok(sim.attach({ point: v(0, 100, 0), buildingId: 'beam' }));
  let previousHorizontal = 0;
  for (let frame = 0; frame < 120 * 5 && sim.position.x > 0; frame++) {
    previousHorizontal = Math.abs(sim.velocity.x);
    sim.step(1 / 120);
  }
  assert.ok(sim.position.x <= 0, 'pendulum did not reach the bottom within five seconds');
  assert.ok(Math.abs(sim.velocity.x) > 21);
  assert.ok(Math.abs(sim.velocity.x) >= previousHorizontal - 0.01);
  assert.ok(Math.abs(sim.velocity.y) < 0.15);
  const outgoing = sim.velocity.clone();
  sim.release();
  assert.deepEqual(sim.velocity.toArray(), outgoing.toArray());
});

test('static hanging tension equals weight and shortening does controlled winch work', () => {
  const beam = box('beam', [-2, 100, -2], [2, 102, 2]);
  const sim = new Simulation([beam], { damping: 0, airControl: 0, fallDrag: 0 });
  sim.reset(v(0, 50, 0));
  assert.ok(sim.attach({ point: v(0, 100, 0), buildingId: 'beam' }));
  simulate(sim, 0.2);
  close(sim.position.y, 50, 1e-7);
  close(sim.tension, 75 * 24, 0.001);
  simulate(sim, 0.5, { reel: -1 });
  close(sim.ropeLength, 44, 0.001);
  close(sim.position.y, 56, 0.001);
  close(sim.velocity.y, 12, 0.001);
});

test('a lower swing converts height into speed, while a poor slow swing loses height', () => {
  const sim = suspended(v(6, 70, 40), v(8, 0, 0));
  const height = sim.position.y;
  const speed = sim.velocity.length();
  simulate(sim, 0.5);
  assert.ok(sim.position.y < height - 1);
  assert.ok(sim.velocity.length() > speed + 2);
});

test('anchor geometry changes the trajectory and a rear anchor brakes forward motion', () => {
  const front = box('front', [30, 0, -5], [40, 100, 5]);
  const rear = box('rear', [-40, 0, -5], [-30, 100, 5]);
  const simulations = [front, rear].map(building => {
    const sim = new Simulation([front, rear], { damping: 0, airControl: 0 });
    sim.reset(v(0, 40, 0), v(20, 0, 0));
    assert.ok(sim.attach({ point: v(building.id === 'front' ? 30 : -30, 80, 0), buildingId: building.id }));
    simulate(sim, 0.2);
    return sim;
  });
  assert.ok(simulations[0].velocity.x > simulations[1].velocity.x + 5);
  assert.ok(simulations[0].position.distanceTo(simulations[1].position) > 0.5);
});

test('reeling respects limits; extending a slack cable adds no velocity', () => {
  const sim = suspended();
  sim.ropeLength = 90;
  const free = new Simulation([tower], { damping: 0, airControl: 0, fallDrag: 0 });
  free.reset(sim.position, sim.velocity);
  simulate(sim, 0.1, { reel: 1 });
  simulate(free, 0.1);
  assert.ok(sim.velocity.distanceTo(free.velocity) < 1e-8);
  close(sim.ropeLength, 91.2, 1e-8);
  sim.ropeLength = 114.9;
  sim.step(0.1, { reel: 1 });
  close(sim.ropeLength, 115);
  sim.config.minLength = sim.ropeLength - 0.01;
  sim.step(1 / 120, { reel: -1 });
  close(sim.ropeLength, sim.config.minLength);
});

test('swept player bounds stop at walls at high speed and retain sliding velocity', () => {
  const wall = box('wall', [10, 0, -30], [12, 100, 30]);
  const sim = new Simulation([wall], { damping: 0 });
  sim.reset(v(0, 30, 0), v(2000, 0, 10));
  sim.step(1 / 120);
  assert.ok(sim.position.x <= 9.55001);
  close(sim.velocity.x, 0);
  assert.ok(sim.position.z > 0 && sim.velocity.z > 9.9);
  assert.ok(sim.wallNormal?.x < 0);
});

test('roofs and floor catch high-speed falls, and jumping clears ground once', () => {
  const sim = new Simulation([tower], { damping: 0 });
  sim.reset(v(0, 140, 0), v(0, -900, 0));
  simulate(sim, 0.1);
  assert.ok(sim.grounded);
  close(sim.position.y, 101, 0.0001);
  sim.step(1 / 120, { jump: true });
  assert.ok(!sim.grounded && sim.velocity.y > 11);
  sim.reset(v(30, 10, 30), v(0, -1000, 0));
  sim.step(1 / 60);
  close(sim.position.y, 1);
  close(sim.velocity.y, 0);
});

test('fixed steps produce identical trajectories at 30, 60 and 120 fps', () => {
  const simulations = [30, 60, 120].map(fps => {
    const sim = suspended();
    simulate(sim, 1, {}, fps);
    return sim;
  });
  for (const sim of simulations.slice(1)) {
    assert.ok(sim.position.distanceTo(simulations[0].position) < 1e-9);
    assert.ok(sim.velocity.distanceTo(simulations[0].velocity) < 1e-9);
  }
});
