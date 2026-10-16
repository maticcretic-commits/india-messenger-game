/**
 * HIMALAYAN FOOTHILLS biome — "Postcards from Bharat" (original cozy low-poly game art).
 *
 * Researched signature details (modeled here; inspired by real Himalayan Buddhist
 * architecture, but an ORIGINAL fictional gompa — never a replica of a protected monument):
 * 1. Multi-tiered gompa: whitewashed inward-sloping walls, maroon/ochre timber bands,
 *    golden tiered roofs and a kangsheng parapet, perched on a snowy crag — Tawang-style.
 * 2. Whitewashed chorten: three-tiered square base, hemispherical dome (bumpa), harmika,
 *    tiered umbrella spire and golden finial, with four miniature corner stupas — Gorsam-style.
 * 3. Lung ta prayer flags in the five-element order — blue (sky), white (air), red (fire),
 *    green (water), yellow (earth) — strung diagonally high-to-low; wind carries the blessings.
 * 4. Mani prayer wheels (wooden posts, red drums with gold bands) set in an arc for
 *    circumambulation around the chorten.
 * 5. Snow-laden deodar cedars, black yak-wool tents, and a warm pink-gold blush on the
 *    snow caps for the alpenglow lighting feel.
 *
 * Palette: glacial whites, deep lapis lazuli accents, saffron + turquoise prayer flags.
 * Quest tie-in: "The High-Altitude Recipe" — thukpa recipe + yak-butter for a novice monk.
 */

import * as THREE from 'three';
import { toon } from '../sketch';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, paintGradientY, biomeMaterial, sampleInZone , surfacePos, flatDist, radToWorld, surfaceQuat, surfaceFrame} from './geo';
import type { BiomeModule, BiomeBuildResult, BiomeCtx } from './types';
import { PLANET_RADIUS } from '../planet';
import { buildRoad, buildPostOffice, buildSchool, buildHouse, buildTeaStall } from './village';

// ---------------------------------------------------------------- palette ----
const SNOW = 0xf2f6fa;
const SNOW_BLUSH = 0xffd9c2; // alpenglow pink-gold on the peaks
const ROCK = 0x8d8577;
const WHITEWASH = 0xf7f3ea;
const MAROON = 0x7a1f1f;
const MAROON_DARK = 0x5c1414;
const OCHRE = 0xc97b2d;
const GOLD = 0xe0a92c;
const LAPIS = 0x27407c;
const WOOD = 0x6b4a2f;
const ROPE = 0x4a3826;
const DEODAR = 0x2f6b4f;
const TENT = 0x2b2118;
const TENT_TRIM = 0x8a6a45;
const WHEEL_RED = 0xa32c1e;
const STONE = 0x9a938a;

// Lung ta five-element order: blue (sky), white (air), red (fire), green (water), yellow (earth).
const FLAG_COLORS = [0x2b6fd4, 0xf5f5f5, 0xd43d2a, 0x2f9e5f, 0xf2c230];

const FLAG_W = 0.1;
const FLAG_H = 0.075;

// ---------------------------------------------------------------- helpers ----
const UP = new THREE.Vector3(0, 1, 0);

/** World matrix for a prop: origin on the terrain at lat/lon, local +Y along the surface normal. */
function anchor(
  latDeg: number,
  lonDeg: number,
  ctx: BiomeCtx,
  lift: number,
  rotY = 0,
): THREE.Matrix4 {
  const dir = ctx.latLonToDir(latDeg, lonDeg);
  const p = surfacePos(dir, ctx.groundH(dir) + lift);
  const q = surfaceQuat(dir);
  const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
  if (rotY !== 0) m.multiply(new THREE.Matrix4().makeRotationY(rotY));
  return m;
}

/**
 * Paint, transform into world space, strip uv, and collect a part for merging.
 * Local offsets (x,y,z) are in the anchor's frame (+Y = surface normal).
 */
