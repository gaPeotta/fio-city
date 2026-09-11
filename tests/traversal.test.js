import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '../vendor/three.module.js';
import { Simulation, selectAnchor } from '../src/physics.js';
import { generateBuildings } from '../src/city.js';

test('real city: four anchors, three loaded swings and more than two blocks without landing', context => {
  const buildings = generateBuildings();
  const sim = new Simulation(buildings, { speedAssist: 0 });
  // Reproducible airborne benchmark, NOT a claim that the rooftop tutorial launches this way.
  // This is the only position/velocity assignment. The pilot subsequently uses public controls.
  sim.reset(new Vector3(-44, 90, 120), new Vector3(0, 0, -22));
  const start = sim.position.clone();
  const launches = [
    { frame: 0, id: 'building-30', point: new Vector3(-31.5, 113, 100) },
    { frame: 111, id: 'building-25', point: new Vector3(-56.5, 69, 65) },
    { frame: 261, id: 'building-18', point: new Vector3(-32, 102, 15) },
    { frame: 465, id: 'building-13', point: new Vector3(-56, 92, -18) },
  ];
  let launchIndex = 0, releases = 0, minimumHeight = start.y, maximumSpeed = sim.velocity.length(), finalFrame = 0;
  const attached = new Set();
  const loadedFrames = new Map();
  for (let frame = 0; frame < 120 * 10; frame++) {
    const next = launches[launchIndex];
    if (next && launchIndex > 0 && frame === next.frame - 9) {
      const outgoing = sim.velocity.toArray();
      sim.release();
      assert.deepEqual(sim.velocity.toArray(), outgoing, 'manual release must preserve every velocity component');
      releases++;
    }
    if (next && frame === next.frame) {
      // Aim with no cone assistance at a real facade. A closer occluder would fail the id/point checks.
      const hit = selectAnchor(sim.position, next.point.clone().sub(sim.position), buildings, { assistAngle: 0 });
      assert.equal(hit?.buildingId, next.id, `launch ${launchIndex} hit unexpected or missing geometry`);
      assert.ok(hit.point.distanceTo(next.point) < 0.001);
      assert.ok(sim.attach(hit));
      attached.add(hit.buildingId);
      launchIndex++;
    }
    // Bounded analog countersteering: lean against lateral drift, then spend the remaining
    // air-control budget moving down the avenue. No vertical input, winch, zip or speed assistance.
    const lateral = Math.max(-1, Math.min(1, (-44 - sim.position.x) * 0.4 - sim.velocity.x * 0.6));
    const move = new Vector3(lateral, 0, -Math.sqrt(1 - lateral * lateral));
    const previous = sim.position.clone();
    const previousSpeed = sim.velocity.length();
    sim.step(1 / 120, { move, reel: 0 });
    finalFrame = frame + 1;
    minimumHeight = Math.min(minimumHeight, sim.position.y);
    maximumSpeed = Math.max(maximumSpeed, sim.velocity.length());
    assert.ok(!sim.grounded, `pilot landed on frame ${frame}`);
    assert.equal(sim.wallNormal, null, `pilot struck a wall on frame ${frame}`);
    assert.equal(sim.releaseReason, '', `cable was obstructed on frame ${frame}`);
    assert.ok(previous.distanceTo(sim.position) <= (Math.max(previousSpeed, sim.velocity.length()) + 5) / 120,
      `position jumped discontinuously on frame ${frame}`);
    for (const building of buildings) {
      const p = sim.position;
      const penetrates = p.x + 0.45 > building.min.x + 1e-5 && p.x - 0.45 < building.max.x - 1e-5
        && p.y + 1 > building.min.y + 1e-5 && p.y - 1 < building.max.y - 1e-5
        && p.z + 0.45 > building.min.z + 1e-5 && p.z - 0.45 < building.max.z - 1e-5;
      assert.ok(!penetrates, `player bounds penetrate ${building.id} on frame ${frame}`);
    }
    if (sim.anchor && sim.tension > 1) {
      loadedFrames.set(sim.anchor.buildingId, (loadedFrames.get(sim.anchor.buildingId) ?? 0) + 1);
      assert.ok(sim.position.distanceTo(sim.anchor.point) <= sim.ropeLength + 0.002);
    }
    if (start.z - sim.position.z > 180) break;
  }
  assert.equal(attached.size, 4);
  assert.equal(releases, 3);
  assert.ok([...loadedFrames.values()].filter(count => count >= 6).length >= 3,
    'at least three different cables must carry tension for at least 0.05 seconds each');
  assert.ok(start.z - sim.position.z > 176, 'pilot must cross more than two 88-metre blocks');
  assert.ok(minimumHeight > 20, 'benchmark should retain a useful margin above the ground');
  context.diagnostic(`Airborne initial state [-44,90,120] m, velocity [0,0,-22] m/s; ${
    (start.z - sim.position.z).toFixed(2)} m traversed in ${(finalFrame / 120).toFixed(2)} s; minimum height ${
    minimumHeight.toFixed(2)} m; maximum speed ${maximumSpeed.toFixed(2)} m/s; 4 anchors, 3 loaded cables; zero wall contacts.`);
});
