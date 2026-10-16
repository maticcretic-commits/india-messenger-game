import * as THREE from 'three';
import { makeNoise2D, smoothstep } from './noise';
import { toon } from './sketch';

/**
 * TINY PLANET. The world is a small sphere the player walks around.
 *
 * PLANET_RADIUS = 40 world units. Gameplay logic works in the 2D lon/lat
 * plane (x = lonDeg, z = -latDeg); rendering maps plane -> sphere via
 * geo.ts (sphereDir / surfacePos / surfaceQuat).
 *
 * terrainHeight takes a plane position and returns RADIAL displacement
 * (positive = outward). The planet is fully walkable land; water appears
 * only in carved basins (lake, Kerala, Goa) via a water shell underneath.
 */
export const PLANET_RADIUS = 40;

// Fixed lake position (plane coords: lon=-100, lat=60).
// Placed clear of all biome zones.
export const LAKE_POS = new THREE.Vector3(-100, 0, -60);
const LAKE_R_OUT = 7; // plane units
const LAKE_R_IN = 3.4;

const noise = makeNoise2D(7);
const detail = makeNoise2D(31);

// Noise input scale: features ~4 units for base, ~1.5 for detail.
const NS = 0.28;
const DS = 0.7;

/** 1 inside the lake, 0 outside — smooth rim in between. */
export function lakeMask(pos: THREE.Vector3): number {
  const d = Math.hypot(pos.x - LAKE_POS.x, pos.z - LAKE_POS.z);
  return smoothstep(LAKE_R_OUT, LAKE_R_IN, d);
}

/**
 * Radial height of the terrain at a plane position (x=lonDeg, z=-latDeg).
 * Takes a Vector3 for call-site compatibility; uses .x and .z.
 */
export function terrainHeight(pos: THREE.Vector3): number {
  const x = pos.x;
  const z = pos.z;
  const n = noise(x * NS + 10, z * NS);
  const d = detail(x * DS, z * DS);
  let h = (n - 0.5) * 2.4 + (d - 0.5) * 0.6;
  const m = lakeMask(pos);
  h = h * (1 - m) - m * 1.1; // carve the lake basin (below water shell)
  // Flatten the Himalayan village plateau (post office, houses, roads)
  h = flattenVillage(pos, h);
  // Himalayan foothills rise toward the north pole (after flattening so the
  // village plateau rides up with the range instead of being wiped out).
  const lat = -z;
  if (lat > 55) h += (lat - 55) * 0.12;
  return h;
}

// The village sits on a flattened plateau (plane coords near himalaya zone).
const VILLAGE_POS = new THREE.Vector3(1.85, 0, -72.02);
const VILLAGE_RADIUS = 5;
const VILLAGE_HEIGHT = (() => {
  const n = noise(VILLAGE_POS.x * NS + 10, VILLAGE_POS.z * NS);
  const d = detail(VILLAGE_POS.x * DS, VILLAGE_POS.z * DS);
  return (n - 0.5) * 2.4 + (d - 0.5) * 0.6;
})();

function flattenVillage(pos: THREE.Vector3, h: number): number {
  const d = Math.hypot(pos.x - VILLAGE_POS.x, pos.z - VILLAGE_POS.z);
  if (d >= VILLAGE_RADIUS) return h;
  const t = smoothstep(VILLAGE_RADIUS, VILLAGE_RADIUS * 0.55, d);
  return h * (1 - t) + VILLAGE_HEIGHT * t;
}

const GRASS_A = new THREE.Color(0x7a8c3f); // olive wash
const GRASS_B = new THREE.Color(0x8fa04a); // lighter olive
const SAND = new THREE.Color(0xc9a86a); // warm tan
const ROCK = new THREE.Color(0xa8895a); // shadowed tan
const SNOW = new THREE.Color(0xf2f6fa); // snowy white (matches himalaya biome)
const WATER = new THREE.Color(0x0f6f7a); // deep teal

// Himalaya zone center (plane: lat 72, lon 0 -> x=0, z=-72).
const HIMALAYA_POS = new THREE.Vector3(0, 0, -72);
// Thar zone center (plane: lat 4, lon 148 -> x=148, z=-4).
const THAR_POS = new THREE.Vector3(148, 0, -4);

/** 1 deep inside a zone disc, feathering to 0 at the rim. */
function zoneMask(pos: THREE.Vector3, center: THREE.Vector3, rOut: number, rIn: number): number {
  const d = Math.hypot(pos.x - center.x, pos.z - center.z);
  return smoothstep(rOut, rIn, d);
}

/** Plane position -> unit sphere direction (duplicated from geo.ts to avoid a cycle). */
function planeToDir(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const latR = (-z) * (Math.PI / 180);
  const lonR = x * (Math.PI / 180);
  const cosLat = Math.cos(latR);
  return out.set(
    cosLat * Math.sin(lonR),
    Math.sin(latR),
    -cosLat * Math.cos(lonR),
  );
}

/**
 * Builds the tiny planet: sphere with radial terrain displacement,
 * vertex-colored. 1 draw call for land + 1 for the water shell.
 * Kept the name buildPlanet so call sites don't change.
 */
export function buildPlanet(): THREE.Group {
  const group = new THREE.Group();
  const SEG_W = 160;
  const SEG_H = 120;
  const geo = new THREE.SphereGeometry(PLANET_RADIUS, SEG_W, SEG_H);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const plane = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // SphereGeometry: y is up. Convert to lat/lon.
    const r = v.length();
    const latR = Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1));
    const lonR = Math.atan2(v.x, -v.z);
    const latD = (latR * 180) / Math.PI;
    const lonD = (lonR * 180) / Math.PI;
    plane.set(lonD, 0, -latD);

    const h = terrainHeight(plane);
    // Displace radially
    const nr = PLANET_RADIUS + h;
    v.normalize().multiplyScalar(nr);
    pos.setXYZ(i, v.x, v.y, v.z);

    // --- vertex color ---
    const n = noise(plane.x * NS * 1.6 + 3, plane.z * NS * 1.6);
    col.copy(GRASS_A).lerp(GRASS_B, n);
    // Sandy band around the Thar zone
    const tharM = zoneMask(plane, THAR_POS, 14, 8);
    if (tharM > 0.001) col.lerp(SAND, tharM * 0.9);
    // Rock on high ground
    if (h > 0.8) col.lerp(ROCK, smoothstep(0.8, 1.4, h));
    // Snow: high ground + polar cap
    const snowM = Math.max(smoothstep(1.2, 1.8, h), smoothstep(60, 75, latD));
    if (snowM > 0.001) col.lerp(SNOW, snowM * 0.95);
    // Himalaya snowfield
    const himM = zoneMask(plane, HIMALAYA_POS, 12, 7);
    if (himM > 0.001) col.lerp(SNOW, himM * 0.9);
    // Lake basin -> sandy rim (water shell shows in the deep part)
    const lm = lakeMask(plane);
    if (lm > 0.12 && lm <= 0.42) col.lerp(SAND, smoothstep(0.12, 0.42, lm));

    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = toon(0xffffff);
  mat.vertexColors = true;
  const land = new THREE.Mesh(geo, mat);
  land.frustumCulled = false;
  group.add(land);

  // Water shell: deep teal sphere just under the surface.
  // Shows through wherever terrain is carved below it (lake, canals).
  const waterGeo = new THREE.SphereGeometry(PLANET_RADIUS - 0.55, 96, 64);
  const waterMat = toon(0x0f6f7a);
  waterMat.transparent = true;
  waterMat.opacity = 0.92;
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.frustumCulled = false;
  group.add(water);

  return group;
}