function addPart(
  parts: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  color: number,
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  ry = 0,
  rx = 0,
  rz = 0,
): void {
  // normalize indexing: mergeGeometries requires all parts indexed or all non-indexed
  // (DodecahedronGeometry is non-indexed, the rest are indexed)
  if (geo.index !== null) geo = geo.toNonIndexed();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
  m.premultiply(base);
  geo.applyMatrix4(m);
  geo.deleteAttribute('uv');
  paint(geo, color);
  parts.push(geo);
}

/** Like addPart but with a vertical color gradient (for lush foliage). */
function addPartGradient(
  parts: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  bottomColor: number,
  topColor: number,
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  ry = 0,
): void {
  if (geo.index !== null) geo = geo.toNonIndexed();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(sx, sy, sz),
  );
  m.premultiply(base);
  geo.applyMatrix4(m);
  geo.deleteAttribute('uv');
  paintGradientY(geo, bottomColor, topColor);
  parts.push(geo);
}

/** Wooden pole, height h, centered at (x, y, z) with base at y. */
function pole(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  h: number,
): void {
  addPart(parts, new THREE.CylinderGeometry(0.025, 0.03, h, 6), WOOD, base, x, y + h / 2, z);
}

/** Snow-laden deodar cedar, base at (x, y, z), scaled by s. */
function deodar(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  s: number,
): void {
  addPart(parts, new THREE.CylinderGeometry(0.035, 0.05, 0.4, 6), WOOD, base, x, y + 0.2 * s, z, s, s, s);
  const layers: Array<[number, number, number]> = [
    [0.34, 0.34, 0.3],
    [0.27, 0.62, 0.26],
    [0.19, 0.88, 0.22],
  ];
  for (const [r, ly, lh] of layers) {
    // Gradient foliage: deep green at bottom → lighter at top (lush, dimensional)
    addPartGradient(parts, new THREE.ConeGeometry(r, lh, 7), 0x2d5a3a, 0x4a7a4a, base, x, y + ly * s, z, s, s, s);
    addPart(parts, new THREE.ConeGeometry(r * 1.04, lh * 0.38, 7), SNOW, base, x, y + (ly + lh * 0.26) * s, z, s, s, s);
  }
}

/** Black yak-wool tent with sloped roof panels, base at (x, y, z). */
function tent(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  ry: number,
): void {
  addPart(parts, new THREE.BoxGeometry(0.55, 0.34, 0.75), TENT, base, x, y + 0.17, z, 1, 1, 1, ry);
  // two sloped roof panels meeting at a ridge
  addPart(parts, new THREE.BoxGeometry(0.36, 0.03, 0.8), TENT, base, x - 0.138, y + 0.455, z, 1, 1, 1, ry, 0, 0.7);
  addPart(parts, new THREE.BoxGeometry(0.36, 0.03, 0.8), TENT, base, x + 0.138, y + 0.455, z, 1, 1, 1, ry, 0, -0.7);
  // ridge cap + door flap
  addPart(parts, new THREE.BoxGeometry(0.08, 0.04, 0.82), TENT_TRIM, base, x, y + 0.585, z, 1, 1, 1, ry);
  addPart(parts, new THREE.BoxGeometry(0.2, 0.26, 0.02), TENT_TRIM, base, x, y + 0.15, z + 0.38, 1, 1, 1, ry);
  // guy ropes from the four corners
  const corners: Array<[number, number]> = [[-0.27, -0.37], [0.27, -0.37], [-0.27, 0.37], [0.27, 0.37]];
  for (const [cx, cz] of corners) {
    addPart(parts, new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), ROPE, base,
      x + cx * 1.5, y + 0.22, z + cz * 1.4, 1, 1, 1, ry,
      cz > 0 ? -0.5 : 0.5, cx > 0 ? 0.5 : -0.5);
  }
}

