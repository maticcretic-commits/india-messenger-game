/**
 * THAR DESERT biome — "Postcards from Bharat"
 *
 * Researched signature details modeled (original stylized interpretation, not a replica):
 *  1. Golden-fort citadel: honey-yellow sandstone walls rising from a Trikuta-style rock
 *     knoll, ringed by an imposing crenellated curtain wall with round corner bastions
 *     (Jaisalmer's Sonar Quila has 99 bastions, double concentric battlements, and a
 *     golden hue that deepens at sunset) — reduced here to 4 bastions + crenellated
 *     keep in cozy low-poly form.
 *  2. Massive ceremonial entry gates: the real fort's pathways pass through four
 *     successive gates (Akhai Pol, Ganesh Pol, Suraj Pol, Hawa Pol); we model one
 *     arched gateway with flanking lanterns and brass door studs.
 *  3. Khejri thorn scrub (Prosopis cineraria, Rajasthan's state tree): stunted,
 *     dark-olive thorny crowns on short crooked trunks — the signature "Kalp Vriksha"
 *     of the Thar's tropical thorn forest.
 *  4. Wind-sculpted dunes with ripple bands: dune mounds painted with darker
 *     vertex-colored bands suggesting wind ripples.
 *  5. Desert-night props: camel saddle on a crate, and brass lanterns whose flames
 *     flicker amber — feeding the "Desert Star Map" quest for the nomadic astronomer.
 *
 * Palette: warm amber, dusty gold, terracotta rose, twilight violet accents.
 * Lighting feel: golden hour — handled by the scene's lights; geometry uses
 * warm vertex colors to catch them.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BiomeModule, BiomeCtx, BiomeNPCDef } from './types';
import { sampleInZone, paint, biomeMaterial , flatDist, radToWorld , surfacePos, surfaceQuat} from './geo';
import { PLANET_RADIUS } from '../planet';


// Palette
const HONEY = 0xdba65f; // honey sandstone walls
const HONEY_DARK = 0xb9834a; // sandstone shadow course
const HONEY_DEEP = 0x9a6633; // recesses, gate inner
const ROCK_KNOLL = 0xc79a5e; // Trikuta-style rock knoll
const DOOR = 0x5a3a22; // dark timber gate doors
const BRASS = 0xd8a94f; // brass lantern bodies
const DUNE = 0xe8cd90; // dusty gold dune
const DUNE_BAND = 0xd4ac68; // darker ripple band
const OLIVE = 0x5f6b38; // khejri crown (dark olive)
const OLIVE_DARK = 0x49522a; // thorn scrub shadow
const TRUNK = 0x6e4b2c; // scrub trunk
const TERRA = 0xc1632f; // terracotta rose (saddle trim)
const VIOLET = 0x7a5fa0; // twilight violet accent (saddle cloth)
const CREAM = 0xf2e3c2; // dome, trim
const PINK = 0xe08a7a; // Hawa Mahal pink sandstone (Jaipur's Pink City)
const PINK_DARK = 0xc26e60; // pink shadow / recesses
const PINK_LIGHT = 0xf0a898; // pink highlight trim

/**
 * Paint + strip uv + normalize to non-indexed, ready for mergeGeometries.
 */
function prep(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  paint(geo, hex);
  geo.deleteAttribute('uv');
  return geo.index ? geo.toNonIndexed() : geo;
}

/** Dune-specific paint: darker vertex-colored ripple bands along local X. */
function prepRippled(
  geo: THREE.BufferGeometry,
  base: number,
  band: number,
  freq: number,
  phase: number,
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cBase = new THREE.Color(base);
  const cBand = new THREE.Color(band);
  const tmp = new THREE.Color();
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = Math.sin(pos.getX(i) * freq + phase);
    // crisp-ish wind-ripple banding
    const k = Math.min(1, Math.max(0, (s - 0.25) / 0.5)) * 0.55;
    tmp.copy(cBase).lerp(cBand, k);
    arr[i * 3] = tmp.r;
    arr[i * 3 + 1] = tmp.g;
    arr[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo.index ? geo.toNonIndexed() : geo;
}

/** Fill the static geometry list in-place, then return a fresh transformed piece. */
function box(
  parts: THREE.BufferGeometry[],
  hex: number,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
): void {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yaw !== 0) g.rotateY(yaw);
  g.translate(x, y, z);
  parts.push(prep(g, hex));
}

