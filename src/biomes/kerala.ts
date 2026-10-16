/**
 * KERALA BACKWATERS biome — "Postcards from Bharat"
 * Zone: lat -34°, lon 62°, radius 0.5 rad.
 *
 * Researched signature details modeled (web research 2026-10-14, original designs):
 * 1. Kettuvallam anatomy — "kettu" (dwelling) + "vallam" (boat): hull planks tied
 *    with coir rope and no nails, sealed with black cashew-shell resin; an arched
 *    roof of thatched bamboo + coconut husk on a bamboo frame; long bamboo punt
 *    poles for shallow water. Modeled as: mahogany hull with raised double ends,
 *    dark resin waterline stripe, cream half-cylinder thatched arch, windowed cabin,
 *    leaning bamboo punt pole, coir-rope mooring stakes.
 * 2. Coconut grove — knobby ringed trunks, crowns of arching fronds with nut
 *    clusters; the fibre economy (soak, sun-dry, weave) appears as woven coir mats.
 * 3. Water lilies — Kerala's seasonal Nymphaea carpets (Malarikkal, Kottayam):
 *    round floating pads plus day-opening multi-petal pink blooms, bobbing gently
 *    on the canal (the single InstancedMesh).
 * 4. Banana clumps and thatched shore life along a curving backwater canal that
 *    conforms to the terrain.
 */
import * as THREE from 'three';
import { toon } from '../sketch';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANET_RADIUS } from '../planet';
import { sampleInZone, paint, biomeMaterial , surfacePos, flatDist, surfaceQuat, surfaceFrame as geoSurfaceFrame} from './geo';
import type { BiomeModule, BiomeNPCDef, BiomeCtx } from './types';
import { addCollider } from '../collision';

const UP = new THREE.Vector3(0, 1, 0);
const ZONE_LAT = -34;
const ZONE_LON = 62;
const ZONE_RAD = 0.5;

// Palette: emerald greens, sun-bleached cream thatch, rich mahogany wood.
const C = {
  hull: 0x6b3f22,
  resin: 0x3a2412,
  cabin: 0x8a5a33,
  dark: 0x2a1a0e,
  thatch: 0xe8d9b0,
  bamboo: 0xc9a86a,
  coir: 0xa67c4e,
  trunk: 0x7a5c3e,
  frondA: 0x3f8f3f,
  frondB: 0x55a04b,
  banana: 0x6fbf5a,
  bananaB: 0x86d168,
  bushA: 0x4c9a4a,
  bushB: 0x5aa84e,
  pad: 0x3e8f4f,
  petal: 0xf2a7c3,
  bloom: 0xffd94d,
};

const parts: THREE.BufferGeometry[] = [];

function addPart(
  geo: THREE.BufferGeometry,
  hex: number,
  m: THREE.Matrix4,
): void {
  // mergeGeometries needs consistent indexing: normalize everything to non-indexed
  // (IcosahedronGeometry ships without an index; the rest ship with one).
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  paint(g, hex);
  g.applyMatrix4(m);
  parts.push(g);
}

function mat4(
  pos: THREE.Vector3,
  quat: THREE.Quaternion,
  s = 1,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(s, s, s));
}

/** Local +Y -> surface dir, plus yaw about the local (surface-normal) axis. */
function surfaceFrame(
  dir: THREE.Vector3,
  lift: number,
  yaw: number,
  ctx: BiomeCtx,
): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const h = ctx.groundH(dir);
  const pos = surfacePos(dir, h + lift);
  const quat = surfaceQuat(dir, yaw);
  return { pos, quat };
}

/** Thin cylinder strut between two points, in world/local coords as given. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  const mid = a.clone().addScaledVector(d, 0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  g.applyMatrix4(mat4(mid, q));
  return g;
}

function box(
  w: number,
  h: number,
  d: number,
  hex: number,
  parent: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  rz = 0,
  ry = 0,
): void {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz !== 0) g.rotateZ(rz);
  if (ry !== 0) g.rotateY(ry);
  const local = new THREE.Matrix4().makeTranslation(x, y, z);
  addPart(g, hex, parent.clone().multiply(local));
}

/* ---------------- signature landmark: the kettuvallam ---------------- */

