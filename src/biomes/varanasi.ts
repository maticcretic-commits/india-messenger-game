/**
 * VARANASI GHATS biome — "Postcards from Bharat"
 * Zone: lat 30°, lon -52°, angular radius 0.5 rad.
 * Twilight magic hour: golden sunset shifting toward glowing lamps.
 * Quest anchor: "The Lost Song" — a lyrics notebook for the old sitar
 * maestro who plays from his boat on the river.
 *
 * Researched signature details modeled (web research 2026-10-14, all
 * designs ORIGINAL, inspired by the real place — no real-world assets):
 * 1. Tiered pauri steps — the ghats are embankments of broad worn stone
 *    slabs; Dashashwamedh's steps descend in multiple levels that double
 *    as a flood gauge as the river rises. Modeled as a fanning
 *    amphitheater of 6 wide sandstone terraces, each step top anchored to
 *    the local terrain so the terraces read on any slope.
 * 2. Floating leaf-boat diyas — ghee lamps set afloat in round/conical
 *    leaf boats with marigold petals as offerings to Ganga (Dev Deepavali's
 *    "stars fallen to earth"). Modeled as one InstancedMesh: leaf-green
 *    flattened cone + flame cone + petal dots, bobbing with flame flicker.
 * 3. Terracotta shrines with stepped shikhara spires — 18th-century temple
 *    architecture crowding behind the ghats. Modeled as plinth + sanctum +
 *    three shrinking shikhara tiers + amalaka disc + brass kalasha finial.
 * 4. Marigold toran garlands — genda phool strung with mango leaves across
 *    doorways as auspicious welcome hangings. Modeled as sagging strings
 *    of alternating orange/yellow marigold spheres (+ leaf cones) across
 *    both temple doors and the ghat platform edge.
 * 5. Ganga Aarti brass bells + striped wooden rowing boats — the evening
 *    aarti's great brass lamps and the dawn boat rides along the ghats.
 *    Modeled as brass bells on wooden posts flanking the steps, and two
 *    stripe-sectioned wooden boats moored on the indigo river.
 */
import * as THREE from 'three';
import { toon } from '../sketch';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANET_RADIUS } from '../planet';
import { sampleInZone, paint, biomeMaterial , surfacePos, surfaceQuat} from './geo';
import type { BiomeModule, BiomeNPCDef, BiomeCtx } from './types';

const UP = new THREE.Vector3(0, 1, 0);
const ZONE_LAT = 30;
const ZONE_LON = -52;
const ZONE_RAD = 0.5;

// Palette: terracotta reds, marigold oranges, sandstone ochres, indigo water.
const C = {
  stepA: 0xd9a86c,
  stepB: 0xd0965e,
  platform: 0xc99a5f,
  parapet: 0xb98a58,
  terracotta: 0xa85b3f,
  terracottaLight: 0xc07a4a,
  terracottaDark: 0x8c4630,
  doorDark: 0x3a2418,
  brass: 0xc9971f,
  kalasha: 0xd9a441,
  wood: 0x5d3a1e,
  hullA: 0x8a5a2b,
  hullB: 0x6f4420,
  hullC: 0x9c6b30,
  hullDark: 0x4a2f16,
  bench: 0xb98a4a,
  marigold: 0xf59e0b,
  marigoldLight: 0xffc53d,
  leaf: 0x3f7d33,
  flame: 0xffb627,
  diyaLeaf: 0x2e7d32,
};

interface Spot {
  x: number;
  z: number;
  dir: THREE.Vector3;
}

