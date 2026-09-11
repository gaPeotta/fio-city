import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { generateBuildings, buildCity } from '../src/city.js';

test('city has 36 deterministic valid building AABBs without overlapping interiors', () => {
  const buildings = generateBuildings();
  assert.equal(buildings.length, 36);
  assert.equal(new Set(buildings.map(building => building.id)).size, 36);
  assert.deepEqual(buildings, generateBuildings());
  for (const building of buildings) {
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Number.isFinite(building.min[axis]) && Number.isFinite(building.max[axis]));
      assert.ok(building.max[axis] > building.min[axis], `${building.id}: invalid ${axis} bounds`);
    }
    assert.equal(building.min.y, 0);
    for (const other of buildings) {
      if (building === other) continue;
      const overlap = ['x', 'y', 'z'].every(axis => building.min[axis] < other.max[axis] && building.max[axis] > other.min[axis]);
      assert.equal(overlap, false, `${building.id} overlaps ${other.id}`);
    }
  }
});

test('all four checkpoints support the character on the intended roof or ground', (t) => {
  const buildings = generateBuildings();
  const city = buildCity(new THREE.Scene(), buildings);
  t.after(() => city.dispose());
  assert.equal(city.checkpoints.length, 4);
  assert.deepEqual(city.checkpoints.map(point => point.name), ['TELHADO INICIAL', 'AVENIDA', 'PÊNDULO', 'MERGULHO']);
  assert.deepEqual(city.spawn, city.checkpoints[0].position);
  const expectedRoofs = [buildings[27], null, buildings[13], buildings[30]];
  city.checkpoints.forEach((checkpoint, index) => {
    const { position: p } = checkpoint;
    assert.ok(p.x > city.bounds.minX && p.x < city.bounds.maxX);
    assert.ok(p.z > city.bounds.minZ && p.z < city.bounds.maxZ);
    assert.ok(Number.isFinite(checkpoint.yaw));
    const roof = expectedRoofs[index];
    if (roof) {
      assert.ok(p.x - 0.45 > roof.min.x && p.x + 0.45 < roof.max.x, `${checkpoint.name}: horizontal roof clearance`);
      assert.ok(p.z - 0.45 > roof.min.z && p.z + 0.45 < roof.max.z, `${checkpoint.name}: depth roof clearance`);
      assert.ok(Math.abs(p.y - roof.max.y - 1.05) < 1e-10, `${checkpoint.name}: roof standing height`);
    } else {
      assert.equal(p.y, 1.05);
      assert.ok(buildings.every(building => p.x + 0.45 < building.min.x || p.x - 0.45 > building.max.x || p.z + 0.45 < building.min.z || p.z - 0.45 > building.max.z), 'Ground checkpoint must clear all buildings');
    }
  });
});

test('instanced building geometry exactly matches colliders and city uses at most 25 mesh batches', (t) => {
  const buildings = generateBuildings();
  const scene = new THREE.Scene();
  const city = buildCity(scene, buildings);
  t.after(() => city.dispose());
  const mesh = scene.getObjectByName('Building collider geometry');
  assert.ok(mesh?.isInstancedMesh);
  assert.equal(mesh.count, buildings.length);
  mesh.geometry.computeBoundingBox();
  const matrix = new THREE.Matrix4();
  buildings.forEach((building, index) => {
    mesh.getMatrixAt(index, matrix);
    const visibleBounds = mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
    assert.deepEqual(visibleBounds.min, building.min, `${building.id}: visible minimum matches collision`);
    assert.deepEqual(visibleBounds.max, building.max, `${building.id}: visible maximum matches collision`);
  });
  let meshCount = 0;
  scene.traverse(item => {
    if (!item.isMesh) return;
    meshCount++;
    assert.ok(item.isInstancedMesh, 'Repeated city geometry must remain instanced');
  });
  assert.ok(meshCount > 0 && meshCount <= 25, `${meshCount} city batches exceed rendering budget`);
});
