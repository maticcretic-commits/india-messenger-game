import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANET_RADIUS, terrainHeight, lakeMask } from './planet';
import { toon, PAL } from './sketch';
import { surfacePos, surfaceQuat, sphereDir } from './biomes/geo';

const dummy = new THREE.Object3D();
const _sv = new THREE.Vector3();

// Tiny planet: player spawn (Himalayan village post office, plane coords).
const SPAWN_POS = new THREE.Vector3(2.8, 0, -72.05);

/** Random plane position on the planet (lon -180..180, lat -75..75). */
function randomSurfacePos(): THREE.Vector3 {
  const lon = (Math.random() * 2 - 1) * 180;
  const lat = (Math.random() * 2 - 1) * 75;
  return new THREE.Vector3(lon, 0, -lat);
}

/** Rejection-sample a spot good for a prop: not in the lake, not at spawn. */
function samplePropSpot(): { pos: THREE.Vector3; h: number } | null {
  for (let attempt = 0; attempt < 24; attempt++) {
    const pos = randomSurfacePos();
    if (lakeMask(pos) > 0.4) continue;
    if (Math.hypot(pos.x - SPAWN_POS.x, pos.z - SPAWN_POS.z) < 5) continue;
    const h = terrainHeight(pos);
    if (h < -0.25) continue;
    return { pos, h };
  }
  return null;
}

function orientDummy(pos: THREE.Vector3, h: number, lift: number, scale: number): void {
  surfacePos(pos, h + lift, dummy.position);
  surfaceQuat(pos, Math.random() * Math.PI * 2, dummy.quaternion);
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();
}

let clouds: THREE.InstancedMesh;
const cloudState: { lon: number; lat: number; alt: number; speed: number; sx: number; sy: number; sz: number }[] = [];

/** Trees, rocks, drifting clouds — all instanced. 4 draw calls total. */
export function buildScenery(scene: THREE.Scene): void {
  // --- trees: trunk + blob canopy (2 draw calls, sketchbook style) ---
  const TREE_COUNT = 70;
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.8, 6);
  const canopyGeo = new THREE.SphereGeometry(0.75, 8, 6); // rounded blob, not cone
  const trunkMat = toon(PAL.trunk);
  const canopyMat = toon(0xffffff);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT);
  const leafTint = new THREE.Color();

  let placed = 0;
  let guard = 0;
  while (placed < TREE_COUNT && guard++ < TREE_COUNT * 40) {
    const spot = samplePropSpot();
    if (!spot) continue;
    const s = 0.8 + Math.random() * 0.9;
    orientDummy(spot.pos, spot.h, 0.4 * s, s);
    trunks.setMatrixAt(placed, dummy.matrix);
    // canopy rides on top of the trunk (along the surface normal)
    sphereDir(spot.pos, _sv);
    dummy.position.addScaledVector(_sv, 1.25 * s);
    dummy.updateMatrix();
    canopies.setMatrixAt(placed, dummy.matrix);
    leafTint.setHSL(0.22 + Math.random() * 0.05, 0.42, 0.32 + Math.random() * 0.1); // olive range
    canopies.setColorAt(placed, leafTint);
    placed++;
  }
  trunks.count = placed;
  canopies.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  scene.add(trunks, canopies);

  // --- rocks (1 draw call) ---
  const ROCK_COUNT = 45;
  const rockGeo = new THREE.DodecahedronGeometry(0.42, 0);
  const rockMat = toon(0xffffff);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  const rockTint = new THREE.Color();
  placed = 0;
  guard = 0;
  while (placed < ROCK_COUNT && guard++ < ROCK_COUNT * 40) {
    const spot = samplePropSpot();
    if (!spot) continue;
    const s = 0.5 + Math.random() * 1.1;
    orientDummy(spot.pos, spot.h, 0.1 * s, s);
    // squash a little for a natural look
    dummy.scale.y *= 0.7;
    dummy.updateMatrix();
    rocks.setMatrixAt(placed, dummy.matrix);
    rockTint.setHSL(0.09, 0.25 + Math.random() * 0.08, 0.52 + Math.random() * 0.12); // warm tan range
    rocks.setColorAt(placed, rockTint);
    placed++;
  }
  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  scene.add(rocks);

  // --- clouds (1 draw call, drift slowly) ---
  // Puffy clouds orbiting the planet at altitude.
  const CLOUD_COUNT = 6;
  const puffGeos: THREE.BufferGeometry[] = [];
  const puffOffsets: Array<[number, number, number, number]> = [
    [0, 0, 0, 1.0],      // center
    [-0.9, -0.15, 0.2, 0.7],  // left
    [0.9, -0.12, -0.15, 0.75], // right
    [0.1, 0.45, 0.1, 0.65],   // top
    [-0.35, -0.25, 0.45, 0.55], // front-left
  ];
  for (const [ox, oy, oz, s] of puffOffsets) {
    const sg = new THREE.SphereGeometry(s, 9, 7);
    sg.translate(ox, oy, oz);
    puffGeos.push(sg);
  }
  const cloudGeo = mergeGeometries(puffGeos)!;
  const cloudMat = toon(0xffffff);
  cloudMat.transparent = true;
  cloudMat.opacity = 0.92;
  clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUD_COUNT);
  for (let i = 0; i < CLOUD_COUNT; i++) {
    cloudState.push({
      lon: (Math.random() * 2 - 1) * 180,
      lat: (Math.random() * 2 - 1) * 60,
      alt: 14 + Math.random() * 10,
      speed: 0.5 + Math.random() * 0.8, // degrees/sec
      sx: 2.0 + Math.random() * 1.2,
      sy: 0.7 + Math.random() * 0.3,
      sz: 1.3 + Math.random() * 0.7,
    });
  }
  clouds.instanceMatrix.needsUpdate = true;
  scene.add(clouds);

  // Magic golden dust motes
  buildMagic(scene);
  // Falling leaves/petals — the second "magic" layer
  buildLeaves(scene);
}

