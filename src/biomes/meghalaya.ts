/**
 * Meghalaya — Living Root Bridges (Nongriat, Khasi Hills)
 * Original cozy low-poly interpretation, inspired by the real place.
 *
 * RESEARCHED SIGNATURE DETAILS (modeled below):
 * 1. Jingkieng Nongriat — the world's only double-decker living root bridge: two
 *    stacked root walkways, the second tier grown after monsoon floods submerged
 *    the first (150-200+ years old, holds ~50 people).
 * 2. Braided aerial roots of the Ficus elastica (Indian rubber fig), guided by
 *    Khasi growers through hollowed areca-palm/bamboo scaffolds over 15-25 years;
 *    the bridge stays alive, thickens and strengthens with age.
 * 3. Bioluminescent forest floor — Khasi Hills host blue-green glowing fungi
 *    (Roridomyces phyllostachydis, first recorded near Mawlynnong, 2020), carpeting
 *    the wet-season forest floor; rendered here as neon glow-moss patches.
 * 4. Mawphlang sacred-grove feel ("mossy stone"): trunks cloaked in emerald moss,
 *    fern carpets, soft light shafts through the canopy, mist resting low.
 * 5. Meghalaya's ~325 orchid species in the Khasi Hills, including rare ghost
 *    orchids — tiny pink/white orchid blooms on slender stems.
 */
import * as THREE from 'three';
import { toon } from '../sketch';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BiomeModule, BiomeBuildResult, BiomeCtx } from './types';
import { PLANET_RADIUS } from '../planet';
import { paint, biomeMaterial, sampleInZone, flatDist, radToWorld, surfacePos, surfaceQuat } from './geo';

const UP_Y = new THREE.Vector3(0, 1, 0);

// ---------- palette ----------
const BARK = 0x6b4a2e;
const BARK_DARK = 0x54371f;
const BARK_LIGHT = 0x7d5a38;
const DECK_A = 0x7a5636;
const DECK_B = 0x6e4e30;
const JADE = 0x1f7a4d;
const JADE_LIGHT = 0x2b8a5b;
const FERN_A = 0x2f9e44;
const FERN_B = 0x237a35;
const MOSS = 0x40c057;
const MOSS_GLOW = 0x8cf59b;
const ROCK = 0x8d8577;
const ROCK_MOSS = 0x6b7f5a;
const ORCHID_PINK = 0xf783ac;
const ORCHID_WHITE = 0xfff0f6;
const LIANA = 0x3d8b4f;
const TRAIL = 0xc9a86a;
const LANTERN = 0xffd98a;
const POOL = 0x0f6f7a;
const FOAM = 0xe8f5f2;
const DECK_WOOD = 0x7a5636;

const ZONE_LAT = 34;
const ZONE_LON = 42;
const ZONE_RAD = 0.5;

/** Rigid frame at a surface direction: local +Y along the normal, yaw about it. */
function frameAt(
  ctx: BiomeCtx,
  dir: THREE.Vector3,
  lift: number,
  yaw: number,
): THREE.Matrix4 {
  const pos = surfacePos(dir, ctx.groundH(dir) + lift);
  const q = surfaceQuat(dir, yaw);
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
}

/** Orthonormal horizontal basis at center, rotated by rotRad in the XZ plane. */
function tangentBasis(
  center: THREE.Vector3,
  rotRad: number,
): [THREE.Vector3, THREE.Vector3] {
  // Flat world: just rotate the XZ axes.
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  const t1 = new THREE.Vector3(c, 0, -s);
  const t2 = new THREE.Vector3(s, 0, c);
  return [t1, t2];
}

/**
 * "Drape" a local (x,y,z) point onto the planet: direction from the tangent
 * offset, height from terrain + local y, facing yaw. Keeps long structures
 * (bridge, stream) hugging the curved terrain.
 */
function drape(
  ctx: BiomeCtx,
  t1: THREE.Vector3,
  t2: THREE.Vector3,
  center: THREE.Vector3,
  x: number,
  y: number,
  z: number,
  yaw: number,
): THREE.Matrix4 {
  const dir = center
    .clone()
    .addScaledVector(t1, x)
    .addScaledVector(t2, z);
  dir.y = 0; // flat world: no normalize
  return frameAt(ctx, dir, y, yaw);
}