/** Mani prayer wheel: wooden post, red drum with gold bands. */
function prayerWheel(
  parts: THREE.BufferGeometry[],
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  ry: number,
): void {
  addPart(parts, new THREE.BoxGeometry(0.07, 0.52, 0.07), WOOD, base, x, y + 0.26, z, 1, 1, 1, ry);
  addPart(parts, new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), WHEEL_RED, base, x, y + 0.42, z, 1, 1, 1, ry);
  addPart(parts, new THREE.CylinderGeometry(0.105, 0.105, 0.03, 8), GOLD, base, x, y + 0.5, z, 1, 1, 1, ry);
  addPart(parts, new THREE.CylinderGeometry(0.105, 0.105, 0.03, 8), GOLD, base, x, y + 0.34, z, 1, 1, 1, ry);
  addPart(parts, new THREE.SphereGeometry(0.035, 6, 5), GOLD, base, x, y + 0.55, z, 1, 1, 1, ry);
}

/** Whitewashed chorten with three-tiered square base, dome, harmika and umbrella spire. */
function chorten(parts: THREE.BufferGeometry[], base: THREE.Matrix4): void {
  const tiers: Array<[number, number, number]> = [
    [0.7, 0.16, 0.08],
    [0.55, 0.14, 0.23],
    [0.42, 0.12, 0.36],
  ];
  for (const [w, h, cy] of tiers) {
    addPart(parts, new THREE.BoxGeometry(w, h, w), WHITEWASH, base, 0, cy, 0);
  }
  const domeY = 0.42;
  addPart(parts, new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), WHITEWASH, base, 0, domeY, 0);
  addPart(parts, new THREE.BoxGeometry(0.1, 0.08, 0.1), MAROON, base, 0, domeY + 0.24, 0); // harmika
  // umbrella spire: stacked rings
  let sy = domeY + 0.28;
  for (const r of [0.09, 0.07, 0.05]) {
    addPart(parts, new THREE.CylinderGeometry(r, r, 0.045, 8), GOLD, base, 0, sy + 0.022, 0);
    sy += 0.055;
  }
  addPart(parts, new THREE.SphereGeometry(0.045, 8, 6), GOLD, base, 0, sy + 0.05, 0); // finial
  // four miniature stupas at the plinth corners
  for (const [cx, cz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    addPart(parts, new THREE.BoxGeometry(0.12, 0.1, 0.12), WHITEWASH, base, cx, 0.05, cz);
    addPart(parts, new THREE.SphereGeometry(0.055, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), WHITEWASH, base, cx, 0.1, cz);
    addPart(parts, new THREE.ConeGeometry(0.03, 0.09, 6), GOLD, base, cx, 0.18, cz);
  }
}