function buildHouseboat(parent: THREE.Matrix4): void {
  // Hull: elongated mahogany box with raised double ends.
  box(2.6, 0.45, 0.9, C.hull, parent, 0, 0.28, 0);
  box(0.55, 0.4, 0.75, C.hull, parent, 1.38, 0.42, 0, -0.5);
  box(0.55, 0.4, 0.75, C.hull, parent, -1.38, 0.42, 0, 0.5);
  // Black cashew-shell resin waterline stripe.
  box(2.62, 0.09, 0.92, C.resin, parent, 0, 0.14, 0);
  // Cabin with windows and a centered door.
  box(1.7, 0.55, 0.72, C.cabin, parent, 0, 0.78, 0);
  for (const sx of [-1, 1]) {
    for (const wx of [-0.55, 0, 0.55]) {
      box(0.22, 0.22, 0.05, C.dark, parent, wx, 0.82, sx * 0.37);
    }
  }
  box(0.05, 0.45, 0.28, C.dark, parent, 0.86, 0.68, 0);
  // Bamboo roof posts under the overhang.
  for (const px of [-0.75, 0.75]) {
    for (const pz of [-0.4, 0.4]) {
      const g = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5);
      const local = new THREE.Matrix4().makeTranslation(px, 1.15, pz);
      addPart(g, C.bamboo, parent.clone().multiply(local));
    }
  }
  // Arched thatched roof: half-cylinder, cream, axis along the boat.
  const roof = new THREE.CylinderGeometry(0.62, 0.62, 1.95, 10, 1, false, 0, Math.PI);
  roof.rotateZ(Math.PI / 2);
  const roofLocal = new THREE.Matrix4().makeTranslation(0, 1.32, 0);
  addPart(roof, C.thatch, parent.clone().multiply(roofLocal));
  // Leaning bamboo punt pole.
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5);
  pole.rotateZ(1.25);
  const poleLocal = new THREE.Matrix4().makeTranslation(0.4, 1.35, 0.55);
  addPart(pole, C.bamboo, parent.clone().multiply(poleLocal));
  // Coir-rope mooring stakes + ropes (kettuvalaam is tied, never nailed).
  for (const sx of [-1, 1]) {
    const stake = new THREE.CylinderGeometry(0.05, 0.07, 0.9, 5);
    stake.rotateZ(sx * -0.12);
    const stakeLocal = new THREE.Matrix4().makeTranslation(sx * 2.0, 0.32, 0.55);
    addPart(stake, C.trunk, parent.clone().multiply(stakeLocal));
    const a = new THREE.Vector3(sx * 2.0, 0.75, 0.55);
    const b = new THREE.Vector3(sx * 1.35, 0.45, 0.42);
    const rope = strut(a, b, 0.025);
    addPart(rope, C.coir, parent);
  }
}

/* ---------------- vegetation ---------------- */

function buildPalm(parent: THREE.Matrix4, h: number, s: number, ctx: BiomeCtx): void {
  const trunk = new THREE.CylinderGeometry(0.09 * s, 0.15 * s, h, 6);
  const trunkLocal = new THREE.Matrix4().makeTranslation(0, h / 2, 0);
  addPart(trunk, C.trunk, parent.clone().multiply(trunkLocal));
  // Knobby ringed trunk bands.
  for (let i = 1; i <= 3; i++) {
    const band = new THREE.CylinderGeometry(0.105 * s, 0.115 * s, 0.06, 6);
    const bandLocal = new THREE.Matrix4().makeTranslation(0, (h * i) / 4, 0);
    addPart(band, C.coir, parent.clone().multiply(bandLocal));
  }
  // Crown of arching fronds.
  const n = 7;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * Math.PI * 2 + ctx.rand() * 0.3;
    const tilt = 1.05 + (k % 2) * 0.38;
    const frond = new THREE.ConeGeometry(0.17 * s, 2.1 * s, 4);
    frond.scale(1, 1, 0.32);
    frond.translate(0, 1.0 * s, 0);
    const m = new THREE.Matrix4()
      .makeTranslation(0, h, 0)
      .multiply(new THREE.Matrix4().makeRotationY(az))
      .multiply(new THREE.Matrix4().makeRotationX(tilt));
    addPart(frond, k % 2 === 0 ? C.frondA : C.frondB, parent.clone().multiply(m));
  }
  // Two upright spear leaves.
  for (let k = 0; k < 2; k++) {
    const az = k * 2.4 + 0.6;
    const spear = new THREE.ConeGeometry(0.12 * s, 1.4 * s, 4);
    spear.scale(1, 1, 0.35);
    spear.translate(0, 0.7 * s, 0);
    const m = new THREE.Matrix4()
      .makeTranslation(0, h, 0)
      .multiply(new THREE.Matrix4().makeRotationY(az))
      .multiply(new THREE.Matrix4().makeRotationX(0.45));
    addPart(spear, C.frondB, parent.clone().multiply(m));
  }
  // Coconut cluster under the crown.
  for (let k = 0; k < 3; k++) {
    const nut = new THREE.SphereGeometry(0.09 * s, 6, 5);
    const a = (k / 3) * Math.PI * 2;
    const nutLocal = new THREE.Matrix4().makeTranslation(
      Math.cos(a) * 0.16 * s,
      h - 0.12,
      Math.sin(a) * 0.16 * s,
    );
    addPart(nut, C.trunk, parent.clone().multiply(nutLocal));
  }
}