/** Collects painted, transformed geometries and merges them into one mesh. */
class Bucket {
  private geos: THREE.BufferGeometry[] = [];

  add(
    geo: THREE.BufferGeometry,
    hex: number,
    base: THREE.Matrix4,
    lx = 0,
    ly = 0,
    lz = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy?: number,
    sz?: number,
  ): void {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(lx, ly, lz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy ?? sx, sz ?? sx),
    );
    local.premultiply(base);
    // mergeGeometries needs a uniform index layout: polyhedron geometries
    // (icosahedron/dodecahedron) are non-indexed, primitives are indexed.
    const g = geo.index ? geo.toNonIndexed() : geo;
    paint(g, hex);
    g.deleteAttribute('uv');
    g.applyMatrix4(local);
    this.geos.push(g);
  }

  merge(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos, false);
    if (!merged) {
      throw new Error('meghalaya: geometry merge failed');
    }
    return merged;
  }
}

type Rand = () => number;

/** Rubber fig (Ficus elastica) with root flares, moss cloak and hanging lianas. */
function rubberFig(
  b: Bucket,
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  s: number,
  rand: Rand,
): void {
  b.add(
    new THREE.CylinderGeometry(0.22 * s, 0.36 * s, 3.8 * s, 7),
    BARK,
    base,
    x,
    y + 1.9 * s,
    z,
  );
  // root flares — cones splayed around the base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand() * 0.6;
    b.add(
      new THREE.ConeGeometry(0.4 * s, 1.4 * s, 6),
      BARK_DARK,
      base,
      x + Math.cos(a) * 0.55 * s,
      y + 0.55 * s,
      z + Math.sin(a) * 0.55 * s,
      0.28 * Math.cos(a),
      0,
      -0.28 * Math.sin(a),
    );
  }
  // moss cloak on the trunk (Mawphlang sacred-grove feel)
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    b.add(
      new THREE.SphereGeometry(0.34 * s, 7, 5),
      MOSS,
      base,
      x + Math.cos(a) * 0.3 * s,
      y + (0.9 + rand() * 1.8) * s,
      z + Math.sin(a) * 0.3 * s,
      0,
      0,
      0,
      1,
      1.4,
      0.6,
    );
  }
  // canopy blobs — deep jade
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const r = (0.7 + rand() * 0.9) * s;
    const g = new THREE.SphereGeometry((1.0 + rand() * 0.6) * s, 8, 6);
    g.scale(1, 0.75, 1);
    b.add(
      g,
      i % 2 === 0 ? JADE : JADE_LIGHT,
      base,
      x + Math.cos(a) * r * 0.55,
      y + (3.6 + rand() * 1.1) * s,
      z + Math.sin(a) * r * 0.55,
    );
  }
  // hanging lianas
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    b.add(
      new THREE.CylinderGeometry(0.035 * s, 0.055 * s, 2.4 * s, 5),
      LIANA,
      base,
      x + Math.cos(a) * 1.2 * s,
      y + 2.3 * s,
      z + Math.sin(a) * 1.2 * s,
      0.07,
      0,
      0.06,
    );
  }
}

/** Giant fern: radiating low-poly fronds from stretched icosahedrons. */
function fern(
  b: Bucket,
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  s: number,
  rand: Rand,
): void {
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rand() * 0.4;
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(0.32 * s, 0.055 * s, 1.55 * s);
    b.add(
      g,
      i % 2 === 0 ? FERN_A : FERN_B,
      base,
      x + Math.cos(a) * 0.85 * s,
      y + 0.55 * s,
      z + Math.sin(a) * 0.85 * s,
      -0.45,
      Math.PI / 2 - a,
      0,
    );
  }
  b.add(new THREE.IcosahedronGeometry(0.28 * s, 0), FERN_B, base, x, y + 0.16 * s, z);
}

/** Grey boulder with a moss (sometimes glow-moss) cap. */
function mossRock(
  b: Bucket,
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  s: number,
  rand: Rand,
): void {
  b.add(
    new THREE.DodecahedronGeometry(0.62 * s, 0),
    ROCK,
    base,
    x,
    y + 0.3 * s,
    z,
    rand() * 0.6,
    rand() * Math.PI * 2,
    0,
  );
  const glow = rand() < 0.45;
  b.add(
    new THREE.CylinderGeometry(0.42 * s, 0.5 * s, 0.14 * s, 8),
    glow ? MOSS_GLOW : MOSS,
    base,
    x,
    y + 0.68 * s,
    z,
  );
  // bioluminescent floor dots around the rock
  if (glow) {
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2;
      const r = (0.9 + rand() * 0.8) * s;
      b.add(
        new THREE.SphereGeometry(0.07 * s, 6, 5),
        MOSS_GLOW,
        base,
        x + Math.cos(a) * r,
        y + 0.08 * s,
        z + Math.sin(a) * r,
      );
    }
  }
}