/** Three-tiered gompa with sloping whitewashed walls, timber bands and golden roofs. */
function gompa(parts: THREE.BufferGeometry[], base: THREE.Matrix4, y0: number): void {
  const q = Math.PI / 4; // align the 4-sided prisms' faces
  // tier 1 — sloping whitewashed walls
  addPart(parts, new THREE.CylinderGeometry(0.5, 0.62, 0.62, 4), WHITEWASH, base, 0, y0 + 0.31, 0, 1, 1, 1, q);
  // kangsheng parapet crowning the walls
  addPart(parts, new THREE.BoxGeometry(0.78, 0.09, 0.78), MAROON, base, 0, y0 + 0.665, 0, 1, 1, 1, q);
  // maroon door + dark windows on tier 1
  addPart(parts, new THREE.BoxGeometry(0.2, 0.34, 0.04), MAROON_DARK, base, 0, y0 + 0.19, 0.445);
  addPart(parts, new THREE.BoxGeometry(0.1, 0.12, 0.04), LAPIS, base, -0.26, y0 + 0.38, 0.41);
  addPart(parts, new THREE.BoxGeometry(0.1, 0.12, 0.04), LAPIS, base, 0.26, y0 + 0.38, 0.41);
  // tier 2 — white walls with a maroon timber window band
  addPart(parts, new THREE.CylinderGeometry(0.36, 0.44, 0.5, 4), WHITEWASH, base, 0, y0 + 0.96, 0, 1, 1, 1, q);
  addPart(parts, new THREE.BoxGeometry(0.6, 0.12, 0.6), MAROON, base, 0, y0 + 0.96, 0, 1, 1, 1, q);
  addPart(parts, new THREE.BoxGeometry(0.09, 0.08, 0.03), LAPIS, base, -0.18, y0 + 0.96, 0.30);
  addPart(parts, new THREE.BoxGeometry(0.09, 0.08, 0.03), LAPIS, base, 0.18, y0 + 0.96, 0.30);
  addPart(parts, new THREE.BoxGeometry(0.09, 0.08, 0.03), LAPIS, base, 0, y0 + 0.96, 0.30);
  // tier 3 — ochre/maroon shrine room
  addPart(parts, new THREE.CylinderGeometry(0.24, 0.3, 0.42, 4), MAROON, base, 0, y0 + 1.42, 0, 1, 1, 1, q);
  addPart(parts, new THREE.BoxGeometry(0.4, 0.08, 0.4), OCHRE, base, 0, y0 + 1.24, 0, 1, 1, 1, q);
  // golden tiered roof + finial
  addPart(parts, new THREE.ConeGeometry(0.44, 0.34, 4), GOLD, base, 0, y0 + 1.8, 0, 1, 1, 1, q);
  addPart(parts, new THREE.CylinderGeometry(0.03, 0.05, 0.22, 6), GOLD, base, 0, y0 + 2.06, 0);
  addPart(parts, new THREE.SphereGeometry(0.055, 8, 6), GOLD, base, 0, y0 + 2.2, 0);
  // rooftop flag pole (lung ta strings start here)
  addPart(parts, new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), WOOD, base, 0, y0 + 2.2, 0);
}

