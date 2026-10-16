import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './planet';
import { paint, surfacePos, surfaceQuat } from './biomes/geo';
import { toon } from './sketch';

const _upY = new THREE.Vector3(0, 1, 0);

export type NpcAccessory =
  | 'turban'
  | 'shawl'
  | 'cap'
  | 'topi'
  | 'beard'
  | 'hijab'
  | 'none';

export interface PlacedNPCDef {
  id: string;
  name: string;
  nameHi: string;
  role: string;
  /** FLAT WORLD: spawn position (y=0); placed at (dir.x, terrainH, dir.z). */
  dir: THREE.Vector3;
  skin: number;
  tunic: number;
  accessory: NpcAccessory;
  accessoryColor: number;
  line: string;
  lineHi: string;
}

/**
 * Stylized villagers: articulated low-poly people (Group hierarchy, no skinning).
 * Each NPC has legs, torso, arms, head, and accessory — recognizable as a person,
 * not a capsule. Original designs; no real-world branding.
 */

// Single shared material for every NPC mesh (vertex colors carry the design).
const npcMaterial = toon(0xffffff);
npcMaterial.vertexColors = true;

export interface Placed {
  def: PlacedNPCDef;
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  dir: THREE.Vector3;
  phase: number;
  /** Ceremony performance offset (lean, bounce, run) — added by updateNPCs. */
  fx: THREE.Vector3;
}

const placed: Placed[] = [];

// "!" markers: ONE InstancedMesh of planes sharing a single canvas texture.
// Two crossed planes per NPC so the badge stays readable from any camera
// angle (a single plane goes edge-on and vanishes).
let markerMesh: THREE.InstancedMesh | null = null;
const markerData: { pos: THREE.Vector3; quat: THREE.Quaternion; dir: THREE.Vector3 }[] = [];
let markerTexture: THREE.CanvasTexture | null = null;

// module scratch (no per-frame allocation in updateNPCs)
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s1 = new THREE.Vector3(1, 1, 1);
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const _ref = new THREE.Vector3();

function getMarkerTexture(): THREE.CanvasTexture {
  if (!markerTexture) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    // Warm gold circle (like the reference game's friendly markers)
    g.beginPath();
    g.arc(64, 64, 50, 0, Math.PI * 2);
    g.fillStyle = '#e8a33d';
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = '#fff7e8';
    g.stroke();
    // Downward arrow (▼) — "this person needs you", matches the reference
    g.fillStyle = '#fff7e8';
    g.beginPath();
    g.moveTo(64, 92);   // arrow tip (bottom)
    g.lineTo(34, 52);   // top-left
    g.lineTo(52, 52);   // inner-left
    g.lineTo(52, 36);   // shaft top-left
    g.lineTo(76, 36);   // shaft top-right
    g.lineTo(76, 52);   // inner-right
    g.lineTo(94, 52);   // top-right
    g.closePath();
    g.fill();
    markerTexture = new THREE.CanvasTexture(c);
    markerTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return markerTexture;
}

/** Painted accessory geometry in NPC-local space (+Y up, +Z facing). */
function buildAccessoryGeometry(def: PlacedNPCDef): THREE.BufferGeometry | null {
  const c = def.accessoryColor;
  switch (def.accessory) {
    case 'turban': {
      // flattened sphere wrap on the head
      const g = new THREE.SphereGeometry(0.3, 16, 12);
      g.scale(1.12, 0.55, 1.12);
      g.translate(0, 1.52, 0);
      return paint(g, c);
    }
    case 'shawl': {
      // open cone draped over the shoulders
      const g = new THREE.ConeGeometry(0.46, 0.6, 14, 1, true);
      g.translate(0, 1.08, 0);
      return paint(g, c);
    }
    case 'cap': {
      // short flat cylinder on the crown
      const g = new THREE.CylinderGeometry(0.19, 0.21, 0.12, 14);
      g.translate(0, 1.585, 0);
      return paint(g, c);
    }
    case 'topi': {
      // small rounded cylinder: band + domed top
      const band = new THREE.CylinderGeometry(0.15, 0.165, 0.14, 14);
      band.translate(0, 1.59, 0);
      const dome = new THREE.SphereGeometry(
        0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2,
      );
      dome.translate(0, 1.66, 0);
      const merged = mergeGeometries([band, dome], false);
      band.dispose();
      dome.dispose();
      return merged ? paint(merged, c) : null;
    }
    case 'beard': {
      // small dark box under the chin
      const g = new THREE.BoxGeometry(0.17, 0.22, 0.12);
      g.translate(0, 1.2, 0.2);
      const dark = new THREE.Color(c).multiplyScalar(0.25).getHex();
      return paint(g, dark);
    }
    case 'hijab': {
      // slightly larger sphere shell around the head, face opening toward +Z
      const phiStart = Math.PI / 2 + 0.55;
      const phiLength = Math.PI * 2 - 1.1;
      const g = new THREE.SphereGeometry(
        0.305, 18, 14, phiStart, phiLength, 0, Math.PI * 0.8,
      );
      g.translate(0, 1.36, 0);
      return paint(g, c);
    }
    case 'none':
    default:
      return null;
  }
}

