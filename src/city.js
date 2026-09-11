import * as THREE from '../vendor/three.module.js';

const PALETTE = [0xbda28c, 0xc87860, 0x518e89, 0x8ea5a0, 0xd1b99a, 0x926b68];
const HEIGHTS = [38, 57, 74, 48, 69, 98, 52, 83, 46, 78, 112, 65, 61, 94, 42, 76, 88, 55, 104, 68, 49, 82, 64, 109, 43, 71, 96, 59, 86, 50, 115, 73, 54, 91, 36, 67];

/** World units are metres; every building mesh is precisely its returned AABB. */
export function generateBuildings() {
  const buildings = [];
  let i = 0;
  for (const bz of [-88, 0, 88]) {
    for (const bx of [-88, 0, 88]) {
      for (const dz of [-18, 18]) {
        for (const dx of [-18, 18]) {
          const width = 27 + ((i * 7) % 5);
          const depth = 26 + ((i * 3) % 5);
          const centerX = bx + dx;
          const centerZ = bz + dz;
          buildings.push({
            id: `building-${i}`,
            min: new THREE.Vector3(centerX - width / 2, 0, centerZ - depth / 2),
            max: new THREE.Vector3(centerX + width / 2, HEIGHTS[i], centerZ + depth / 2),
            color: PALETTE[(i + Math.floor(i / 4)) % PALETTE.length],
          });
          i++;
        }
      }
    }
  }
  // The south-west entry roof opens directly onto the first avenue.
  buildings[27].max.y = 86;
  return buildings;
}