function buildBanana(parent: THREE.Matrix4, s: number): void {
  const trunk = new THREE.CylinderGeometry(0.07 * s, 0.1 * s, 0.9 * s, 5);
  const trunkLocal = new THREE.Matrix4().makeTranslation(0, 0.45 * s, 0);
  addPart(trunk, C.bananaB, parent.clone().multiply(trunkLocal));
  for (let k = 0; k < 6; k++) {
    const az = (k / 6) * Math.PI * 2;
    const leaf = new THREE.ConeGeometry(0.3 * s, 1.7 * s, 4);
    leaf.scale(1, 1, 0.2);
    leaf.translate(0, 0.8 * s, 0);
    const m = new THREE.Matrix4()
      .makeTranslation(0, 0.85 * s, 0)
      .multiply(new THREE.Matrix4().makeRotationY(az))
      .multiply(new THREE.Matrix4().makeRotationX(1.25));
    addPart(leaf, k % 2 === 0 ? C.banana : C.bananaB, parent.clone().multiply(m));
  }
}

function buildBush(parent: THREE.Matrix4, s: number, hex: number): void {
  const bush = new THREE.IcosahedronGeometry(0.34 * s, 0);
  bush.scale(1, 0.7, 1);
  addPart(bush, hex, parent);
}

function buildCoirMats(parent: THREE.Matrix4): void {
  // Flat woven mat + one rolled mat beside it (coir = coconut fibre, woven).
  box(1.0, 0.05, 0.7, C.bamboo, parent, 0, 0.03, 0);
  box(0.86, 0.055, 0.58, C.coir, parent, 0, 0.035, 0, 0, 0.35);
  const roll = new THREE.CylinderGeometry(0.11, 0.11, 0.72, 7);
  roll.rotateX(Math.PI / 2);
  const rollLocal = new THREE.Matrix4().makeTranslation(0.75, 0.11, 0.1);
  addPart(roll, C.bamboo, parent.clone().multiply(rollLocal));
}

/* ---------------- the canal (object 2) ---------------- */

interface WaterBuild {
  geo: THREE.BufferGeometry;
  centers: THREE.Vector3[];
}