function clearNPCs(scene: THREE.Scene): void {
  for (const p of placed) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
  }
  placed.length = 0;
  if (markerMesh) {
    scene.remove(markerMesh);
    markerMesh.geometry.dispose();
    (markerMesh.material as THREE.Material).dispose();
    markerMesh = null;
  }
  markerData.length = 0;
}

/**
 * Build (or rebuild) all NPCs from placement defs. Safe to call again —
 * previous meshes are removed first.
 *
 * NOTE: `defs` has a default only so the pre-coordinator main.ts
 * (`buildNPCs(scene)`) keeps compiling; the coordinator passes real defs.
 */
/**
 * Build a stylized low-poly person as an articulated Group.
 * Not a capsule — has distinct legs, torso, arms, head, and accessory.
 */
function buildPerson(def: PlacedNPCDef): THREE.Group {
  const g = new THREE.Group();
  const skin = def.skin;
  const cloth = def.tunic;
  const acc = def.accessoryColor;

  // Helper to make a painted box
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(w, h, d);
    paint(geo, color);
    const m = new THREE.Mesh(geo, npcMaterial);
    m.position.set(x, y, z);
    return m;
  };

  // Legs (two boxes)
  const legH = 0.5;
  g.add(box(0.16, legH, 0.16, 0x3a3a3a, -0.11, legH / 2, 0)); // left leg
  g.add(box(0.16, legH, 0.16, 0x3a3a3a, 0.11, legH / 2, 0));  // right leg

  // Torso (tunic — slightly tapered box)
  const torsoH = 0.65;
  const torso = box(0.42, torsoH, 0.28, cloth, 0, legH + torsoH / 2, 0);
  g.add(torso);

  // Arms (two boxes, slightly angled)
  const armH = 0.55;
  const armL = box(0.11, armH, 0.11, cloth, -0.28, legH + torsoH - armH / 2 + 0.05, 0);
  const armR = box(0.11, armH, 0.11, cloth, 0.28, legH + torsoH - armH / 2 + 0.05, 0);
  // Hands (skin color spheres at arm ends)
  const handGeo = new THREE.SphereGeometry(0.07, 8, 6);
  paint(handGeo, skin);
  const handL = new THREE.Mesh(handGeo, npcMaterial);
  handL.position.set(-0.28, legH + torsoH - armH + 0.05, 0);
  const handR = new THREE.Mesh(handGeo.clone(), npcMaterial);
  handR.position.set(0.28, legH + torsoH - armH + 0.05, 0);
  g.add(armL, armR, handL, handR);

  // Head (sphere, skin)
  const headY = legH + torsoH + 0.18;
  const headGeo = new THREE.SphereGeometry(0.19, 12, 10);
  paint(headGeo, skin);
  const head = new THREE.Mesh(headGeo, npcMaterial);
  head.position.set(0, headY, 0);
  g.add(head);

  // Accessory on head
  const accMesh = buildAccessoryMesh(def, headY);
  if (accMesh) g.add(accMesh);

  return g;
}

/**
 * Build accessory as a Mesh (not merged geometry) for the articulated person.
 */
