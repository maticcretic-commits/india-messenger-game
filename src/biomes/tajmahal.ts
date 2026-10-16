/**
 * Taj Mahal biome — "Postcards from Bharat".
 *
 * ORIGINAL stylized interpretation of Agra's famous white-marble mausoleum.
 * This is NOT a replica of the protected monument: proportions, ornament,
 * and detail are all invented for this game in the sketchbook style.
 *
 * Signature elements (stylized):
 * 1. Marble platform: large square plinth
 * 2. Central mausoleum: cube with arched niches, big onion dome, 4 small domes
 * 3. Four minarets: slender towers at the platform corners
 * 4. Reflecting pool: long water strip mirroring the dome
 * 5. Charbagh garden: four green quadrants with cross paths
 * 6. Cypress trees: dark green spikes lining the paths
 * 7. Red sandstone gateway: warm red arch in the background
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleInZone, paint, biomeMaterial , surfacePos , surfaceQuat} from './geo';
import { PLANET_RADIUS } from '../planet';
import { toon, PAL } from '../sketch';
import type { BiomeModule, BiomeCtx, BiomeNPCDef } from './types';

const UP = new THREE.Vector3(0, 1, 0);

const ZONE_LAT = 45;
const ZONE_LON = -20;
const ZONE_RAD = 0.45;

// Sketchbook palette for the Taj complex
const MARBLE = 0xf8f2e4; // warm white marble
const MARBLE_SHADOW = 0xe8dcc0; // shaded marble
const SANDSTONE = 0xc46a4a; // red sandstone gateway
const SANDSTONE_DARK = 0xa8563a;
const DOME_GOLD = 0xd4a017; // finial accent
const POOL_BLUE = 0x0f6f7a; // reflecting pool (deep teal)
const GARDEN = 0x7a8c3f; // charbagh green
const PATH = 0xd4c49a; // garden paths
const CYPRESS = 0x3f5a2a; // dark cypress green

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

/** Onion dome: sphere squashed + pointed top via cone. */
function onionDome(r: number, color: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  // Main dome bulb
  const bulb = new THREE.SphereGeometry(r, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65);
  paint(bulb, color);
  parts.push(bulb);
  // Pointed finial cone
  const tip = new THREE.ConeGeometry(r * 0.18, r * 0.9, 8);
  tip.translate(0, r * 1.05, 0);
  paint(tip, color);
  parts.push(tip);
  // Golden finial ball
  const ball = new THREE.SphereGeometry(r * 0.12, 8, 6);
  ball.translate(0, r * 1.55, 0);
  paint(ball, DOME_GOLD);
  parts.push(ball);
  // Drum (cylinder base)
  const drum = new THREE.CylinderGeometry(r * 0.82, r * 0.88, r * 0.5, 12);
  drum.translate(0, -r * 0.2, 0);
  paint(drum, color);
  parts.push(drum);
  return parts;
}

