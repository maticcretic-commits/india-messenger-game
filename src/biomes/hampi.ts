/**
 * Hampi ruins biome — "Postcards from Bharat".
 *
 * ORIGINAL stylized interpretation of Hampi's landscape. The wheeled stone
 * shrine below is an original low-poly pavilion inspired by the *motif* of
 * Hampi's famous wheeled temple shrine — it is NOT a replica of the protected
 * monument: proportions, carvings, and ornament are all invented for this game.
 *
 * Researched signature details modeled:
 * 1. Wheeled stone pavilion (motif of the Vittala stone chariot): box sanctum
 *    on a battle-carved plinth, four ornamental spoked wheels with inset
 *    floral discs on stone axles, stepped pyramid canopy with a pale-gold
 *    finial, and twin granite elephants posed as if drawing it.
 * 2. Balancing boulder hills: weather-rounded granite dodecahedrons stacked
 *    2-3 high with precarious offsets and warm sienna tint variation —
 *    Hampi's surreal tor landscape of ancient eroded granite.
 * 3. Frangipani (temple/champa) trees: thick pale succulent-like branches
 *    tipped with clusters of five-petaled white-and-gold pinwheel blossoms.
 * 4. Dry savannah grass tufts in straw gold scattered over the ground.
 * 5. High-contrast warm palette — granite grey, burnt sienna, pale gold —
 *    with golden dust motes drifting in the sunlight.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleInZone, paint, biomeMaterial , surfacePos, flatDist, radToWorld , surfaceQuat} from './geo';
import { PLANET_RADIUS } from '../planet';
import type { BiomeModule, BiomeCtx, BiomeNPCDef } from './types';

const UP = new THREE.Vector3(0, 1, 0);

interface LocalOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

/** Compose a local-space matrix: translate + rotate (Euler XYZ) + scale. */
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

/** World matrix that drops a prop onto the flat ground: upright + yaw. */
function placement(ctx: BiomeCtx, dir: THREE.Vector3, yaw = 0): THREE.Matrix4 {
  const h = ctx.groundH(dir);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(), surfaceQuat(dir, yaw), new THREE.Vector3(1, 1, 1));
  m.setPosition(surfacePos(dir, h));
  return m;
}

// Palette
const GRANITE = 0x8f867b;
const GRANITE_DARK = 0x6b635b;
const SPOKE_DARK = 0x4a423b;
const SIENNA = 0xa6562e;
const GOLD = 0xe8c86a;
const DOOR_DARK = 0x3a2f28;
const BARK_PALE = 0xb5ac9c;
const BLOSSOM_WHITE = 0xfdf6ea;
const BLOSSOM_GOLD = 0xf2b93b;
const LEAF_GREEN = 0x4e7a45;
const BOULDER_TINTS = [0x8a8078, 0x96897c, 0x7c736a, 0x9c8b76];