export const varanasiBiome: BiomeModule = {
  id: 'varanasi',
  name: 'Varanasi Ghats',
  nameHi: 'वाराणसी घाट',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  signatureDetails: [
    'Tiered pauri stone steps — broad sandstone terraces fanning down to the river, step levels doubling as the flood gauge',
    'Floating leaf-boat diyas — ghee lamps in green leaf cups with marigold petals, set adrift as offerings to Ganga',
    'Terracotta shrines with stepped shikhara spires, amalaka discs and brass kalasha finials',
    'Marigold toran garlands with mango leaves strung across temple doorways and the ghat platform edge',
    'Ganga Aarti brass bells on wooden posts, and striped wooden rowing boats moored on the indigo river',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): { update?: (dt: number, t: number) => void; npcs: BiomeNPCDef[] } {
    // --- local frame (flat world): x = east offset, z = north offset ---
    const center = ctx.latLonToDir(ZONE_LAT, ZONE_LON);
    const east = new THREE.Vector3(1, 0, 0);
    const north = new THREE.Vector3(0, 0, -1);

    // x/z are world-unit offsets from the zone center.
    const dirAt = (x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => {
      return out.set(center.x + x, 0, center.z - z);
    };

    /** Flat-world frame: upright position + optional yaw. */
    const frameMatrix = (x: number, z: number, lift: number, yawRad = 0): THREE.Matrix4 => {
      const dir = dirAt(x, z);
      const h = ctx.groundH(dir);
      const m = new THREE.Matrix4().makeRotationY(yawRad);
      m.setPosition(dir.x, h + lift, dir.z);
      return m;
    };

    const offsetToLatLon = (x: number, z: number): { lat: number; lon: number } => {
      const d = dirAt(x, z);
      const r = (v: number): number => Math.round(v * 1000) / 1000;
      // inverse of latLonToDir: x=lon, z=-lat
      return { lat: r(-d.z), lon: r(d.x) };
    };

    // --- merged static geometry (object #1 of 3) ---
    const parts: THREE.BufferGeometry[] = [];
    const addPart = (geo: THREE.BufferGeometry, hex: number, m: THREE.Matrix4): void => {
      geo.deleteAttribute('uv');
      paint(geo, hex);
      geo.applyMatrix4(m);
      parts.push(geo);
    };
    const local = (m: THREE.Matrix4, x: number, y: number, z: number): THREE.Matrix4 =>
      m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    const boxAt = (
      w: number, h: number, d: number, hex: number,
      m: THREE.Matrix4, x: number, y: number, z: number, ry = 0,
    ): void => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (ry !== 0) g.rotateY(ry);
      addPart(g, hex, local(m, x, y, z));
    };
    const coneAt = (
      r: number, h: number, seg: number, hex: number,
      m: THREE.Matrix4, x: number, y: number, z: number,
    ): void => {
      const g = new THREE.ConeGeometry(r, h, seg);
      addPart(g, hex, local(m, x, y, z));
    };
    const sphereAt = (
      r: number, hex: number,
      m: THREE.Matrix4, x: number, y: number, z: number,
    ): void => {
      const g = new THREE.SphereGeometry(r, 7, 6);
      addPart(g, hex, local(m, x, y, z));
    };
    const cylAt = (
      rTop: number, rBot: number, h: number, hex: number,
      m: THREE.Matrix4, x: number, y: number, z: number, seg = 7,
    ): void => {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
      addPart(g, hex, local(m, x, y, z));
    };

    /** Sagging marigold garland between two points (local coords). */
    const garland = (
      m: THREE.Matrix4,
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      sag: number, beads: number, withLeaves: boolean,
    ): void => {
      for (let i = 0; i < beads; i++) {
        const f = beads === 1 ? 0 : i / (beads - 1);
        const x = ax + (bx - ax) * f;
        const y = ay + (by - ay) * f - sag * 4 * f * (1 - f);
        const z = az + (bz - az) * f;
        sphereAt(0.09, i % 2 === 0 ? C.marigold : C.marigoldLight, m, x, y, z);
        if (withLeaves && i < beads - 1) {
          const f2 = (i + 0.5) / (beads - 1);
          coneAt(0.07, 0.16, 5, C.leaf, m,
            ax + (bx - ax) * f2,
            ay + (by - ay) * f2 - sag * 4 * f2 * (1 - f2) - 0.1,
            az + (bz - az) * f2);
        }
      }
    };

    // --- 1. grand terraced ghat steps (amphitheater fan, descending east) ---
    const STEP_N = 6;
    const stepTop: number[] = [];
    for (let i = 0; i < STEP_N; i++) {
      const sx = -0.5 + i * 1.1;
      const width = 4.2 + i * 0.55;
      const topLift = 1.7 - i * 0.3;
      stepTop.push(topLift);
      const g = new THREE.BoxGeometry(width, 2.4, 1.18);
      g.translate(0, -1.2, 0); // top face at local y=0
      addPart(g, i % 2 === 0 ? C.stepA : C.stepB, frameMatrix(sx, 0, topLift));
    }
    // parapet walls flanking the steps (two segments per side)
    for (const side of [-1, 1]) {
      for (let s = 0; s < 3; s++) {
        const i0 = s * 2;
        const sx = -0.5 + (i0 + 0.5) * 1.1;
        const avgTop = (stepTop[i0] + stepTop[i0 + 1]) / 2;
        const pz = side * (2.55 + i0 * 0.28);
        const g = new THREE.BoxGeometry(2.32, 0.55, 0.35);
        g.translate(0, -0.275, 0);
        addPart(g, C.parapet, frameMatrix(sx, pz, avgTop + 0.32));
      }
    }

    // --- 2. top platform slab ---
    {
      const g = new THREE.BoxGeometry(2.6, 2.6, 7.2);
      g.translate(0, -1.3, 0);
      addPart(g, C.platform, frameMatrix(-2.3, 0, 1.78));
    }

    // --- 3. two terracotta shrines with stepped shikhara ---
    const buildTemple = (m: THREE.Matrix4): void => {
      boxAt(2.6, 0.7, 2.6, C.terracottaDark, m, 0, 0.35, 0); // plinth
      boxAt(1.7, 1.3, 1.7, C.terracotta, m, 0, 1.35, 0); // sanctum
      boxAt(1.45, 0.55, 1.45, C.terracottaLight, m, 0, 2.27, 0); // shikhara tiers
      boxAt(1.1, 0.5, 1.1, C.terracottaLight, m, 0, 2.8, 0);
      boxAt(0.78, 0.45, 0.78, C.terracottaLight, m, 0, 3.27, 0);
      cylAt(0.34, 0.34, 0.22, C.terracottaDark, m, 0, 3.6, 0); // amalaka
      coneAt(0.16, 0.42, 6, C.kalasha, m, 0, 3.92, 0); // kalasha finial
      boxAt(0.12, 1.0, 0.75, C.doorDark, m, 0.86, 1.2, 0); // doorway (faces +x)
      // marigold toran across the doorway
      garland(m, 0.95, 1.82, -0.5, 0.95, 1.82, 0.5, 0.14, 11, false);
    };
    buildTemple(frameMatrix(-2.6, -4.4, 0));
    buildTemple(frameMatrix(-2.6, 4.4, 0));

    // --- 4. brass aarti bells on wooden posts flanking the steps ---
    const buildBell = (x: number, z: number): void => {
      const m = frameMatrix(x, z, 1.78); // standing on the platform
      cylAt(0.09, 0.11, 1.6, C.wood, m, 0, 0.8, 0);
      boxAt(0.7, 0.1, 0.12, C.wood, m, 0, 1.62, 0);
      coneAt(0.22, 0.35, 8, C.brass, m, 0, 1.38, 0);
      sphereAt(0.05, C.wood, m, 0, 1.18, 0);
      garland(m, -0.32, 1.62, 0, 0.32, 1.62, 0, 0.08, 7, false);
    };
    buildBell(-1.2, -3.2);
    buildBell(-1.2, 3.2);

    // --- 5. marigold swag across the platform's river-facing edge ---
    {
      const m = frameMatrix(-1.0, 0, 1.78);
      for (const side of [-1, 1]) {
        cylAt(0.08, 0.1, 2.2, C.wood, m, 0, 1.1, side * 3.3);
        sphereAt(0.12, C.marigold, m, 0, 2.25, side * 3.3);
      }
      garland(m, 0, 2.2, -3.3, 0, 2.2, 3.3, 0.45, 17, true);
    }

    // --- prop spots: in-zone sample gives a tangent direction, remapped into the river rect ---
    const riverSpot = (cx: number, cz: number, hx: number, hz: number): Spot => {
      const d = sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, ctx.rand, new THREE.Vector3());
      // flat-world pos → local offsets from zone center
      let tx = d.x - center.x;
      let tz = -(d.z - center.z);
      const m = Math.hypot(tx, tz) || 1;
      tx /= m;
      tz /= m;
      const jx = 0.35 + 0.65 * ctx.rand();
      const jz = 0.35 + 0.65 * ctx.rand();
      const x = THREE.MathUtils.clamp(cx + tx * hx * jx, cx - hx, cx + hx);
      const z = THREE.MathUtils.clamp(cz + tz * hz * jz, cz - hz, cz + hz);
      return { x, z, dir: dirAt(x, z) };
    };

    // --- 6. two striped wooden rowing boats on the river ---
    const buildBoat = (s: Spot): void => {
      const m = frameMatrix(s.x, s.z, 0.1, Math.PI / 2 + (ctx.rand() - 0.5) * 0.3);
      boxAt(1.4, 0.42, 0.75, C.hullA, m, 0, 0.21, 0); // mid hull
      const bow = new THREE.BoxGeometry(0.7, 0.42, 0.55);
      // striped sections: bow / stern in alternating woods
      addPart(bow, C.hullB, local(m, 1.0, 0.21, 0));
      const stern = new THREE.BoxGeometry(0.7, 0.42, 0.55);
      addPart(stern, C.hullC, local(m, -1.0, 0.21, 0));
      boxAt(1.9, 0.1, 0.55, C.hullDark, m, 0, 0.43, 0); // dark interior
      boxAt(0.25, 0.08, 0.6, C.bench, m, 0.5, 0.44, 0); // thwarts
      boxAt(0.25, 0.08, 0.6, C.bench, m, -0.5, 0.44, 0);
      // mooring pole
      const pole = new THREE.CylinderGeometry(0.035, 0.035, 1.8, 5);
      pole.rotateZ(0.35);
      addPart(pole, C.wood, local(m, -1.2, 0.9, 0.2));
    };
    const boat1 = riverSpot(7.1, -1.9, 0.5, 0.7);
    const boat2 = riverSpot(7.1, 1.9, 0.5, 0.7);
    buildBoat(boat1);
    buildBoat(boat2);

    // --- merge ALL statics into ONE mesh (object #1) ---
    const merged = mergeGeometries(parts, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, biomeMaterial());
      scene.add(mesh);
    }

    // --- 7. river: terrain-conforming indigo strip (object #2) ---
    const riverGeo = new THREE.PlaneGeometry(3, 7, 3, 8);
    riverGeo.rotateX(-Math.PI / 2);
    {
      const rp = riverGeo.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < rp.count; i++) {
        v.fromBufferAttribute(rp, i);
        const dir = dirAt(7.2 + v.x, v.z);
        const h = ctx.groundH(dir);
        v.set(dir.x, h + 0.12, dir.z);
        rp.setXYZ(i, v.x, v.y, v.z);
      }
      riverGeo.computeVertexNormals();
    }
    const river = new THREE.Mesh(
      riverGeo,
      (() => { const m = toon(0x0f6f7a); m.transparent = true; m.opacity = 0.88; return m; })(),
    );
    scene.add(river);

    // --- 8. floating diyas: ONE InstancedMesh (object #3) ---
    const DIYA_N = 10;
    const diyaGeos: THREE.BufferGeometry[] = [];
    {
      const leafG = new THREE.ConeGeometry(0.24, 0.12, 7);
      leafG.deleteAttribute('uv');
      paint(leafG, C.diyaLeaf);
      diyaGeos.push(leafG);
      const flameG = new THREE.ConeGeometry(0.055, 0.16, 6);
      flameG.translate(0, 0.13, 0);
      flameG.deleteAttribute('uv');
      paint(flameG, C.flame);
      diyaGeos.push(flameG);
      for (let p = 0; p < 3; p++) {
        const petal = new THREE.SphereGeometry(0.045, 6, 5);
        const a = (p / 3) * Math.PI * 2;
        petal.translate(Math.cos(a) * 0.16, 0.03, Math.sin(a) * 0.16);
        petal.deleteAttribute('uv');
        paint(petal, p % 2 === 0 ? C.marigold : C.marigoldLight);
        diyaGeos.push(petal);
      }
    }
    const diyaGeo = mergeGeometries(diyaGeos, false);
    if (!diyaGeo) throw new Error('varanasi: diya geometry merge failed');
    const diyaMat = (() => { const m = toon(0xffffff); m.vertexColors = true; return m; })();
    const diyas = new THREE.InstancedMesh(diyaGeo, diyaMat, DIYA_N);
    diyas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(diyas);

    interface DiyaState {
      dir: THREE.Vector3;
      baseY: number;
      phase: number;
      quat: THREE.Quaternion;
    }
    const diyaStates: DiyaState[] = [];
    {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const col = new THREE.Color(1, 1, 1);
      for (let i = 0; i < DIYA_N; i++) {
        const s = riverSpot(7.2, 0, 1.1, 3.1);
        const h = ctx.groundH(s.dir);
        const phase = ctx.rand() * Math.PI * 2;
        surfaceQuat(s.dir, ctx.rand() * Math.PI * 2, q);
        diyaStates.push({ dir: s.dir.clone(), baseY: h + 0.15, phase, quat: q.clone() });
        m4.compose(
          surfacePos(s.dir, h + 0.15),
          q,
          new THREE.Vector3(1, 1, 1),
        );
        diyas.setMatrixAt(i, m4);
        diyas.setColorAt(i, col);
      }
      diyas.instanceMatrix.needsUpdate = true;
      if (diyas.instanceColor) diyas.instanceColor.needsUpdate = true;
    }

    const update = (_dt: number, t: number): void => {
      const m4 = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const yawQ = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const col = new THREE.Color();
      for (let i = 0; i < DIYA_N; i++) {
        const st = diyaStates[i];
        // gentle bob on the water + slow drift rotation
        surfacePos(st.dir, st.baseY + Math.sin(t * 1.1 + st.phase) * 0.06, p);
        yawQ.setFromAxisAngle(UP, t * 0.15 + st.phase);
        q.copy(st.quat).multiply(yawQ);
        // flame flicker: subtle scale pulse
        const fs = 1 + 0.05 * Math.sin(t * 6 + st.phase * 3);
        s.set(fs, fs, fs);
        m4.compose(p, q, s);
        diyas.setMatrixAt(i, m4);
        // flame flicker: warm brightness pulse via instance color
        const f = 0.88 + 0.12 * Math.sin(t * 9 + st.phase * 5);
        diyas.setColorAt(i, col.setRGB(f, f * 0.97, f * 0.92));
      }
      diyas.instanceMatrix.needsUpdate = true;
      if (diyas.instanceColor) diyas.instanceColor.needsUpdate = true;
    };

    // --- NPCs (exactly 2, inside the zone) ---
    const maestroLL = offsetToLatLon(boat1.x, boat1.z); // the old maestro, on his boat
    const sellerLL = offsetToLatLon(-1.4, 1.6); // flower-seller by the steps
    const npcs: BiomeNPCDef[] = [
      {
        id: 'varanasi-maestro',
        name: 'Ustad Kailash Bhatt',
        nameHi: 'उस्ताद कैलाश भट्ट',
        role: 'Sitar maestro',
        latDeg: maestroLL.lat,
        lonDeg: maestroLL.lon,
        skin: 0x8d5a3b,
        tunic: 0xe8dcc0,
        accessory: 'shawl',
        accessoryColor: 0x7a2e2e,
        line: 'My lyrics notebook slipped into the river at dawn — thirty years of river songs. The Ganga keeps what she loves; perhaps she will hum one back to me.',
        lineHi: 'मेरी धुनों वाली कॉपी भोर में गंगा में गिर गई — तीस साल के नदी-गीत। गंगा जिसे चाहती है रख लेती है; शायद कोई धुन लौटा दे।',
      },
      {
        id: 'varanasi-phoolwali',
        name: 'Malti Devi',
        nameHi: 'मालती देवी',
        role: 'Marigold flower-seller',
        latDeg: sellerLL.lat,
        lonDeg: sellerLL.lon,
        skin: 0x7a4a2e,
        tunic: 0xd94f30,
        accessory: 'shawl',
        accessoryColor: 0x2e7d32,
        line: 'Fresh genda phool! Marigolds for the temple, marigolds for your boat — the river always smiles at orange.',
        lineHi: 'ताज़े गेंदे के फूल! मंदिर के लिए भी, नाव के लिए भी — गंगा नारंगी रंग देखकर मुस्करा देती है।',
      },
    ];

    return { update, npcs };
  },
};
