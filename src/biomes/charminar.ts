/**
 * Charminar biome — "Postcards from Bharat".
 *
 * ORIGINAL stylized interpretation of Hyderabad's famous four-minaret monument.
 * This is NOT a replica of the protected monument: proportions, ornament,
 * and detail are all invented for this game in the sketchbook style.
 *
 * Signature elements (stylized):
 * 1. Central square block with a big arch on each of the four sides
 * 2. Four tall slender minarets at the corners ("birthday candles")
 * 3. Small domes ("little round hats") capping each minaret
 * 4. Small dome on the central block
 * 5. Warm tan/rose stone with white-ish trim
 * 6. Bustling market stalls around the base
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, biomeMaterial , surfacePos , surfaceQuat} from './geo';
import { PLANET_RADIUS } from '../planet';
import type { BiomeModule, BiomeCtx, BiomeNPCDef } from './types';

const UP = new THREE.Vector3(0, 1, 0);

const ZONE_LAT = -60;
const ZONE_LON = -120;
const ZONE_RAD = 0.4;

// Sketchbook palette for Charminar (warm tan/rose)
const TAN = 0xe6c9a8; // warm tan stone
const ROSE_TAN = 0xd49a6a; // rose-tan accents
const TRIM = 0xf5e6d3; // white-ish trim
const INK = 0x8b5e3c; // ink lines
const ARCH_DARK = 0x3a2e24; // arch interior shadow
const OLIVE = 0x4a7c59; // olive trees
const STALL_RED = 0xc0392b; // market stall canopy
const STALL_YELLOW = 0xd4a017; // market stall canopy

interface LocalOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

function localM(x: number, y: number, z: number, o: LocalOpts = {}): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0),
  );
  const s = o.s ?? 1;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    q,
    new THREE.Vector3(o.sx ?? s, o.sy ?? s, o.sz ?? s),
  );
}

function placement(ctx: BiomeCtx, dir: THREE.Vector3, yaw = 0): THREE.Matrix4 {
  const h = ctx.groundH(dir);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(), surfaceQuat(dir, yaw), new THREE.Vector3(1, 1, 1));
  m.setPosition(surfacePos(dir, h));
  return m;
}

/** Slender minaret with "little round hat" dome cap. */
function minaret(h: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const r = h * 0.06;
  // Square base
  const baseB = new THREE.BoxGeometry(r * 3.4, h * 0.1, r * 3.4);
  baseB.translate(0, h * 0.05, 0);
  paint(baseB, ROSE_TAN);
  parts.push(baseB);
  // Tapered shaft
  const shaft = new THREE.CylinderGeometry(r * 0.7, r, h * 0.8, 8);
  shaft.translate(0, h * 0.1 + h * 0.4, 0);
  paint(shaft, TAN);
  parts.push(shaft);
  // Balcony rings (two)
  for (const by of [h * 0.5, h * 0.78]) {
    const ring = new THREE.CylinderGeometry(r * 1.6, r * 1.6, h * 0.035, 8);
    ring.translate(0, by, 0);
    paint(ring, TRIM);
    parts.push(ring);
  }
  // "Little round hat" — small dome cap
  const hat = new THREE.SphereGeometry(r * 1.5, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
  hat.translate(0, h * 0.9 + r * 0.3, 0);
  paint(hat, ROSE_TAN);
  parts.push(hat);
  const hatTrim = new THREE.CylinderGeometry(r * 1.55, r * 1.55, r * 0.25, 10);
  hatTrim.translate(0, h * 0.9 + r * 0.1, 0);
  paint(hatTrim, TRIM);
  parts.push(hatTrim);
  // Tiny finial
  const tip = new THREE.ConeGeometry(r * 0.3, r * 1.4, 6);
  tip.translate(0, h * 0.9 + r * 1.4, 0);
  paint(tip, INK);
  parts.push(tip);
  return parts;
}

export const charminarBiome: BiomeModule = {
  id: 'charminar',
  name: 'Charminar',
  nameHi: 'चारमीनार',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  signatureDetails: [
    'Central square block (original stylized interpretation) with a big arch on each of the four sides.',
    'Four tall slender minarets at the corners — "like birthday candles".',
    'Small domes ("little round hats") capping each minaret, plus one on the central block.',
    'Warm tan/rose stone with white-ish trim.',
    'Market stalls with colorful canopies around the base.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): { update?: (dt: number, t: number) => void; npcs: BiomeNPCDef[] } {
    const bucket: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
      bucket.push(geo.clone().applyMatrix4(m));
    };
    const addAll = (geos: THREE.BufferGeometry[], m: THREE.Matrix4) => {
      for (const g of geos) add(g, m);
    };

    const center = ctx.latLonToDir(ZONE_LAT, ZONE_LON);
    const base = placement(ctx, center, 0);

    // ---- Dimensions ----
    const blockW = 10; // central block width
    const blockH = 9; // central block height
    const minH = 22; // minaret height

    // ---- 1. Base platform ----
    const plat = new THREE.BoxGeometry(blockW + 8, 1, blockW + 8);
    paint(plat, ROSE_TAN);
    add(plat, localM(0, 0.5, 0).premultiply(base));

    // ---- 2. Central square block ----
    const block = new THREE.BoxGeometry(blockW, blockH, blockW);
    paint(block, TAN);
    add(block, localM(0, 1 + blockH / 2, 0).premultiply(base));
    // White trim band
    const band = new THREE.BoxGeometry(blockW + 0.5, 0.7, blockW + 0.5);
    paint(band, TRIM);
    add(band, localM(0, 1 + blockH - 0.8, 0).premultiply(base));
    // Cornice
    const cornice = new THREE.BoxGeometry(blockW + 1, 0.8, blockW + 1);
    paint(cornice, ROSE_TAN);
    add(cornice, localM(0, 1 + blockH + 0.4, 0).premultiply(base));

    // ---- 3. Big arch on each of the four sides ----
    const archW = 4.5;
    const archH = 6;
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      // Dark arch opening
      const arch = new THREE.BoxGeometry(archW, archH, 0.4);
      paint(arch, ARCH_DARK);
      const am = localM(0, 1 + archH / 2 + 0.5, blockW / 2 + 0.02, { ry });
      add(arch, am.premultiply(base));
      // Rounded top of the arch
      const archTop = new THREE.CylinderGeometry(archW / 2, archW / 2, 0.4, 10, 1, false, 0, Math.PI);
      archTop.rotateX(Math.PI / 2);
      paint(archTop, ARCH_DARK);
      const tm = localM(0, 1 + archH + 0.5, blockW / 2 + 0.02, { ry });
      add(archTop, tm.premultiply(base));
      // White trim frame around the arch
      const frame = new THREE.BoxGeometry(archW + 0.8, 0.4, 0.45);
      paint(frame, TRIM);
      const fm = localM(0, 1 + archH + archW / 2 + 0.4, blockW / 2 + 0.02, { ry });
      add(frame, fm.premultiply(base));
    }

    // ---- 4. Small dome on the central block ----
    const domeY = 1 + blockH + 0.8;
    const dome = new THREE.SphereGeometry(2.0, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
    paint(dome, ROSE_TAN);
    add(dome, localM(0, domeY, 0).premultiply(base));
    const domeFin = new THREE.ConeGeometry(0.3, 1.2, 6);
    paint(domeFin, INK);
    add(domeFin, localM(0, domeY + 2.2, 0).premultiply(base));

    // ---- 5. Four tall minarets at the corners ----
    const off = blockW / 2 + 2.5;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      addAll(minaret(minH), localM(cx * off, 1, cz * off).premultiply(base));
    }

    // ---- 6. Market stalls around the base ----
    const stallColors = [STALL_RED, STALL_YELLOW, STALL_RED, STALL_YELLOW];
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const sx = Math.cos(ang) * (blockW / 2 + 7);
      const sz = Math.sin(ang) * (blockW / 2 + 7);
      // Stall table
      const table = new THREE.BoxGeometry(2.2, 0.9, 1.6);
      paint(table, INK);
      add(table, localM(sx, 0.45, sz, { ry: -ang }).premultiply(base));
      // Canopy (slanted)
      const canopy = new THREE.BoxGeometry(2.8, 0.15, 2.2);
      paint(canopy, stallColors[i]);
      add(canopy, localM(sx, 2.2, sz, { ry: -ang, rz: 0.12 }).premultiply(base));
      // Canopy poles
      for (const px of [-1.2, 1.2]) {
        const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
        pole.translate(0, 1.1, 0);
        paint(pole, INK);
        add(pole, localM(sx + px * Math.cos(-ang), 0, sz + px * Math.sin(-ang), { ry: -ang }).premultiply(base));
      }
    }

    // ---- 7. Olive trees at the plaza corners ----
    for (const [tx, tz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]] as const) {
      const trunk = new THREE.CylinderGeometry(0.18, 0.24, 1.2, 6);
      paint(trunk, INK);
      add(trunk, localM(tx, 0.6, tz).premultiply(base));
      const crown = new THREE.SphereGeometry(1.3, 8, 6);
      paint(crown, OLIVE);
      add(crown, localM(tx, 2.1, tz, { sy: 0.85 }).premultiply(base));
    }

    // ---- merge and add ----
    const merged = mergeGeometries(bucket, false);
    if (!merged) throw new Error('charminar: geometry merge failed');
    const mesh = new THREE.Mesh(merged, biomeMaterial());
    mesh.frustumCulled = false;
    scene.add(mesh);

    const npcs: BiomeNPCDef[] = [
      {
        id: 'charminar-zoya',
        name: 'Bangle seller Zoya',
        nameHi: 'चूड़ीवाली ज़ोया',
        role: 'Bangle seller',
        latDeg: ZONE_LAT + 0.1,
        lonDeg: ZONE_LON + 0.12,
        skin: 0xa06a45,
        tunic: 0xc0392b,
        accessory: 'hijab',
        accessoryColor: 0x2e8f86,
        line: 'Pretty bangles! Four towers, a hundred colors!',
        lineHi: 'सुंदर चूड़ियाँ! चार मीनार, सौ रंग!',
      },
      {
        id: 'charminar-imran',
        name: 'Historian Imran',
        nameHi: 'इतिहासकार इमरान',
        role: 'Story keeper',
        latDeg: ZONE_LAT - 0.1,
        lonDeg: ZONE_LON - 0.14,
        skin: 0x8a5a3a,
        tunic: 0xf5e6d3,
        accessory: 'topi',
        accessoryColor: 0x8b5e3c,
        line: 'Four minarets, four hundred years of stories.',
        lineHi: 'चार मीनार, चार सौ साल की कहानियाँ।',
      },
    ];

    return { npcs };
  },
};
