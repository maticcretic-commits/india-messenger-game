/**
 * GOA COAST biome — "Postcards from Bharat" (original cozy low-poly art).
 *
 * Research (web, Oct 2026) → signature details modeled:
 * 1. BALCÃO PORCH — the covered front veranda of Indo-Portuguese Goan homes:
 *    ornamental columns, built-in masonry bench seats finished in red oxide
 *    ("sopó"), and grand entrance steps; the susegad social space where
 *    neighbours gather and watch the street.
 * 2. OYSTER-SHELL WINDOWS — cream stucco-moulded frames with bright turquoise
 *    shutters and pale shell-like panes; whitewashed walls under a steep
 *    terracotta pyramid roof with neat eaves boards.
 * 3. RAMPONN / KHUTAVANNI NETS — Goa's traditional shore-seine and stake
 *    fishing: huge nets hauled ashore by hand, and nets tied between wooden
 *    poles ("khutti") staked along the water; modeled as cream mesh panels
 *    draped over wooden stake tripods.
 * 4. LEANING COCONUT PALMS with coconut clusters, and bougainvillea
 *    (magenta / coral / pink) cascading over the villa walls.
 *
 * All designs are original low-poly interpretations inspired by the real place.
 */

import * as THREE from 'three';
import { toon } from '../sketch';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, biomeMaterial, sampleInZone } from './geo';
import type { BiomeModule, BiomeCtx } from './types';
import { PLANET_RADIUS } from '../planet';

const ZONE_LAT = -40;
const ZONE_LON = -42;
const ZONE_RAD = 0.5;

// Palette: pastel corals, azure sea, crisp white, sun-kissed sand.
const WHITE = 0xfdfbf3;
const CREAM = 0xf0e4cc;
const TERRACOTTA = 0xc1603a;
const TERRACOTTA_DARK = 0x9c4a2e;
const TURQUOISE = 0x2fb9a6;
const SHELL = 0xf3e6c8;
const WOOD = 0x8a5a33;
const WOOD_DARK = 0x7a5233;
const STAKE = 0x7c5a38;
const RED_OXIDE = 0xa8432f;
const STONE = 0xd9cdb8;
const SAND = 0xe9d6a4;
const SAND_DARK = 0xe3cd9c;
const PATH = 0xdcc08e;
const NET = 0xf0e2c2;
const TRUNK = 0x8a6b4a;
const LEAF_A = 0x62a24e;
const LEAF_B = 0x74b45e;
const LEAF_DRY = 0xc9a86a;
const NUT = 0x6e4f30;
const OAT = 0xcbb26a;
const BOUG_A = 0xd1509b;
const BOUG_B = 0xe8766a;
const BOUG_C = 0xe89bb8;
const BUSH = 0x5d8f4e;

interface PutOpts {
  ry2?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  rx?: number;
  rz?: number;
}

