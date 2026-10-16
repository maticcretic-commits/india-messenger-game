import * as THREE from 'three';
import { PLANET_RADIUS, terrainHeight } from '../planet';
import { paint , surfacePos , surfaceQuat} from './geo';
import type { BiomeCtx } from './types';

const UP_Y = new THREE.Vector3(0, 1, 0);

// Palette: warm, earthy, cozy
const ROAD = 0xc9a86a;      // packed dirt path
const ROAD_EDGE = 0xb08d55; // path border stones
const WALL_WHITE = 0xf5f0e6;
const WALL_STONE = 0x9a8a76;
const ROOF_RED = 0xa8442f;
const ROOF_SLATE = 0x5a6a7a;
const WOOD = 0x7a5a3a;
const WOOD_DARK = 0x5a4028;
const SIGN_BLUE = 0x2a5a8a;
const SCHOOL_YELLOW = 0xd4a017;

function addPart(
  parts: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  color: number,
  base: THREE.Matrix4,
  x: number, y: number, z: number,
  sx = 1, sy = 1, sz = 1,
  ry = 0,
): void {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(sx, sy, sz),
  );
  m.premultiply(base);
  geo.applyMatrix4(m);
  paint(geo, color);
  // Biome static merges (himalaya etc.) require every part non-indexed,
  // uv-stripped, and vertex-colored — normalize here like the other biomes.
  geo.deleteAttribute('uv');
  parts.push(geo.index ? geo.toNonIndexed() : geo);
}

function anchor(
  latDeg: number, lonDeg: number, ctx: BiomeCtx, lift = 0,
): THREE.Matrix4 {
  const dir = ctx.latLonToDir(latDeg, lonDeg);
  const p = surfacePos(dir, ctx.groundH(dir) + lift);
  const q = surfaceQuat(dir);
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
}

/**
 * Build a winding dirt road through waypoints (each a unit direction).
 * The road ribbon follows the terrain, ~0.5 units wide, slightly above ground.
 * Returns the waypoints as world positions for building placement.
 */
export function buildRoad(
  parts: THREE.BufferGeometry[],
  waypoints: THREE.Vector3[],
  width = 0.55,
): THREE.Vector3[] {
  const worldPts: THREE.Vector3[] = [];
  // Subdivide each segment for smooth terrain following
  const subdiv: THREE.Vector3[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      subdiv.push(a.clone().lerp(b, t)); // flat world: plain lerp, no normalize
    }
  }
  subdiv.push(waypoints[waypoints.length - 1].clone());

  // Build ribbon: for each subdiv point, create two verts offset perpendicular
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < subdiv.length; i++) {
    const dir = subdiv[i];
    const h = terrainHeight(dir);
    const center = surfacePos(dir, h + 0.03);

    // Perpendicular in the XZ plane (flat world)
    const next = subdiv[Math.min(i + 1, subdiv.length - 1)];
    const tangent = new THREE.Vector3(next.x - dir.x, 0, next.z - dir.z);
    // If tangent is zero (last point), use previous
    if (tangent.lengthSq() < 1e-6 && i > 0) {
      tangent.set(dir.x - subdiv[i - 1].x, 0, dir.z - subdiv[i - 1].z);
    }
    tangent.normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);

    const left = center.clone().addScaledVector(side, width / 2);
    const right = center.clone().addScaledVector(side, -width / 2);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    worldPts.push(center);

    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  paint(geo, ROAD);
  // Ribbon is indexed; the biome static merge needs every part non-indexed.
  parts.push(geo.toNonIndexed());
  return worldPts;
}

/** A cozy post office — the player's home base. Red roof, white walls, DAAK sign. */
export function buildPostOffice(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
): void {
  // Main hall
  addPart(parts, new THREE.BoxGeometry(1.6, 1.0, 1.2), WALL_WHITE, base, 0, 0.5, 0);
  // Red sloped roof (two slabs)
  addPart(parts, new THREE.BoxGeometry(1.9, 0.08, 0.75), ROOF_RED, base, 0, 1.12, -0.3, 1, 1, 1, 0);
  const roofL = new THREE.BoxGeometry(1.9, 0.08, 0.75);
  // Tilt the roof slabs
  addPart(parts, roofL, ROOF_RED, base, 0, 1.18, 0.32);
  // Door
  addPart(parts, new THREE.BoxGeometry(0.34, 0.62, 0.06), WOOD_DARK, base, 0, 0.31, -0.62);
  // Windows
  addPart(parts, new THREE.BoxGeometry(0.3, 0.3, 0.06), SIGN_BLUE, base, -0.5, 0.62, -0.62);
  addPart(parts, new THREE.BoxGeometry(0.3, 0.3, 0.06), SIGN_BLUE, base, 0.5, 0.62, -0.62);
  // Sign board
  addPart(parts, new THREE.BoxGeometry(1.2, 0.28, 0.08), SIGN_BLUE, base, 0, 1.0, -0.64);
  // Red post box outside
  addPart(parts, new THREE.BoxGeometry(0.3, 0.42, 0.3), ROOF_RED, base, 0.95, 0.21, -0.5);
  addPart(parts, new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), ROOF_RED, base, 0.95, 0.42, -0.5);
}

