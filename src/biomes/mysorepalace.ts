/**
 * Mysore Palace biome — "Postcards from Bharat".
 *
 * ORIGINAL stylized interpretation of Mysuru's famous royal palace.
 * This is NOT a replica of the protected monument: proportions, ornament,
 * and detail are all invented for this game in the sketchbook style.
 *
 * Signature elements (stylized):
 * 1. Wedding-cake tiers: wide base box + smaller upper box
 * 2. Big central dome with golden finial spike (the "crown on the cake")
 * 3. Smaller domes marching along the roofline
 * 4. Symmetrical façade with rows of arched windows
 * 5. Warm cream/rose walls with terracotta + gold trim
 * 6. Grand front steps and forecourt
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, biomeMaterial , surfacePos , surfaceQuat} from './geo';
import { PLANET_RADIUS } from '../planet';
import type { BiomeModule, BiomeCtx, BiomeNPCDef } from './types';

const UP = new THREE.Vector3(0, 1, 0);

const ZONE_LAT = -55;
const ZONE_LON = 120;
const ZONE_RAD = 0.4;

// Sketchbook palette for Mysore Palace (cream/rose/gold)
const CREAM = 0xf2d6b3; // cream walls
const ROSE = 0xe8a87c; // rose-tan trim
const TERRA = 0xc97b5a; // terracotta accents
const GOLD = 0xd4a24c; // gold trim + finials
const INK = 0x7a4e2d; // ink lines / window shadow
const WINDOW = 0x4a3a2e; // dark arched windows
const COURT = 0xd4c49a; // forecourt stone

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

/** Small dome with finial spike — reused along the roofline. */
function smallDome(r: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const bulb = new THREE.SphereGeometry(r, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  paint(bulb, ROSE);
  parts.push(bulb);
  const drum = new THREE.CylinderGeometry(r * 0.8, r * 0.88, r * 0.5, 10);
  drum.translate(0, -r * 0.2, 0);
  paint(drum, CREAM);
  parts.push(drum);
  const spike = new THREE.ConeGeometry(r * 0.14, r * 0.9, 6);
  spike.translate(0, r * 1.0, 0);
  paint(spike, GOLD);
  parts.push(spike);
  return parts;
}

export const mysorepalaceBiome: BiomeModule = {
  id: 'mysorepalace',
  name: 'Mysore Palace',
  nameHi: 'मैसूर पैलेस',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  signatureDetails: [
    'Wedding-cake tiers (original stylized interpretation): wide cream base, smaller rose upper tier.',
    'Big central dome with golden finial spike — "like a crown on a cake".',
    'Six smaller domes marching along the roofline.',
    'Symmetrical façade with rows of arched windows and terracotta trim.',
    'Grand front steps leading to a stone forecourt.',
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
    const baseW = 24; // base tier width
    const baseH = 6; // base tier height
    const upperW = 15; // upper tier width
    const upperH = 4.5; // upper tier height

    // ---- 1. Wide base tier (tier one of the cake) ----
    const tier1 = new THREE.BoxGeometry(baseW, baseH, baseW * 0.7);
    paint(tier1, CREAM);
    add(tier1, localM(0, baseH / 2, 0).premultiply(base));
    // Terracotta base trim
    const trim1 = new THREE.BoxGeometry(baseW + 0.6, 0.7, baseW * 0.7 + 0.6);
    paint(trim1, TERRA);
    add(trim1, localM(0, 0.6, 0).premultiply(base));
    // Top trim of tier 1
    const trim1b = new THREE.BoxGeometry(baseW + 0.4, 0.5, baseW * 0.7 + 0.4);
    paint(trim1b, GOLD);
    add(trim1b, localM(0, baseH - 0.2, 0).premultiply(base));

    // ---- 2. Smaller upper tier (tier two of the cake) ----
    const tier2 = new THREE.BoxGeometry(upperW, upperH, upperW * 0.7);
    paint(tier2, ROSE);
    add(tier2, localM(0, baseH + upperH / 2, 0).premultiply(base));
    // Gold trim on tier 2
    const trim2 = new THREE.BoxGeometry(upperW + 0.4, 0.5, upperW * 0.7 + 0.4);
    paint(trim2, GOLD);
    add(trim2, localM(0, baseH + upperH - 0.2, 0).premultiply(base));

    // ---- 3. Arched windows on the front façade ----
    // Two rows on tier 1, one row on tier 2
    const winRows: Array<[number, number, number]> = [
      // [y, count, tierHalfWidth]
      [2.2, 7, baseW / 2],
      [4.4, 7, baseW / 2],
      [baseH + 2.2, 5, upperW / 2],
    ];
    for (const [wy, count, hw] of winRows) {
      for (let i = 0; i < count; i++) {
        const wx = -hw + 1.5 + (i * (hw * 2 - 3)) / (count - 1);
        // Window: dark arch shape (box + half-cylinder top)
        const win = new THREE.BoxGeometry(1.1, 1.6, 0.25);
        paint(win, WINDOW);
        add(win, localM(wx, wy, (hw === baseW / 2 ? baseW * 0.7 : upperW * 0.7) / 2 + 0.02).premultiply(base));
        const winTop = new THREE.CylinderGeometry(0.55, 0.55, 0.25, 8, 1, false, 0, Math.PI);
        winTop.rotateX(Math.PI / 2);
        winTop.rotateZ(Math.PI / 2);
        paint(winTop, WINDOW);
        add(winTop, localM(wx, wy + 0.8, (hw === baseW / 2 ? baseW * 0.7 : upperW * 0.7) / 2 + 0.02).premultiply(base));
        // Gold frame around window
        const frame = new THREE.BoxGeometry(1.4, 0.25, 0.28);
        paint(frame, GOLD);
        add(frame, localM(wx, wy - 0.95, (hw === baseW / 2 ? baseW * 0.7 : upperW * 0.7) / 2 + 0.02).premultiply(base));
      }
    }

    // ---- 4. BIG central dome with golden spike ----
    const domeY = baseH + upperH;
    const bigDome = new THREE.SphereGeometry(3.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
    paint(bigDome, ROSE);
    add(bigDome, localM(0, domeY + 0.4, 0).premultiply(base));
    const bigDrum = new THREE.CylinderGeometry(2.8, 3.0, 1.6, 14);
    paint(bigDrum, CREAM);
    add(bigDrum, localM(0, domeY - 0.4, 0).premultiply(base));
    // THE golden spike — "crown on the cake"
    const spike = new THREE.ConeGeometry(0.5, 3.2, 8);
    paint(spike, GOLD);
    add(spike, localM(0, domeY + 4.6, 0).premultiply(base));
    const spikeBall = new THREE.SphereGeometry(0.55, 10, 8);
    paint(spikeBall, GOLD);
    add(spikeBall, localM(0, domeY + 3.4, 0).premultiply(base));

    // ---- 5. Six smaller domes along the roofline ----
    const roofY = baseH;
    for (const dx of [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5]) {
      addAll(smallDome(1.3), localM(dx, roofY + 0.6, 0).premultiply(base));
    }
    // Two more flanking the central dome on tier 2
    for (const dx of [-6, 6]) {
      addAll(smallDome(1.0), localM(dx, domeY + 0.3, 0).premultiply(base));
    }

    // ---- 6. Grand front steps + forecourt ----
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const step = new THREE.BoxGeometry(8 - i * 0.8, 0.45, 1.6);
      paint(step, COURT);
      add(step, localM(0, 0.22 + i * 0.45, baseW * 0.35 + 1 + i * 1.3).premultiply(base));
    }
    const court = new THREE.BoxGeometry(16, 0.2, 10);
    paint(court, COURT);
    add(court, localM(0, 0.1, baseW * 0.35 + 9).premultiply(base));

    // ---- 7. Corner pavilions (chhatris) ----
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const px = cx * (baseW / 2 - 1.2);
      const pz = cz * (baseW * 0.7 / 2 - 1.2);
      const pillar = new THREE.BoxGeometry(1.6, 2.5, 1.6);
      paint(pillar, CREAM);
      add(pillar, localM(px, baseH + 1.25, pz).premultiply(base));
      addAll(smallDome(0.9), localM(px, baseH + 2.8, pz).premultiply(base));
    }

    // ---- merge and add ----
    const merged = mergeGeometries(bucket, false);
    if (!merged) throw new Error('mysorepalace: geometry merge failed');
    const mesh = new THREE.Mesh(merged, biomeMaterial());
    mesh.frustumCulled = false;
    scene.add(mesh);

    const npcs: BiomeNPCDef[] = [
      {
        id: 'mysorepalace-lakshmi',
        name: 'Guide Lakshmi',
        nameHi: 'गाइड लक्ष्मी',
        role: 'Palace guide',
        latDeg: ZONE_LAT + 0.1,
        lonDeg: ZONE_LON + 0.12,
        skin: 0xa06a45,
        tunic: 0xc97b5a,
        accessory: 'shawl',
        accessoryColor: 0xd4a24c,
        line: 'Welcome! This palace shines like a wedding cake.',
        lineHi: 'स्वागत है! यह महल शादी के केक जैसा चमकता है।',
      },
      {
        id: 'mysorepalace-ravi',
        name: 'Drummer Ravi',
        nameHi: 'ढोलकिया रवि',
        role: 'Festival drummer',
        latDeg: ZONE_LAT - 0.1,
        lonDeg: ZONE_LON - 0.14,
        skin: 0x8a5a3a,
        tunic: 0x2e8f86,
        accessory: 'turban',
        accessoryColor: 0xc0392b,
        line: 'I drum when the palace lights up!',
        lineHi: 'महल जगमगाता है तो मैं ढोल बजाता हूँ!',
      },
    ];

    return { npcs };
  },
};