/** Row of merlons (crenellation teeth) along a straight parapet segment. */
function merlonRow(
  parts: THREE.BufferGeometry[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  topY: number,
  count: number,
  hex: number,
): void {
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const dx = bx - ax;
    const dz = bz - az;
    const yaw = Math.atan2(dx, dz);
    box(parts, hex, 0.34, 0.44, 0.3, x, topY + 0.22, z, yaw);
  }
}

/** Ring of merlons around a bastion top. */
function merlonRing(
  parts: THREE.BufferGeometry[],
  cx: number,
  cz: number,
  r: number,
  topY: number,
  count: number,
  hex: number,
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    box(parts, hex, 0.3, 0.42, 0.3, x, topY + 0.21, z, -a);
  }
}

/**
 * Build the Hawa Mahal (Palace of Winds) in local coords.
 * ORIGINAL stylized interpretation — NOT a replica of the protected monument.
 * Signature: 5 stepped pink stories, each narrower than the last, rows of
 * small arched windows (jharokhas), crowned with a curved pavilion cap.
 * (origin at ground, +y up, faces +z)
 */
function buildHawaMahal(parts: THREE.BufferGeometry[]): void {
  const stories = 5;
  let y = 0;
  let w = 7; // base width
  const depth = 3.2;
  for (let s = 0; s < stories; s++) {
    const h = s === 0 ? 2.2 : 1.7; // ground floor taller
    // Main slab for this story
    box(parts, s % 2 === 0 ? PINK : PINK_LIGHT, w, h, depth, 0, y + h / 2, 0);
    // Cornice trim between stories
    box(parts, PINK_DARK, w + 0.4, 0.25, depth + 0.4, 0, y + h + 0.12, 0);
    // Rows of small arched windows (dark insets with pink frames)
    const winCount = Math.max(3, Math.floor(w / 1.1));
    for (let i = 0; i < winCount; i++) {
      const wx = -w / 2 + 0.7 + (i * (w - 1.4)) / Math.max(1, winCount - 1);
      // Window frame (slightly proud of the wall)
      box(parts, CREAM, 0.55, 0.9, 0.15, wx, y + h / 2 + 0.1, depth / 2 + 0.02);
      // Dark window inset
      box(parts, PINK_DARK, 0.35, 0.65, 0.18, wx, y + h / 2 + 0.05, depth / 2 + 0.02);
      // Tiny arch cap above each window
      const arch = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 8, 1, false, 0, Math.PI);
      arch.rotateZ(Math.PI / 2);
      arch.rotateY(Math.PI / 2);
      arch.translate(wx, y + h / 2 + 0.45, depth / 2 + 0.02);
      parts.push(prep(arch, CREAM));
    }
    y += h + 0.25;
    w *= 0.82; // each story narrower — the pyramidal silhouette
  }
  // Crown: curved pavilion cap with small domes
  const crownW = w + 1.2;
  box(parts, PINK, crownW, 0.8, depth * 0.7, 0, y + 0.4, 0);
  for (const cx of [-crownW / 2 + 0.5, 0, crownW / 2 - 0.5]) {
    const dome = new THREE.SphereGeometry(0.55, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
    dome.translate(cx, y + 0.8, 0);
    parts.push(prep(dome, PINK_LIGHT));
    const finial = new THREE.ConeGeometry(0.12, 0.5, 6);
    finial.translate(cx, y + 1.45, 0);
    parts.push(prep(finial, BRASS));
  }
  // Flanking stair towers
  for (const sx of [-4.2, 4.2]) {
    box(parts, PINK_DARK, 1.2, 3.5, 2.5, sx, 1.75, 0);
    const cap = new THREE.SphereGeometry(0.7, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    cap.translate(sx, 3.5, 0);
    parts.push(prep(cap, PINK));
  }
}

/** Build the golden fort in fort-local coords (origin at knoll base, +y up). */
function buildFort(parts: THREE.BufferGeometry[]): void {
  // --- Trikuta-style rock knoll (fort platform) ---
  const knoll = new THREE.SphereGeometry(3.4, 8, 6);
  knoll.scale(1, 0.42, 1);
  knoll.translate(0, 0.35, 0);
  parts.push(prep(knoll, ROCK_KNOLL));
  // knoll ledge ring
  const ledge = new THREE.CylinderGeometry(3.35, 3.55, 0.35, 10);
  ledge.translate(0, 1.55, 0);
  parts.push(prep(ledge, HONEY_DARK));

  const wallBaseY = 1.72; // top of knoll platform
  const wallH = 2.0;
  const wallTop = wallBaseY + wallH;
  const hx = 2.5; // half-width (x)
  const hz = 1.7; // half-depth (z)
  const thick = 0.5;

  // --- Curtain walls (south wall split for the arched gate) ---
  // North wall
  box(parts, HONEY, hx * 2 + thick, wallH, thick, 0, wallBaseY + wallH / 2, -hz);
  // East / West walls
  box(parts, HONEY, thick, wallH, hz * 2 + thick, hx, wallBaseY + wallH / 2, 0);
  box(parts, HONEY, thick, wallH, hz * 2 + thick, -hx, wallBaseY + wallH / 2, 0);
  // South wall: two segments leaving a 1.2-wide gate passage
  const gateHalf = 0.6;
  const segW = hx - gateHalf;
  box(parts, HONEY, segW, wallH, thick, -(gateHalf + segW / 2), wallBaseY + wallH / 2, hz);
  box(parts, HONEY, segW, wallH, thick, gateHalf + segW / 2, wallBaseY + wallH / 2, hz);
  // Gate lintel + half-torus arch over the passage
  box(parts, HONEY_DARK, gateHalf * 2 + 0.7, 0.5, thick, 0, wallTop - 0.25, hz);
  const arch = new THREE.TorusGeometry(0.6, 0.18, 6, 12, Math.PI);
  arch.translate(0, wallTop - 0.5, hz);
  parts.push(prep(arch, HONEY_DEEP));
  // Timber gate doors (recessed, slightly ajar)
  box(parts, DOOR, 0.5, 1.6, 0.12, -0.28, wallBaseY + 0.8, hz - 0.05, 0.35);
  box(parts, DOOR, 0.5, 1.6, 0.12, 0.3, wallBaseY + 0.8, hz + 0.08, -0.15);
  // Brass door studs
  for (let i = 0; i < 3; i++) {
    const stud = new THREE.SphereGeometry(0.07, 6, 5);
    stud.translate(-0.28, wallBaseY + 0.5 + i * 0.35, hz + 0.18);
    parts.push(prep(stud, BRASS));
  }
  // Gate flanking pillars
  box(parts, HONEY_DARK, 0.45, 2.7, 0.45, -1.0, wallBaseY + 1.35, hz);
  box(parts, HONEY_DARK, 0.45, 2.7, 0.45, 1.0, wallBaseY + 1.35, hz);

  // --- Crenellated parapets ---
  merlonRow(parts, -hx - thick / 2, -hz, hx + thick / 2, -hz, wallTop, 12, HONEY_DARK);
  merlonRow(parts, hx, -hz, hx, hz, wallTop, 9, HONEY_DARK);
  merlonRow(parts, -hx, -hz, -hx, hz, wallTop, 9, HONEY_DARK);
  merlonRow(parts, -hx, hz, -gateHalf - 0.6, hz, wallTop, 5, HONEY_DARK);
  merlonRow(parts, gateHalf + 0.6, hz, hx, hz, wallTop, 5, HONEY_DARK);

  // --- 4 round corner bastions (colossal, slightly taller than the walls) ---
  const bastH = 2.9;
  for (const [cx, cz] of [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ]) {
    const b = new THREE.CylinderGeometry(0.8, 0.95, bastH, 9);
    b.translate(cx, wallBaseY + bastH / 2, cz);
    parts.push(prep(b, HONEY));
    const collar = new THREE.CylinderGeometry(0.92, 0.8, 0.3, 9);
    collar.translate(cx, wallBaseY + bastH + 0.15, cz);
    parts.push(prep(collar, HONEY_DARK));
    merlonRing(parts, cx, cz, 0.86, wallBaseY + bastH + 0.3, 8, HONEY_DARK);
  }

  // --- Inner keep: two-tiered palace block with carved trim ---
  const keepY = wallBaseY;
  box(parts, HONEY, 2.0, 1.9, 1.5, 0, keepY + 0.95, -0.2);
  box(parts, HONEY_DARK, 2.15, 0.22, 1.65, 0, keepY + 1.95, -0.2); // trim course
  box(parts, HONEY, 1.3, 1.1, 1.0, 0.2, keepY + 2.6, -0.2);
  // tiny jharokha windows (dark insets)
  box(parts, HONEY_DEEP, 0.28, 0.42, 0.1, -0.5, keepY + 1.15, 0.58);
  box(parts, HONEY_DEEP, 0.28, 0.42, 0.1, 0.4, keepY + 1.15, 0.58);
  box(parts, HONEY_DEEP, 0.24, 0.36, 0.1, 0.2, keepY + 2.6, 0.31);

  // --- Chhatri dome pavilion atop the keep ---
  const chhY = keepY + 3.15;
  for (const [px, pz] of [
    [-0.3, -0.5],
    [0.7, -0.5],
    [-0.3, 0.1],
    [0.7, 0.1],
  ]) {
    box(parts, HONEY_DARK, 0.16, 0.8, 0.16, px, chhY + 0.4, pz);
  }
  box(parts, HONEY_DARK, 1.25, 0.16, 0.85, 0.2, chhY + 0.85, -0.2);
  const dome = new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.85, 1);
  dome.translate(0.2, chhY + 0.93, -0.2);
  parts.push(prep(dome, CREAM));
  const finial = new THREE.SphereGeometry(0.09, 6, 5);
  finial.translate(0.2, chhY + 1.5, -0.2);
  parts.push(prep(finial, BRASS));
}