export function updateScenery(dt: number, reducedMotion = false): void {
  updateClouds(dt, reducedMotion);
  updateMagic(dt, reducedMotion);
  updateLeaves(dt, reducedMotion);
}

const _cloudPlane = new THREE.Vector3();

function updateClouds(dt: number, reducedMotion: boolean): void {
  if (!clouds || reducedMotion) return; // no cloud drift under reduced motion
  for (let i = 0; i < cloudState.length; i++) {
    const c = cloudState[i];
    // Drift eastward, wrap around the planet
    c.lon += c.speed * dt;
    if (c.lon > 180) c.lon -= 360;
    _cloudPlane.set(c.lon, 0, -c.lat);
    surfacePos(_cloudPlane, c.alt, dummy.position);
    dummy.quaternion.identity();
    dummy.scale.set(c.sx, c.sy, c.sz);
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
}

// ---------------- magic particles: golden dust motes + fireflies ----------------
let magic: THREE.Points | null = null;
const MAGIC_COUNT = 90;
const magicBase = new Float32Array(MAGIC_COUNT * 3); // sphere positions
const magicPhase = new Float32Array(MAGIC_COUNT);
const magicSpeed = new Float32Array(MAGIC_COUNT);

function buildMagic(scene: THREE.Scene): void {
  const pos = new Float32Array(MAGIC_COUNT * 3);
  for (let i = 0; i < MAGIC_COUNT; i++) {
    const p = randomSurfacePos();
    const h = terrainHeight(p);
    surfacePos(p, h + 0.3 + Math.random() * 2.2, _sv);
    magicBase[i * 3] = _sv.x;
    magicBase[i * 3 + 1] = _sv.y;
    magicBase[i * 3 + 2] = _sv.z;
    pos[i * 3] = _sv.x;
    pos[i * 3 + 1] = _sv.y;
    pos[i * 3 + 2] = _sv.z;
    magicPhase[i] = Math.random() * Math.PI * 2;
    magicSpeed[i] = 0.3 + Math.random() * 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.4, 'rgba(255, 220, 150, 0.5)');
  grad.addColorStop(1, 'rgba(255, 200, 120, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({
    size: 0.35,
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffe0a0,
    opacity: 0.7,
  });
  magic = new THREE.Points(geo, mat);
  magic.frustumCulled = false;
  scene.add(magic);
}

