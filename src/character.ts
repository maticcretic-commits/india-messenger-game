import * as THREE from 'three';
import { paint } from './biomes/geo';
import { toon } from './sketch';

/**
 * MEERA v2 — the little postwoman, rebuilt 2026-10-15 from fused 6-partner
 * research (DeepSeek build specs, Grok robot-autopsy, ChatGPT kid-psych,
 * Perplexity movie research, Gemini rigging, Copilot scorecard).
 * Hand-rigged low-poly character (~22 bones, ~2k tris, 1 draw call) built
 * procedurally in code — no binary assets, no Mixamo redistribution.
 * Anti-robot rules: ONE spline-smoothed lathe torso, 25-40% overlap at every
 * joint, 13% limb taper, deliberate asymmetry (bun/brow/fringe/shoulder),
 * S-curve rest posture, blush, color continuity at joints. 4.5 heads tall.
 * (Blender remains the future art pipeline for the final rig.)
 *
 * Animation spec (DeepSeek + Perplexity, filtered by Grok 2026-10-14):
 *  Grok's rule: "If it doesn't change the silhouette or create a clear rhythm
 *  the eye can track from orbit, it is wasted." Her face is 4-8 pixels at our
 *  camera distance — so: NO facial/eye-look/breathing/subtle-tilt detail.
 *  KEEP: excellent walk (speed-scaled, one cycle), ONE looping idle (root bob
 *  + bag sway), 1.0s deliver pose, start/stop blend + quick root turn,
 *  satchel sway (2-bone springy chain), braid big-arc swing ONLY, one
 *  two-handed wave, namaste, thanks (bounce+tuck), shield-eyes ritual, jump.
 *  KILLED: head look-at, breathing, turn/footstep leans, finger stretch,
 *  satchel-adjust, check-letters/stretch clips, small wave, foot planting.
 *  ChatGPT's 5-beat delivery ceremony SURVIVES as staging/timing/poses
 *  (ceremony.ts) — staged with poses + camera, never close-ups.
 *
 * Reference game feel: A Short Hike (bouncy idle, anticipation), Untitled Goose
 * Game (long anticipation, sharp readable poses), A Hat in Time (base clip +
 * procedural layers), Wobbly Life (springy over-rotation on the bag).
 *
 * Local space: origin at the feet, +Y up, faces -Z.
 */

// Palette: original Daak uniform — teal kurta, maroon satchel.
// (Redesigned 2026-10-14: warmer, cuter — bigger head, real face, cap,
// salwar-kameez silhouette instead of boxy tunic.)
const TEAL = 0x2e8f86;
const TEAL_DARK = 0x256f68;
// Meera v2 palette (fused 6-partner research, 2026-10-15)
const SKIN = 0xe8b48c; // warm fair Indian skin (Nitesh's choice)
const SKIN_SHADOW = 0xc98b63;
const HAIR = 0x3b2417; // warm dark brown
const IRIS = 0x4a2c1a; // deep warm brown
const EYE_WHITE = 0xf7eee4; // warm off-white, never pure white
const SANDAL = 0x6b4a2f;
const MAROON = 0x8a3030;
const MAROON_DARK = 0x662222;
const CREAM = 0xf3e8d2;
const BLUSH = 0xe88c7d; // the #1 humanity cheat code
const EYE_DARK = 0x241a12;
const BRASS = 0xd9a441; // post badge
const BINDI_RED = 0xc1272d;
const LIP = 0xc15f52;
const NOSE_C = 0xd89f76;
const POSTAL_RED = 0xb33a2e; // satchel stripe
// Festive + modern outfit colors
const MUSTARD = 0xd4a017;
const MUSTARD_DARK = 0xb08613;
const DENIM = 0x4a6a8a;
const DENIM_DARK = 0x3a5570;
const SNEAKER = 0xf0f0f0;
const TAN = 0xc9a86a;
const MARIGOLD = 0xe8912a;