/** A village school — yellow walls, big windows, flag pole, small playground. */
export function buildSchool(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
): void {
  // Classroom block
  addPart(parts, new THREE.BoxGeometry(2.0, 0.9, 1.1), SCHOOL_YELLOW, base, 0, 0.45, 0);
  // Roof
  addPart(parts, new THREE.BoxGeometry(2.2, 0.1, 1.3), ROOF_SLATE, base, 0, 0.95, 0);
  // Big windows (learning needs light!)
  for (const x of [-0.6, 0, 0.6]) {
    addPart(parts, new THREE.BoxGeometry(0.36, 0.4, 0.06), SIGN_BLUE, base, x, 0.55, -0.57);
  }
  // Door
  addPart(parts, new THREE.BoxGeometry(0.36, 0.6, 0.06), WOOD_DARK, base, 0, 0.3, 0.57);
  // Sign
  addPart(parts, new THREE.BoxGeometry(1.4, 0.24, 0.06), WALL_WHITE, base, 0, 0.82, -0.58);
  // Flag pole with small flag
  addPart(parts, new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), WOOD, base, 1.3, 0.8, 0.3);
  addPart(parts, new THREE.BoxGeometry(0.4, 0.26, 0.02), ROOF_RED, base, 1.52, 1.45, 0.3);
  // Playground: simple swing frame
  addPart(parts, new THREE.BoxGeometry(0.06, 0.9, 0.06), WOOD, base, -1.6, 0.45, 0.6);
  addPart(parts, new THREE.BoxGeometry(0.06, 0.9, 0.06), WOOD, base, -0.8, 0.45, 0.6);
  addPart(parts, new THREE.BoxGeometry(0.9, 0.06, 0.06), WOOD, base, -1.2, 0.88, 0.6);
}

/** A regional house — style varies by biome ('stone' | 'kerala' | 'desert' | 'tribal'). */
export function buildHouse(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
  style: 'stone' | 'kerala' | 'desert' | 'tribal' = 'stone',
): void {
  const wall = style === 'desert' ? 0xd4a76a : style === 'kerala' ? WALL_WHITE : WALL_STONE;
  const roof = style === 'kerala' ? ROOF_RED : style === 'desert' ? 0xc48a4a : ROOF_SLATE;
  // Walls
  addPart(parts, new THREE.BoxGeometry(1.2, 0.8, 1.0), wall, base, 0, 0.4, 0);
  // Sloped roof
  if (style === 'kerala') {
    // Steep Kerala roof
    addPart(parts, new THREE.ConeGeometry(1.0, 0.7, 4), roof, base, 0, 1.15, 0, 1, 1, 1, Math.PI / 4);
  } else {
    addPart(parts, new THREE.BoxGeometry(1.4, 0.08, 1.2), roof, base, 0, 0.84, 0);
  }
  // Door + window
  addPart(parts, new THREE.BoxGeometry(0.28, 0.52, 0.06), WOOD_DARK, base, -0.2, 0.26, -0.52);
  addPart(parts, new THREE.BoxGeometry(0.26, 0.26, 0.06), SIGN_BLUE, base, 0.3, 0.5, -0.52);
}

/** A tiny tea stall — striped awning, counter, kettle. */
export function buildTeaStall(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
): void {
  // Counter
  addPart(parts, new THREE.BoxGeometry(0.9, 0.5, 0.5), WOOD, base, 0, 0.25, 0);
  // Posts + striped awning
  for (const x of [-0.45, 0.45]) {
    addPart(parts, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), WOOD_DARK, base, x, 0.55, -0.2);
    addPart(parts, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), WOOD_DARK, base, x, 0.55, 0.2);
  }
  addPart(parts, new THREE.BoxGeometry(1.1, 0.04, 0.6), ROOF_RED, base, 0, 1.12, 0);
  addPart(parts, new THREE.BoxGeometry(1.1, 0.04, 0.2), WALL_WHITE, base, 0, 1.1, 0.28);
  // Kettle
  addPart(parts, new THREE.CylinderGeometry(0.09, 0.11, 0.16, 8), 0x8a8a8a, base, -0.2, 0.58, 0);
}

export { anchor };
