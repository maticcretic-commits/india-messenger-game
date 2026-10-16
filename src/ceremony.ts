import * as THREE from 'three';
import type { Postwoman } from './character';
import type { Player } from './player';
import type { FollowCamera } from './camera';
import { getNPCEntry, type Placed } from './npcs';
import { BIOME_ZONES } from './biomes/registry';
import { latLonToDir, planeFromSphere } from './biomes/geo';
import { announce } from './a11y';
import {
  recordDelivery,
  approachSpeedMult,
  wavesFirst,
  halfStepBack,
  markVisited,
} from './arc';
import { offerPostcard } from './postcard';
import { settings } from './settings';
import { terrainHeight } from './planet';
import { flatDist, radToWorld } from './biomes/geo';

const UP_Y = new THREE.Vector3(0, 1, 0);

/**
 * The 5-beat delivery ceremony (ChatGPT sell-lane, staged per Grok).
 *
 * Grok's filter: stage with POSES + camera + particles/props — never close-ups,
 * no facial detail (her face is 4-8 pixels from orbit). Beats:
 *  (1) anticipation — she steadies, finds the envelope (deliver clip)
 *  (2) recognition — the recipient leans forward
 *  (3) contact — both hold the letter briefly (envelope midpoint + sparkle)
 *  (4) reaction per personality — child / grandfather / friend / grandmother
 *  (5) echo — she mirrors one small part of the reaction
 *
 * Signature moment ("A Little Piece of Home"): the grandmother personality —
 * recognizes the handwriting, presses the letter to her chest, namaste,
 * wave exchange as the camera pulls away. No dialogue, just body language.
 */

export type Personality = 'grandmother' | 'grandfather' | 'child' | 'friend';

export const PERSONALITY_BY_ID: Record<string, Personality> = {
  'himalaya-ama-lhamo': 'grandmother',
  'goa-lourdes': 'grandmother',
  'himalaya-tenzin': 'child',
  'varanasi-maestro': 'grandfather',
  'meghalaya-elder': 'grandfather',
  'kerala-boatbuilder': 'grandfather',
  'hampi-caretaker': 'grandfather',
  'varanasi-phoolwali': 'friend',
  'thar-herder': 'friend',
  'kerala-fisherwoman': 'friend',
  'goa-rosario': 'friend',
  'thar-astronomer': 'friend',
  'meghalaya-guardian': 'friend',
  'hampi-carver': 'friend',
};

const CAPTION: Record<Personality, string> = {
  grandmother: 'Some letters travel farther than words.',
  grandfather: 'News from home, kept near the heart.',
  child: 'Delivered with extra bounce.',
  friend: 'A little sweetness, postage paid.',
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _handW = new THREE.Vector3();

// ---------------- delivery sparkle burst (beat 3: the letter changes hands) ----------------
// A short-lived fountain of golden sparkles at the handoff point — the promised
// "sparkle" in the ceremony's contact beat. Transient Points systems, disposed
// after ~1s; capped so rapid repeat deliveries can't pile up.
const BURST_COUNT = 40;
const BURST_LIFE = 1.0;
const MAX_BURSTS = 4;
interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
}
const bursts: Burst[] = [];
let burstTexture: THREE.Texture | null = null;

function getBurstTexture(): THREE.Texture {
  if (!burstTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,250,230,1)');
    grad.addColorStop(0.35, 'rgba(255,225,150,0.7)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    burstTexture = new THREE.CanvasTexture(c);
  }
  return burstTexture;
}