/** Orchid: slender stem with tiny pink/white blooms. */
function orchid(
  b: Bucket,
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  s: number,
  rand: Rand,
): void {
  b.add(
    new THREE.CylinderGeometry(0.03 * s, 0.045 * s, 0.75 * s, 5),
    FERN_A,
    base,
    x,
    y + 0.37 * s,
    z,
  );
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    b.add(
      new THREE.IcosahedronGeometry(0.11 * s, 0),
      i % 2 === 0 ? ORCHID_PINK : ORCHID_WHITE,
      base,
      x + Math.cos(a) * 0.17 * s,
      y + (0.55 + rand() * 0.35) * s,
      z + Math.sin(a) * 0.17 * s,
    );
  }
}

/** One braided deck: plank segments + herringbone root strands + torus-arc rail. */
function deck(
  ctx: BiomeCtx,
  b: Bucket,
  t1: THREE.Vector3,
  t2: THREE.Vector3,
  center: THREE.Vector3,
  deckY: number,
  span: number,
  width: number,
): void {
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const x = -span / 2 + ((i + 0.5) * span) / segs;
    const base = drape(ctx, t1, t2, center, x, deckY, 0, 0);
    b.add(
      new THREE.BoxGeometry(span / segs + 0.18, 0.26, width),
      i % 2 === 0 ? DECK_A : DECK_B,
      base,
    );
  }
  for (const side of [-1, 1]) {
    const railSegs = 12;
    for (let i = 0; i < railSegs; i++) {
      const x = -span / 2 + ((i + 0.5) * span) / railSegs;
      const base = drape(ctx, t1, t2, center, x, deckY, (side * width) / 2, 0);
      // twisted root strand — herringbone tilt, alternating bark tones
      b.add(
        new THREE.CylinderGeometry(0.05, 0.065, 1.15, 5),
        i % 2 === 0 ? BARK : BARK_LIGHT,
        base,
        0,
        0.55,
        0,
        0,
        0,
        (i % 2 === 0 ? 1 : -1) * 0.5,
      );
      // braided top rail — half-torus arcs in alternating tones
      b.add(
        new THREE.TorusGeometry(0.32, 0.06, 6, 10, Math.PI),
        i % 2 === 0 ? BARK_DARK : BARK,
        base,
        0,
        1.06,
        0,
      );
    }
  }
}