/** Slender minaret: tapered tower with balconies and small dome cap. */
function minaret(h: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const r = h * 0.055;
  // Main shaft (tapered)
  const shaft = new THREE.CylinderGeometry(r * 0.7, r, h, 8);
  shaft.translate(0, h / 2, 0);
  paint(shaft, MARBLE);
  parts.push(shaft);
  // Two balcony rings
  for (const by of [h * 0.55, h * 0.85]) {
    const balc = new THREE.CylinderGeometry(r * 1.5, r * 1.5, h * 0.04, 8);
    balc.translate(0, by, 0);
    paint(balc, MARBLE_SHADOW);
    parts.push(balc);
  }
  // Small dome cap
  const cap = new THREE.SphereGeometry(r * 1.2, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
  cap.translate(0, h + r * 0.3, 0);
  paint(cap, MARBLE);
  parts.push(cap);
  const tip = new THREE.ConeGeometry(r * 0.25, r * 1.2, 6);
  tip.translate(0, h + r * 1.1, 0);
  paint(tip, DOME_GOLD);
  parts.push(tip);
  // Square base
  const base = new THREE.BoxGeometry(r * 3, h * 0.08, r * 3);
  base.translate(0, h * 0.04, 0);
  paint(base, MARBLE_SHADOW);
  parts.push(base);
  return parts;
}

export const tajmahalBiome: BiomeModule = {
  id: 'tajmahal',
  name: 'Taj Mahal',
  nameHi: 'ताज महल',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  signatureDetails: [
    'White marble mausoleum (original stylized interpretation): square plinth, arched niches, grand onion dome with golden finial, four corner domes.',
    'Four slender minarets with balcony rings at the platform corners.',
    'Long reflecting pool mirroring the dome, flanked by cypress trees.',
    'Charbagh four-part garden with cross paths and red sandstone gateway.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): { update?: (dt: number, t: number) => void; npcs: BiomeNPCDef[] } {
    const bucket: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
      const g = geo.clone().applyMatrix4(m);
      bucket.push(g);
    };
    const addAll = (geos: THREE.BufferGeometry[], m: THREE.Matrix4) => {
      for (const g of geos) add(g, m);
    };

    const center = ctx.latLonToDir(ZONE_LAT, ZONE_LON);
    const base = placement(ctx, center, 0);

    // ---- 1. Marble platform (large square plinth) ----
    const platSize = 26;
    const platH = 1.2;    const plat = new THREE.BoxGeometry(platSize, platH, platSize);
    paint(plat, MARBLE_SHADOW);
    add(plat, localM(0, platH / 2, 0).premultiply(base));

    const platTop = new THREE.BoxGeometry(platSize - 1, 0.3, platSize - 1);
    paint(platTop, MARBLE);
    add(platTop, localM(0, platH + 0.15, 0).premultiply(base));

    // ---- 2. Central mausoleum (scaled for grandeur — dome visible from afar) ----
    const mauSize = 12;
    const mauH = 8;
    const mauY = platH + 0.3;
    // Main cube
    const cube = new THREE.BoxGeometry(mauSize, mauH, mauSize);
    paint(cube, MARBLE);
    add(cube, localM(0, mauY + mauH / 2, 0).premultiply(base));
    // Arched niche hints (darker insets on each face)
    for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [Math.PI, 0], [-Math.PI / 2, 0]] as const) {
      for (const off of [-3, 0, 3]) {
        const niche = new THREE.BoxGeometry(1.6, 3.2, 0.3);
        paint(niche, MARBLE_SHADOW);
        const nm = localM(off, mauY + 2.2, mauSize / 2 - 0.05, { ry: rx });
        add(niche, nm.premultiply(base));
      }
    }
    // Corner pillars (small)
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const pillar = new THREE.CylinderGeometry(0.5, 0.6, mauH + 1, 8);
      paint(pillar, MARBLE);
      add(pillar, localM(cx * (mauSize / 2 - 0.3), mauY + (mauH + 1) / 2, cz * (mauSize / 2 - 0.3)).premultiply(base));
      // Small dome on each corner pillar
      addAll(onionDome(1.1, MARBLE), localM(cx * (mauSize / 2 - 0.3), mauY + mauH + 1.2, cz * (mauSize / 2 - 0.3)).premultiply(base));
    }
    // BIG central onion dome
    addAll(onionDome(4.6, MARBLE), localM(0, mauY + mauH + 0.5, 0).premultiply(base));

    // ---- 3. Four minarets at platform corners ----
    const minH = 16;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      addAll(
        minaret(minH),
        localM(cx * (platSize / 2 - 1.5), platH + 0.3, cz * (platSize / 2 - 1.5)).premultiply(base),
      );
    }

    // ---- 4. Reflecting pool (long water strip in front) ----
    const poolL = 30;
    const poolW = 4;
    const pool = new THREE.BoxGeometry(poolW, 0.2, poolL);
    paint(pool, POOL_BLUE);
    add(pool, localM(0, 0.15, platSize / 2 + poolL / 2 + 2).premultiply(base));
    // Pool rim
    const rim = new THREE.BoxGeometry(poolW + 0.6, 0.35, poolL + 0.6);
    paint(rim, MARBLE_SHADOW);
    // (rim as frame — simplified to a slightly larger flat box under the pool)
    add(rim, localM(0, 0.08, platSize / 2 + poolL / 2 + 2).premultiply(base));

    // ---- 5. Charbagh garden quadrants ----
    const gSize = 12;
    const gOff = 8;
    for (const [gx, gz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const quad = new THREE.BoxGeometry(gSize, 0.25, gSize);
      paint(quad, GARDEN);
      const qx = gx * (poolW / 2 + gSize / 2 + 1);
      const qz = platSize / 2 + poolL + 4 + gz * (gSize / 2 + 1);
      add(quad, localM(qx, 0.12, qz).premultiply(base));
    }
    // Cross paths
    const pathV = new THREE.BoxGeometry(1.5, 0.28, gSize * 2 + 3);
    paint(pathV, PATH);
    add(pathV, localM(0, 0.13, platSize / 2 + poolL + 4).premultiply(base));
    const pathH = new THREE.BoxGeometry(gSize * 2 + 4, 0.28, 1.5);
    paint(pathH, PATH);
    add(pathH, localM(0, 0.13, platSize / 2 + poolL + 4).premultiply(base));

    // ---- 6. Cypress trees lining the pool ----
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const tz = platSize / 2 + 4 + t * (poolL - 2);
      for (const tx of [-poolW / 2 - 1.2, poolW / 2 + 1.2]) {
        const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6);
        paint(trunk, PAL.trunk);
        add(trunk, localM(tx, 0.4, tz).premultiply(base));
        const cone = new THREE.ConeGeometry(0.7, 2.8, 7);
        paint(cone, CYPRESS);
        add(cone, localM(tx, 2.2, tz).premultiply(base));
      }
    }

    // ---- 7. Red sandstone gateway (background) ----
    const gateZ = -(platSize / 2 + 8);
    const gateW = 12;
    const gateH = 8;
    // Two towers
    for (const gx of [-gateW / 2 + 1, gateW / 2 - 1]) {
      const tower = new THREE.BoxGeometry(2.5, gateH, 2.5);
      paint(tower, SANDSTONE);
      add(tower, localM(gx, gateH / 2, gateZ).premultiply(base));
      const cap = new THREE.SphereGeometry(1.1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
      paint(cap, SANDSTONE_DARK);
      add(cap, localM(gx, gateH + 0.3, gateZ).premultiply(base));
    }
    // Arch top beam
    const beam = new THREE.BoxGeometry(gateW, 2, 2.5);
    paint(beam, SANDSTONE);
    add(beam, localM(0, gateH - 1, gateZ).premultiply(base));
    // Arch opening (dark inset)
    const arch = new THREE.BoxGeometry(gateW - 5, gateH - 2.5, 0.5);
    paint(arch, SANDSTONE_DARK);
    add(arch, localM(0, (gateH - 2.5) / 2 + 0.5, gateZ).premultiply(base));

    // ---- 8. GRAND ENTRY SEQUENCE (Gemini place rule #3: every place needs a threshold) ----
    // Arrival order: entry road → Great Gate (walk through, dome framed) →
    // garden path → stairs → marble platform → reflecting pool → mausoleum.
    const entryZ = platSize / 2 + poolL + 4 + gSize + 6; // ~south of garden

    // 8a. Entry road: long path from the zone edge to the gate
    const roadL = 42;
    const road = new THREE.BoxGeometry(5, 0.22, roadL);
    paint(road, PATH);
    add(road, localM(0, 0.11, entryZ + 8 + roadL / 2).premultiply(base));
    // Road edge stones
    for (let i = 0; i < 12; i++) {
      const rz = entryZ + 8 + (i / 11) * roadL;
      for (const rx of [-2.8, 2.8]) {
        const stone = new THREE.BoxGeometry(0.5, 0.4, 0.5);
        paint(stone, MARBLE_SHADOW);
        add(stone, localM(rx, 0.2, rz).premultiply(base));
      }
    }

    // 8b. Great Gate: walk-through red sandstone arch (the threshold).
    // The dome is framed through this arch on approach — staged reveal.
    const ggZ = entryZ + 8;
    const ggW = 11;
    const ggH = 9;
    for (const gx of [-ggW / 2 + 1.2, ggW / 2 - 1.2]) {
      const tower = new THREE.BoxGeometry(2.6, ggH, 3);
      paint(tower, SANDSTONE);
      add(tower, localM(gx, ggH / 2, ggZ).premultiply(base));
      // cusped-arch parapet cap (Rajput kangura silhouette)
      const cap = new THREE.CylinderGeometry(1.5, 1.5, 1.2, 4);
      paint(cap, SANDSTONE_DARK);
      add(cap, localM(gx, ggH + 0.6, ggZ, { ry: Math.PI / 4 }).premultiply(base));
      // tiny dome on each tower
      addAll(
        onionDome(0.9, SANDSTONE),
        localM(gx, ggH + 1.4, ggZ).premultiply(base),
      );
    }
    // Arch beam across the top — opening below stays walkable (5 wide)
    const ggBeam = new THREE.BoxGeometry(ggW, 2.2, 3);
    paint(ggBeam, SANDSTONE);
    add(ggBeam, localM(0, ggH - 1.1, ggZ).premultiply(base));
    // Decorative arch trim (not blocking)
    const ggTrim = new THREE.BoxGeometry(ggW - 4.5, 1.1, 3.3);
    paint(ggTrim, SANDSTONE_DARK);
    add(ggTrim, localM(0, ggH - 2.6, ggZ).premultiply(base));

    // 8c. Grand stairs: wide steps up the platform's south face
    const stairW = 9;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const step = new THREE.BoxGeometry(stairW, 0.26, 0.9);
      paint(step, i % 2 === 0 ? MARBLE : MARBLE_SHADOW);
      add(
        step,
        localM(0, platH + 0.3 - i * 0.24, platSize / 2 + 0.45 + i * 0.85).premultiply(base),
      );
    }
    // Stair side walls
    for (const sx of [-stairW / 2 - 0.3, stairW / 2 + 0.3]) {
      const wall = new THREE.BoxGeometry(0.6, 1.1, steps * 0.9);
      paint(wall, MARBLE_SHADOW);
      add(wall, localM(sx, 0.55, platSize / 2 + 2.6).premultiply(base));
    }

    // 8d. Trees + lamps lining the entry road (density, not emptiness)
    for (let i = 0; i < 7; i++) {
      const tz = entryZ + 10 + (i / 6) * (roadL - 4);
      for (const tx of [-4.6, 4.6]) {
        const trunk = new THREE.CylinderGeometry(0.14, 0.18, 1.0, 6);
        paint(trunk, PAL.trunk);
        add(trunk, localM(tx, 0.5, tz).premultiply(base));
        const crown = new THREE.SphereGeometry(1.1, 7, 6);
        paint(crown, CYPRESS);
        add(crown, localM(tx, 1.9, tz).premultiply(base));
      }
      // Lamp posts on alternating sides
      const lx = i % 2 === 0 ? -3.4 : 3.4;
      const pole = new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6);
      paint(pole, 0x3a3a3a);
      add(pole, localM(lx, 1.3, tz).premultiply(base));
      const lamp = new THREE.SphereGeometry(0.22, 6, 5);
      paint(lamp, 0xffd98a);
      add(lamp, localM(lx, 2.75, tz).premultiply(base));
    }

    // 8e. Ticket stall near the gate (lived-in detail)
    const stallX = -7.5;
    const stallZ = ggZ + 4;
    const booth = new THREE.BoxGeometry(2.2, 2.0, 1.8);
    paint(booth, 0xd4c49a);
    add(booth, localM(stallX, 1.0, stallZ).premultiply(base));
    const awning = new THREE.BoxGeometry(2.8, 0.15, 2.4);
    paint(awning, SANDSTONE);
    add(awning, localM(stallX, 2.25, stallZ, { rx: 0.12 }).premultiply(base));
    // Benches along the garden path
    for (const [bx, bz] of [[-4, entryZ - 6], [4, entryZ - 14]] as const) {
      const seat = new THREE.BoxGeometry(1.8, 0.15, 0.5);
      paint(seat, 0x8a5a2a);
      add(seat, localM(bx, 0.55, bz).premultiply(base));
      for (const lx of [-0.7, 0.7]) {
        const leg = new THREE.BoxGeometry(0.12, 0.55, 0.4);
        paint(leg, 0x5a3a1a);
        add(leg, localM(bx + lx, 0.27, bz).premultiply(base));
      }
    }

    // ---- merge and add ----
    const merged = mergeGeometries(bucket, false);
    if (!merged) throw new Error('tajmahal: geometry merge failed');
    const mesh = new THREE.Mesh(merged, biomeMaterial());
    mesh.frustumCulled = false;
    scene.add(mesh);

    // ---- 8f. "TAJ MAHAL" name sign (original-Messenger rule: every place named) ----
    // Separate textured mesh — chunky comic board by the gate.
    {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 160;
      const g = c.getContext('2d')!;
      g.fillStyle = '#7a4a28';
      g.fillRect(0, 0, 512, 160);
      g.strokeStyle = '#ffd98a';
      g.lineWidth = 10;
      g.strokeRect(10, 10, 492, 140);
      g.fillStyle = '#fdf6e3';
      g.font = 'bold 72px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('TAJ MAHAL', 256, 84);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const signGroup = new THREE.Group();
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1.9, 0.25),
        new THREE.MeshToonMaterial({ map: tex }),
      );
      board.position.y = 2.6;
      signGroup.add(board);
      for (const px of [-2.4, 2.4]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6),
          toon(0x5a3a1a),
        );
        post.position.set(px, 1.3, 0);
        signGroup.add(post);
      }
      const signDir = ctx.latLonToDir(ZONE_LAT - (entryZ + 12), ZONE_LON + 7);
      signGroup.position.copy(surfacePos(signDir, ctx.groundH(signDir)));
      signGroup.position.y += 0.1;
      signGroup.rotation.y = Math.PI; // face the arriving player
      scene.add(signGroup);
    }

    // Water shimmer for the pool (separate, animated elsewhere if needed)
    // (pool is part of merged geometry — static is fine for the sketchbook look)

    const npcs: BiomeNPCDef[] = [
      {
        id: 'taj-guide',
        name: 'Guide Arjun',
        nameHi: 'गाइड अर्जुन',
        role: 'Marble guide',
        latDeg: ZONE_LAT + 0.15,
        lonDeg: ZONE_LON + 0.2,
        skin: 0xa06a45,
        tunic: 0x2e8f86,
        accessory: 'cap',
        accessoryColor: 0x8a3030,
        line: 'Welcome to the Taj! Would you like to hear its story?',
        lineHi: 'ताज में आपका स्वागत है!',
      },
      {
        id: 'taj-gardener',
        name: 'Mali Devi',
        nameHi: 'माली देवी',
        role: 'Garden keeper',
        latDeg: ZONE_LAT - 0.12,
        lonDeg: ZONE_LON - 0.18,
        skin: 0x8a5a3a,
        tunic: 0x6b7f35,
        accessory: 'shawl',
        accessoryColor: 0xd4a017,
        line: 'These gardens have bloomed for three hundred years.',
        lineHi: 'ये बगीचे तीन सौ सालों से खिल रहे हैं।',
      },
      {
        id: 'taj-tickets',
        name: 'Ticket Babu',
        nameHi: 'टिकट बाबू',
        role: 'Ticket seller',
        latDeg: ZONE_LAT - 77,
        lonDeg: ZONE_LON - 7.5,
        skin: 0x8a5a3a,
        tunic: 0x8a3030,
        accessory: 'cap',
        accessoryColor: 0x2e4a6b,
        line: 'Tickets! Come get your tickets for the Taj!',
        lineHi: 'टिकट ले लो! ताज के टिकट!',
      },
      {
        id: 'taj-visitor1',
        name: 'Tourist Meena',
        nameHi: 'पर्यटक मीना',
        role: 'Visitor',
        latDeg: ZONE_LAT - 55,
        lonDeg: ZONE_LON + 3,
        skin: 0xa06a45,
        tunic: 0xd4a017,
        accessory: 'shawl',
        accessoryColor: 0x2e8f86,
        line: 'I walked through the gate and gasped — look at that dome!',
        lineHi: 'दरवाजे से अंदर आई और दंग रह गई!',
      },
      {
        id: 'taj-visitor2',
        name: 'Photographer Ravi',
        nameHi: 'फोटोग्राफर रवि',
        role: 'Photographer',
        latDeg: ZONE_LAT - 35,
        lonDeg: ZONE_LON - 4,
        skin: 0x7a4a2a,
        tunic: 0x4a6b8a,
        accessory: 'cap',
        accessoryColor: 0x3a3a3a,
        line: 'Stand by the pool — the reflection doubles the magic!',
        lineHi: 'तालाब के पास खड़े हो जाओ — परछाई दोगुना जादू!',
      },
    ];

    return { npcs };
  },
};