/** Thorny khejri scrub: short trunk + dark-olive thorny crowns. */
function buildScrub(
  parts: THREE.BufferGeometry[],
  matrix: THREE.Matrix4,
  rand: () => number,
): void {
  const local: THREE.BufferGeometry[] = [];
  // crooked trunk
  const trunk = new THREE.CylinderGeometry(0.09, 0.13, 0.6, 6);
  trunk.rotateZ(0.12);
  trunk.translate(0, 0.3, 0);
  local.push(prep(trunk, TRUNK));
  // main thorny crown (dark olive icosahedron)
  const s = 0.55 + rand() * 0.35;
  const crown = new THREE.IcosahedronGeometry(s, 0);
  crown.translate(0.1, 0.85, 0);
  local.push(prep(crown, rand() < 0.5 ? OLIVE : OLIVE_DARK));
  // smaller satellite crown for the windswept look
  const sat = new THREE.IcosahedronGeometry(s * 0.55, 0);
  sat.translate(-0.35, 0.55, 0.15);
  local.push(prep(sat, OLIVE_DARK));
  for (const g of local) {
    g.applyMatrix4(matrix);
    parts.push(g);
  }
}

/** Brass lantern: post + cage + (flame position returned for the InstancedMesh). */
function buildLantern(
  parts: THREE.BufferGeometry[],
  flameAt: THREE.Vector3[],
  matrix: THREE.Matrix4,
  lampOffset: THREE.Vector3,
): void {
  const local: THREE.BufferGeometry[] = [];
  const post = new THREE.CylinderGeometry(0.06, 0.09, 1.5, 6);
  post.translate(0, 0.75, 0);
  local.push(prep(post, HONEY_DEEP));
  const cage = new THREE.CylinderGeometry(0.22, 0.26, 0.5, 6);
  cage.translate(0, 1.75, 0);
  local.push(prep(cage, BRASS));
  const cap = new THREE.ConeGeometry(0.32, 0.25, 6);
  cap.translate(0, 2.12, 0);
  local.push(prep(cap, BRASS));
  for (const g of local) {
    g.applyMatrix4(matrix);
    parts.push(g);
  }
  const flame = lampOffset.clone().applyMatrix4(matrix);
  flameAt.push(flame);
}