export const hampiBiome: BiomeModule = {
  id: 'hampi',
  name: 'Hampi Ruins',
  nameHi: 'हम्पी खंडहर',
  zone: { latDeg: -2, lonDeg: -158, radiusRad: 0.5 },
  signatureDetails: [
    'Wheeled stone pavilion (original stylized take on the Hampi wheeled-shrine motif): sanctum on a battle-carved plinth, four ornamental spoked wheels on stone axles, stepped pyramid canopy with gold finial, twin granite elephants posed as if drawing it.',
    'Balancing boulder hills: weather-rounded granite dodecahedrons stacked 2-3 high with precarious offsets and warm sienna tint variation.',
    'Frangipani (temple/champa) trees: thick pale succulent-like branches tipped with white-and-gold pinwheel blossom clusters.',
    'Dry savannah grass tufts in straw gold scattered across the ground.',
    'High-contrast warm palette (granite grey, burnt sienna, pale gold) with golden dust motes drifting in the sunlight.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): { update?: (dt: number, t: number) => void; npcs: BiomeNPCDef[] } {
    const rand = ctx.rand;
    const parts: THREE.BufferGeometry[] = [];
    const scratch = new THREE.Matrix4();

    /** Paint, transform, strip uv, normalize to non-indexed, collect. */
    function add(geo: THREE.BufferGeometry, hex: number, local: THREE.Matrix4, place: THREE.Matrix4): void {
      scratch.multiplyMatrices(place, local);
      geo.applyMatrix4(scratch);
      paint(geo, hex);
      geo.deleteAttribute('uv');
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    }

    const chariotDir = ctx.latLonToDir(-2, -158);

    // ------------------------------------------------------------------
    // Stone chariot pavilion (original stylized interpretation)
    // ------------------------------------------------------------------
    function buildWheel(place: THREE.Matrix4, wx: number, wz: number): void {
      const w = localM(wx, 0.47, wz, { rz: Math.PI / 2 }); // cylinder axis Y -> axle X
      add(new THREE.CylinderGeometry(0.47, 0.47, 0.14, 14), GRANITE_DARK, w, place);
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), SIENNA, w, place); // inset floral disc
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 8), GOLD, w, place); // hub
      for (let k = 0; k < 3; k++) {
        // spokes radiate in the wheel disc plane (cylinder-local XZ)
        const sm = w.clone().multiply(new THREE.Matrix4().makeRotationY((k * Math.PI) / 3));
        add(new THREE.BoxGeometry(0.06, 0.09, 0.82), SPOKE_DARK, sm, place);
      }
    }

    function buildElephant(place: THREE.Matrix4, ex: number, ez: number): void {
      const e = place.clone().multiply(localM(ex, 0, ez));
      add(new THREE.BoxGeometry(0.55, 0.5, 0.85), GRANITE, localM(0, 0.55, 0), e); // body
      add(new THREE.BoxGeometry(0.42, 0.42, 0.4), GRANITE, localM(0, 0.62, 0.55), e); // head
      add(new THREE.CylinderGeometry(0.07, 0.05, 0.5, 6), GRANITE_DARK, localM(0, 0.42, 0.82, { rx: 0.5 }), e); // trunk
      const legs: Array<[number, number]> = [
        [-0.18, 0.3],
        [0.18, 0.3],
        [-0.18, -0.3],
        [0.18, -0.3],
      ];
      for (const [lx, lz] of legs) {
        add(new THREE.CylinderGeometry(0.09, 0.1, 0.4, 6), GRANITE_DARK, localM(lx, 0.2, lz), e);
      }
      add(new THREE.BoxGeometry(0.06, 0.3, 0.28), GRANITE_DARK, localM(-0.24, 0.66, 0.5), e); // ears
      add(new THREE.BoxGeometry(0.06, 0.3, 0.28), GRANITE_DARK, localM(0.24, 0.66, 0.5), e);
      add(new THREE.CylinderGeometry(0.025, 0.02, 0.4, 5), GRANITE_DARK, localM(0, 0.55, -0.5, { rx: -0.4 }), e); // tail
    }

    function buildChariot(): void {
      const p = placement(ctx, chariotDir, rand() * Math.PI * 2);
      // plinth with battle-scene band
      add(new THREE.BoxGeometry(2.4, 0.28, 1.7), GRANITE, localM(0, 0.14, 0), p);
      add(new THREE.BoxGeometry(2.46, 0.14, 1.76), SIENNA, localM(0, 0.16, 0), p);
      add(new THREE.BoxGeometry(2.1, 0.1, 1.5), GRANITE_DARK, localM(0, 0.35, 0), p);
      // sanctum + doorway + cornice
      add(new THREE.BoxGeometry(1.15, 0.85, 1.0), GRANITE, localM(0, 0.82, -0.1), p);
      add(new THREE.BoxGeometry(0.4, 0.55, 0.08), DOOR_DARK, localM(0, 0.72, 0.42), p);
      add(new THREE.BoxGeometry(1.35, 0.12, 1.2), GRANITE_DARK, localM(0, 1.3, -0.1), p);
      // corner pillars
      const pillars: Array<[number, number]> = [
        [-0.62, 0.28],
        [0.62, 0.28],
        [-0.62, -0.48],
        [0.62, -0.48],
      ];
      for (const [px, pz] of pillars) {
        add(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 6), GRANITE_DARK, localM(px, 1.1, pz), p);
      }
      // stepped pyramid canopy + gold finial
      add(new THREE.BoxGeometry(1.5, 0.22, 1.3), GRANITE, localM(0, 1.47, -0.1), p);
      add(new THREE.BoxGeometry(1.1, 0.2, 0.95), GRANITE, localM(0, 1.68, -0.1), p);
      add(new THREE.BoxGeometry(0.7, 0.18, 0.6), GRANITE, localM(0, 1.87, -0.1), p);
      add(new THREE.SphereGeometry(0.11, 8, 6), GOLD, localM(0, 2.02, -0.1), p);
      // four ornamental wheels
      buildWheel(p, -1.28, 0.5);
      buildWheel(p, 1.28, 0.5);
      buildWheel(p, -1.28, -0.5);
      buildWheel(p, 1.28, -0.5);
      // twin elephants "drawing" the shrine
      buildElephant(p, -0.55, 1.85);
      buildElephant(p, 0.55, 1.85);
      // fallen ruins nearby: broken pillar stubs + a toppled lintel
      const stubs: Array<[number, number, number, number]> = [
        [2.5, 1.4, 0.55, 0.1],
        [-2.6, 0.8, 0.8, 0.2],
        [2.0, -2.0, 0.42, 0.05],
      ];
      for (const [sx, sz, sh, tilt] of stubs) {
        add(
          new THREE.CylinderGeometry(0.09, 0.11, sh, 7),
          GRANITE_DARK,
          localM(sx, sh / 2, sz, { rz: tilt }),
          p,
        );
      }
      add(new THREE.BoxGeometry(1.2, 0.25, 0.35), GRANITE, localM(-2.0, 0.13, 2.1, { ry: 0.6, rz: 0.06 }), p);
    }

    buildChariot();

    // ------------------------------------------------------------------
    // Balancing boulder hills
    // ------------------------------------------------------------------
    const boulderDirs: THREE.Vector3[] = [];
    const nHills = 5 + Math.floor(rand() * 3); // 5-7
    for (let i = 0; i < nHills; i++) {
      let dir = new THREE.Vector3();
      let ok = false;
      for (let attempt = 0; attempt < 10 && !ok; attempt++) {
        dir = sampleInZone(-2, -158, 0.5, rand, new THREE.Vector3());
        ok = flatDist(dir, chariotDir) > radToWorld(0.06);
        for (const bd of boulderDirs) {
          if (flatDist(dir, bd) < radToWorld(0.09)) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      boulderDirs.push(dir.clone());

      const p = placement(ctx, dir, rand() * Math.PI * 2);
      const tint = BOULDER_TINTS[Math.floor(rand() * BOULDER_TINTS.length)];
      const r = 1.0 + rand() * 0.9;
      add(
        new THREE.DodecahedronGeometry(r, 0),
        tint,
        localM(0, r * 0.55, 0, { ry: rand() * Math.PI * 2, sy: 0.8 }),
        p,
      );
      // second boulder, precariously offset
      const r2 = 0.5 + rand() * 0.5;
      const ox = (rand() - 0.5) * 0.7;
      const oz = (rand() - 0.5) * 0.7;
      add(
        new THREE.DodecahedronGeometry(r2, 0),
        BOULDER_TINTS[Math.floor(rand() * BOULDER_TINTS.length)],
        localM(ox, r * 1.05 + r2 * 0.55, oz, { ry: rand() * Math.PI * 2, sy: 0.85 }),
        p,
      );
      // occasional third boulder crowning the stack
      if (rand() < 0.35) {
        const r3 = 0.28 + rand() * 0.25;
        add(
          new THREE.DodecahedronGeometry(r3, 0),
          tint,
          localM(ox + (rand() - 0.5) * 0.4, r * 1.05 + r2 * 1.15 + r3 * 0.5, oz + (rand() - 0.5) * 0.4, {
            ry: rand() * Math.PI * 2,
          }),
          p,
        );
      }
    }

    // ------------------------------------------------------------------
    // Frangipani (temple/champa) trees
    // ------------------------------------------------------------------
    function buildFrangipani(dir: THREE.Vector3): void {
      const p = placement(ctx, dir, rand() * Math.PI * 2);
      add(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 7), BARK_PALE, localM(0, 0.45, 0), p); // trunk
      const nBr = 3 + Math.floor(rand() * 3);
      for (let b = 0; b < nBr; b++) {
        const ang = (b / nBr) * Math.PI * 2 + rand() * 0.5;
        const tilt = 0.5 + rand() * 0.5;
        const bx = Math.cos(ang);
        const bz = Math.sin(ang);
        add(
          new THREE.CylinderGeometry(0.06, 0.09, 0.7, 6),
          BARK_PALE,
          localM(bx * 0.28, 1.05, bz * 0.28, { rx: bz * tilt, rz: -bx * tilt }),
          p,
        );
        const tx = bx * 0.55;
        const tz = bz * 0.55;
        const ty = 1.32;
        // blossom cluster: white pinwheel petals
        const nBl = 6 + Math.floor(rand() * 4);
        for (let f = 0; f < nBl; f++) {
          const fa = rand() * Math.PI * 2;
          const fr = rand() * 0.22;
          add(
            new THREE.IcosahedronGeometry(0.055 + rand() * 0.02, 0),
            BLOSSOM_WHITE,
            localM(tx + Math.cos(fa) * fr, ty + (rand() - 0.3) * 0.14, tz + Math.sin(fa) * fr),
            p,
          );
        }
        // golden centers
        for (let f = 0; f < 3; f++) {
          const fa = rand() * Math.PI * 2;
          const fr = rand() * 0.16;
          add(
            new THREE.IcosahedronGeometry(0.028, 0),
            BLOSSOM_GOLD,
            localM(tx + Math.cos(fa) * fr, ty + 0.06 + rand() * 0.08, tz + Math.sin(fa) * fr),
            p,
          );
        }
        // narrow leathery leaves
        for (let f = 0; f < 3; f++) {
          const fa = rand() * Math.PI * 2;
          add(
            new THREE.ConeGeometry(0.05, 0.42, 4),
            LEAF_GREEN,
            localM(tx + Math.cos(fa) * 0.25, ty + 0.05, tz + Math.sin(fa) * 0.25, {
              rx: Math.sin(fa) * 0.9,
              rz: -Math.cos(fa) * 0.9,
            }),
            p,
          );
        }
      }
    }

    for (let i = 0; i < 6; i++) {
      const dir = sampleInZone(-2, -158, 0.5, rand, new THREE.Vector3());
      if (flatDist(dir, chariotDir) < radToWorld(0.05)) continue;
      buildFrangipani(dir);
    }

    // ------------------------------------------------------------------
    // Dry savannah grass tufts (merged static)
    // ------------------------------------------------------------------
    for (let i = 0; i < 170; i++) {
      const dir = sampleInZone(-2, -158, 0.5, rand, new THREE.Vector3());
      if (flatDist(dir, chariotDir) < radToWorld(0.05)) continue;
      let nearBoulder = false;
      for (const bd of boulderDirs) {
        if (flatDist(dir, bd) < radToWorld(0.025)) {
          nearBoulder = true;
          break;
        }
      }
      if (nearBoulder) continue;
      const p = placement(ctx, dir, rand() * Math.PI * 2);
      const tint = rand() < 0.5 ? 0xd9b36a : 0xc9a05a;
      const n = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const a = rand() * Math.PI * 2;
        const r0 = rand() * 0.06;
        add(
          new THREE.ConeGeometry(0.035, 0.3 + rand() * 0.18, 4),
          tint,
          localM(Math.cos(a) * r0, 0.16, Math.sin(a) * r0, {
            rx: (rand() - 0.5) * 0.7,
            rz: (rand() - 0.5) * 0.7,
          }),
          p,
        );
      }
    }

    // ------------------------------------------------------------------
    // Merge everything static into ONE mesh
    // ------------------------------------------------------------------
    const merged = mergeGeometries(parts, false);
    if (!merged) {
      throw new Error('hampi: static geometry merge failed');
    }
    const staticMesh = new THREE.Mesh(merged, biomeMaterial());
    scene.add(staticMesh);

    // ------------------------------------------------------------------
    // Golden dust motes — the single allowed InstancedMesh
    // ------------------------------------------------------------------
    const DUST_N = 36;
    const dust = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.04, 0),
      new THREE.MeshBasicMaterial({ color: 0xf5d98b, transparent: true, opacity: 0.55 }),
      DUST_N,
    );
    dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dustBase: THREE.Vector3[] = [];
    const dustNormal: THREE.Vector3[] = [];
    const dustDrift: THREE.Vector3[] = [];
    const dustPhase: number[] = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < DUST_N; i++) {
      const dir = sampleInZone(-2, -158, 0.35, rand, new THREE.Vector3());
      const h = ctx.groundH(dir);
      const base = surfacePos(dir, h + 0.3 + rand() * 1.4);
      dustBase.push(base);
      dustNormal.push(new THREE.Vector3(0, 1, 0)); // flat world: up
      // horizontal drift direction
      const tangent = new THREE.Vector3(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
      tangent.normalize().multiplyScalar(0.25 + rand() * 0.25);
      dustDrift.push(tangent);
      dustPhase.push(rand() * Math.PI * 2);
    }
    const tickDust = (t: number): void => {
      for (let i = 0; i < DUST_N; i++) {
        const base = dustBase[i];
        dummy.position
          .copy(base)
          .addScaledVector(dustDrift[i], Math.sin(t * 0.25 + dustPhase[i]))
          .addScaledVector(dustNormal[i], Math.sin(t * 0.4 + dustPhase[i] * 1.7) * 0.12);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        dust.setMatrixAt(i, dummy.matrix);
      }
      dust.instanceMatrix.needsUpdate = true;
    };
    tickDust(0);
    scene.add(dust);

    // ------------------------------------------------------------------
    // NPCs — original fictional characters
    // ------------------------------------------------------------------
    const npcs: BiomeNPCDef[] = [
      {
        id: 'hampi-caretaker',
        name: 'Basavaraj',
        nameHi: 'बसवराज',
        role: 'Ruins caretaker',
        latDeg: -4.8,
        lonDeg: -162.8,
        skin: 0x8a5a3b,
        tunic: 0xc96f3b,
        accessory: 'turban',
        accessoryColor: 0xa6562e,
        line: 'Fifty years ago a postcard arrived with no sender — the ruins have kept it safe ever since.',
        lineHi: 'पचास साल पहले बिना प्रेषक का एक पोस्टकार्ड आया था — खंडहर ने उसे तब से संभाल कर रखा है।',
      },
      {
        id: 'hampi-carver',
        name: 'Meenakshi',
        nameHi: 'मीनाक्षी',
        role: 'Stone carver',
        latDeg: 0.4,
        lonDeg: -153.8,
        skin: 0x7a4f33,
        tunic: 0xe8d9a0,
        accessory: 'shawl',
        accessoryColor: 0x8f867b,
        line: 'Every wheel I carve turns a little easier than the last — stone remembers kindness.',
        lineHi: 'मैं जो पहिया तराशती हूँ, वह पिछले से थोड़ा और आसानी से घूमता है — पत्थर दया को याद रखता है।',
      },
    ];

    return {
      update: (_dt: number, t: number) => tickDust(t),
      npcs,
    };
  },
};