function spawnBurst(scene: THREE.Scene, at: THREE.Vector3): void {
  if (settings.reducedMotion) return;
  if (bursts.length >= MAX_BURSTS) return;
  const up = new THREE.Vector3(0, 1, 0); // flat world: up is +Y
  const pos = new Float32Array(BURST_COUNT * 3);
  const vel = new Float32Array(BURST_COUNT * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < BURST_COUNT; i++) {
    pos[i * 3] = at.x;
    pos[i * 3 + 1] = at.y;
    pos[i * 3 + 2] = at.z;
    // Random cone around up: outward fountain with upward bias
    tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (tmp.lengthSq() < 1e-4) tmp.set(0, 1, 0);
    tmp.normalize();
    tmp.multiplyScalar(1.2 + Math.random() * 1.6);
    tmp.addScaledVector(up, 1.6 + Math.random() * 1.4);
    vel[i * 3] = tmp.x;
    vel[i * 3 + 1] = tmp.y;
    vel[i * 3 + 2] = tmp.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.32,
    map: getBurstTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xffe9a8,
    opacity: 1,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  bursts.push({ points, vel, life: BURST_LIFE });
}

/** Advance + fade active bursts; called every frame from main's animate loop. */
export function updateBursts(dt: number): void {
  for (let b = bursts.length - 1; b >= 0; b--) {
    const burst = bursts[b];
    burst.life -= dt;
    if (burst.life <= 0) {
      burst.points.parent?.remove(burst.points);
      burst.points.geometry.dispose();
      (burst.points.material as THREE.Material).dispose();
      bursts.splice(b, 1);
      continue;
    }
    const pos = burst.points.geometry.attributes.position as THREE.BufferAttribute;
    const drag = Math.max(0, 1 - dt * 1.4);
    for (let i = 0; i < BURST_COUNT; i++) {
      const ix = i * 3;
      burst.vel[ix] *= drag;
      burst.vel[ix + 1] *= drag;
      burst.vel[ix + 2] *= drag;
      pos.array[ix] += burst.vel[ix] * dt;
      pos.array[ix + 1] += burst.vel[ix + 1] * dt;
      pos.array[ix + 2] += burst.vel[ix + 2] * dt;
    }
    pos.needsUpdate = true;
    (burst.points.material as THREE.PointsMaterial).opacity = burst.life / BURST_LIFE;
  }
}

type Beat =
  | 'approach'
  | 'anticipation'
  | 'recognition'
  | 'contact'
  | 'reaction'
  | 'echo'
  | 'done';

export class DeliveryDirector {
  active = false;
  private beat: Beat = 'approach';
  private beatT = 0;
  private contactInit = false;
  private npcObj: THREE.Object3D | null = null;
  private entry: Placed | null = null;
  private npcId = '';
  private deliveredToName = '';
  /** Called when the delivery ceremony finishes. */
  onFinish: (() => void) | null = null;
  private personality: Personality = 'friend';
  private meaningful = false;
  private readonly startPos = new THREE.Vector3();
  private readonly goalPos = new THREE.Vector3();
  private readonly leanDir = new THREE.Vector3();
  private readonly runDir = new THREE.Vector3();
  private approachDur = 1.4;
  private gift: THREE.Group | null = null;
  private giftT = 0;
  private giftFrom = new THREE.Vector3();
  private echoBack = 0;
  private dollyTimer = 0;

  constructor(
    private readonly player: Player,
    private readonly follow: FollowCamera,
    private readonly scene: THREE.Scene,
  ) {}

  private get ch(): Postwoman {
    return this.player.character;
  }

  /** Begin the ceremony with an NPC's scene object + def id. */
  start(npcObj: THREE.Object3D, npcId: string, recipientName?: string): void {
    if (this.active) return;
    const entry = getNPCEntry(npcObj);
    if (!entry) return;
    this.active = true;
    this.npcObj = npcObj;
    this.entry = entry;
    this.npcId = npcId;
    // The letter's addressed recipient (may differ from the NPC being faced
    // in the old flow; in the new flow they're always the same person).
    this.deliveredToName = recipientName ?? entry.def.name;
    this.personality = PERSONALITY_BY_ID[npcId] ?? 'friend';
    this.meaningful = this.personality === 'grandmother' || this.personality === 'child';
    this.beat = 'approach';
    this.beatT = 0;
    this.echoBack = 0;
    this.giftT = 0;

    // stand 1.7m from the NPC, facing it (flat world: XZ only)
    const npcPos = npcObj.position;
    _v.copy(this.player.group.position).sub(npcPos);
    _v.y = 0;
    _v.normalize();
    _v2.copy(npcPos).addScaledVector(_v, 1.7);
    _v2.y = terrainHeight(_v2) + 0.05;
    this.goalPos.copy(_v2);
    this.startPos.copy(this.player.group.position);
    this.approachDur = 1.5 / approachSpeedMult(); // Act I/III approach slower
    // NPC lean direction (toward the player, tangent plane)
    this.leanDir.copy(_v).negate();
    // child run direction (away, tangent)
    this.runDir.copy(_v);

    this.player.faceToward(npcPos);
    this.player.setForceMoving(true);
    if (wavesFirst()) this.ch.playWave(); // Act II+: she waves first
    announce(`Delivering a letter to ${entry.def.name}…`);
  }

  /** Hold-Space skip (Copilot's skip test): jump straight to the echo. */
  skip(): void {
    if (!this.active || !this.entry) return;
    this.entry.fx.set(0, 0, 0);
    const ch = this.ch;
    ch.showEnvelope(false);
    ch.bones.get('handR')!.add(ch.envelope);
    ch.envelope.position.set(0, -0.3, 0.07);
    ch.envelope.rotation.set(0.35, 0, 0);
    if (this.gift) this.gift.visible = false;
    this.follow.setDolly(1);
    this.beat = 'echo';
    this.beatT = 99;
    announce('Ceremony skipped.');
  }

  private next(b: Beat): void {
    this.beat = b;
    this.beatT = 0;
    if (b === 'contact') this.contactInit = false;
  }

  private npcChestWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.npcObj!.position).addScaledVector(UP_Y, 1.1);
  }

  update(dt: number): void {
    if (!this.active || !this.npcObj || !this.entry) return;
    this.beatT += dt;
    const ch = this.ch;
    const npcPos = this.npcObj.position;

    switch (this.beat) {
      // ---------------- beat 1: anticipation ----------------
      case 'approach': {
        const k = Math.min(1, this.beatT / this.approachDur);
        const e = k * k * (3 - 2 * k);
        _v.copy(this.startPos).lerp(this.goalPos, e);
        _v.y = terrainHeight(_v) + 0.05;
        this.player.group.position.copy(_v);
        this.player.faceToward(npcPos);
        if (k >= 1) {
          this.player.setForceMoving(false);
          this.next('anticipation');
          // she steadies, finds the envelope — the 1.0s deliver clip
          ch.startDelivery(this.npcObj, () => this.onHandoff());
        }
        break;
      }

      // ---------------- beat 1b: anticipation (clip plays) ----------------
      case 'anticipation': {
        // recipient begins to lean forward as she extends the letter
        const k = Math.min(1, this.beatT / 0.8);
        this.entry.fx.copy(this.leanDir).multiplyScalar(0.22 * k);
        if (this.beatT >= 1.15) this.next('recognition');
        break;
      }

      // ---------------- beat 2: recognition ----------------
      case 'recognition': {
        this.entry.fx.copy(this.leanDir).multiplyScalar(0.3);
        if (this.beatT >= 0.8) this.next('contact');
        break;
      }

      // ---------------- beat 3: contact — both hold the letter briefly ----
      case 'contact': {
        // lift the envelope to the midpoint between them for a shared beat
        // (use a flag, not beatT<0.05 — dt can exceed 0.05 on slow frames)
        if (!this.contactInit) {
          this.contactInit = true;
          this.scene.attach(ch.envelope);
          ch.bones.get('handR')!.getWorldPosition(_handW);
          this.npcChestWorld(_v3);
          _mid.copy(_handW).add(_v3).multiplyScalar(0.5);
          ch.envelope.userData.from = ch.envelope.position.clone();
          ch.envelope.userData.to = _mid.clone();
        }
        const k = Math.min(1, this.beatT / 0.5);
        ch.envelope.position.lerpVectors(
          ch.envelope.userData.from,
          ch.envelope.userData.to,
          k,
        );
        if (this.beatT >= 0.7) {
          this.npcObj.attach(ch.envelope);
          ch.envelope.position.set(0, 1.05, 0.32);
          ch.envelope.rotation.set(0, 0, 0);
          this.next('reaction');
        }
        break;
      }

      // ---------------- beat 4: reaction per personality ------------------
      case 'reaction': {
        this.updateReaction(dt);
        break;
      }

      // ---------------- beat 5: echo — she mirrors a small part -----------
      case 'echo': {
        const echoDur = 1.5;
        if (this.beatT < 0.1 && !this.ch.isDelivering()) {
          if (this.personality === 'child') this.ch.playJump(); // one playful bounce
          else if (this.personality === 'grandfather') this.ch.playNamaste();
          else if (this.personality === 'friend') this.ch.playThanks();
          else this.ch.playNamaste();
          if (halfStepBack()) this.echoBack = 0.35; // Act I: half-step back
        }
        if (this.echoBack > 0) {
          this.echoBack = Math.max(0, this.echoBack - dt * 0.5);
          this.ch.group.position.z = this.echoBack;
        }
        if (this.dollyTimer > 0) {
          this.dollyTimer -= dt;
          if (this.dollyTimer <= 0) this.follow.setDolly(1);
        }
        if (this.beatT >= echoDur) this.finish();
        break;
      }

      case 'done':
        break;
    }
  }

  /** The letter changes hands (fired by the character at the handoff moment). */
  private onHandoff(): void {
    announce(`Letter delivered to ${this.deliveredToName}.`);
    // Sparkle burst at the envelope's midpoint, lifted above the ground
    if (this.npcObj) {
      _mid
        .copy(this.player.group.position)
        .add(this.npcObj.position)
        .multiplyScalar(0.5);
      _mid.y += 0.9; // lift above the ground (flat world: +Y)
      spawnBurst(this.scene, _mid);
    }
  }

  private updateReaction(dt: number): void {
    const t = this.beatT;
    const ch = this.ch;
    const e = this.entry!;
    const dur =
      this.personality === 'grandmother' ? 4.6 : 2.6;

    switch (this.personality) {
      case 'child': {
        // bounces twice, runs 3 steps, waves the letter overhead
        if (t < 1.2) {
          const hop = Math.abs(Math.sin((t / 1.2) * Math.PI * 2));
          e.fx.copy(UP_Y).multiplyScalar(hop * 0.3);
        } else {
          const k = Math.min(1, (t - 1.2) / 1.4);
          e.fx.copy(this.runDir).multiplyScalar(k * 1.6);
          ch.envelope.position.set(0, 1.95, 0.1); // letter waved overhead
        }
        break;
      }
      case 'grandfather': {
        // adjusts, reads, folds the letter into his shirt pocket near the heart
        if (t < 1.2) {
          const nod = Math.abs(Math.sin((t / 1.2) * Math.PI * 2));
          e.fx.copy(this.leanDir).multiplyScalar(0.3 + nod * 0.08);
          ch.envelope.position.set(0, 1.15, 0.3); // held up to read
        } else {
          e.fx.copy(this.leanDir).multiplyScalar(0.3);
          const k = Math.min(1, (t - 1.2) / 0.8);
          ch.envelope.position.set(0.14 * k, 1.15 - 0.2 * k, 0.3 - 0.04 * k);
        }
        break;
      }
      case 'friend': {
        // freezes, hugs the letter, offers a flower; she tucks it in her satchel
        if (t < 0.7) {
          e.fx.set(0, 0, 0); // freeze
          ch.envelope.position.set(0, 1.2, 0.28); // hugged to chest
        } else {
          this.flyGift(dt);
        }
        break;
      }
      case 'grandmother': {
        // "A Little Piece of Home": recognizes the handwriting, presses the
        // letter to her chest, touches her cheek; namaste; wave exchange as
        // the camera pulls away. No dialogue — body language only.
        if (t < 1.2) {
          ch.envelope.position.set(0, 1.5, 0.3); // held up — the handwriting
          e.fx.copy(this.leanDir).multiplyScalar(0.25);
        } else if (t < 2.4) {
          ch.envelope.position.set(0, 1.15, 0.28); // pressed to her chest
          e.fx.copy(this.leanDir).multiplyScalar(0.3);
        } else if (t < 3.2) {
          // she reaches toward the postwoman's cheek
          e.fx.copy(this.leanDir).multiplyScalar(0.55);
          if (t > 2.5 && t - dt <= 2.5) ch.playNamaste();
        } else {
          // wave from the doorway as the camera pulls away
          const k = Math.min(1, (t - 3.2) / 0.8);
          e.fx.copy(this.leanDir).multiplyScalar(0.55 - 1.05 * k); // steps back
          const wave = Math.abs(Math.sin(t * 9)) * 0.18 * k;
          e.fx.addScaledVector(UP_Y, wave);
          if (t > 3.3 && t - dt <= 3.3) {
            ch.playWave();
            this.follow.setDolly(1.7); // camera pulls away
            this.dollyTimer = 2.6;
          }
        }
        break;
      }
    }

    if (this.beatT >= dur) {
      e.fx.set(0, 0, 0);
      this.next('echo');
    }
  }

  /** The friend's thank-you flower flies to the postwoman's satchel. */
  private flyGift(dt: number): void {
    const ch = this.ch;
    if (!this.gift) {
      this.gift = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5),
        new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 }),
      );
      stem.position.y = 0.15;
      const bloom = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.09, 0),
        new THREE.MeshStandardMaterial({ color: 0xe86a8a, roughness: 1 }),
      );
      bloom.position.y = 0.34;
      this.gift.add(stem, bloom);
      this.scene.add(this.gift);
      this.npcChestWorld(this.giftFrom);
      this.giftT = 0;
    }
    this.giftT += dt;
    const k = Math.min(1, this.giftT / 0.9);
    const ez = k * k * (3 - 2 * k);
    ch.bones.get('bagBone2')!.getWorldPosition(_v3);
    _v.copy(this.giftFrom).lerp(_v3, ez);
    _v.y += Math.sin(ez * Math.PI) * 0.45; // little arc
    this.gift.position.copy(_v);
    this.gift.visible = true;
    if (k >= 1) {
      // tucked into the satchel with both hands
      ch.group.add(this.gift);
      this.gift.position.set(-0.26, 0.72, 0);
      ch.playThanks();
      ch.startSatchelHug();
      announce(`${this.entry!.def.name} gave you a flower.`);
      window.setTimeout(() => {
        if (this.gift) this.gift.visible = false;
      }, 1400);
      this.gift = null; // done — next beat won't re-enter
      this.beatT = 99; // finish the reaction early on warmth
    }
  }

  private finish(): void {
    const ch = this.ch;
    this.entry!.fx.set(0, 0, 0);
    ch.group.position.z = 0;
    this.follow.setDolly(1);
    recordDelivery();
    markVisited(this.npcId);
    if (this.meaningful) {
      // Postcard souvenir: animated capture window (postcard.ts)
      let location = 'Bharat';
      let locationHi = '';
      planeFromSphere(this.npcObj!.position, _v);
      for (const z of Object.values(BIOME_ZONES)) {
        latLonToDir(z.lat, z.lon, _v2);
        if (flatDist(_v, _v2) < radToWorld(z.radiusRad)) {
          location = z.name;
          locationHi = z.nameHi;
          break;
        }
      }
      offerPostcard({
        location,
        locationHi,
        recipient: this.entry!.def.name,
        caption: CAPTION[this.personality],
      });
      announce('Press C to capture this moment as a postcard.', true);
    }
    this.active = false;
    this.beat = 'done';
    this.npcObj = null;
    this.entry = null;
    if (this.onFinish) this.onFinish();
  }
}