/** Decorative camel saddle on a low crate: striped cloth + terracotta frame. */
function buildSaddle(
  parts: THREE.BufferGeometry[],
  matrix: THREE.Matrix4,
): void {
  const local: THREE.BufferGeometry[] = [];
  // low crate
  boxInto(local, TRUNK, 1.2, 0.5, 0.8, 0, 0.25, 0);
  // saddle frame: seat + two angled flaps
  boxInto(local, DOOR, 0.7, 0.18, 0.6, 0, 0.6, 0);
  const flapL = new THREE.BoxGeometry(0.14, 0.5, 0.6);
  flapL.rotateZ(0.5);
  flapL.translate(-0.4, 0.5, 0);
  local.push(prep(flapL, TERRA));
  const flapR = new THREE.BoxGeometry(0.14, 0.5, 0.6);
  flapR.rotateZ(-0.5);
  flapR.translate(0.4, 0.5, 0);
  local.push(prep(flapR, TERRA));
  // striped saddle cloth (violet + cream bands)
  boxInto(local, VIOLET, 0.78, 0.08, 0.68, 0, 0.73, 0);
  boxInto(local, CREAM, 0.78, 0.09, 0.16, 0, 0.73, 0);
  for (const g of local) {
    g.applyMatrix4(matrix);
    parts.push(g);
  }
}