/** The three selectable outfits (Nitesh approved all three 2026-10-14). */
export type OutfitId = 'postal' | 'festive' | 'modern';
export interface OutfitDef {
  name: string;
  nameHi: string;
  kurta: number;
  kurtaDark: number;
  pants: number;
  shoes: number;
  cap: number;
  capDark: number;
  capStyle: 'peaked' | 'topi' | 'baseball';
  vest: number | null;      // Nehru vest (festive) or open jacket (modern)
  dupatta: number | null;   // scarf (postal only)
  satchel: number;
  satchelDark: number;
  braidBead: number;
}
export const OUTFITS: Record<OutfitId, OutfitDef> = {
  postal: {
    name: 'Official Postal', nameHi: 'डाक वर्दी',
    kurta: 0x2a9db8, kurtaDark: 0x1e7a8c, // teal shirt (reference look)
    pants: 0x2b2b33, shoes: 0x7a2e22, // black shorts, maroon jutti
    cap: MAROON, capDark: MAROON_DARK, capStyle: 'peaked',
    vest: null, dupatta: null, // no cap/dupatta with twin buns
    satchel: 0xe8912a, satchelDark: 0xc9761a, // orange satchel (reference)
    braidBead: BINDI_RED,
  },
  festive: {
    name: 'Festive', nameHi: 'त्योहारी',
    kurta: MUSTARD, kurtaDark: MUSTARD_DARK, pants: CREAM, shoes: SANDAL,
    cap: MAROON, capDark: MAROON_DARK, capStyle: 'topi',
    vest: MAROON, dupatta: null, satchel: MAROON, satchelDark: MAROON_DARK,
    braidBead: MARIGOLD,
  },
  modern: {
    name: 'Modern Utility', nameHi: 'आधुनिक',
    kurta: CREAM, kurtaDark: 0xd8cbb0, pants: DENIM, shoes: SNEAKER,
    cap: TEAL, capDark: TEAL_DARK, capStyle: 'baseball',
    vest: TEAL, dupatta: null, satchel: TAN, satchelDark: 0xa8845a,
    braidBead: 0xc0392b,
  },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m4 = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();

function makeHeartTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#ff9ebb';
  g.beginPath();
  g.moveTo(32, 54);
  g.bezierCurveTo(2, 32, 8, 6, 32, 20);
  g.bezierCurveTo(56, 6, 62, 32, 32, 54);
  g.fill();
  g.fillStyle = '#fffdf6';
  g.beginPath();
  g.arc(22, 24, 5, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface PartDef {
  geo: THREE.BufferGeometry;
  bone: string;
  color: number;
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export interface CharacterUpdateOpts {
  /** currentSpeed / 1.8 — drives walk timeScale */
  speedRatio: number;
  moving: boolean;
  /** smoothed forward acceleration (braid brake-swing) */
  accel: number;
  /** smoothed signed turn rate rad/s (satchel turn-lag) */
  turnRate: number;
  /** Act-driven walk bounce multiplier (cheap emotional parameter) */
  walkBounceAmp: number;
  /** Head-local yaw for the head to glance toward (rad); undefined = idle wander */
  lookYaw?: number;
  camera?: THREE.Camera | null;
  reducedMotion: boolean;
}

export interface Postwoman {
  group: THREE.Group;
  bones: Map<string, THREE.Bone>;
  envelope: THREE.Group;
  update(dt: number, o: CharacterUpdateOpts): void;
  playWave(): void;
  playNamaste(): void;
  playThanks(): void;
  playShieldEyes(): void;
  playJump(): void;
  startSatchelHug(): void;
  addBagImpulse(x: number): void;
  /** Squash & stretch on landing (alive rule #2) — call on touchdown. */
  addLandSquash(): void;
  showEnvelope(v: boolean): void;
  startDelivery(
    target: THREE.Object3D | null,
    onHandoff?: () => void,
  ): void;
  isDelivering(): boolean;
  beginHandoff(npcHand: THREE.Object3D, onDone?: () => void): void;
}

export function createPostwoman(outfitId: OutfitId = 'postal'): Postwoman {
  const OF = OUTFITS[outfitId];
  // ------------------------------- bones -------------------------------
  const bones: THREE.Bone[] = [];
  const boneMap = new Map<string, THREE.Bone>();
  function bone(
    name: string,
    parent: THREE.Bone | null,
    x: number,
    y: number,
    z: number,
  ): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) parent.add(b);
    bones.push(b);
    boneMap.set(name, b);
    return b;
  }

  const hips = bone('hips', null, 0, 0.98, 0);
  const spine = bone('spine', hips, 0, 0.14, 0);
  const chest = bone('chest', spine, 0, 0.18, 0);
  const neck = bone('neck', chest, 0, 0.16, 0);
  const head = bone('head', neck, 0, 0.1, 0);
  // CHIBI: bobblehead proportions like the reference (Messenger/Abeto).
  // Head ~35% of total height. Children (eyes/hair/buns) scale uniformly;
  // bone-rotation animations are unaffected.
  head.scale.setScalar(1.55);
  bone('hairBone', head, 0, 0.08, 0.1);
  // expressive braid: 2-bone chain — trails on sprint, swings on brake,
  // flutters in mountain wind (ChatGPT micro-animation #2)
  const braid1 = bone('braid1', boneMap.get('hairBone')!, 0, -0.05, 0.05);
  bone('braid2', braid1, 0, -0.15, 0.02);
  // bag chain: 2 bag bones for delayed springy sway
  const bag1 = bone('bagBone1', hips, -0.26, -0.02, 0);
  bone('bagBone2', bag1, 0, -0.16, 0);
  // dupatta tail: 2-bone chain — the flowing signature (alive rule #3).
  // Trails on the move, flutters at idle. Geometry only on the postal outfit.
  const dup1 = bone('dupatta1', chest, -0.16, -0.14, -0.06);
  bone('dupatta2', dup1, -0.07, -0.13, 0.03);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const sh = bone(`shoulder${side}`, chest, 0.2 * s, 0.1, 0);
    const ua = bone(`upperArm${side}`, sh, 0, -0.04, 0);
    const la = bone(`lowerArm${side}`, ua, 0, -0.26, 0);
    bone(`hand${side}`, la, 0, -0.24, 0); // single hand bone, no fingers
    const ul = bone(`upperLeg${side}`, hips, 0.11 * s, -0.04, 0);
    const ll = bone(`lowerLeg${side}`, ul, 0, -0.44, 0);
    bone(`foot${side}`, ll, 0, -0.4, -0.02);
  }

  // ------------------------------ geometry ------------------------------
  const P = (
    geo: THREE.BufferGeometry,
    b: string,
    color: number,
    x: number,
    y: number,
    z: number,
    o: Partial<PartDef> = {},
  ): PartDef => ({ geo, bone: b, color, x, y, z, ...o });

  // All part offsets are RELATIVE to their bone's bind position
  // (the baker adds the bone's bind offset). Bone bind positions:
  // hips (0,.98,0), chest (0,1.30,0), head (0,1.56,0), hairBone (0,1.64,.10),
  // braid1 (0,1.59,.15), braid2 (0,1.44,.17), bagBone2 (-.26,.80,0),
  // upperArm (±.20,1.36,0), lowerArm (±.20,1.10,0), hand (±.20,.86,0),
  // upperLeg (±.11,.94,0), lowerLeg (±.11,.50,0), foot (±.11,.10,-.02).
  // Spline-smoothed lathe helper (DeepSeek seam-killer #2):
  // Catmull-Rom through the profile -> one continuous organic curve.
  const smoothLathe = (pts: Array<[number, number]>, segments: number): THREE.LatheGeometry => {
    const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    return new THREE.LatheGeometry(curve.getPoints(12), segments);
  };

  const parts: PartDef[] = [
    // ============ MEERA v2 — fused 6-partner rebuild ============
    // Anti-robot rules: ONE lathe torso, 25-40% overlap at every joint,
    // tapered limbs (13%), deliberate asymmetry, S-curve rest posture,
    // blush, color continuity at joints. 4.5 heads tall, head ~= shoulders.

    // ---- TORSO: one smooth lathe, hip -> neck (no stacked pieces) ----
    P(
      smoothLathe(
        [
          [0.001, -0.30],
          [0.20, -0.295],
          [0.26, -0.26], // flared kurta hem
          [0.245, -0.14], // hip
          [0.205, 0.0], // waist (soft belly)
          [0.185, 0.14], // lower chest
          [0.175, 0.26], // chest
          [0.15, 0.36], // shoulder shelf
          [0.105, 0.43], // neck base
          [0.001, 0.45],
        ],
        8,
      ),
      'hips',
      OF.kurta,
      0, 0, 0,
    ),
    // Hip blend spheres (kurta) — thighs emerge from cloth, never a gap
    P(new THREE.SphereGeometry(0.10, 5, 4), 'hips', OF.kurta, -0.11, -0.12, 0),
    P(new THREE.SphereGeometry(0.10, 5, 4), 'hips', OF.kurta, 0.11, -0.12, 0),

    // ---- NECK: short, 60% hidden ----
    P(new THREE.CapsuleGeometry(0.065, 0.06, 4, 4), 'neck', SKIN, 0, 0.02, 0),

    // ---- CHEST attachments ----
    // Shoulder blends (sleeve color = kurta: color continuity, DeepSeek #3).
    // Right one 5mm lower — deliberate asymmetry (Grok sin #4).
    P(new THREE.SphereGeometry(0.095, 5, 4), 'chest', OF.kurta, -0.17, 0.06, 0),
    P(new THREE.SphereGeometry(0.095, 5, 4), 'chest', OF.kurta, 0.17, 0.055, 0),
    // Brass post badge (left chest)
    P(
      new THREE.CylinderGeometry(0.022, 0.022, 0.014, 8),
      'chest',
      BRASS,
      0.075,
      0.10,
      -0.148,
      { rx: Math.PI / 2 },
    ),
    // Dupatta: diagonal drape + trailing tail (teal for Meera)
    ...(OF.dupatta !== null
      ? [
          P(
            new THREE.CapsuleGeometry(0.035, 0.30, 4, 4),
            'chest',
            OF.dupatta,
            -0.10,
            -0.06,
            -0.135,
            { rz: 0.5 },
          ),
          // Flowing tail on the spring chain — the alive signature
          P(
            new THREE.CapsuleGeometry(0.030, 0.15, 4, 4),
            'dupatta1',
            OF.dupatta,
            0,
            -0.07,
            0,
            { rz: 0.3 },
          ),
          P(
            new THREE.CapsuleGeometry(0.026, 0.13, 4, 4),
            'dupatta2',
            OF.dupatta,
            0,
            -0.06,
            0,
            { rz: 0.2 },
          ),
        ]
      : []),
    // Satchel strap (rounded, not boxy)
    P(
      new THREE.CapsuleGeometry(0.028, 0.44, 4, 4),
      'chest',
      OF.satchelDark,
      0.03,
      0,
      -0.14,
      { rz: 0.55 },
    ),

    // ---- HEAD: big, warm, low-set eyes ----
    P(
      new THREE.SphereGeometry(0.20, 10, 8),
      'head',
      SKIN,
      0,
      0.04,
      0,
      { sx: 1.03, sy: 1, sz: 1 },
    ),
    // Full cheeks (secondary volume, Grok sin #3)
    P(
      new THREE.SphereGeometry(0.085, 6, 4),
      'head',
      SKIN,
      -0.125,
      -0.03,
      -0.115,
      { sx: 1, sy: 0.75, sz: 0.6 },
    ),
    P(
      new THREE.SphereGeometry(0.085, 6, 4),
      'head',
      SKIN,
      0.125,
      -0.03,
      -0.115,
      { sx: 1, sy: 0.75, sz: 0.6 },
    ),
    // Eyes: warm white, deep-brown iris, single glint (lively, not glassy)
    P(new THREE.SphereGeometry(0.048, 5, 4), 'head', EYE_WHITE, -0.078, 0.055, -0.168),
    P(new THREE.SphereGeometry(0.048, 5, 4), 'head', EYE_WHITE, 0.078, 0.055, -0.168),
    P(new THREE.SphereGeometry(0.032, 5, 4), 'head', IRIS, -0.078, 0.055, -0.20),
    P(new THREE.SphereGeometry(0.032, 5, 4), 'head', IRIS, 0.078, 0.055, -0.20),
    P(new THREE.SphereGeometry(0.012, 5, 3), 'head', 0xffffff, -0.090, 0.069, -0.222),
    P(new THREE.SphereGeometry(0.012, 5, 3), 'head', 0xffffff, 0.066, 0.069, -0.222),
    // Eyebrows: right one 8mm higher (asymmetry = alive)
    P(
      new THREE.CapsuleGeometry(0.014, 0.09, 3, 4),
      'head',
      HAIR,
      -0.078,
      0.135,
      -0.178,
      { rz: 0.12 },
    ),
    P(
      new THREE.CapsuleGeometry(0.014, 0.09, 3, 4),
      'head',
      HAIR,
      0.078,
      0.143,
      -0.178,
      { rz: -0.12 },
    ),
    // Nose (tiny), mouth (soft), blush (#1 humanity cheat code), bindi
    P(new THREE.SphereGeometry(0.02, 5, 3), 'head', NOSE_C, 0, 0.005, -0.196),
    P(
      new THREE.SphereGeometry(0.032, 6, 4),
      'head',
      LIP,
      0,
      -0.085,
      -0.182,
      { sx: 1.5, sy: 0.45, sz: 0.4 },
    ),
    P(
      new THREE.SphereGeometry(0.05, 6, 4),
      'head',
      BLUSH,
      -0.135,
      -0.03,
      -0.148,
      { sx: 1.1, sy: 0.65, sz: 0.35 },
    ),
    P(
      new THREE.SphereGeometry(0.05, 6, 4),
      'head',
      BLUSH,
      0.135,
      -0.03,
      -0.148,
      { sx: 1.1, sy: 0.65, sz: 0.35 },
    ),
    P(new THREE.SphereGeometry(0.014, 5, 3), 'head', BINDI_RED, 0, 0.105, -0.190),

    // ---- HAIR: the warmth multiplier (Ghibli style) ----
    P(
      new THREE.SphereGeometry(0.215, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52),
      'head',
      HAIR,
      0,
      0.075,
      0.012,
    ),
    // Fringe: 4 strands, right one longer/lower (asymmetric)
    P(
      new THREE.SphereGeometry(0.07, 6, 4),
      'head',
      HAIR,
      -0.125,
      0.135,
      -0.155,
      { sx: 1, sy: 0.85, sz: 0.6 },
    ),
    P(
      new THREE.SphereGeometry(0.07, 6, 4),
      'head',
      HAIR,
      -0.042,
      0.15,
      -0.158,
      { sx: 1, sy: 0.9, sz: 0.6 },
    ),
    P(
      new THREE.SphereGeometry(0.07, 6, 4),
      'head',
      HAIR,
      0.045,
      0.145,
      -0.158,
      { sx: 1, sy: 0.85, sz: 0.6 },
    ),
    P(
      new THREE.SphereGeometry(0.075, 6, 4),
      'head',
      HAIR,
      0.128,
      0.115,
      -0.152,
      { sx: 1, sy: 1.0, sz: 0.6 },
    ),
    // Side locks
    P(
      new THREE.CapsuleGeometry(0.042, 0.13, 4, 4),
      'head',
      HAIR,
      -0.195,
      -0.06,
      0.0,
    ),
    P(
      new THREE.CapsuleGeometry(0.042, 0.13, 4, 4),
      'head',
      HAIR,
      0.195,
      -0.06,
      0.0,
    ),
    // Twin buns (reference look): two round buns high on either side.
    P(new THREE.SphereGeometry(0.095, 6, 5), 'head', HAIR, -0.16, 0.20, 0.06),
    P(new THREE.SphereGeometry(0.095, 6, 5), 'head', HAIR, 0.16, 0.20, 0.06),
    // Bun ties: small colored bands at the base of each bun
    P(new THREE.SphereGeometry(0.035, 5, 4), 'head', BINDI_RED, -0.16, 0.13, 0.06),
    P(new THREE.SphereGeometry(0.035, 5, 4), 'head', BINDI_RED, 0.16, 0.13, 0.06),
    // Two loose Ghibli strands in front of ears
    P(
      new THREE.CapsuleGeometry(0.011, 0.09, 3, 4),
      'head',
      HAIR,
      -0.198,
      -0.01,
      -0.075,
      { rx: 0.15 },
    ),
    P(
      new THREE.CapsuleGeometry(0.011, 0.09, 3, 4),
      'head',
      HAIR,
      0.198,
      -0.01,
      -0.075,
      { rx: 0.15 },
    ),
    // Headwear by outfit (Nitesh-approved styles) — skipped when the
    // outfit uses the twin-bun look (dupatta: null on postal).
    ...(OF.dupatta === null && outfitId === 'postal'
      ? []
      : OF.capStyle === 'peaked'
      ? [
          P(new THREE.CylinderGeometry(0.125, 0.138, 0.095, 10), 'head', OF.cap, 0, 0.252, 0.008),
          P(new THREE.CylinderGeometry(0.132, 0.132, 0.028, 10), 'head', OF.capDark, 0, 0.208, 0.008),
          P(new THREE.BoxGeometry(0.17, 0.022, 0.11), 'head', OF.capDark, 0, 0.2, -0.17),
        ]
      : OF.capStyle === 'topi'
        ? [
            P(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 10), 'head', OF.cap, 0, 0.26, 0.008),
            P(new THREE.CylinderGeometry(0.126, 0.126, 0.025, 10), 'head', OF.capDark, 0, 0.205, 0.008),
          ]
        : [
            P(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 'head', OF.cap, 0, 0.22, 0.01),
            P(new THREE.BoxGeometry(0.18, 0.02, 0.16), 'head', OF.capDark, 0, 0.205, -0.2),
          ]),
    // (twin-bun look: no braid — bones kept for animation compat)

    P(new THREE.SphereGeometry(0.042, 6, 5), 'braid2', OF.braidBead, 0, -0.27, 0.05),
    // Satchel: soft rounded, olive + red postal stripe
    P(
      new THREE.SphereGeometry(0.155, 7, 5),
      'bagBone2',
      OF.satchel,
      0,
      -0.14,
      0,
      { sx: 1, sy: 1.12, sz: 0.72 },
    ),
    P(
      new THREE.SphereGeometry(0.10, 5, 4),
      'bagBone2',
      OF.satchelDark,
      0,
      -0.02,
      0.015,
      { sx: 1.25, sy: 0.55, sz: 0.85 },
    ),
    P(
      new THREE.BoxGeometry(0.13, 0.032, 0.02),
      'bagBone2',
      POSTAL_RED,
      0,
      -0.03,
      -0.062,
    ),
  ];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    parts.push(
      // Upper arm: tapered, top buried in shoulder blend (DeepSeek #1)
      P(
        new THREE.CapsuleGeometry(0.060, 0.16, 4, 4),
        `upperArm${side}`,
        OF.kurta,
        0.01 * s,
        -0.09,
        0,
      ),
      // Forearm: 13% taper (Grok sin #2 killer)
      P(
        new THREE.CapsuleGeometry(0.052, 0.16, 4, 4),
        `lowerArm${side}`,
        SKIN,
        0.01 * s,
        -0.09,
        0,
      ),
      // Hand: slightly oversized, soft (Grok sin #7)
      P(
        new THREE.SphereGeometry(0.062, 6, 5),
        `hand${side}`,
        SKIN,
        0.01 * s,
        -0.02,
        -0.01,
        { sx: 1, sy: 1.15, sz: 0.85 },
      ),
      // Thigh: tucked under kurta hem
      P(
        new THREE.CapsuleGeometry(0.075, 0.30, 4, 4),
        `upperLeg${side}`,
        OF.pants,
        0,
        -0.16,
        0,
      ),
      // Calf: 13% taper
      P(
        new THREE.CapsuleGeometry(0.065, 0.30, 4, 4),
        `lowerLeg${side}`,
        OF.pants,
        0,
        -0.13,
        0,
      ),
      // Ankle bridge (pants) — guarantees no calf/shoe gap
      P(
        new THREE.SphereGeometry(0.06, 6, 5),
        `lowerLeg${side}`,
        OF.pants,
        0,
        -0.36,
        -0.01,
      ),
      // Jutti shoe: pointed toe
      P(
        new THREE.SphereGeometry(0.08, 6, 5),
        `foot${side}`,
        OF.shoes,
        0,
        -0.03,
        -0.05,
        { sx: 0.95, sy: 0.75, sz: 1.55, rx: -0.12 },
      ),
    );
  }

  // Bone-parented parts (NO skinning): each body part is a regular Mesh parented
  // directly to its bone. The animation clips already target bones by name, so
  // all existing walk/idle/deliver/wave/namaste clips work unchanged. This is
  // bulletproof compared to SkinnedMesh (no bone-texture, bind-matrix or
  // shader edge cases) and visually identical for rigid single-bone parts.
  // (Previous SkinnedMesh path removed 2026-10-14: mesh existed and reported
  // visible=true but never rendered on screen; root cause unidentified.)
  const material = toon(0xffffff);
  material.vertexColors = true;
  const group = new THREE.Group();
  for (const p of parts) {
    let g: THREE.BufferGeometry = p.geo.toNonIndexed();
    _e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    _q.setFromEuler(_e);
    _v.set(p.x, p.y, p.z);
    _v2.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    _m4.compose(_v, _q, _v2);
    g.applyMatrix4(_m4);
    g.deleteAttribute('uv');
    paint(g, p.color);
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    const b = boneMap.get(p.bone);
    if (b) b.add(mesh);
    else group.add(mesh);
  }
  group.add(hips);

  // ------------------------------ envelope ------------------------------
  const envelope = new THREE.Group();
  const envBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.14, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.8 }),
  );
  const envStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.03, 0.027),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }),
  );
  envStripe.position.y = 0.045;
  envelope.add(envBody, envStripe);
  const ENVELOPE_HOME = { pos: new THREE.Vector3(0, -0.3, 0.07), rot: new THREE.Euler(0.35, 0, 0) };
  const handR = boneMap.get('handR')!;
  handR.add(envelope);
  envelope.position.copy(ENVELOPE_HOME.pos);
  envelope.rotation.copy(ENVELOPE_HOME.rot);
  envelope.visible = false;

  // ------------------------------ sparkles ------------------------------
  const SPARKS = 26;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.16,
    map: makeHeartTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffc4d6,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.visible = false;
  sparks.frustumCulled = false;
  group.add(sparks);
  const sparkVel = new Float32Array(SPARKS * 3);
  let sparkLife = 1e9;

  function burst(worldPos: THREE.Vector3): void {
    const local = group.worldToLocal(worldPos.clone());
    for (let i = 0; i < SPARKS; i++) {
      sparkPos[i * 3] = local.x;
      sparkPos[i * 3 + 1] = local.y;
      sparkPos[i * 3 + 2] = local.z;
      const a = Math.random() * Math.PI * 2;
      const r = 0.7 + Math.random() * 1.1;
      sparkVel[i * 3] = Math.cos(a) * r;
      sparkVel[i * 3 + 1] = 1.1 + Math.random() * 1.4;
      sparkVel[i * 3 + 2] = Math.sin(a) * r;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkLife = 0;
    sparks.visible = true;
  }

  // --------------------------- clip authoring ---------------------------
  // All clips authored in-place (no root motion), sampled at 8-12fps.
  const E = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);
  function qtrack(
    boneName: string,
    times: number[],
    eulers: THREE.Euler[],
  ): THREE.QuaternionKeyframeTrack {
    const vals: number[] = [];
    for (const e of eulers) {
      _q.setFromEuler(e);
      vals.push(_q.x, _q.y, _q.z, _q.w);
    }
    return new THREE.QuaternionKeyframeTrack(
      `${boneName}.quaternion`,
      times,
      vals,
    );
  }
  function vtrack(
    boneName: string,
    times: number[],
    vecs: THREE.Vector3[],
  ): THREE.VectorKeyframeTrack {
    const vals: number[] = [];
    for (const v of vecs) vals.push(v.x, v.y, v.z);
    return new THREE.VectorKeyframeTrack(`${boneName}.position`, times, vals);
  }

  function buildWalk(): THREE.AnimationClip {
    // Grok: make it EXCELLENT — strong arm/leg opposition, visible hip bob.
    // This is 80% of "alive". In-place (no root motion), 8-frame loop.
    const N = 8;
    const DUR = 0.64;
    const times = Array.from({ length: N }, (_, i) => (i / N) * DUR);
    const legL: THREE.Euler[] = [];
    const legR: THREE.Euler[] = [];
    const kneeL: THREE.Euler[] = [];
    const kneeR: THREE.Euler[] = [];
    const footL: THREE.Euler[] = [];
    const footR: THREE.Euler[] = [];
    const armL: THREE.Euler[] = [];
    const armR: THREE.Euler[] = [];
    const hipsY: THREE.Vector3[] = [];
    const chestY: THREE.Euler[] = [];
    const hipsYaw: THREE.Euler[] = [];
    const headLag: THREE.Euler[] = [];
    for (let i = 0; i < N; i++) {
      const p = (i / N) * Math.PI * 2;
      // Alive rule #10: exaggerate 20% past realistic — kid = bouncy, all-in.
      const swL = Math.sin(p) * 0.74;
      const swR = Math.sin(p + Math.PI) * 0.74;
      const knL = -(Math.max(0, Math.sin(p - 1.2)) * 1.0) - 0.08;
      const knR = -(Math.max(0, Math.sin(p + Math.PI - 1.2)) * 1.0) - 0.08;
      legL.push(E(swL));
      legR.push(E(swR));
      kneeL.push(E(knL));
      kneeR.push(E(knR));
      footL.push(E(-swL * 0.5 - knL * 0.3));
      footR.push(E(-swR * 0.5 - knR * 0.3));
      armL.push(E(Math.sin(p + Math.PI) * 0.72, 0, 0.09));
      armR.push(E(Math.sin(p) * 0.72, 0, -0.06)); // asymmetric (alive)
      // visible hip bob — in-place (hips Y only, no XZ root motion)
      hipsY.push(new THREE.Vector3(0, 0.98 + Math.abs(Math.cos(p)) * 0.075, 0));
      chestY.push(E(0.05, Math.sin(p) * 0.09, 0)); // slight forward drive
      // hips: yaw + transverse roll (Gemini anti-robot); head lags 2 frames
      hipsYaw.push(E(0, -Math.sin(p) * 0.07, Math.sin(p) * 0.06));
      headLag.push(E(Math.sin(p - Math.PI / 2) * 0.045, 0, Math.sin(p - Math.PI / 2) * 0.02));
    }
    return new THREE.AnimationClip('walk', DUR, [
      qtrack('upperLegL', times, legL),
      qtrack('upperLegR', times, legR),
      qtrack('lowerLegL', times, kneeL),
      qtrack('lowerLegR', times, kneeR),
      qtrack('footL', times, footL),
      qtrack('footR', times, footR),
      qtrack('upperArmL', times, armL),
      qtrack('upperArmR', times, armR),
      qtrack('chest', times, chestY),
      qtrack('hips', times, hipsYaw),
      qtrack('head', times, headLag),
      vtrack('hips', times, hipsY),
    ]);
  }

  function buildIdle(): THREE.AnimationClip {
    // Grok: ONE looping idle — gentle root bob + slow bag sway (procedural).
    // No look-around variants, no breathing (invisible from orbit).
    const N = 8;
    const DUR = 2.4;
    const times = Array.from({ length: N }, (_, i) => (i / N) * DUR);
    const bob: THREE.Vector3[] = [];
    const sway: THREE.Euler[] = [];
    for (let i = 0; i < N; i++) {
      const p = (i / N) * Math.PI * 2;
      bob.push(new THREE.Vector3(0, 0.98 + Math.sin(p) * 0.018, 0));
      sway.push(E(0, 0, Math.sin(p) * 0.03)); // gentle weight shifting
    }
    return new THREE.AnimationClip('idle', DUR, [
      vtrack('hips', times, bob),
      qtrack('hips', times, sway),
    ]);
  }

  function buildDeliver(): THREE.AnimationClip {
    // Grok: deliver/interact pose 0.6-1.0s — arm extend + letter handoff.
    // Anticipation lives in the ceremony STAGING (ChatGPT's 5 beats), not the clip.
    const times = [0, 0.2, 0.38, 0.62, 0.8, 1.0];
    const N = times.length;
    const chest: THREE.Euler[] = [];
    const shR: THREE.Euler[] = [];
    const laR: THREE.Euler[] = [];
    const headE: THREE.Euler[] = [];
    const hipsY: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const t = times[i];
      const antic = THREE.MathUtils.smoothstep(t, 0, 0.2); // steady the satchel
      const extend = THREE.MathUtils.smoothstep(t, 0.2, 0.62); // arm extends
      chest.push(E(0.14 * antic, 0, 0));
      shR.push(E(1.45 * extend, 0, -0.1 * extend));
      laR.push(E(0.15 * extend, 0, 0));
      headE.push(E(0.22 * extend, 0, 0)); // eyes on the letter, not the face
      hipsY.push(new THREE.Vector3(0, 0.98 - 0.03 * antic, 0));
    }
    return new THREE.AnimationClip('deliver', 1.0, [
      qtrack('chest', times, chest),
      qtrack('shoulderR', times, shR),
      qtrack('lowerArmR', times, laR),
      qtrack('head', times, headE),
      vtrack('hips', times, hipsY),
    ]);
  }

  function buildJump(): THREE.AnimationClip {
    // anticipation crouch → extend → soft land (matches ~0.65s airtime)
    const times = [0, 0.16, 0.32, 0.5, 0.62, 0.7];
    const N = times.length;
    const hipsY: THREE.Vector3[] = [];
    const legL: THREE.Euler[] = [];
    const kneeL: THREE.Euler[] = [];
    const shL: THREE.Euler[] = [];
    const shR: THREE.Euler[] = [];
    for (let i = 0; i < N; i++) {
      const t = times[i];
      // crouch 0→0.16, extend 0.16→0.32, hold, land 0.5→0.7
      const crouch =
        THREE.MathUtils.smoothstep(t, 0, 0.16) *
        (1 - THREE.MathUtils.smoothstep(t, 0.16, 0.3));
      const land = THREE.MathUtils.smoothstep(t, 0.5, 0.62);
      const c = crouch + land * 0.5;
      hipsY.push(new THREE.Vector3(0, 0.98 - 0.11 * c, 0));
      legL.push(E(-0.35 * c, 0, 0));
      kneeL.push(E(-0.95 * c, 0, 0));
      const air = THREE.MathUtils.smoothstep(t, 0.16, 0.3) * (1 - land);
      shL.push(E(0, 0, -2.4 * air));
      shR.push(E(0, 0, 2.4 * air));
    }
    const legR = legL.map((e) => e.clone());
    const kneeR = kneeL.map((e) => e.clone());
    return new THREE.AnimationClip('jump', 0.7, [
      vtrack('hips', times, hipsY),
      qtrack('upperLegL', times, legL),
      qtrack('upperLegR', times, legR),
      qtrack('lowerLegL', times, kneeL),
      qtrack('lowerLegR', times, kneeR),
      qtrack('shoulderL', times, shL),
      qtrack('shoulderR', times, shR),
    ]);
  }

  function buildNamaste(): THREE.AnimationClip {
    // small two-handed namaste: palms meet at the chest, gentle bow
    const times = [0, 0.4, 0.9, 1.25, 1.6];
    const N = times.length;
    const shL: THREE.Euler[] = [];
    const shR: THREE.Euler[] = [];
    const laL: THREE.Euler[] = [];
    const laR: THREE.Euler[] = [];
    const chestE: THREE.Euler[] = [];
    const headE: THREE.Euler[] = [];
    for (let i = 0; i < N; i++) {
      const t = times[i];
      const k =
        THREE.MathUtils.smoothstep(t, 0, 0.4) *
        (1 - THREE.MathUtils.smoothstep(t, 1.25, 1.6));
      shL.push(E(-0.55 * k, 0, 0.95 * k));
      shR.push(E(-0.55 * k, 0, -0.95 * k));
      laL.push(E(-1.0 * k, 0, 0));
      laR.push(E(-1.0 * k, 0, 0));
      chestE.push(E(0.24 * k, 0, 0));
      headE.push(E(0.2 * k, 0, 0));
    }
    return new THREE.AnimationClip('namaste', 1.6, [
      qtrack('shoulderL', times, shL),
      qtrack('shoulderR', times, shR),
      qtrack('lowerArmL', times, laL),
      qtrack('lowerArmR', times, laR),
      qtrack('chest', times, chestE),
      qtrack('head', times, headE),
    ]);
  }

  function buildWaveWarm(): THREE.AnimationClip {
    // warm two-handed wave for after deliveries (both arms up, waggling)
    const N = 8;
    const DUR = 1.8;
    const times = Array.from({ length: N }, (_, i) => (i / N) * DUR);
    const shL: THREE.Euler[] = [];
    const shR: THREE.Euler[] = [];
    const laL: THREE.Euler[] = [];
    const laR: THREE.Euler[] = [];
    const bounce: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const t = times[i];
      const k =
        THREE.MathUtils.smoothstep(t, 0, 0.25) *
        (1 - THREE.MathUtils.smoothstep(t, 1.45, 1.8));
      const wag = Math.sin(t * 16) * 0.35 * k;
      shL.push(E(0, 0, -2.1 * k));
      shR.push(E(0, 0, 2.1 * k));
      laL.push(E(0, 0, wag));
      laR.push(E(0, 0, -wag));
      bounce.push(
        new THREE.Vector3(0, 0.98 + Math.abs(Math.sin(t * 8)) * 0.03 * k, 0),
      );
    }
    return new THREE.AnimationClip('waveWarm', DUR, [
      qtrack('shoulderL', times, shL),
      qtrack('shoulderR', times, shR),
      qtrack('lowerArmL', times, laL),
      qtrack('lowerArmR', times, laR),
      vtrack('hips', times, bounce),
    ]);
  }

  function buildThanks(): THREE.AnimationClip {
    // Grok: one readable "thank you" pose — happy bounce + both hands tuck
    // the gift into the satchel. (Facial "blink twice" killed: invisible.)
    const times = [0, 0.3, 0.45, 0.6, 0.8, 1.0, 1.2];
    const N = times.length;
    const hipsY: THREE.Vector3[] = [];
    const shL: THREE.Euler[] = [];
    const shR: THREE.Euler[] = [];
    for (let i = 0; i < N; i++) {
      const t = times[i];
      const hb =
        THREE.MathUtils.smoothstep(t, 0.15, 0.3) *
        (1 - THREE.MathUtils.smoothstep(t, 0.6, 0.75));
      hipsY.push(
        new THREE.Vector3(0, 0.98 + Math.abs(Math.sin(t * 14)) * 0.07 * hb, 0),
      );
      const tuck = THREE.MathUtils.smoothstep(t, 0.7, 1.0);
      shL.push(E(-0.6 * tuck, 0, 0.3 * tuck));
      shR.push(E(-0.6 * tuck, 0, -0.3 * tuck));
    }
    return new THREE.AnimationClip('thanks', 1.2, [
      vtrack('hips', times, hipsY),
      qtrack('shoulderL', times, shL),
      qtrack('shoulderR', times, shR),
    ]);
  }

  function buildShieldEyes(): THREE.AnimationClip {
    // idle ritual: hand to brow, scans the horizon
    const times = [0, 0.4, 0.9, 1.4, 1.9, 2.3, 2.6];
    const N = times.length;
    const shR: THREE.Euler[] = [];
    const laR: THREE.Euler[] = [];
    const headE: THREE.Euler[] = [];
    for (let i = 0; i < N; i++) {
      const t = times[i];
      const k =
        THREE.MathUtils.smoothstep(t, 0, 0.4) *
        (1 - THREE.MathUtils.smoothstep(t, 2.3, 2.6));
      const scan = k * Math.sin((t - 0.4) * 2.2) * 0.3;
      shR.push(E(0.65 * k, 0, -0.15 * k));
      laR.push(E(-2.1 * k, 0, 0));
      headE.push(E(-0.3 * k, scan, 0));
    }
    return new THREE.AnimationClip('shieldEyes', 2.6, [
      qtrack('shoulderR', times, shR),
      qtrack('lowerArmR', times, laR),
      qtrack('head', times, headE),
    ]);
  }

  const mixer = new THREE.AnimationMixer(group);
  const walkAction = mixer.clipAction(buildWalk());
  const idleAction = mixer.clipAction(buildIdle());
  const deliverAction = mixer.clipAction(buildDeliver());
  const waveAction = mixer.clipAction(buildWaveWarm()); // THE wave: two-handed, readable
  const namasteAction = mixer.clipAction(buildNamaste());
  const thanksAction = mixer.clipAction(buildThanks());
  const jumpAction = mixer.clipAction(buildJump());
  const shieldAction = mixer.clipAction(buildShieldEyes());
  walkAction.setLoop(THREE.LoopRepeat, Infinity);
  idleAction.setLoop(THREE.LoopRepeat, Infinity);
  for (const a of [
    deliverAction,
    waveAction,
    namasteAction,
    thanksAction,
    jumpAction,
    shieldAction,
  ]) {
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
  }

  // Grok: tiny state machine — walk / idle / deliver / turn only.
  // (Turn is handled by the controller's short facing blend, not a clip.)
  let base: 'walk' | 'idle' = 'idle';
  let current = idleAction;
  idleAction.play();

  function fadeTo(next: THREE.AnimationAction, dur = 0.22): void {
    if (current === next) return;
    current.fadeOut(dur);
    current = next;
    next.reset().fadeIn(dur).play();
  }
  function playOnce(action: THREE.AnimationAction): void {
    if (deliveringRef.v) return;
    current.fadeOut(0.16);
    current = action;
    action.reset();
    action.fadeIn(0.16).play();
  }
  const deliveringRef = { v: false };
  mixer.addEventListener('finished', (e) => {
    const finished = (e as { action: THREE.AnimationAction }).action;
    if (
      finished === deliverAction ||
      finished === waveAction ||
      finished === namasteAction ||
      finished === thanksAction ||
      finished === jumpAction ||
      finished === shieldAction
    ) {
      fadeTo(base === 'walk' ? walkAction : idleAction, 0.22);
    }
  });

  // ------------------------- procedural state -------------------------
  // Grok: only what changes the silhouette or makes a trackable rhythm.
  let tGlobal = 0;
  let bagPhase = 0;
  let bagImpulse = 0; // landing thump → the bag bumps her hip
  let dupPhase = 0; // dupatta tail flow phase
  let squashT = 1e9; // landing squash & stretch (alive rule #2)
  let lookYawSm = 0; // smoothed head look-at yaw
  let hugT = 1e9; // procedural satchel hug (silhouette ✓)
  // delivery ceremony state (compressed 1.0s clip per Grok)
  let deliverT = 0;
  let handedOff = false;
  let deliverTarget: THREE.Object3D | null = null;
  let handoffCb: (() => void) | null = null;
  let nodT = 1e9;
  let nodTarget: THREE.Object3D | null = null;
  let nodBaseY = 0;

  /** Begin the envelope handoff: show envelope, animate to NPC hand. */
  function beginHandoff(npcHand: THREE.Object3D, onDone?: () => void): void {
    envelope.visible = true;
    // Simple timed handoff: after 0.6s, move envelope to NPC hand
    const handoffDelay = 0.6;
    let handoffT = 0;
    const handoffUpdate = (dt: number): boolean => {
      handoffT += dt;
      if (handoffT >= handoffDelay && envelope.parent === handR) {
        // Re-parent to NPC hand
        npcHand.add(envelope);
        envelope.position.set(0, 0, 0);
        envelope.rotation.set(0, 0, 0);
        burst(npcHand.getWorldPosition(_v)); // golden sparkle burst
        if (onDone) onDone();
        return true; // done, remove updater
      }
      return false;
    };
    // Register as a one-shot updater (will be called in main update)
    oneShotUpdaters.push(handoffUpdate);
  }

  const oneShotUpdaters: Array<(dt: number) => boolean> = [];

  const api: Postwoman = {
    group,
    bones: boneMap,
    envelope,

    update(dt: number, o: CharacterUpdateOpts): void {
      // ---- perf LOD: freeze the mixer when far or off-screen ----
      if (o.camera) {
        group.getWorldPosition(_v);
        if (_v.distanceTo(o.camera.position) > 15) return;
        _m4.multiplyMatrices(
          o.camera.projectionMatrix,
          o.camera.matrixWorldInverse,
        );
        _frustum.setFromProjectionMatrix(_m4);
        _sphere.center.copy(_v);
        _sphere.center.y += 0.9;
        _sphere.radius = 1.3;
        if (!_frustum.intersectsSphere(_sphere)) return;
      }

      tGlobal += dt;

      // ---- one-shot updaters (handoff, etc.) ----
      for (let i = oneShotUpdaters.length - 1; i >= 0; i--) {
        if (oneShotUpdaters[i](dt)) oneShotUpdaters.splice(i, 1);
      }

      // ---- base state: walk vs idle; timeScale from velocity (no moonwalk) ----
      const wantBase = o.moving ? 'walk' : 'idle';
      if (!deliveringRef.v && wantBase !== base) {
        base = wantBase;
        fadeTo(base === 'walk' ? walkAction : idleAction, 0.22);
      }
      if (base === 'walk' && current === walkAction) {
        walkAction.timeScale = THREE.MathUtils.clamp(o.speedRatio, 0.5, 1.7);
      }
      mixer.update(dt);

      // ---- landing squash & stretch (alive rule #2): quick dip + recover ----
      if (squashT < 0.34) {
        squashT += dt;
        const k = Math.sin(Math.min(1, squashT / 0.34) * Math.PI);
        group.scale.set(1 + 0.10 * k, 1 - 0.16 * k, 1 + 0.10 * k);
      } else if (group.scale.y !== 1) {
        group.scale.set(1, 1, 1);
      }

      const B = boneMap;
      const bag1B = B.get('bagBone1')!;
      const bag2B = B.get('bagBone2')!;
      const braid1B = B.get('braid1')!;
      const braid2B = B.get('braid2')!;
      const hipsB = B.get('hips')!;
      const chestB = B.get('chest')!;
      const shLB = B.get('shoulderL')!;
      const shRB = B.get('shoulderR')!;
      const laLB = B.get('lowerArmL')!;
      const laRB = B.get('lowerArmR')!;
      const headB = B.get('head')!;

      if (!o.reducedMotion) {
        const moveBlend = o.moving ? 1 : 0;
        const restBlend = 1 - moveBlend;

        // Act-driven extra bounce (Week 5: cheap posture parameter, no new clip)
        if (moveBlend > 0 && o.walkBounceAmp !== 1) {
          hipsB.position.y +=
            Math.abs(Math.sin(tGlobal * 9.8)) * 0.02 * (o.walkBounceAmp - 1);
        }

        // ---- satchel sway: delayed sine tied to walk speed, springy
        //      over-rotation on the second bag bone (changes silhouette ✓) ----
        bagPhase += dt * (2 + 7 * Math.min(1.2, o.speedRatio));
        const swayAmp = 0.05 + 0.14 * Math.min(1, o.speedRatio);
        bagImpulse *= Math.exp(-4 * dt);
        bag1B.rotation.x = Math.sin(bagPhase - 0.8) * swayAmp + bagImpulse * 0.4;
        bag1B.rotation.z =
          Math.sin(bagPhase * 0.63) * swayAmp * 0.5 - o.turnRate * 0.35; // lags on turns
        bag2B.rotation.x =
          Math.sin(bagPhase - 1.7) * swayAmp * 1.4 + bagImpulse;
        bag2B.rotation.z = Math.sin(bagPhase * 0.63 - 0.9) * swayAmp * 0.7;

        // ---- braid: big-arc swing ONLY (Grok) — trails on sprint, swings on brake
        const trail = Math.min(1.2, o.speedRatio);
        const brake = THREE.MathUtils.clamp(-o.accel * 0.05, -0.45, 0.45);
        braid1B.rotation.x = trail * 0.55 + brake;
        braid2B.rotation.x =
          trail * 0.75 + brake * 1.3 + Math.sin(tGlobal * 2.4) * 0.05 * trail;

        // ---- dupatta tail: flowing secondary motion (alive rule #3) ----
        // Trails behind on the move, flutters gently at idle, lags on turns.
        const dup1B = B.get('dupatta1')!;
        const dup2B = B.get('dupatta2')!;
        dupPhase += dt * (2.4 + 6 * trail);
        const dupAmp = 0.07 + 0.17 * trail;
        dup1B.rotation.x =
          trail * 0.55 + Math.sin(dupPhase - 0.7) * dupAmp;
        dup1B.rotation.z =
          0.3 + Math.sin(dupPhase * 0.7) * dupAmp * 0.6 - o.turnRate * 0.3;
        dup2B.rotation.x =
          trail * 0.7 + Math.sin(dupPhase - 1.5) * dupAmp * 1.35;
        dup2B.rotation.z =
          Math.sin(dupPhase * 0.7 - 0.8) * dupAmp * 0.85;

        // ---- head leads: glance toward nearby interest (alive rule #4) ----
        // o.lookYaw is the head-local yaw to glance at (clamped ±0.55).
        const lookTarget =
          o.lookYaw !== undefined
            ? THREE.MathUtils.clamp(o.lookYaw, -0.55, 0.55)
            : Math.sin(tGlobal * 0.43) * 0.05 * restBlend; // idle wander
        lookYawSm += (lookTarget - lookYawSm) * (1 - Math.exp(-5 * dt));
        headB.rotation.y += lookYawSm;

        // ---- Meera v2: S-curve rest posture + breathing + micro-saccades ----
        // (never T-pose; asymmetry = alive; Grok sin #4/#7)
        chestB.rotation.x += -0.05 * restBlend; // torso leans in gently
        headB.rotation.x += 0.035 * restBlend; // head counter-tilt
        hipsB.rotation.z += 0.02 * restBlend; // weight to one side
        const breath = 1 + Math.sin(tGlobal * 1.795) * 0.015; // 3.5s breath
        chestB.scale.set(breath, 1, breath);
        // (head idle wander now handled by the look-at block below)

        // ---- satchel hug: arms wrap the bag after heartfelt thanks ----
        if (hugT < 1.4) {
          hugT += dt;
          const k = Math.sin(Math.min(1, hugT / 1.4) * Math.PI);
          shLB.rotation.x += -0.55 * k;
          shRB.rotation.x += -0.55 * k;
          laLB.rotation.x += -0.35 * k;
          laRB.rotation.x += -0.35 * k;
          headB.rotation.x += 0.12 * k;
        }
      }

      // ---- delivery ceremony timeline (1.0s clip; staging in ceremony.ts) ----
      if (deliveringRef.v) {
        deliverT += dt;
        if (deliverT >= 0.3) envelope.visible = true;
        if (deliverT >= 0.65 && !handedOff) {
          handedOff = true;
          // mask the swap with a sparkle burst, then re-parent to the NPC
          envelope.getWorldPosition(_v);
          burst(_v);
          if (deliverTarget) {
            deliverTarget.attach(envelope);
            envelope.position.set(0, 1.05, 0.32);
            envelope.rotation.set(0, 0, 0);
            nodTarget = deliverTarget;
            nodBaseY = deliverTarget.position.y;
            nodT = 0;
          }
          if (handoffCb) handoffCb();
        }
        if (deliverT >= 1.05) {
          deliveringRef.v = false;
          envelope.visible = false;
          handR.add(envelope); // back home for the next delivery
          envelope.position.copy(ENVELOPE_HOME.pos);
          envelope.rotation.copy(ENVELOPE_HOME.rot);
        }
      }

      // ---- NPC happy bounce (nod substitute for unrigged low-poly NPCs) ----
      if (nodT < 0.9 && nodTarget) {
        nodT += dt;
        const k = Math.sin(Math.min(1, nodT / 0.9) * Math.PI * 2);
        nodTarget.position.y = nodBaseY + Math.abs(k) * 0.09;
        if (nodT >= 0.9) {
          nodTarget.position.y = nodBaseY;
          nodTarget = null;
        }
      }

      // ---- sparkles ----
      if (sparks.visible) {
        sparkLife += dt;
        const pos = sparkGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < SPARKS; i++) {
          sparkVel[i * 3 + 1] -= 2.5 * dt;
          pos.setXYZ(
            i,
            pos.getX(i) + sparkVel[i * 3] * dt,
            pos.getY(i) + sparkVel[i * 3 + 1] * dt,
            pos.getZ(i) + sparkVel[i * 3 + 2] * dt,
          );
        }
        pos.needsUpdate = true;
        sparkMat.opacity = Math.max(0, 1 - sparkLife / 0.9);
        if (sparkLife > 0.9) sparks.visible = false;
      }
    },

    playWave(): void {
      playOnce(waveAction);
    },

    playNamaste(): void {
      playOnce(namasteAction);
    },

    playThanks(): void {
      playOnce(thanksAction);
    },

    playShieldEyes(): void {
      playOnce(shieldAction);
    },

    playJump(): void {
      playOnce(jumpAction);
    },

    startSatchelHug(): void {
      hugT = 0;
    },

    addBagImpulse(x: number): void {
      bagImpulse += x;
    },

    addLandSquash(): void {
      squashT = 0;
    },

    showEnvelope(v: boolean): void {
      envelope.visible = v;
    },

    startDelivery(target: THREE.Object3D | null, onHandoff?: () => void): void {
      if (deliveringRef.v) return;
      deliveringRef.v = true;
      deliverT = 0;
      handedOff = false;
      deliverTarget = target;
      handoffCb = onHandoff ?? null;
      // inline the one-shot (playOnce refuses while delivering — by design)
      current.fadeOut(0.16);
      current = deliverAction;
      deliverAction.reset();
      deliverAction.fadeIn(0.16).play();
    },

    isDelivering(): boolean {
      return deliveringRef.v;
    },

    beginHandoff(npcHand: THREE.Object3D, onDone?: () => void): void {
      beginHandoff(npcHand, onDone);
    },
  };

  return api;
}