export function buildCity(scene, buildings) {
  const group = new THREE.Group();
  group.name = 'Nine-block city';
  scene.add(group);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const usedMaterials = [];
  const material = (options) => {
    const result = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, ...options });
    usedMaterials.push(result);
    return result;
  };
  const batch = (items, mat, { shadows = false } = {}) => {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(unitBox, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      dummy.position.set(...item.position);
      dummy.scale.set(...item.scale);
      dummy.rotation.set(0, item.rotation || 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (item.color !== undefined) mesh.setColorAt(i, new THREE.Color(item.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const slab = (x, y, z, sx, sy, sz, color) => ({ position: [x, y, z], scale: [sx, sy, sz], color });

  // Pavement and markings are flat visual details. The physics ground is y=0.
  batch([slab(0, -0.08, 0, 328, 0.16, 328)], material({ color: 0x283b42 }));
  const sidewalks = [];
  for (const x of [-88, 0, 88]) {
    for (const z of [-88, 0, 88]) sidewalks.push(slab(x, 0.005, z, 74, 0.01, 74));
  }
  batch(sidewalks, material({ color: 0x677370 }));

  const laneMarks = [];
  const crosswalks = [];
  const curbs = [];
  for (const avenue of [-132, -44, 44, 132]) {
    for (let p = -148; p <= 148; p += 10) {
      if ([-132, -44, 44, 132].some(cross => Math.abs(p - cross) < 10)) continue;
      laneMarks.push(slab(avenue - 0.25, 0.028, p, 0.13, 0.012, 4));
      laneMarks.push(slab(avenue + 0.25, 0.028, p, 0.13, 0.012, 4));
      laneMarks.push(slab(p, 0.028, avenue - 0.25, 4, 0.012, 0.13));
      laneMarks.push(slab(p, 0.028, avenue + 0.25, 4, 0.012, 0.13));
    }
    for (const cross of [-132, -44, 44, 132]) {
      for (const side of [-1, 1]) {
        for (let stripe = -5; stripe <= 5; stripe += 2) {
          crosswalks.push(slab(avenue + stripe, 0.04, cross + side * 10.5, 0.95, 0.015, 3));
          crosswalks.push(slab(avenue + side * 10.5, 0.04, cross + stripe, 3, 0.015, 0.95));
        }
      }
    }
  }
  for (const x of [-88, 0, 88]) {
    for (const z of [-88, 0, 88]) {
      for (const side of [-1, 1]) {
        curbs.push(slab(x + side * 37, 0.025, z, 0.3, 0.02, 74));
        curbs.push(slab(x, 0.025, z + side * 37, 74, 0.02, 0.3));
      }
    }
  }
  batch(laneMarks, material({ color: 0xc6a96a }));
  batch(crosswalks, material({ color: 0xc0c9bd }));
  batch(curbs, material({ color: 0x9b9d8e }));

  const blocks = [];
  const roofs = [];
  const roofLines = [];
  const litWindows = [];
  const darkWindows = [];
  const facadeBands = [];
  const doorways = [];

  buildings.forEach((building, index) => {
    const { min, max, color } = building;
    const width = max.x - min.x;
    const depth = max.z - min.z;
    const height = max.y;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    blocks.push(slab(cx, height / 2, cz, width, height, depth, color));
    roofs.push(slab(cx, height + 0.008, cz, width - 0.15, 0.016, depth - 0.15, index % 3 === 0 ? 0x536a69 : 0x817a6c));
    // Painted rooftop borders give roofs a readable rim without phantom obstacles.
    for (const side of [-1, 1]) {
      roofLines.push(slab(cx + side * (width / 2 - 0.6), height + 0.022, cz, 0.5, 0.014, depth - 0.8));
      roofLines.push(slab(cx, height + 0.022, cz + side * (depth / 2 - 0.6), width - 0.8, 0.014, 0.5));
    }
    const floorCount = Math.floor((height - 6) / 4.2);
    const columnCountX = Math.floor((width - 4) / 4.3);
    const columnCountZ = Math.floor((depth - 4) / 4.3);
    for (let floor = 0; floor < floorCount; floor++) {
      const y = 5.8 + floor * 4.2;
      for (const side of [-1, 1]) {
        for (let column = 0; column < columnCountX; column++) {
          const x = cx + (column - (columnCountX - 1) / 2) * 4.3;
          const target = ((index * 17 + floor * 3 + column * 11 + side) % 7 + 7) % 7 < 3 ? litWindows : darkWindows;
          target.push(slab(x, y, side < 0 ? min.z - 0.012 : max.z + 0.012, index % 4 === 0 ? 2.7 : 1.7, 2.1, 0.026));
        }
        for (let column = 0; column < columnCountZ; column++) {
          const z = cz + (column - (columnCountZ - 1) / 2) * 4.3;
          const target = ((index * 13 + floor * 5 + column * 3 + side) % 7 + 7) % 7 < 3 ? litWindows : darkWindows;
          target.push(slab(side < 0 ? min.x - 0.012 : max.x + 0.012, y, z, 0.026, 2.1, index % 4 === 0 ? 2.7 : 1.7));
        }
      }
    }
    // Thin facade reveals and street-level shop glazing follow the collider faces.
    for (const y of [3.5, height - 1.4]) {
      for (const side of [-1, 1]) {
        facadeBands.push(slab(cx, y, side < 0 ? min.z - 0.02 : max.z + 0.02, width, 0.32, 0.04));
        facadeBands.push(slab(side < 0 ? min.x - 0.02 : max.x + 0.02, y, cz, 0.04, 0.32, depth));
      }
    }
    for (const side of [-1, 1]) {
      doorways.push(slab(cx, 1.45, side < 0 ? min.z - 0.025 : max.z + 0.025, width * 0.66, 2.7, 0.045));
      doorways.push(slab(side < 0 ? min.x - 0.025 : max.x + 0.025, 1.45, cz, 0.045, 2.7, depth * 0.66));
    }
  });
  const buildingMesh = batch(blocks, material({ color: 0xffffff }), { shadows: true });
  buildingMesh.name = 'Building collider geometry';
  batch(roofs, material({ color: 0xffffff }));
  batch(roofLines, material({ color: 0xc8bca1 }));
  batch(litWindows, material({ color: 0xf3d396, emissive: 0xf6b965, emissiveIntensity: 0.42, roughness: 0.45 }));
  batch(darkWindows, material({ color: 0x294650, roughness: 0.42, metalness: 0.12 }));
  batch(facadeBands, material({ color: 0x9a9b8e }));
  batch(doorways, material({ color: 0x233c46, roughness: 0.35 }));

  // A flat courtyard and a painted landing target: both remain traversable.
  batch([slab(0, 0.023, 0, 8, 0.018, 8)], material({ color: 0x648575 }));
  const entry = buildings[27];
  const spawn = new THREE.Vector3(entry.max.x - 1.5, entry.max.y + 1.05, entry.max.z - 4);
  const dive = buildings[30];
  const pendulum = buildings[13];
  const checkpoints = [
    { name: 'TELHADO INICIAL', position: spawn.clone(), yaw: 0.3, description: 'Avance e salte para a avenida. Mire acima, na fachada à frente; segure o cabo para iniciar o arco.' },
    { name: 'AVENIDA', position: new THREE.Vector3(-44, 1.05, 113), yaw: 0, description: 'Corrida e salto no solo. Compare ancoragens próximas e distantes na mesma avenida.' },
    { name: 'PÊNDULO', position: new THREE.Vector3(pendulum.min.x + 2, pendulum.max.y + 1.05, pendulum.max.z - 2), yaw: Math.PI, description: 'Salte em direção à avenida. Compare prender à frente e atrás e soltar no fundo do arco.' },
    { name: 'MERGULHO', position: new THREE.Vector3(dive.min.x + 1.5, dive.max.y + 1.05, dive.min.z + 2), yaw: 0, description: 'Mergulhe a partir de 115 m. Lance a teia antes do solo para converter queda em velocidade.' },
  ];
  const target = [];
  for (const checkpoint of [checkpoints[0], checkpoints[2], checkpoints[3]]) {
    const p = checkpoint.position;
    target.push(slab(p.x, p.y - 1.012, p.z, 1.8, 0.01, 0.17));
    target.push(slab(p.x, p.y - 1.012, p.z, 0.17, 0.01, 1.8));
  }
  batch(target, material({ color: 0x7fefe3, emissive: 0x47cabc, emissiveIntensity: 0.3 }));

  return {
    spawn,
    checkpoints,
    bounds: { minX: -159, maxX: 159, minZ: -159, maxZ: 159 },
    dispose() {
      scene.remove(group);
      unitBox.dispose();
      usedMaterials.forEach(item => item.dispose());
      group.traverse(item => { if (item.isInstancedMesh) item.dispose(); });
    },
  };
}
