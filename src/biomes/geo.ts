import * as THREE from 'three';
import { PLANET_RADIUS, terrainHeight } from '../planet';
import type { BiomeCtx, Rand } from './types';
import { toon } from '../sketch';

/**
 * TINY PLANET mapping.
 *
 * Gameplay logic (movement, collision, NPC placement) works in the 2D
 * lon/lat plane: latLonToDir keeps its signature and returns
 * (x = lonDeg, y = 0, z = -latDeg) — 1 degree = 1 plane unit.
 *
 * Rendering maps the plane onto the sphere:
 *   sphereDir(planePos) -> unit vector from planet center
 *   surfacePos(planePos, h) -> sphereDir * (PLANET_RADIUS + h)
 *   surfaceQuat(planePos, yaw) -> +Y aligned to sphereDir, yaw about normal
 *
 * Biome files keep calling latLonToDir / surfacePos / placeOnSurface with
 * plane positions and get correct sphere placement for free. The only
 * per-biome change: identity quaternions become surfaceQuat(dir).
 */
export const DEG = 1; // plane units per degree
export const UP_Y = new THREE.Vector3(0, 1, 0);

const _sd = new THREE.Vector3();
const _sqYaw = new THREE.Quaternion();

/** Latitude/longitude in degrees -> 2D plane position (y=0). UNCHANGED. */
export function latLonToDir(
  latDeg: number,
  lonDeg: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  // Plane coords are in DEGREES (1 unit = 1°). Do NOT scale by DEG.
  out.set(lonDeg, 0, -latDeg);
  return out;
}

/**
 * 2D plane position -> unit sphere direction from planet center.
 * Plane: x = lonDeg, z = -latDeg.
 */
export function sphereDir(
  planePos: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const latR = (-planePos.z * DEG) * (Math.PI / 180);
  const lonR = (planePos.x * DEG) * (Math.PI / 180);
  const cosLat = Math.cos(latR);
  out.set(
    cosLat * Math.sin(lonR),
    Math.sin(latR),
    -cosLat * Math.cos(lonR),
  );
  return out;
}

/**
 * World (sphere) position -> 2D plane position (x=lonDeg, z=-latDeg).
 * Inverse of the rendering map; for gameplay queries from world positions.
 */
export function planeFromSphere(
  worldPos: THREE.Vector3,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const r = worldPos.length();
  const dirY = THREE.MathUtils.clamp(worldPos.y / r, -1, 1);
  const latD = (Math.asin(dirY) * 180) / Math.PI;
  const lonD = (Math.atan2(worldPos.x, -worldPos.z) * 180) / Math.PI;
  return out.set(lonD, 0, -latD);
}

/** Sphere surface position: unit dir * (R + h). planePos is 2D (y=0). */
export function surfacePos(
  planePos: THREE.Vector3,
  h: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  sphereDir(planePos, _sd);
  return out.copy(_sd).multiplyScalar(PLANET_RADIUS + h);
}

/**
 * Orientation for a prop at a plane position: local +Y aligned to the
 * sphere normal, then yaw (radians) about the normal.
 */
export function surfaceQuat(
  planePos: THREE.Vector3,
  yaw = 0,
  out = new THREE.Quaternion(),
): THREE.Quaternion {
  sphereDir(planePos, _sd);
  out.setFromUnitVectors(UP_Y, _sd);
  if (yaw !== 0) {
    _sqYaw.setFromAxisAngle(UP_Y, yaw);
    out.multiply(_sqYaw);
  }
  return out;
}

/** Full placement matrix: sphere position + normal-aligned orientation. */
const _sfPos = new THREE.Vector3();
const _sfQuat = new THREE.Quaternion();
const _sfScale = new THREE.Vector3(1, 1, 1);
export function surfaceFrame(
  planePos: THREE.Vector3,
  h: number,
  yaw = 0,
  out = new THREE.Matrix4(),
): THREE.Matrix4 {
  surfacePos(planePos, h, _sfPos);
  surfaceQuat(planePos, yaw, _sfQuat);
  return out.compose(_sfPos, _sfQuat, _sfScale);
}

/** Great-circle distance between two plane positions, in world units. */
export function flatDist(a: THREE.Vector3, b: THREE.Vector3): number {
  const dax = sphereDir(a, new THREE.Vector3());
  const dbx = sphereDir(b, new THREE.Vector3());
  const cosA = THREE.MathUtils.clamp(dax.dot(dbx), -1, 1);
  return Math.acos(cosA) * PLANET_RADIUS;
}

/** Angular radius (radians) -> world units on the planet surface. */
export function radToWorld(rad: number): number {
  return rad * PLANET_RADIUS;
}

/**
 * Zone scatter radius: the biome radiusRad values (0.4-0.5) were tuned for
 * the old flat world. On the R=40 planet they are scaled to keep districts
 * compact (~9-11 units) so the 11 zones read as dense neighborhoods.
 */
export function zoneScatterRadius(radiusRad: number): number {
  return radiusRad * PLANET_RADIUS * 0.5;
}

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a BiomeCtx with a per-biome seed (deterministic). */
export function makeCtx(seed: number): BiomeCtx {
  const dummy = new THREE.Object3D();
  return {
    latLonToDir: (la, lo) => latLonToDir(la, lo, new THREE.Vector3()),
    groundH: (dir) => terrainHeight(dir),
    placeOnSurface: (obj, dir, lift) => {
      const h = terrainHeight(dir);
      surfacePos(dir, h + lift, obj.position);
      surfaceQuat(dir, 0, obj.quaternion); // sphere: up = surface normal
    },
    rand: mulberry32(seed),
    dummy,
  };
}

/** Random plane position within a zone radius (compact districts). */
export function sampleInZone(
  latDeg: number,
  lonDeg: number,
  radiusRad: number,
  rand: Rand,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const cx = lonDeg * DEG;
  const cz = -latDeg * DEG;
  const radius = zoneScatterRadius(radiusRad);
  const r = Math.sqrt(rand()) * radius;
  const a = rand() * Math.PI * 2;
  out.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
  return out;
}

/** Fill a geometry's color attribute with a flat hex color (for merged vertex-colored meshes). */
export function paint(
  geo: THREE.BufferGeometry,
  hex: number,
): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Paint a vertical gradient (dark at bottom → light at top) for foliage.
 * Makes trees look lush and dimensional instead of flat.
 */
export function paintGradientY(
  geo: THREE.BufferGeometry,
  bottomHex: number,
  topHex: number,
): THREE.BufferGeometry {
  const bottom = new THREE.Color(bottomHex);
  const top = new THREE.Color(topHex);
  const pos = geo.attributes.position;
  const n = pos.count;
  // Find Y range
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const range = Math.max(maxY - minY, 1e-6);
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = (pos.getY(i) - minY) / range;
    c.copy(bottom).lerp(top, t);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Shared sketchbook material for merged vertex-colored biome geometry. */
export function biomeMaterial(): THREE.MeshToonMaterial {
  const m = toon(0xffffff);
  m.vertexColors = true;
  return m;
}