function updateMagic(dt: number, reducedMotion: boolean): void {
  if (!magic || reducedMotion) return;
  const t = performance.now() * 0.001;
  const pos = magic.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < MAGIC_COUNT; i++) {
    const p = magicPhase[i];
    const s = magicSpeed[i];
    const ix = i * 3;
    pos.array[ix] = magicBase[ix] + Math.sin(t * 0.3 * s + p) * 0.15;
    pos.array[ix + 1] = magicBase[ix + 1] + Math.cos(t * 0.4 * s + p * 1.3) * 0.2;
    pos.array[ix + 2] = magicBase[ix + 2] + Math.sin(t * 0.25 * s + p * 0.7) * 0.15;
  }
  pos.needsUpdate = true;
  (magic.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(t * 1.2) * 0.15;
}

// ---------------- falling leaves/petals ----------------
let leaves: THREE.Points | null = null;
const LEAF_COUNT = 110;
const LEAF_TOP = 3.2; // respawn height above the surface
const leafLon = new Float32Array(LEAF_COUNT);
const leafLat = new Float32Array(LEAF_COUNT);
const leafY = new Float32Array(LEAF_COUNT); // radial height above the ground
const leafBaseH = new Float32Array(LEAF_COUNT); // surface radial height
const leafFall = new Float32Array(LEAF_COUNT);
const leafPhase = new Float32Array(LEAF_COUNT);
const leafSway = new Float32Array(LEAF_COUNT);
const LEAF_COLORS = [
  new THREE.Color(0xffb7c5),
  new THREE.Color(0xfff3e0),
  new THREE.Color(0xf2c14e),
  new THREE.Color(0xa8d5a2),
  new THREE.Color(0xff8fa3),
];
const _leafPlane = new THREE.Vector3();

function buildLeaves(scene: THREE.Scene): void {
  const pos = new Float32Array(LEAF_COUNT * 3);
  const col = new Float32Array(LEAF_COUNT * 3);
  for (let i = 0; i < LEAF_COUNT; i++) {
    const p = randomSurfacePos();
    const h = terrainHeight(p);
    leafLon[i] = p.x;
    leafLat[i] = -p.z;
    leafBaseH[i] = h;
    leafY[i] = 0.4 + Math.random() * (LEAF_TOP - 0.4);
    leafFall[i] = 0.25 + Math.random() * 0.45;
    leafPhase[i] = Math.random() * Math.PI * 2;
    leafSway[i] = 0.5 + Math.random() * 1.0;
    const c = LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0];
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 28);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(32, 32, 26, 18, 0.6, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({
    size: 0.3,
    map: tex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  leaves = new THREE.Points(geo, mat);
  leaves.frustumCulled = false;
  scene.add(leaves);
}

function updateLeaves(dt: number, reducedMotion: boolean): void {
  if (!leaves || reducedMotion) return;
  const t = performance.now() * 0.001;
  const pos = leaves.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < LEAF_COUNT; i++) {
    leafY[i] -= leafFall[i] * dt;
    if (leafY[i] <= 0.08) {
      const p = randomSurfacePos();
      const h = terrainHeight(p);
      leafLon[i] = p.x;
      leafLat[i] = -p.z;
      leafBaseH[i] = h;
      leafY[i] = LEAF_TOP * (0.7 + Math.random() * 0.5);
      leafPhase[i] = Math.random() * Math.PI * 2;
    }
    const ix = i * 3;
    const p = leafPhase[i];
    const s = leafSway[i];
    // Sway in plane space, then map to the sphere
    _leafPlane.set(
      leafLon[i] + Math.sin(t * 0.9 * s + p) * 0.5,
      0,
      -(leafLat[i] + Math.sin(t * 0.8 * s + p * 0.6) * 0.5),
    );
    surfacePos(_leafPlane, leafBaseH[i] + leafY[i] + Math.cos(t * 0.7 * s + p * 1.7) * 0.28, _sv);
    pos.array[ix] = _sv.x;
    pos.array[ix + 1] = _sv.y;
    pos.array[ix + 2] = _sv.z;
  }
  pos.needsUpdate = true;
}