export const meghalayaBiome: BiomeModule = {
  id: 'meghalaya',
  name: 'Meghalaya — Living Root Bridges',
  nameHi: 'मेघालय — जीवित जड़ पुल',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  signatureDetails: [
    'Jingkieng Nongriat double-decker living root bridge: two stacked root walkways, the upper tier grown after monsoon floods submerged the first.',
    'Braided Ficus elastica aerial roots guided by Khasi growers through hollowed areca-palm scaffolds over 15–25 years; the bridge stays alive and strengthens.',
    'Bioluminescent forest floor: neon glow-moss patches inspired by the Khasi Hills’ blue-green glowing fungi (Roridomyces phyllostachydis, 2020).',
    'Mawphlang sacred-grove feel: emerald moss cloaking trunks, fern carpets, low drifting mist.',
    'Khasi Hills orchids (~325 species incl. rare ghost orchids): tiny pink/white blooms on slender stems.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): BiomeBuildResult {
    const rand = ctx.rand;
    const bucket = new Bucket();
    const center = ctx.latLonToDir(ZONE_LAT, ZONE_LON);
    const [t1, t2] = tangentBasis(center, 0.7);

    // ---------- hero: double-decker living root bridge ----------
    const span = 8;
    const width = 1.7;
    const lowerY = 1.7;
    const upperY = 3.7;
    deck(ctx, bucket, t1, t2, center, lowerY, span, width);
    deck(ctx, bucket, t1, t2, center, upperY, span, width);
    // braided root posts joining the two tiers at both ends
    for (const ex of [-3.5, 3.5]) {
      for (const ez of [-0.7, 0.7]) {
        const base = drape(ctx, t1, t2, center, ex, lowerY, ez, 0);
        bucket.add(
          new THREE.CylinderGeometry(0.09, 0.11, upperY - lowerY + 0.4, 6),
          BARK_DARK,
          base,
          0,
          (upperY - lowerY) / 2,
          0,
          0,
          0,
          0.06,
        );
      }
    }
    // living supports: rubber figs at each end of the span
    for (const ex of [-4.1, 4.1]) {
      for (const ez of [-2.1, 2.1]) {
        const base = drape(ctx, t1, t2, center, ex, 0, ez, rand() * Math.PI * 2);
        rubberFig(bucket, base, 0, 0, 0, 1.05, rand);
      }
    }
    // young roots still dangling under the lower deck
    for (let i = 0; i < 6; i++) {
      const x = -3 + i * 1.2;
      const base = drape(ctx, t1, t2, center, x, lowerY - 0.1, 0.3, 0);
      bucket.add(
        new THREE.CylinderGeometry(0.03, 0.045, 1.1, 5),
        BARK_DARK,
        base,
        0,
        -0.55,
        0,
        0.05,
        0,
        0.04,
      );
    }

    // ---------- stream under the bridge (separate transparent mesh) ----------
    const waterGeos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 8; k++) {
      const z = -12 + k * 3.2 + 1.6;
      const x = 1.0 * Math.sin(z * 0.3);
      const yaw = Math.atan2(0.3 * Math.cos(z * 0.3), 1);
      const base = drape(ctx, t1, t2, center, x, 0.16, z, yaw);
      const g = new THREE.PlaneGeometry(3.8, 3.6);
      g.rotateX(-Math.PI / 2);
      g.applyMatrix4(base);
      waterGeos.push(g);
    }
    const waterGeo = mergeGeometries(waterGeos, false);
    if (!waterGeo) {
      throw new Error('meghalaya: stream merge failed');
    }
    const stream = new THREE.Mesh(
      waterGeo,
      (() => { const m = toon(0x0f6f7a); m.transparent = true; m.opacity = 0.72; return m; })(),
    );
    scene.add(stream);

    // stepping stones beside the bridge
    for (let i = 0; i < 3; i++) {
      const base = drape(ctx, t1, t2, center, 2.6 + i * 0.9, 0.25, 2.2 - i * 1.6, 0);
      bucket.add(
        new THREE.CylinderGeometry(0.42, 0.5, 0.3, 8),
        ROCK,
        base,
        0,
        0,
        0,
        0,
        rand() * Math.PI,
        0,
      );
    }

    // ---------- WATERFALL TRAIL (Gemini rule: promising trail → rewarding clearing) ----------
    // A winding dirt path leads east from the root bridge to a waterfall clearing.
    // The falls are visible through the trees from afar — a promise that pulls you in.
    const fallX = 15; // waterfall center, t1 offset from bridge
    // Trail: 12 winding segments from the bridge (x=5) to the falls (x=13.5)
    for (let i = 0; i < 12; i++) {
      const k = i / 11;
      const tx = 5 + k * 8.5;
      const tz = Math.sin(k * Math.PI * 2.2) * 1.6;
      const yaw = Math.atan2(
        Math.cos((k + 0.05) * Math.PI * 2.2) * 1.6 * 0.1,
        0.77,
      );
      const base = drape(ctx, t1, t2, center, tx, 0.06, tz, yaw);
      bucket.add(
        new THREE.BoxGeometry(1.6, 0.12, 1.1),
        TRAIL,
        base,
        0,
        0,
        0,
        0,
        0,
        0,
      );
    }
    // Trail lanterns: warm lights guiding the way (dusk magic)
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      const tx = 5.8 + k * 7.4;
      const tz = Math.sin(k * Math.PI * 2.2) * 1.6 + 1.3;
      const base = drape(ctx, t1, t2, center, tx, 0, tz, 0);
      bucket.add(
        new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6),
        BARK_DARK,
        base,
        0,
        0.8,
        0,
        0,
        0,
        0,
      );
      bucket.add(
        new THREE.SphereGeometry(0.16, 6, 5),
        LANTERN,
        base,
        0,
        1.7,
        0,
        0,
        0,
        0,
      );
    }

    // Waterfall: rock cliff with falling water + plunge pool + viewpoint deck.
    const fallBase = drape(ctx, t1, t2, center, fallX, 0, 0, 0);
    // Cliff face: stacked mossy rocks
    for (let i = 0; i < 7; i++) {
      const ry = 1.2 + i * 1.05;
      const rw = 4.6 - i * 0.35;
      bucket.add(
        new THREE.BoxGeometry(rw, 1.25, 1.6),
        ROCK_MOSS,
        fallBase,
        (rand() - 0.5) * 0.5,
        ry,
        -0.4,
        0,
        (rand() - 0.5) * 0.2,
        0,
      );
    }
    // Plunge pool
    bucket.add(
      new THREE.CylinderGeometry(2.6, 2.9, 0.35, 12),
      POOL,
      fallBase,
      0,
      0.1,
      1.6,
      0,
      0,
      0,
    );
    // Foam ring where the falls hit
    bucket.add(
      new THREE.TorusGeometry(1.1, 0.28, 6, 14),
      FOAM,
      fallBase,
      0,
      0.28,
      1.1,
      Math.PI / 2,
      0,
      0,
    );
    // Viewpoint deck: wooden platform facing the falls, with railing
    const deckBase = drape(ctx, t1, t2, center, fallX - 5.2, 0, 0.5, 0);
    bucket.add(
      new THREE.BoxGeometry(3.4, 0.22, 2.6),
      DECK_WOOD,
      deckBase,
      0,
      0.35,
      0,
      0,
      0,
      0,
    );
    for (const [px, pz] of [[-1.55, -1.15], [1.55, -1.15], [-1.55, 1.15], [1.55, 1.15]] as const) {
      bucket.add(
        new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6),
        BARK_DARK,
        deckBase,
        px,
        0.85,
        pz,
        0,
        0,
        0,
      );
    }
    // railing on the falls-facing side
    bucket.add(
      new THREE.BoxGeometry(3.4, 0.09, 0.09),
      DECK_WOOD,
      deckBase,
      0,
      1.25,
      1.15,
      0,
      0,
      0,
    );
    // Fireflies/orchids reward in the clearing
    for (let i = 0; i < 4; i++) {
      const dir = center.clone().addScaledVector(t1, fallX - 6 + rand() * 3).addScaledVector(t2, (rand() - 0.5) * 5);
      dir.y = 0;
      orchid(
        bucket,
        frameAt(ctx, dir, 0, rand() * Math.PI * 2),
        0,
        0,
        0,
        0.9 + rand() * 0.5,
        rand,
      );
    }

    // ---------- rainforest props scattered in the zone ----------
    const clearOfBridge = (dir: THREE.Vector3): boolean =>
      flatDist(dir, center) > radToWorld(0.14);

    for (let i = 0; i < 4; i++) {
      const dir = sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, rand);
      if (!clearOfBridge(dir)) continue;
      rubberFig(
        bucket,
        frameAt(ctx, dir, 0, rand() * Math.PI * 2),
        0,
        0,
        0,
        1.1 + rand() * 0.5,
        rand,
      );
    }
    for (let i = 0; i < 11; i++) {
      const dir = sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, rand);
      if (!clearOfBridge(dir)) continue;
      fern(
        bucket,
        frameAt(ctx, dir, 0, rand() * Math.PI * 2),
        0,
        0,
        0,
        0.9 + rand() * 0.8,
        rand,
      );
    }
    for (let i = 0; i < 7; i++) {
      const dir = sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, rand);
      if (!clearOfBridge(dir)) continue;
      mossRock(
        bucket,
        frameAt(ctx, dir, 0, rand() * Math.PI * 2),
        0,
        0,
        0,
        0.8 + rand() * 0.7,
        rand,
      );
    }
    for (let i = 0; i < 6; i++) {
      const dir = sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, rand);
      if (!clearOfBridge(dir)) continue;
      orchid(
        bucket,
        frameAt(ctx, dir, 0, rand() * Math.PI * 2),
        0,
        0,
        0,
        0.9 + rand() * 0.5,
        rand,
      );
    }

    // ---------- ONE merged mesh for all static geometry ----------
    const merged = new THREE.Mesh(bucket.merge(), biomeMaterial());
    scene.add(merged);

    // ---------- waterfall: animated falling-water planes (separate mesh) ----------
    const fallTex = (() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(180, 220, 235, 0.0)';
      g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * 128;
        const w = 2 + Math.random() * 5;
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, 'rgba(220, 240, 250, 0.85)');
        grad.addColorStop(1, 'rgba(220, 240, 250, 0.25)');
        g.fillStyle = grad;
        g.fillRect(x, 0, w, 256);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })();
    const fallMat = new THREE.MeshBasicMaterial({
      map: fallTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fallPlanes: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const fp = new THREE.Mesh(new THREE.PlaneGeometry(3.4 - i * 0.5, 7.5), fallMat);
      const fb = drape(ctx, t1, t2, center, fallX + (i - 1) * 0.35, 4.6, 0.55, 0);
      fp.applyMatrix4(fb);
      // tilt slightly to follow the cliff face
      fp.rotateX(0.06);
      scene.add(fp);
      fallPlanes.push(fp);
    }

    // ---------- mist: ONE InstancedMesh, slow drift in update ----------
    const mistGeo = new THREE.SphereGeometry(2.3, 12, 10);
    const mistMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const mist = new THREE.InstancedMesh(mistGeo, mistMat, 4);
    mist.frustumCulled = false;
    interface MistPuff {
      pos: THREE.Vector3;
      t1: THREE.Vector3;
      t2: THREE.Vector3;
      p1: number;
      p2: number;
    }
    const puffs: MistPuff[] = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 4; i++) {
      const dir = sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, rand);
      const pos = surfacePos(dir, ctx.groundH(dir) + 2.6 + rand() * 1.6);
      // flat world: mist drifts horizontally
      const mt1 = new THREE.Vector3(1, 0, 0);
      const mt2 = new THREE.Vector3(0, 0, 1);
      puffs.push({
        pos,
        t1: mt1,
        t2: mt2,
        p1: rand() * Math.PI * 2,
        p2: rand() * Math.PI * 2,
      });
      dummy.position.copy(pos);
      dummy.updateMatrix();
      mist.setMatrixAt(i, dummy.matrix);
    }
    mist.instanceMatrix.needsUpdate = true;
    scene.add(mist);

    const update = (_dt: number, t: number): void => {
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        dummy.position
          .copy(p.pos)
          .addScaledVector(p.t1, Math.sin(t * 0.12 + p.p1) * 1.4)
          .addScaledVector(p.t2, Math.cos(t * 0.09 + p.p2) * 1.1);
        dummy.scale.setScalar(1 + 0.07 * Math.sin(t * 0.2 + p.p1));
        dummy.updateMatrix();
        mist.setMatrixAt(i, dummy.matrix);
      }
      mist.instanceMatrix.needsUpdate = true;
      // waterfall: scroll the streak texture downward
      fallTex.offset.y = (t * 0.55) % 1;
    };

    return {
      update,
      npcs: [
        {
          id: 'meghalaya-guardian',
          name: 'Banshan Lyngdoh',
          nameHi: 'बानशान लिंगदोह',
          role: 'Forest Guardian',
          latDeg: 34.7,
          lonDeg: 43.1,
          skin: 0x8a5a3b,
          tunic: 0x2d6a4f,
          accessory: 'beard',
          accessoryColor: 0x2b2b2b,
          line: 'The roots remember every promise whispered under this bridge. Walk softly, and the forest will walk with you.',
          lineHi:
            'इस पुल के नीचे फुसफुसाया हर वादा जड़ों को याद रहता है। धीरे चलो, और जंगल तुम्हारे साथ चलेगा।',
        },
        {
          id: 'meghalaya-elder',
          name: 'Kong Thiarlang Syiem',
          nameHi: 'कोंग थियारलांग सिएम',
          role: 'Village Elder',
          latDeg: 33.1,
          lonDeg: 40.6,
          skin: 0x7c4f33,
          tunic: 0x7f4f3a,
          accessory: 'shawl',
          accessoryColor: 0xb08968,
          line: 'Take this seed packet across the double bridge to the guardian. Plant it where the mist rests, and the forest will remember your name.',
          lineHi:
            'बीज की यह थैली दोहरे पुल के पार रखवाले तक पहुँचा दो। जहाँ धुंध ठहरती है, वहाँ इसे बो देना — जंगल तुम्हारा नाम याद रखेगा।',
        },
      ],
    };
  },
};