export const goaBiome: BiomeModule = {
  id: 'goa',
  name: 'Goa Coast',
  nameHi: 'गोवा तट',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  // Beach rim along the west edge: soft sand underfoot (×0.7, feathered rim).
  speedZones: [{ latDeg: -40, lonDeg: -57, radiusRad: 0.24, mult: 0.7 }],
  signatureDetails: [
    'Balcão porch: covered veranda on ornamental columns with built-in red-oxide bench seats (sopó) and grand front steps — the Goan susegad social space.',
    'Oyster-shell-style window panes with bright turquoise shutters and cream stucco mouldings; whitewashed walls under a terracotta pyramid roof with eaves boards.',
    'Ramponn nets draped over khutti wooden stake tripods — cream mesh from crossed thin bars.',
    'Leaning coconut palms with coconut clusters, plus magenta-coral bougainvillea cascading over the villa walls.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx) {
    const center = ctx.latLonToDir(ZONE_LAT, ZONE_LON);
    const hCenter = ctx.groundH(center);
    // Local frame (flat world): dirOf(x, z) with x = east offset, z = north offset.
    // (north = -z in world coords.)
    const tmpV = new THREE.Vector3();

    const dirOf = (x: number, z: number, out: THREE.Vector3): THREE.Vector3 =>
      out.set(center.x + x, 0, center.z - z);

    // Local y of the terrain surface at (x, z), relative to the zone-center surface.
    const groundLocalY = (x: number, z: number): number =>
      ctx.groundH(dirOf(x, z, tmpV)) - hCenter;

    // ---- merged static geometry -------------------------------------------
    const parts: THREE.BufferGeometry[] = [];
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const m = new THREE.Matrix4();

    const addPart = (
      geo: THREE.BufferGeometry,
      hex: number,
      x: number,
      y: number,
      z: number,
      ry = 0,
      sx = 1,
      sy = 1,
      sz = 1,
      rx = 0,
      rz = 0,
    ): void => {
      let g: THREE.BufferGeometry = paint(geo, hex);
      g.deleteAttribute('uv');
      // IcosahedronGeometry is non-indexed while the rest are indexed — merge
      // needs one consistent form, so normalize everything to non-indexed.
      if (g.index) g = g.toNonIndexed();
      e.set(rx, ry, rz);
      q.setFromEuler(e);
      p.set(x, y, z);
      s.set(sx, sy, sz);
      m.compose(p, q, s);
      g.applyMatrix4(m);
      parts.push(g);
    };

    // Local placer: builds in a small (lx, ly, lz) frame anchored at (px, pz),
    // rotated ry about Y, sitting on the terrain.
    const placer = (px: number, pz: number, ry: number) => {
      const py = groundLocalY(px, pz);
      const c = Math.cos(ry);
      const sn = Math.sin(ry);
      return {
        put(geo: THREE.BufferGeometry, hex: number, lx: number, ly: number, lz: number, o: PutOpts = {}): void {
          const wx = px + lx * c + lz * sn;
          const wz = pz - lx * sn + lz * c;
          addPart(
            geo, hex, wx, py + ly, wz,
            (o.ry2 ?? 0) + ry,
            o.sx ?? 1, o.sy ?? 1, o.sz ?? 1,
            o.rx ?? 0, o.rz ?? 0,
          );
        },
      };
    };

    // ---- villa (whitewashed Indo-Portuguese house, front faces the sea) ----
    const villa = placer(2.6, 0.8, Math.PI);

    villa.put(new THREE.BoxGeometry(3.7, 0.4, 2.9), CREAM, 0, 0.2, 0); // plinth
    villa.put(new THREE.BoxGeometry(3.2, 1.7, 2.4), WHITE, 0, 1.25, 0); // walls
    villa.put(new THREE.BoxGeometry(3.8, 0.09, 3.0), WOOD_DARK, 0, 2.14, 0); // eaves boards
    villa.put(new THREE.BoxGeometry(3.45, 0.14, 2.65), CREAM, 0, 2.24, 0); // cornice
    villa.put(new THREE.ConeGeometry(2.55, 1.35, 4), TERRACOTTA, 0, 2.985, 0, {
      ry2: Math.PI / 4, sx: 1.12, sz: 0.95,
    }); // terracotta pyramid roof
    villa.put(new THREE.SphereGeometry(0.12, 6, 5), TERRACOTTA_DARK, 0, 3.72, 0); // finial

    // Balcão porch: columns + slab + benches (sopó) + steps
    villa.put(new THREE.BoxGeometry(1.9, 0.34, 2.7), SAND_DARK, 2.55, 0.17, 0); // slab
    villa.put(new THREE.BoxGeometry(1.94, 0.07, 2.74), RED_OXIDE, 2.55, 0.375, 0); // red-oxide floor
    for (const cx of [1.85, 3.25]) {
      for (const cz of [-1.15, 1.15]) {
        villa.put(new THREE.CylinderGeometry(0.09, 0.11, 1.55, 6), WHITE, cx, 1.19, cz);
        villa.put(new THREE.BoxGeometry(0.24, 0.1, 0.24), WHITE, cx, 2.0, cz); // capital
      }
    }
    villa.put(new THREE.ConeGeometry(1.95, 0.85, 4), TERRACOTTA, 2.55, 2.475, 0, {
      ry2: Math.PI / 4, sx: 0.82, sz: 1.08,
    }); // porch roof
    for (const bz of [-1.05, 1.05]) {
      villa.put(new THREE.BoxGeometry(1.5, 0.4, 0.4), RED_OXIDE, 2.55, 0.61, bz); // sopó benches
    }
    const stepY = [0.3, 0.19, 0.08];
    for (let i = 0; i < 3; i++) {
      villa.put(new THREE.BoxGeometry(0.55, 0.13, 1.7), STONE, 3.75 + i * 0.4, stepY[i], 0);
    }
    for (const sz2 of [-0.98, 0.98]) {
      villa.put(new THREE.BoxGeometry(1.35, 0.45, 0.18), WHITE, 4.15, 0.225, sz2); // step cheek walls
      villa.put(new THREE.BoxGeometry(1.4, 0.08, 0.24), RED_OXIDE, 4.15, 0.49, sz2);
    }

    // Door + windows: cream stucco frames, turquoise shutters, shell-like panes
    villa.put(new THREE.BoxGeometry(0.1, 1.35, 0.85), CREAM, 1.62, 1.15, 0);
    villa.put(new THREE.BoxGeometry(0.1, 1.2, 0.65), WOOD, 1.65, 1.08, 0);
    for (const wz of [-0.78, 0.78]) {
      villa.put(new THREE.BoxGeometry(0.1, 0.85, 0.72), CREAM, 1.62, 1.35, wz);
      villa.put(new THREE.BoxGeometry(0.08, 0.62, 0.5), SHELL, 1.63, 1.35, wz);
      for (const off of [-0.41, 0.41]) {
        villa.put(new THREE.BoxGeometry(0.08, 0.62, 0.26), TURQUOISE, 1.63, 1.35, wz + off);
      }
    }
    for (const sx2 of [-1, 1]) {
      for (const wx of [-0.8, 0.8]) {
        villa.put(new THREE.BoxGeometry(0.72, 0.85, 0.1), CREAM, wx, 1.35, sx2 * 1.22);
        villa.put(new THREE.BoxGeometry(0.5, 0.62, 0.08), SHELL, wx, 1.35, sx2 * 1.23);
        for (const off of [-0.41, 0.41]) {
          villa.put(new THREE.BoxGeometry(0.26, 0.62, 0.08), TURQUOISE, wx + off, 1.35, sx2 * 1.23);
        }
      }
    }

    // Bougainvillea clusters on walls, corners and porch roof edge
    const bougSpots: Array<[number, number, number, number]> = [
      [1.7, 0.7, 1.28, BOUG_A], [1.72, 1.15, 1.3, BOUG_B], [1.55, 1.95, 1.05, BOUG_C],
      [-1.66, 0.8, 0.9, BOUG_B], [-1.62, 1.3, 1.16, BOUG_A], [-1.68, 0.6, -0.7, BOUG_C],
      [0.5, 0.55, -1.32, BOUG_A], [1.2, 0.5, -1.34, BOUG_B], [-0.6, 0.5, 1.3, BOUG_C],
      [2.55, 2.1, 1.45, BOUG_A], [3.3, 1.95, -1.3, BOUG_B], [1.8, 2.0, -1.2, BOUG_C],
      [4.2, 0.55, 1.15, BOUG_B], [-1.7, 1.75, -0.5, BOUG_A],
    ];
    for (const [bx, by, bz, col] of bougSpots) {
      villa.put(new THREE.IcosahedronGeometry(0.17, 0), col, bx, by, bz, {
        ry2: ctx.rand() * Math.PI,
      });
    }
    for (const [lx, ly, lz] of [[1.7, 0.45, 1.26], [-1.64, 0.55, 0.9], [0.5, 0.32, -1.3]] as Array<[number, number, number]>) {
      villa.put(new THREE.IcosahedronGeometry(0.14, 0), BUSH, lx, ly, lz);
    }

    // Garden bushes near the villa
    for (const [gx, gz, gr] of [[4.6, 2.6, 0.34], [0.6, -1.6, 0.3], [5.4, -0.8, 0.38]] as Array<[number, number, number]>) {
      addPart(new THREE.IcosahedronGeometry(gr, 0), BUSH, gx, groundLocalY(gx, gz) + gr * 0.7, gz, ctx.rand() * Math.PI);
    }

    // Sandy path from villa steps to the beach
    for (let i = 0; i < 5; i++) {
      const px = -1.9 - i * 0.42;
      addPart(new THREE.BoxGeometry(0.55, 0.08, 0.7), PATH, px, groundLocalY(px, 0.8) + 0.02, 0.8, ctx.rand() * 0.4);
    }

    // ---- leaning coconut palms --------------------------------------------
    const buildPalm = (px: number, pz: number): void => {
      const py = groundLocalY(px, pz);
      const lean = 0.16 + ctx.rand() * 0.14;
      const yaw = ctx.rand() * Math.PI * 2;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const t1x = px + 1.3 * Math.sin(lean) * cy;
      const t1y = py + 1.3 * Math.cos(lean);
      const t1z = pz - 1.3 * Math.sin(lean) * sy;
      addPart(new THREE.CylinderGeometry(0.1, 0.15, 1.3, 6), TRUNK, px, py + 0.6, pz, yaw, 1, 1, 1, 0, lean / 2);
      const lean2 = lean * 1.5;
      const s2x = t1x + 0.45 * Math.sin(lean2) * cy;
      const s2y = t1y + 0.45 * Math.cos(lean2);
      const s2z = t1z - 0.45 * Math.sin(lean2) * sy;
      addPart(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 6), TRUNK, s2x, s2y, s2z, yaw, 1, 1, 1, 0, lean2);
      const tx = s2x + 0.5 * Math.sin(lean2) * cy;
      const ty = s2y + 0.5 * Math.cos(lean2);
      const tz = s2z - 0.5 * Math.sin(lean2) * sy;
      for (let i = 0; i < 7; i++) {
        const phi = yaw + (i / 7) * Math.PI * 2;
        const col = i === 6 && ctx.rand() < 0.5 ? LEAF_DRY : i % 2 === 0 ? LEAF_A : LEAF_B;
        addPart(new THREE.ConeGeometry(0.17, 1.6, 5), col, tx, ty + 0.1, tz, phi, 1, 1.15, 0.55, 0, 1.12);
      }
      for (let i = 0; i < 3; i++) {
        const a = ctx.rand() * Math.PI * 2;
        addPart(new THREE.SphereGeometry(0.11, 6, 5), NUT, tx + Math.cos(a) * 0.16, ty - 0.14, tz + Math.sin(a) * 0.16);
      }
    };

    for (let i = 0; i < 7; i++) {
      let px = 0;
      let pz = 0;
      for (let tries = 0; tries < 12; tries++) {
        sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, ctx.rand, tmpV);
        // flat-world pos → local coords (x east, z north of zone center)
        px = tmpV.x - center.x;
        pz = -(tmpV.z - center.z);
        const dx = px - 2.6;
        const dz = pz - 0.8;
        if (px > -2.6 && dx * dx + dz * dz > 12.25) break; // off the sea, clear of the villa
      }
      buildPalm(px, pz);
    }

    // ---- ramponn nets on khutti stake tripods ------------------------------
    const buildNet = (cx: number, cz: number): void => {
      const cy = groundLocalY(cx, cz);
      const stakeTops: Array<[number, number]> = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + ctx.rand() * 0.5;
        const bx = cx + Math.cos(a) * 0.55;
        const bz = cz + Math.sin(a) * 0.55;
        const by = groundLocalY(bx, bz);
        stakeTops.push([a, by]);
        const tilt = Math.atan2(0.55, 1.4);
        addPart(
          new THREE.CylinderGeometry(0.035, 0.05, 1.55, 5), STAKE,
          (bx + cx) / 2, (by + cy + 1.4) / 2, (bz + cz) / 2,
          Math.PI - a, 1, 1, 1, 0, tilt,
        );
      }
      // Net mesh panel between two stakes: crossed thin cream bars.
      const am = (stakeTops[0][0] + stakeTops[1][0]) / 2;
      const nx = cx + Math.cos(am) * 0.4;
      const nz = cz + Math.sin(am) * 0.4;
      const panelRy = -am - Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 0.18;
        addPart(
          new THREE.BoxGeometry(0.03, 0.85, 0.03), NET,
          nx + Math.cos(panelRy) * off, cy + 0.62, nz - Math.sin(panelRy) * off,
          panelRy,
        );
      }
      for (const hy of [0.32, 0.52, 0.72, 0.92]) {
        addPart(new THREE.BoxGeometry(0.85, 0.03, 0.03), NET, nx, cy + hy, nz, panelRy);
      }
    };

    buildNet(-2.6, -3.2);
    buildNet(-2.4, 0.6);
    buildNet(-2.7, 4.2);

    // ---- beach rim, sand patches, sea oats ----------------------------------
    for (let z = -6; z <= 6; z += 1.0) {
      const x = -3.85 + (ctx.rand() - 0.5) * 0.5;
      addPart(new THREE.BoxGeometry(1.2, 0.22, 1.06), SAND, x, groundLocalY(x, z) - 0.03, z, ctx.rand() * 0.3);
    }
    for (let i = 0; i < 8; i++) {
      const x = -3.2 + ctx.rand() * 2.2;
      const z = -5 + ctx.rand() * 10;
      addPart(new THREE.BoxGeometry(0.9, 0.1, 0.9), SAND_DARK, x, groundLocalY(x, z) - 0.02, z, ctx.rand() * 0.6);
    }
    for (let i = 0; i < 8; i++) {
      const x = -3.2 + ctx.rand() * 2.0;
      const z = -6 + ctx.rand() * 12;
      const y = groundLocalY(x, z);
      for (let k = 0; k < 3; k++) {
        addPart(
          new THREE.ConeGeometry(0.06, 0.4, 4), OAT,
          x + (ctx.rand() - 0.5) * 0.25, y + 0.18, z + (ctx.rand() - 0.5) * 0.25,
          ctx.rand() * Math.PI, 1, 1, 1, (ctx.rand() - 0.5) * 0.4, (ctx.rand() - 0.5) * 0.4,
        );
      }
    }

    // ---- merged static mesh (object 1) --------------------------------------
    const merged = new THREE.Mesh(mergeGeometries(parts, false), biomeMaterial());
    ctx.placeOnSurface(merged, center, 0);
    scene.add(merged);

    // ---- sea: azure water strip along the west edge (object 2) --------------
    const shoreX = -3.4;
    const refY = groundLocalY(shoreX, 0);
    // Flat world: constant sea level, clipped just under the terrain near
    // shore so the shoreline conforms; terrain bumps further out become islands.
    const seaLevel = (x: number, z: number): number => {
      const flatY = refY - 0.12;
      return Math.min(flatY, groundLocalY(x, z) - 0.06);
    };

    const seaGeo = new THREE.PlaneGeometry(5.8, 11, 12, 16);
    seaGeo.rotateX(-Math.PI / 2);
    const sp = seaGeo.attributes.position as THREE.BufferAttribute;
    const sv = new THREE.Vector3();
    for (let i = 0; i < sp.count; i++) {
      sv.fromBufferAttribute(sp, i);
      const wx = sv.x - 6.3; // x ∈ [-9.2, -3.4]
      const wz = sv.z; // z ∈ [-5.5, 5.5]
      sp.setXYZ(i, wx, seaLevel(wx, wz), wz);
    }
    seaGeo.computeVertexNormals();
    const seaMat = toon(0x0f6f7a);
    seaMat.transparent = true;
    seaMat.opacity = 0.88;
    seaMat.side = THREE.DoubleSide;
    const sea = new THREE.Mesh(seaGeo, seaMat);
    ctx.placeOnSurface(sea, center, 0);
    scene.add(sea);

    // ---- animated foam strips (object 3: the single InstancedMesh) ----------
    const foamGeo = new THREE.BoxGeometry(0.55, 0.07, 0.3);
    const foamMat = toon(0xffffff);
    const FOAM_N = 8;
    const foam = new THREE.InstancedMesh(foamGeo, foamMat, FOAM_N);
    foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const foamBase: Array<{ x: number; y: number; z: number; phase: number; ry: number }> = [];
    for (let i = 0; i < FOAM_N; i++) {
      const fz = -5.2 + i * 1.5 + (ctx.rand() - 0.5) * 0.6;
      const fx = -3.55 + (ctx.rand() - 0.5) * 0.3;
      foamBase.push({
        x: fx,
        y: seaLevel(fx, fz) + 0.05,
        z: fz,
        phase: ctx.rand() * Math.PI * 2,
        ry: ctx.rand() * Math.PI,
      });
    }
    const setFoam = (t: number): void => {
      for (let i = 0; i < FOAM_N; i++) {
        const f = foamBase[i];
        ctx.dummy.position.set(f.x, f.y + Math.sin(t * 1.7 + f.phase) * 0.07, f.z);
        ctx.dummy.rotation.set(0, f.ry, 0);
        ctx.dummy.updateMatrix();
        foam.setMatrixAt(i, ctx.dummy.matrix);
      }
      foam.instanceMatrix.needsUpdate = true;
    };
    setFoam(0);
    ctx.placeOnSurface(foam, center, 0);
    scene.add(foam);

    return {
      update: (_dt: number, t: number): void => {
        setFoam(t);
      },
      npcs: [
        {
          id: 'goa-rosario',
          name: 'Rosario',
          nameHi: 'रोज़ारियो',
          role: 'Old fisherman',
          latDeg: -40.6,
          lonDeg: -44.6,
          skin: 0x8a5a3b,
          tunic: 0x3f7f9e,
          accessory: 'cap',
          accessoryColor: 0xd9c07a,
          line: 'The sea gives, the sea takes — but these glass chimes remember every wave.',
          lineHi: 'समंदर देता भी है, लेता भी है — पर काँच की ये घंटियाँ हर लहर को याद रखती हैं।',
        },
        {
          id: 'goa-lourdes',
          name: 'Lourdes',
          nameHi: 'लूर्देस',
          role: 'Villa caretaker',
          latDeg: -39.7,
          lonDeg: -41.3,
          skin: 0x7a4f33,
          tunic: 0xc9607e,
          accessory: 'shawl',
          accessoryColor: 0xf2e3c2,
          line: 'Whitewash every summer, polish the turquoise shutters — a loved house stays young forever.',
          lineHi: 'हर गर्मी में सफ़ेदी, फ़िरोज़ी शटर पर पॉलिश — जिससे प्यार किया जाए, वो घर हमेशा जवान रहता है।',
        },
      ],
    };
  },
};
