/**
 * India Gate biome — "Postcards from Bharat".
 *
 * ORIGINAL stylized interpretation of Delhi's famous war-memorial arch.
 * This is NOT a replica of the protected monument: proportions, ornament,
 * and detail are all invented for this game in the sketchbook style.
 *
 * Signature elements (stylized):
 * 1. Two massive sandstone piers flanking a tall central arch
 * 2. Dark arch opening (deep shadow inside, walk-through scale)
 * 3. Wide flat cornice crowning the top
 * 4. Shallow dome cap with four small finials
 * 5. Broad ceremonial path (Rajpath) leading to the arch
 * 6. Trimmed shrubs and lawn panels on both sides
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, biomeMaterial , surfacePos , surfaceQuat} from './geo';
import { PLANET_RADIUS } from '../planet';
import { PAL } from '../sketch';
import type { BiomeModule, BiomeCtx, BiomeNPCDef } from './types';

const UP = new THREE.Vector3(0, 1, 0);

const ZONE_LAT = 12;
const ZONE_LON = -100;
const ZONE_RAD = 0.4;

// Sketchbook palette for India Gate (warm sandstone)
const STONE = 0xe8c39e; // warm sandstone body
const STONE_SHADOW = 0xc99a6e; // shaded sandstone
const STONE_DARK = 0x7a4e2d; // deep trim / ink-ish
const ARCH_DARK = 0x2e2a26; // arch interior shadow
const SHRUB = 0x5b7f4a; // shrub trim
const LAWN = 0x7a8c3f; // lawn panels
const PATH = 0xd4c49a; // ceremonial path

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

export const indiagateBiome: BiomeModule = {
  id: 'indiagate',
  name: 'India Gate',
  nameHi: 'इंडिया गेट',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  signatureDetails: [
    'Massive central arch (original stylized interpretation): two sandstone piers, deep shadow opening, wide cornice, shallow dome cap.',
    'Four small finials crowning the cornice corners.',
    'Broad ceremonial path leading through the arch.',
    'Trimmed shrubs and lawn panels flanking the path.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): { update?: (dt: number, t: number) => void; npcs: BiomeNPCDef[] } {
    const bucket: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
      bucket.push(geo.clone().applyMatrix4(m));
    };

    const center = ctx.latLonToDir(ZONE_LAT, ZONE_LON);
    const base = placement(ctx, center, 0);

    // ---- Dimensions ----
    const pierW = 4; // pier width
    const pierH = 13; // pier height
    const archW = 6; // arch opening width
    const archH = 10; // arch opening height
    const totalW = archW + pierW * 2; // 14

    // ---- 1. Base platform ----
    const plat = new THREE.BoxGeometry(totalW + 4, 1, totalW + 4);
    paint(plat, STONE_SHADOW);
    add(plat, localM(0, 0.5, 0).premultiply(base));

    // ---- 2. Two massive piers ----
    for (const px of [-(archW / 2 + pierW / 2), archW / 2 + pierW / 2]) {
      // Main pier block
      const pier = new THREE.BoxGeometry(pierW, pierH, pierW + 1);
      paint(pier, STONE);
      add(pier, localM(px, 1 + pierH / 2, 0).premultiply(base));
      // Pier cap (slightly wider)
      const cap = new THREE.BoxGeometry(pierW + 0.6, 0.8, pierW + 1.6);
      paint(cap, STONE_SHADOW);
      add(cap, localM(px, 1 + pierH + 0.4, 0).premultiply(base));
      // Small inset panels on the pier face (decorative)
      for (const py of [4, 7, 10]) {
        const panel = new THREE.BoxGeometry(pierW - 1.5, 1.6, 0.25);
        paint(panel, STONE_SHADOW);
        add(panel, localM(px, 1 + py, (pierW + 1) / 2 + 0.05).premultiply(base));
      }
    }

    // ---- 3. Arch opening (dark inset between piers) ----
    const opening = new THREE.BoxGeometry(archW, archH, pierW + 1.2);
    paint(opening, ARCH_DARK);
    add(opening, localM(0, 1 + archH / 2, 0).premultiply(base));
    // Rounded arch top hint: half-cylinder cap over the opening
    const archTop = new THREE.CylinderGeometry(archW / 2, archW / 2, pierW + 1.2, 12, 1, false, 0, Math.PI);
    archTop.rotateZ(Math.PI / 2);
    archTop.rotateY(Math.PI / 2);
    paint(archTop, ARCH_DARK);
    add(archTop, localM(0, 1 + archH, 0).premultiply(base));

    // ---- 4. Wide cornice above the arch ----
    const corniceH = 2;
    const cornice = new THREE.BoxGeometry(totalW + 1.5, corniceH, pierW + 2.5);
    paint(cornice, STONE);
    add(cornice, localM(0, 1 + pierH + corniceH / 2 + 0.8, 0).premultiply(base));
    // Cornice trim line
    const trim = new THREE.BoxGeometry(totalW + 2, 0.5, pierW + 3);
    paint(trim, STONE_DARK);
    add(trim, localM(0, 1 + pierH + 0.9, 0).premultiply(base));

    // ---- 5. Shallow dome cap ----
    const domeY = 1 + pierH + corniceH + 0.8;
    const dome = new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    paint(dome, STONE_SHADOW);
    add(dome, localM(0, domeY, 0).premultiply(base));
    const domeTip = new THREE.SphereGeometry(0.35, 8, 6);
    paint(domeTip, STONE_DARK);
    add(domeTip, localM(0, domeY + 2.4, 0).premultiply(base));

    // ---- 6. Four small finials at cornice corners ----
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const fx2 = fx * (totalW / 2 - 0.5);
      const fz2 = fz * (pierW / 2 + 0.5);
      const fin = new THREE.CylinderGeometry(0.18, 0.28, 1.4, 6);
      paint(fin, STONE_DARK);
      add(fin, localM(fx2, domeY + 0.7, fz2).premultiply(base));
      const finBall = new THREE.SphereGeometry(0.3, 8, 6);
      paint(finBall, STONE_DARK);
      add(finBall, localM(fx2, domeY + 1.5, fz2).premultiply(base));
    }

    // ---- 7. Ceremonial path (Rajpath) ----
    const pathL = 34;
    const pathW = 5;
    const path = new THREE.BoxGeometry(pathW, 0.22, pathL);
    paint(path, PATH);
    add(path, localM(0, 0.11, (totalW + 4) / 2 + pathL / 2).premultiply(base));

    // ---- 8. Lawns + trimmed shrubs ----
    for (const side of [-1, 1]) {
      const lawn = new THREE.BoxGeometry(7, 0.2, pathL);
      paint(lawn, LAWN);
      add(lawn, localM(side * (pathW / 2 + 4.5), 0.1, (totalW + 4) / 2 + pathL / 2).premultiply(base));
      // Shrub row
      for (let i = 0; i < 6; i++) {
        const sz = (totalW + 4) / 2 + 3 + i * 5.5;
        const shrub = new THREE.SphereGeometry(0.9, 8, 6);
        paint(shrub, SHRUB);
        add(shrub, localM(side * (pathW / 2 + 4.5), 0.8, sz, { sy: 0.8 }).premultiply(base));
      }
    }

    // ---- merge and add ----
    const merged = mergeGeometries(bucket, false);
    if (!merged) throw new Error('indiagate: geometry merge failed');
    const mesh = new THREE.Mesh(merged, biomeMaterial());
    mesh.frustumCulled = false;
    scene.add(mesh);

    const npcs: BiomeNPCDef[] = [
      {
        id: 'indiagate-kabir',
        name: 'Guard Kabir',
        nameHi: 'गार्ड कबीर',
        role: 'Memorial guard',
        latDeg: ZONE_LAT + 0.1,
        lonDeg: ZONE_LON + 0.12,
        skin: 0xa06a45,
        tunic: 0x4a5d23,
        accessory: 'cap',
        accessoryColor: 0x2e2a26,
        line: 'This arch honors brave soldiers. Walk through slowly.',
        lineHi: 'यह द्वार बहादुर सैनिकों की याद में है।',
      },
      {
        id: 'indiagate-raju',
        name: 'Chaiwala Raju',
        nameHi: 'चायवाला राजू',
        role: 'Chai seller',
        latDeg: ZONE_LAT - 0.1,
        lonDeg: ZONE_LON - 0.14,
        skin: 0x8a5a3a,
        tunic: 0xc46a4a,
        accessory: 'turban',
        accessoryColor: 0xd4a017,
        line: 'Hot chai! Perfect for an evening walk.',
        lineHi: 'गरम चाय! शाम की सैर के लिए बढ़िया।',
      },
    ];

    return { npcs };
  },
};