export const himalayaBiome: BiomeModule = {
  id: 'himalaya',
  name: 'Himalayan Foothills',
  nameHi: 'हिमालय की तलहटी',
  zone: { latDeg: 72, lonDeg: 0, radiusRad: 0.5 },
  signatureDetails: [
    'Three-tiered gompa with whitewashed sloping walls, maroon/ochre timber bands, golden roofs and a kangsheng parapet on a snowy crag (Tawang-inspired, original design).',
    'Whitewashed chorten: three-tiered square base, hemispherical dome, harmika, umbrella spire and golden finial with four miniature corner stupas (Gorsam-inspired).',
    'Lung ta prayer flags in five-element order — blue (sky), white (air), red (fire), green (water), yellow (earth) — strung diagonally high-to-low with animated sway.',
    'Mani prayer wheels (wooden posts, red drums with gold bands) in an arc for circumambulation around the chorten.',
    'Snow-laden deodar cedars, black yak-wool tents, and a pink-gold alpenglow blush on the snow caps.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): BiomeBuildResult {
    const parts: THREE.BufferGeometry[] = [];
    const rand = ctx.rand;

    // ------------------------------------------------- crag + gompa ----
    const cragBase = anchor(72, 0, ctx, 0);
    const CRAG_H = 2.3;
    addPart(parts, new THREE.CylinderGeometry(0.35, 1.9, CRAG_H, 7), ROCK, cragBase, 0, CRAG_H / 2, 0);
    addPart(parts, new THREE.CylinderGeometry(0.22, 0.5, 0.9, 7), SNOW, cragBase, 0, 1.85, 0);
    addPart(parts, new THREE.CylinderGeometry(0.12, 0.24, 0.35, 7), SNOW_BLUSH, cragBase, 0, 2.12, 0); // alpenglow
    // rock outcrops at the crag foot
    addPart(parts, new THREE.DodecahedronGeometry(0.22, 0), ROCK, cragBase, -1.6, 0.1, 1.1, 1, 0.7, 1);
    addPart(parts, new THREE.DodecahedronGeometry(0.16, 0), ROCK, cragBase, 1.7, 0.08, 0.9, 1, 0.6, 1.2);
    // the gompa, sunk slightly into the snow cap
    gompa(parts, cragBase, CRAG_H - 0.05);
    const roofTop = new THREE.Vector3(0, CRAG_H - 0.05 + 2.42, 0).applyMatrix4(cragBase);
    // tall flag pole on the crag shoulder
    pole(parts, cragBase, 1.55, 0, -1.2, 1.5);
    const p1Top = new THREE.Vector3(1.55, 1.5, -1.2).applyMatrix4(cragBase);
    // one deodar close to the crag for a flag string
    deodar(parts, cragBase, 2.4, 0, 1.6, 1.0);
    const deodarTop = new THREE.Vector3(2.4, 1.1, 1.6).applyMatrix4(cragBase);

    // ------------------------------------------------- chorten + wheels ----
    const chBase = anchor(71.2, -1.6, ctx, 0, rand() * Math.PI * 2);
    chorten(parts, chBase);
    // mani wheels in an arc for circumambulation — each gets its OWN anchor
    // (they're offset from center, terrain height differs)
    for (let i = 0; i < 5; i++) {
      const a = (-60 + i * 30) * (Math.PI / 180);
      // Offset in degrees (0.66 units ≈ 1.9° on r=20 planet)
      const latOff = (Math.cos(a) * 1.9);
      const lonOff = (Math.sin(a) * 1.9) / Math.cos((71.2 * Math.PI) / 180);
      const wBase = anchor(71.2 + latOff, -1.6 + lonOff, ctx, 0, a);
      prayerWheel(parts, wBase, 0, 0, 0, 0);
    }
    // flag poles flanking the chorten (individual anchors)
    const poleABase = anchor(71.2 - 2.0, -1.6, ctx, 0, 0);
    pole(parts, poleABase, 0, 0, 0, 1.2);
    const poleBBase = anchor(71.2 + 2.0, -1.6, ctx, 0, 0);
    pole(parts, poleBBase, 0, 0, 0, 1.2);
    const chA = new THREE.Vector3(0, 1.2, 0).applyMatrix4(poleABase);
    const chB = new THREE.Vector3(0, 1.2, 0).applyMatrix4(poleBBase);

    // ------------------------------------------------- yak-wool tent camp ----
    // Each tent gets its own anchor (offsets need individual terrain sampling)
    const tent1Base = anchor(73.1 - 1.5, 1.8 + 0.3, ctx, 0, 0.3);
    tent(parts, tent1Base, 0, 0, 0, 0);
    const tent2Base = anchor(73.1 + 1.5, 1.8 - 0.4, ctx, 0, -0.4);
    tent(parts, tent2Base, 0, 0, 0, 0);
    const tentPoleBase = anchor(73.1, 1.8 + 2.0, ctx, 0, 0);
    pole(parts, tentPoleBase, 0, 0, 0, 1.0);
    const tA = new THREE.Vector3(0, 0.75, 0.35).applyMatrix4(tent1Base);
    const tB = new THREE.Vector3(0, 1.0, 0).applyMatrix4(tentPoleBase);

    // ------------------------------------------------- deodar grove ----
    const cragDir = ctx.latLonToDir(72, 0);
    let placed = 0;
    let guard = 0;
    while (placed < 6 && guard++ < 60) {
      const dir = sampleInZone(72, 0, 0.45, rand);
      if (flatDist(dir, cragDir) < radToWorld(0.09)) continue; // keep the crag clear
      const m = surfaceFrame(dir, ctx.groundH(dir));
      deodar(parts, m, 0, 0, 0, 0.8 + rand() * 0.7);
      placed++;
    }

    // ------------------------------------------------- mani stone piles ----
    for (let i = 0; i < 3; i++) {
      const dir = sampleInZone(72, 0, 0.4, rand);
      const m = surfaceFrame(dir, ctx.groundH(dir));
      addPart(parts, new THREE.DodecahedronGeometry(0.13, 0), STONE, m, 0, 0.06, 0);
      addPart(parts, new THREE.DodecahedronGeometry(0.1, 0), STONE, m, 0.14, 0.05, 0.06, 1, 0.8, 1);
      addPart(parts, new THREE.DodecahedronGeometry(0.09, 0), STONE, m, -0.12, 0.045, -0.07, 1, 0.7, 1);
    }

    // ------------------------------------------------- snow patches ----
    for (let i = 0; i < 4; i++) {
      const dir = sampleInZone(72, 0, 0.42, rand);
      const m = surfaceFrame(dir, ctx.groundH(dir));
      addPart(parts, new THREE.SphereGeometry(0.3 + rand() * 0.25, 7, 5), SNOW, m, 0, 0, 0, 1, 0.22, 1);
    }

    // ------------------------------------------------- village ----
    // A cozy mountain village: post office, school, houses, tea stall,
    // all connected by dirt roads so the player always knows where to go.
    {
      const vAnchor = (la: number, lo: number) => anchor(la, lo, ctx, 0);
      // Buildings (each on its own terrain-sampled anchor)
      buildPostOffice(parts, vAnchor(72.05, 1.6));
      buildSchool(parts, vAnchor(71.82, 2.3));
      buildHouse(parts, vAnchor(72.25, 2.1), 'stone');
      buildHouse(parts, vAnchor(71.92, 1.05), 'stone');
      buildTeaStall(parts, vAnchor(72.12, 1.75));
      // Roads: village loop + spurs to chorten, gompa, and NPCs
      const D = (la: number, lo: number) => ctx.latLonToDir(la, lo);
      // Main village loop
      buildRoad(parts, [D(72.05, 1.6), D(72.12, 1.75), D(72.25, 2.1), D(71.82, 2.3), D(71.92, 1.05), D(72.05, 1.6)]);
      // Spur to chorten + Ama Lhamo
      buildRoad(parts, [D(72.05, 1.6), D(71.7, 0.2), D(71.2, -1.6)]);
      // Spur to gompa + Tenzin
      buildRoad(parts, [D(72.05, 1.6), D(72.15, 0.8), D(72.3, 0.6), D(72, 0)]);
    }

    // ------------------------------------------------- flag strings ----
    interface FlagString { a: THREE.Vector3; b: THREE.Vector3; count: number; sag: number }
    const strings: FlagString[] = [
      { a: roofTop, b: p1Top, count: 12, sag: 0.1 },
      { a: chA, b: chB, count: 10, sag: 0.06 },
      { a: tA, b: tB, count: 8, sag: 0.05 },
      { a: chB, b: p1Top, count: 12, sag: 0.12 },
      { a: roofTop, b: deodarTop, count: 10, sag: 0.12 },
    ];

    // rope for each string (static, merged)
    for (const s of strings) {
      const dirV = s.b.clone().sub(s.a);
      const len = dirV.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dirV.clone().normalize());
      const base = new THREE.Matrix4().compose(
        s.a.clone().add(s.b).multiplyScalar(0.5),
        q,
        new THREE.Vector3(1, 1, 1),
      );
      addPart(parts, new THREE.BoxGeometry(len, 0.014, 0.014), ROPE, base, 0, 0, 0);
    }

    // one merged static mesh — object #1
    const merged = mergeGeometries(parts, false);
    if (merged === null) throw new Error('himalaya: geometry merge failed');
    const staticMesh = new THREE.Mesh(merged, biomeMaterial());
    scene.add(staticMesh);

    // ------------------------------------------------- prayer flags (animated) ----
    // Count flags first.
    let flagTotal = 0;
    for (const s of strings) flagTotal += s.count;

    const flagGeo = new THREE.PlaneGeometry(FLAG_W, FLAG_H);
    const flagMat = (() => { const m = toon(0xffffff); m.side = THREE.DoubleSide; return m; })();
    const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagTotal);

    interface FlagState { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; phase: number }
    const flagStates: FlagState[] = [];
    const upRef = cragDir.clone();
    let fi = 0;
    for (const s of strings) {
      const xAxis = s.b.clone().sub(s.a).normalize();
      let zAxis = new THREE.Vector3().crossVectors(xAxis, upRef);
      if (zAxis.lengthSq() < 1e-6) zAxis.set(1, 0, 0);
      zAxis.normalize();
      const down = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize().negate();
      const basisQ = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(xAxis, down, zAxis),
      );
      for (let i = 0; i < s.count; i++) {
        const t = 0.06 + (0.88 * i) / Math.max(1, s.count - 1);
        const pt = s.a.clone().lerp(s.b, t);
        pt.y -= Math.sin(Math.PI * t) * s.sag;
        const cx = pt.x + down.x * (FLAG_H / 2 - 0.01);
        const cy = pt.y + down.y * (FLAG_H / 2 - 0.01);
        const cz = pt.z + down.z * (FLAG_H / 2 - 0.01);
        flagStates.push({ x: cx, y: cy, z: cz, qx: basisQ.x, qy: basisQ.y, qz: basisQ.z, qw: basisQ.w, phase: rand() * Math.PI * 2 });
        flags.setColorAt(fi, new THREE.Color(FLAG_COLORS[fi % FLAG_COLORS.length]));
        fi++;
      }
    }
    if (flags.instanceColor !== null) flags.instanceColor.needsUpdate = true;
    scene.add(flags); // object #2

    // ------------------------------------------------- per-frame sway ----
    const scratchQ = new THREE.Quaternion();
    const scratchQB = new THREE.Quaternion();
    const scratchQX = new THREE.Quaternion();
    const scratchP = new THREE.Vector3();
    const scratchS = new THREE.Vector3(1, 1, 1);
    const scratchM = new THREE.Matrix4();
    const xAxisUnit = new THREE.Vector3(1, 0, 0);

    const update = (_dt: number, t: number): void => {
      for (let i = 0; i < flagStates.length; i++) {
        const f = flagStates[i];
        const sway = Math.sin(t * 2.1 + f.phase) * 0.38 + Math.sin(t * 3.9 + f.phase * 1.7) * 0.08;
        scratchQB.set(f.qx, f.qy, f.qz, f.qw);
        scratchQX.setFromAxisAngle(xAxisUnit, sway);
        scratchQ.copy(scratchQB).multiply(scratchQX);
        scratchP.set(f.x, f.y, f.z);
        scratchM.compose(scratchP, scratchQ, scratchS);
        flags.setMatrixAt(i, scratchM);
      }
      flags.instanceMatrix.needsUpdate = true;
    };
    // initialize matrices once so the flags are visible before the first frame
    update(0, 0);

    return {
      update,
      npcs: [
        {
          id: 'himalaya-tenzin',
          name: 'Tenzin',
          nameHi: 'तेनज़िन',
          role: 'Novice monk of the gompa',
          latDeg: 72.3,
          lonDeg: 0.6,
          skin: 0xd9a077,
          tunic: 0x8b2323,
          accessory: 'cap',
          accessoryColor: 0x7a1f1f,
          line: "If you bring me Ama Lhamo's thukpa recipe and a lump of her yak-butter, I will finally cook for the whole gompa!",
          lineHi: 'अगर तुम अमा ल्हामो की थुकपा विधि और उनके याक-मक्खन का एक टुकड़ा ला दो, तो मैं पूरे गोम्पा के लिए खाना बनाऊँगा!',
        },
        {
          id: 'himalaya-ama-lhamo',
          name: 'Ama Lhamo',
          nameHi: 'अमा ल्हामो',
          role: 'Foothill grandmother & yak-butter churner',
          latDeg: 71.7,
          lonDeg: -1.4,
          skin: 0xc98e5f,
          tunic: 0x7a5230,
          accessory: 'shawl',
          accessoryColor: 0x30c2b8,
          line: 'Thukpa for cold nights, child — take my recipe, and tell young Tenzin the butter is already churning.',
          lineHi: 'ठंडी रातों के लिए थुकपा, बच्चे — मेरी विधि ले जाओ, और नन्हे तेनज़िन से कहना मक्खन पहले से मथा जा रहा है।',
        },
      ],
    };
  },
};