function buildAccessoryMesh(def: PlacedNPCDef, headY: number): THREE.Mesh | null {
  const c = def.accessoryColor;
  let geo: THREE.BufferGeometry | null = null;
  let y = headY;

  switch (def.accessory) {
    case 'turban': {
      geo = new THREE.SphereGeometry(0.21, 12, 8);
      (geo as THREE.SphereGeometry).scale(1, 0.6, 1);
      y = headY + 0.12;
      break;
    }
    case 'cap': {
      geo = new THREE.CylinderGeometry(0.16, 0.17, 0.1, 12);
      y = headY + 0.18;
      break;
    }
    case 'topi': {
      const band = new THREE.CylinderGeometry(0.15, 0.16, 0.12, 12);
      band.translate(0, 0.06, 0);
      const dome = new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(0, 0.12, 0);
      const merged = mergeGeometries([band, dome], false);
      band.dispose(); dome.dispose();
      if (!merged) return null;
      geo = merged;
      y = headY + 0.14;
      break;
    }
    case 'shawl': {
      geo = new THREE.ConeGeometry(0.32, 0.5, 10, 1, true);
      y = headY - 0.1;
      break;
    }
    case 'hijab': {
      geo = new THREE.SphereGeometry(0.23, 12, 10);
      (geo as THREE.SphereGeometry).scale(1, 1.1, 1);
      y = headY + 0.05;
      break;
    }
    case 'beard': {
      geo = new THREE.BoxGeometry(0.16, 0.2, 0.1);
      // Position under chin (forward)
      const m = new THREE.Mesh(paint(geo, new THREE.Color(c).multiplyScalar(0.3).getHex()), npcMaterial);
      m.position.set(0, headY - 0.15, 0.14);
      return m;
    }
    case 'none':
    default:
      return null;
  }

  if (!geo) return null;
  const mesh = new THREE.Mesh(paint(geo, c), npcMaterial);
  mesh.position.set(0, y, 0);
  return mesh;
}

export function buildNPCs(scene: THREE.Scene, defs: PlacedNPCDef[] = []): void {
  clearNPCs(scene);

  defs.forEach((def, i) => {
    const dir = def.dir.clone(); // flat-world position (y=0)
    dir.y = 0;

    // Build articulated person (not a capsule)
    const person = buildPerson(def);

    // Tiny planet: normal-aligned, with a deterministic yaw for variety
    surfaceQuat(dir, ((i * 2.399) % (Math.PI * 2)), person.quaternion);

    const basePos = surfacePos(dir, terrainHeight(dir) + 0.05, new THREE.Vector3());
    person.position.copy(basePos);
    scene.add(person);
    // Store the group as the "mesh" for compatibility
    placed.push({ def, mesh: person as unknown as THREE.Mesh, basePos, dir, phase: i * 1.7, fx: new THREE.Vector3() });
  });

  if (defs.length > 0) {
    const plane = new THREE.PlaneGeometry(1.05, 1.05);
    const mat = new THREE.MeshBasicMaterial({
      map: getMarkerTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    markerMesh = new THREE.InstancedMesh(plane, mat, defs.length * 2);
    markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Flat world: markers lie flat on the ground (plane XY -> XZ).
    const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const qFlat2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
    const upY = new THREE.Vector3(0, 1, 0);
    for (const p of placed) {
      const pos = p.basePos.clone().addScaledVector(upY, 2.15);
      markerData.push(
        { pos, quat: qFlat.clone(), dir: upY.clone() },
        { pos: pos.clone(), quat: qFlat2.clone(), dir: upY.clone() },
      );
    }
    scene.add(markerMesh);
    updateNPCs(0); // set initial marker matrices
  }
}

export function updateNPCs(t: number, reducedMotion = false): void {
  if (reducedMotion) return; // calm static-ish scene: no idle bob or marker bounce
  for (const p of placed) {
    // gentle idle bob along +Y + ceremony performance offset
    p.mesh.position
      .copy(p.basePos)
      .addScaledVector(_upY, Math.sin(t * 2 + p.phase) * 0.035)
      .add(p.fx);
  }
  if (markerMesh) {
    for (let i = 0; i < markerData.length; i++) {
      const md = markerData[i];
      _p
        .copy(md.pos)
        .addScaledVector(md.dir, Math.sin(t * 2.6 + (i >> 1) * 2.1) * 0.1);
      _m.compose(_p, md.quat, _s1);
      markerMesh.setMatrixAt(i, _m);
    }
    markerMesh.instanceMatrix.needsUpdate = true;
  }
}

/** The placed entry behind a scene object (for ceremony animation). */
export function getNPCEntry(obj: THREE.Object3D): Placed | null {
  for (const p of placed) {
    if (p.mesh === obj) return p;
  }
  return null;
}

/** Closest placed NPC's scene object within maxDist of pos, or null. */
export function nearestNPCObject(
  pos: THREE.Vector3,
  maxDist: number,
): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let bestD2 = maxDist * maxDist;
  for (const p of placed) {
    const d2 = p.mesh.position.distanceToSquared(pos);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p.mesh;
    }
  }
  return best;
}
export function nearestNPC(
  pos: THREE.Vector3,
  maxDist: number,
): PlacedNPCDef | null {
  let best: PlacedNPCDef | null = null;
  let bestD2 = maxDist * maxDist;
  for (const p of placed) {
    const d2 = p.mesh.position.distanceToSquared(pos);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p.def;
    }
  }
  return best;
}