function buildWater(ctx: BiomeCtx): WaterBuild {
  const SEG = 26;
  const HALF = 1.7;
  const LEN = 7.2;
  const center = ctx.latLonToDir(ZONE_LAT, ZONE_LON);
  // Flat world: channel runs east-west with a north-south bend.
  const a1 = new THREE.Vector3(1, 0, 0);
  const a2 = new THREE.Vector3(0, 0, 1);

  const centers: THREE.Vector3[] = [];
  for (let i = 0; i <= SEG; i++) {
    const s = -LEN + (2 * LEN * i) / SEG;
    const bend = Math.sin(s * 0.55) * 2.6;
    centers.push(
      center.clone().addScaledVector(a1, s).addScaledVector(a2, bend),
    );
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) {
    const a = centers[Math.max(0, i - 1)];
    const b = centers[Math.min(SEG, i + 1)];
    const tangent = b.clone().sub(a).normalize();
    tangent.y = 0;
    tangent.normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    for (const sgn of [-1, 1]) {
      tmp.copy(centers[i]).addScaledVector(side, sgn * HALF);
      const h = ctx.groundH(tmp);
      tmp.set(tmp.x, h + 0.15, tmp.z);
      positions.push(tmp.x, tmp.y, tmp.z);
    }
    if (i < SEG) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return { geo, centers };
}

/* ---------------- biome module ---------------- */

const boatBuilder: BiomeNPCDef = {
  id: 'kerala-boatbuilder',
  name: 'Velu Aashari',
  nameHi: 'वेलु आशारी',
  role: 'Reclusive boat-builder',
  latDeg: -33.6,
  lonDeg: 61.2,
  skin: 0x8a5a3b,
  tunic: 0xe8dcc0,
  accessory: 'beard',
  accessoryColor: 0xd8d8d8,
  line: 'They stopped coming when the nails came — my boats are tied with coir, and coir remembers every hand.',
  lineHi: 'कीलें आईं तो लोग आना बंद कर गए — मेरी नावें जटे से बंधी हैं, और जटा हर हाथ को याद रखती है।',
};

const fisherwoman: BiomeNPCDef = {
  id: 'kerala-fisherwoman',
  name: 'Kamala Chechi',
  nameHi: 'कमला चेची',
  role: 'Fisherwoman',
  latDeg: -34.8,
  lonDeg: 63.1,
  skin: 0x7a4f33,
  tunic: 0x2e7d6e,
  accessory: 'shawl',
  accessoryColor: 0xc9563c,
  line: 'Cast your net when the lilies open — the water only lies to those in a hurry.',
  lineHi: 'जब कमल खिलें तभी जाल डालो — पानी सिर्फ़ जल्दबाज़ों से झूठ बोलता है।',
};

export const keralaBiome: BiomeModule = {
  id: 'kerala',
  name: 'Kerala Backwaters',
  nameHi: 'केरल बैकवाटर्स',
  zone: { latDeg: ZONE_LAT, lonDeg: ZONE_LON, radiusRad: ZONE_RAD },
  signatureDetails: [
    'Kettuvallam anatomy: nail-less coir-tied mahogany hull with cashew-resin waterline, arched thatched bamboo roof, leaning punt pole, coir mooring stakes',
    'Coconut grove: knobby ringed trunks, arching frond crowns, coconut clusters, woven coir mats',
    'Water lilies: pink Nymphaea blooms on round floating pads, bobbing gently (single InstancedMesh)',
    'Curving backwater canal conformed to terrain, fringed with banana clumps',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx): { update?: (dt: number, t: number) => void; npcs: BiomeNPCDef[] } {
    parts.length = 0;

    // Object 2: the canal.
    const water = buildWater(ctx);
    const waterMesh = new THREE.Mesh(
      water.geo,
      (() => { const m = toon(0x0f6f7a); m.transparent = true; m.opacity = 0.85; return m; })(),
    );
    waterMesh.frustumCulled = false;

    const minDistToWater = (pos: THREE.Vector3): number => {
      let m = Infinity;
      for (const c of water.centers) {
        const d = flatDist(pos, c);
        if (d < m) m = d;
      }
      return m;
    };
    const scatter = (count: number, minD: number, maxD: number): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      let guard = 0;
      while (out.length < count && guard++ < 500) {
        const d = sampleInZone(ZONE_LAT, ZONE_LON, ZONE_RAD, ctx.rand);
        const dist = minDistToWater(d);
        if (dist >= minD && dist <= maxD) out.push(d);
      }
      return out;
    };

    // Signature landmark: kettuvallam moored mid-canal by the coconut grove.
    const mid = water.centers[Math.floor(water.centers.length / 2)];
    const next = water.centers[Math.floor(water.centers.length / 2) + 1];
    const tangent = next.clone().sub(mid).normalize();
    {
      const h = ctx.groundH(mid);
      const pos = surfacePos(mid, h + 0.17);
      // flat world: yaw aligns local +X to the channel tangent
      const quat = new THREE.Quaternion().setFromAxisAngle(
        UP, Math.atan2(-tangent.z, tangent.x));
      buildHouseboat(mat4(pos, quat));
    }

    // ---- WATER VIEWPOINTS (boss order: enjoy water from paths/bridges/viewpoints,
    // never by walking into deep water) ----
    const chanDir = (i: number): { c: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3 } => {
      const c = water.centers[i];
      const a = water.centers[Math.max(0, i - 1)];
      const b = water.centers[Math.min(water.centers.length - 1, i + 1)];
      const t = b.clone().sub(a).setY(0).normalize();
      const s = new THREE.Vector3(-t.z, 0, t.x); // across the canal
      return { c, t, s };
    };

    // 1. JETTY: wooden deck reaching over the canal edge — stand, watch, enjoy.
    {
      const { c, t, s } = chanDir(8);
      const yaw = Math.atan2(-s.z, s.x) + Math.PI / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      // Deck: 2.2 wide, 4.5 long — from the bank (s*2.6) out over the water (s*-1.4)
      const deckC = c.clone().addScaledVector(s, 0.6);
      const h = ctx.groundH(deckC);
      const deckPos = surfacePos(deckC, h + 0.55);
      const dm = mat4(deckPos, q);
      box(2.2, 0.18, 4.6, C.hull, dm, 0, 0, 0);
      // planks
      for (let p = 0; p < 9; p++) {
        box(2.2, 0.05, 0.32, C.bamboo, dm, 0, 0.11, -2.0 + p * 0.5);
      }
      // posts into the water
      for (const [px, pz] of [[-0.9, -1.9], [0.9, -1.9], [-0.9, 1.9], [0.9, 1.9]] as const) {
        const post = new THREE.CylinderGeometry(0.09, 0.11, 1.4, 6);
        const lm = new THREE.Matrix4().makeTranslation(px, -0.5, pz);
        addPart(post, C.hull, dm.clone().multiply(lm));
      }
      // railing on three sides (open at the bank end)
      for (const px of [-1.0, 1.0]) {
        box(0.08, 0.7, 4.6, C.hull, dm, px, 0.45, 0);
      }
      box(2.2, 0.08, 0.08, C.hull, dm, 0, 0.78, -2.26);
      // mooring bollard + coiled rope at the tip
      const bol = new THREE.CylinderGeometry(0.12, 0.14, 0.5, 6);
      addPart(bol, C.resin, dm.clone().multiply(new THREE.Matrix4().makeTranslation(0.7, 0.3, -2.0)));
    }

    // 2. BRIDGE: arched wooden footbridge across the canal — walk OVER water.
    {
      const { c, t, s } = chanDir(18);
      const yaw = Math.atan2(-t.z, t.x) + Math.PI / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      const h = ctx.groundH(c);
      const bp = surfacePos(c, h + 0.15);
      const bm = mat4(bp, q);
      // Arched deck: 7 segments rising to 0.9 at center
      for (let i = 0; i < 7; i++) {
        const k = i / 6; // 0..1 across
        const archY = Math.sin(k * Math.PI) * 0.85;
        const zPos = -4.2 + k * 8.4;
        box(2.0, 0.16, 1.35, C.hull, bm, 0, archY, zPos);
        // railings follow the arch
        for (const px of [-0.92, 0.92]) {
          box(0.07, 0.65, 1.35, C.bamboo, bm, px, archY + 0.4, zPos);
        }
      }
      // support piles
      for (const pz of [-2.8, 2.8]) {
        for (const px of [-0.8, 0.8]) {
          const pile = new THREE.CylinderGeometry(0.1, 0.12, 1.6, 6);
          const lm = new THREE.Matrix4().makeTranslation(px, -0.4, pz);
          addPart(pile, C.resin, bm.clone().multiply(lm));
        }
      }
    }

    // 3. WATER BOUNDARY: circle colliders along the canal so the player
    // enjoys water from the jetty/bridge/banks — never walks into deep water.
    // (Gaps at the jetty idx 8 and bridge idx 18 spans.)
    for (let i = 0; i < water.centers.length; i += 2) {
      if (i >= 6 && i <= 10) continue; // jetty span
      if (i >= 16 && i <= 20) continue; // bridge span
      const c = water.centers[i];
      addCollider(c.x, c.z, 1.55);
    }
    // Railing colliders at the jetty tip (don't walk off the end)
    {
      const { c, s } = chanDir(8);
      const tip = c.clone().addScaledVector(s, -1.6);
      addCollider(tip.x, tip.z, 0.9);
    }

    // 4. DRIFTING HOUSEBOAT: a second kettuvallam gliding slowly along the canal.
    const driftBoat = new THREE.Group();
    {
      const hullM = toon(C.hull);
      const cabinM = toon(C.cabin);
      const roofM = toon(0xe8d9a8);
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.9), hullM);
      hull.position.y = 0.28;
      driftBoat.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.72), cabinM);
      cabin.position.y = 0.78;
      driftBoat.add(cabin);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.95, 10, 1, false, 0, Math.PI), roofM);
      roof.rotation.z = Math.PI / 2;
      roof.position.y = 1.05;
      driftBoat.add(roof);
      // tiny wake foam
      const wake = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 1.1), toon(0xdff5f2));
      wake.position.set(-1.7, 0.16, 0);
      driftBoat.add(wake);
      scene.add(driftBoat);
    }
    let driftT = 0;

    // 5. "KERALA BACKWATERS" name sign by the jetty bank.
    {
      const { c, s } = chanDir(8);
      const signPos = c.clone().addScaledVector(s, 4.2);
      const h = ctx.groundH(signPos);
      const c2 = document.createElement('canvas');
      c2.width = 512;
      c2.height = 160;
      const g2 = c2.getContext('2d')!;
      g2.fillStyle = '#2e6b4f';
      g2.fillRect(0, 0, 512, 160);
      g2.strokeStyle = '#ffd98a';
      g2.lineWidth = 10;
      g2.strokeRect(10, 10, 492, 140);
      g2.fillStyle = '#fdf6e3';
      g2.font = 'bold 56px system-ui, sans-serif';
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      g2.fillText('KERALA BACKWATERS', 256, 84);
      const tex2 = new THREE.CanvasTexture(c2);
      tex2.colorSpace = THREE.SRGBColorSpace;
      const sg = new THREE.Group();
      const board2 = new THREE.Mesh(
        new THREE.BoxGeometry(5, 1.6, 0.22),
        new THREE.MeshToonMaterial({ map: tex2 }),
      );
      board2.position.y = 2.2;
      sg.add(board2);
      for (const px of [-2, 2]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.13, 2.2, 6),
          toon(0x5a3a1a),
        );
        post.position.set(px, 1.1, 0);
        sg.add(post);
      }
      sg.position.copy(surfacePos(signPos, h + 0.1));
      sg.rotation.y = Math.atan2(-s.x, -s.z);
      scene.add(sg);
    }

    // Coconut grove near the mooring + scattered palms, bananas, bushes.
    const grove = scatter(5, 1.6, 4.0);
    for (const d of grove) {
      const f = surfaceFrame(d, 0, ctx.rand() * Math.PI * 2, ctx);
      buildPalm(mat4(f.pos, f.quat), 2.0 + ctx.rand() * 0.8, 0.9 + ctx.rand() * 0.3, ctx);
    }
    for (const d of scatter(4, 2.0, 10.0)) {
      const f = surfaceFrame(d, 0, ctx.rand() * Math.PI * 2, ctx);
      buildPalm(mat4(f.pos, f.quat), 1.7 + ctx.rand() * 0.6, 0.75 + ctx.rand() * 0.25, ctx);
    }
    for (const d of scatter(5, 1.4, 9.0)) {
      const f = surfaceFrame(d, 0, ctx.rand() * Math.PI * 2, ctx);
      buildBanana(mat4(f.pos, f.quat), 0.9 + ctx.rand() * 0.4);
    }
    for (const d of scatter(10, 1.2, 10.0)) {
      const f = surfaceFrame(d, 0, ctx.rand() * Math.PI * 2, ctx);
      buildBush(
        mat4(f.pos, f.quat),
        0.8 + ctx.rand() * 0.6,
        ctx.rand() < 0.5 ? C.bushA : C.bushB,
      );
    }
    // Woven coir mats drying on the shore near the boat.
    for (const d of scatter(2, 1.4, 3.2)) {
      const f = surfaceFrame(d, 0.02, ctx.rand() * Math.PI * 2, ctx);
      buildCoirMats(mat4(f.pos, f.quat));
    }

    // Object 1: everything static merged into ONE mesh.
    const merged = mergeGeometries(parts, false);
    if (!merged) throw new Error('kerala: geometry merge failed');
    const staticMesh = new THREE.Mesh(merged, biomeMaterial());
    staticMesh.frustumCulled = false;

    // Object 3: water lilies — ONE InstancedMesh, bobbing gently.
    const lilyParts: THREE.BufferGeometry[] = [];
    const pad = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8);
    pad.deleteAttribute('uv');
    paint(pad, C.pad);
    lilyParts.push(pad);
    for (let k = 0; k < 6; k++) {
      const petal = new THREE.ConeGeometry(0.035, 0.1, 4);
      const a = (k / 6) * Math.PI * 2;
      petal.deleteAttribute('uv');
      paint(petal, C.petal);
      petal.applyMatrix4(
        new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.05, 0.06, Math.sin(a) * 0.05),
      );
      lilyParts.push(petal);
    }
    const heart = new THREE.SphereGeometry(0.03, 6, 5);
    heart.deleteAttribute('uv');
    paint(heart, C.bloom);
    heart.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.08, 0));
    lilyParts.push(heart);
    const lilyGeo = mergeGeometries(lilyParts, false);
    if (!lilyGeo) throw new Error('kerala: lily merge failed');

    const LILIES = 14;
    const lilyMesh = new THREE.InstancedMesh(
      lilyGeo,
      (() => { const m = toon(0xffffff); m.vertexColors = true; return m; })(),
      LILIES,
    );
    lilyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lilyMesh.frustumCulled = false;
    interface LilyBase {
      pos: THREE.Vector3;
      quat: THREE.Quaternion;
      dir: THREE.Vector3;
      phase: number;
    }
    const bases: LilyBase[] = [];
    for (let i = 0; i < LILIES; i++) {
      const idx = 2 + Math.floor((i / LILIES) * (water.centers.length - 4));
      const ci = water.centers[idx];
      // Offset across the canal along a true tangent-plane perpendicular.
      const cj = water.centers[Math.min(water.centers.length - 1, idx + 1)];
      const ck = water.centers[Math.max(0, idx - 1)];
      const ti = cj.clone().sub(ck).normalize();
      ti.y = 0;
      ti.normalize();
      const sideI = new THREE.Vector3(-ti.z, 0, ti.x);
      const k = (ctx.rand() - 0.5) * 0.1;
      const ldir = ci.clone().addScaledVector(sideI, k);
      const h = ctx.groundH(ldir);
      const pos = surfacePos(ldir, h + 0.2);
      const quat = new THREE.Quaternion(); // flat world: upright
      quat.multiply(
        new THREE.Quaternion().setFromAxisAngle(UP, ctx.rand() * Math.PI * 2),
      );
      bases.push({ pos, quat, dir: ldir.clone(), phase: ctx.rand() * Math.PI * 2 });
      ctx.dummy.position.copy(pos);
      ctx.dummy.quaternion.copy(quat);
      ctx.dummy.scale.setScalar(0.9 + ctx.rand() * 0.5);
      ctx.dummy.updateMatrix();
      lilyMesh.setMatrixAt(i, ctx.dummy.matrix);
    }
    lilyMesh.instanceMatrix.needsUpdate = true;

    scene.add(staticMesh);
    scene.add(waterMesh);
    scene.add(lilyMesh);

    return {
      update: (_dt: number, t: number) => {
        for (let i = 0; i < bases.length; i++) {
          const b = bases[i];
          ctx.dummy.position.copy(b.pos).addScaledVector(b.dir, Math.sin(t * 1.3 + b.phase) * 0.045);
          ctx.dummy.quaternion.copy(b.quat);
          ctx.dummy.scale.setScalar(1);
          ctx.dummy.updateMatrix();
          lilyMesh.setMatrixAt(i, ctx.dummy.matrix);
        }
        lilyMesh.instanceMatrix.needsUpdate = true;
        // Drifting houseboat: slow glide along the canal, bobbing gently.
        driftT += _dt * 0.05;
        const seg = driftT % 1;
        const fi = seg * (water.centers.length - 1);
        const i0 = Math.floor(fi);
        const i1 = Math.min(water.centers.length - 1, i0 + 1);
        const fk = fi - i0;
        const p0 = water.centers[i0];
        const p1 = water.centers[i1];
        driftBoat.position.set(
          p0.x + (p1.x - p0.x) * fk,
          ctx.groundH(p0) + 0.32 + Math.sin(t * 1.1) * 0.04,
          p0.z + (p1.z - p0.z) * fk,
        );
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        if (Math.hypot(dx, dz) > 1e-4) {
          driftBoat.rotation.y = Math.atan2(-dz, dx);
        }
      },
      npcs: [boatBuilder, fisherwoman],
    };
  },
};