function boxInto(
  local: THREE.BufferGeometry[],
  hex: number,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): void {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  local.push(prep(g, hex));
}

/** World matrix: position at surface dir + local yaw, +Y aligned to dir. */
function worldMatrixInto(
  dir: THREE.Vector3,
  lift: number,
  yaw: number,
  groundH: (d: THREE.Vector3) => number,
  target: THREE.Object3D,
): THREE.Matrix4 {
  const h = groundH(dir);
  surfacePos(dir, h + lift, target.position);
  surfaceQuat(dir, yaw, target.quaternion);
  target.updateMatrix();
  return target.matrix;
}

export const tharBiome: BiomeModule = {
  id: 'thar',
  name: 'Thar Desert',
  nameHi: 'थार रेगिस्तान',
  zone: { latDeg: 4, lonDeg: 148, radiusRad: 0.5 },
  // Deep desert: dune sand drags at ×0.8 across the whole zone (feathered rim).
  speedZones: [{ latDeg: 4, lonDeg: 148, radiusRad: 0.5, mult: 0.8 }],
  signatureDetails: [
    'Golden-fort citadel: honey-sandstone crenellated walls, 4 round bastions with merlon rings, on a Trikuta-style rock knoll (inspired by Sonar Quila).',
    'Hawa Mahal (original stylized take): 5 stepped pink stories with rows of arched jharokha windows, crowned pavilion domes — Jaipur\'s Palace of Winds.',
    'Arched ceremonial gateway with timber doors, brass studs, flanking pillars and brass lanterns (inspired by the fort’s four successive pols).',
    'Khejri thorn scrub: stunted dark-olive thorny crowns on short crooked trunks (Rajasthan’s state tree, Kalp Vriksha of the Thar).',
    'Wind-sculpted dunes with darker vertex-colored ripple bands.',
    'Camel saddle on a crate + flickering brass lanterns feeding the Desert Star Map quest.',
  ],

  build(scene: THREE.Object3D, ctx: BiomeCtx) {
    const { rand } = ctx;
    const parts: THREE.BufferGeometry[] = [];
    const flameAt: THREE.Vector3[] = [];
    const tmpObj = new THREE.Object3D();

    const fortDir = ctx.latLonToDir(4, 148);

    // ---------- HERO FORT ----------
    {
      const fortLocal: THREE.BufferGeometry[] = [];
      buildFort(fortLocal);
      // lanterns crowning the two gate pillars (pillar top at wallBaseY + 2.7 = 4.42)
      const lampY = 1.72 + 2.7;
      const fortM = worldMatrixInto(fortDir, -0.3, 0.6, ctx.groundH, tmpObj);
      for (const lx of [-1.0, 1.0]) {
        const m = new THREE.Matrix4().makeTranslation(lx, lampY, 1.7);
        m.premultiply(fortM);
        buildLantern(parts, flameAt, m, new THREE.Vector3(0, 1.75, 0));
      }
      for (const g of fortLocal) {
        g.applyMatrix4(fortM);
        parts.push(g);
      }
    }

    // ---------- HAWA MAHAL (Pink Palace of Winds) ----------
    {
      const hawaDir = ctx.latLonToDir(3.4, 149.2);
      const hawaLocal: THREE.BufferGeometry[] = [];
      buildHawaMahal(hawaLocal);
      const hawaM = worldMatrixInto(hawaDir, 0.5, 0.4, ctx.groundH, tmpObj);
      for (const g of hawaLocal) {
        g.applyMatrix4(hawaM);
        parts.push(g);
      }
    }

    // ---------- DUNES (5 sculpted mounds, rippled bands) ----------
    const duneDirs: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      let dir = new THREE.Vector3();
      for (let tries = 0; tries < 10; tries++) {
        dir = sampleInZone(4, 148, 0.48, rand, dir);
        if (flatDist(dir, fortDir) > radToWorld(0.24)) break;
      }
      duneDirs.push(dir.clone());
      const r = 1.1 + rand() * 1.1;
      const dune = new THREE.SphereGeometry(r, 9, 6);
      dune.scale(1.4, 0.32, 1);
      const yaw = rand() * Math.PI * 2;
      dune.rotateY(yaw);
      const g = prepRippled(dune, DUNE, DUNE_BAND, 3.2 / r, rand() * 6.28);
      const m = worldMatrixInto(dir, -0.35 * r, 0, ctx.groundH, tmpObj);
      g.applyMatrix4(m);
      parts.push(g);
    }

    // ---------- KHEJRI SCRUB (14 thorny bushes) ----------
    for (let i = 0; i < 14; i++) {
      const dir = sampleInZone(4, 148, 0.5, rand);
      if (flatDist(dir, fortDir) < radToWorld(0.2)) continue;
      const m = worldMatrixInto(dir, -0.06, rand() * Math.PI * 2, ctx.groundH, tmpObj);
      buildScrub(parts, m, rand);
    }

    // ---------- BRASS LANTERNS scattered (4 standalone) ----------
    for (let i = 0; i < 4; i++) {
      const dir = sampleInZone(4, 148, 0.5, rand);
      if (flatDist(dir, fortDir) < radToWorld(0.2)) continue;
      const m = worldMatrixInto(dir, -0.04, rand() * Math.PI * 2, ctx.groundH, tmpObj);
      buildLantern(parts, flameAt, m, new THREE.Vector3(0, 1.75, 0));
    }

    // ---------- CAMEL SADDLE near the herder ----------
    {
      const dir = ctx.latLonToDir(3.2, 146.0);
      const m = worldMatrixInto(dir, -0.04, 2.1, ctx.groundH, tmpObj);
      buildSaddle(parts, m);
    }

    // ---------- TALL DUNE under the astronomer (high dune for star-gazing) ----------
    {
      const dir = ctx.latLonToDir(5.2, 150.5);
      const dune = new THREE.SphereGeometry(1.6, 9, 6);
      dune.scale(1.3, 0.5, 1.3);
      const g = prepRippled(dune, DUNE, DUNE_BAND, 2.2, 1.1);
      const m = worldMatrixInto(dir, -0.5, 0, ctx.groundH, tmpObj);
      g.applyMatrix4(m);
      parts.push(g);
    }

    // ---------- MERGE everything static into ONE mesh ----------
    const merged = mergeGeometries(parts, false);
    if (!merged) {
      throw new Error('thar: mergeGeometries returned null');
    }
    const mesh = new THREE.Mesh(merged, biomeMaterial());
    scene.add(mesh);

    // ---------- Lantern flames: ONE InstancedMesh with flickering colors ----------
    const flameGeo = new THREE.IcosahedronGeometry(0.15, 1);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const flames = new THREE.InstancedMesh(flameGeo, flameMat, Math.max(1, flameAt.length));
    const flameA = new THREE.Color(0xff7b1c); // deep amber
    const flameB = new THREE.Color(0xffd94d); // bright gold
    const flameCol = new THREE.Color();
    for (let i = 0; i < flameAt.length; i++) {
      tmpObj.position.copy(flameAt[i]);
      tmpObj.quaternion.identity();
      tmpObj.scale.setScalar(1);
      tmpObj.updateMatrix();
      flames.setMatrixAt(i, tmpObj.matrix);
      flames.setColorAt(i, flameB);
    }
    flames.instanceMatrix.needsUpdate = true;
    if (flames.instanceColor) flames.instanceColor.needsUpdate = true;
    scene.add(flames);

    const update = (dt: number, t: number): void => {
      void dt;
      for (let i = 0; i < flameAt.length; i++) {
        const f =
          0.5 + 0.3 * Math.sin(t * 9 + i * 2.1) + 0.2 * Math.sin(t * 3.7 + i * 1.3);
        flameCol.copy(flameA).lerp(flameB, f);
        flames.setColorAt(i, flameCol);
      }
      if (flames.instanceColor) flames.instanceColor.needsUpdate = true;
    };

    const npcs: BiomeNPCDef[] = [
      {
        id: 'thar-astronomer',
        name: 'Tara Maru',
        nameHi: 'तारा मारू',
        role: 'Nomadic Astronomer',
        latDeg: 5.2,
        lonDeg: 150.5,
        skin: 0x8a5a33,
        tunic: 0x4a3a6e, // twilight violet robe
        accessory: 'shawl',
        accessoryColor: 0xc1632f, // terracotta rose shawl
        line: 'The desert sky remembers every journey. Give me your star map, and I will read where your road bends next.',
        lineHi: 'रेगिस्तान का आसमान हर सफ़र याद रखता है। अपना तारा-नक्शा दो, मैं बता दूँगी तुम्हारी राह कब मुड़ेगी।',
      },
      {
        id: 'thar-herder',
        name: 'Dhara Raika',
        nameHi: 'धारा राइका',
        role: 'Camel Herder',
        latDeg: 3.0,
        lonDeg: 145.8,
        skin: 0x7a4e2c,
        tunic: 0xc1632f, // terracotta kurta
        accessory: 'turban',
        accessoryColor: 0xdba65f, // honey-gold turban
        line: 'Camels trust a steady hand and a patient heart. Walk with us awhile, and the dunes will tell you their names.',
        lineHi: 'ऊँट स्थिर हाथ और धैर्यवान दिल पर भरोसा करते हैं। थोड़ी देर हमारे साथ चलो, रेत के टीले तुम्हें अपने नाम बता देंगे।',
      },
    ];

    return { update, npcs };
  },
};
