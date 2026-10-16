import * as THREE from 'three';
import './style.css';
import { PLANET_RADIUS, terrainHeight, buildPlanet } from './planet';
import { buildScenery, updateScenery } from './scenery';
import { buildSketchSky, PAL } from './sketch';
import { Player } from './player';
import { FollowCamera } from './camera';
import { Input } from './input';
import { buildNPCs, updateNPCs, nearestNPC, nearestNPCObject, getNPCEntry, type Placed } from './npcs';
import { buildBiomes, BIOME_CENTERS, BIOME_ZONES } from './biomes/registry';
import { showTitle, isTitleUp } from './title';
import { latLonToDir, planeFromSphere } from './biomes/geo';
import { startDialogue, isDialogueOpen, closeDialogue, setDeliverHandler, setAcceptHandler } from './dialogue';
import {
  canAcceptFrom,
  canDeliverTo,
  acceptLetter,
  completeDelivery,
  getCarried,
} from './delivery';
import { settings, saveSettings } from './settings';
import { initAudio, setMusicMuted, setSfxMuted } from './audio';
import { startMusic, setMusicMutedGen } from './music';

// First pointer/touch also unlocks audio (mobile players may never press a key)
window.addEventListener('pointerdown', () => startMusic(), { once: false });
import { initA11y, announce } from './a11y';
import { OUTFITS, type OutfitId } from './character';
import { DeliveryDirector, updateBursts } from './ceremony';
import {
  postcardPending,
  setFraming,
  getFraming,
  clearPostcardOffer,
  capturePostcard,
  showPostcardCard,
  type PostcardInfo,
} from './postcard';
import { wavesFirst, isVisited } from './arc';
import { KidTutorial, isTutorialDone } from './tutorial';
import { buildProgressHUD, recordDelivery, showStickerEarned, updateProgressHUD } from './progress';
import { Multiplayer } from './multiplayer';
import { showLogin, showChatPicker } from './login';
import { buildRoads } from './roads';

// Multiplayer instance (null = solo mode)
let mp: Multiplayer | null = null;

// Chat button (only in multiplayer mode)
function buildChatButton(): void {
  if (document.getElementById('chat-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'chat-btn';
  btn.textContent = '💬';
  btn.title = 'Say something!';
  btn.style.cssText = `
    position: fixed; bottom: 180px; right: 18px; z-index: 6;
    width: 64px; height: 64px; border-radius: 50%;
    font-size: 28px; background: #fffdf6;
    border: 3px solid #2b2620;
    box-shadow: 3px 3px 0 rgba(43,38,32,0.2);
    cursor: pointer;
  `;
  btn.onclick = () => {
    if (mp) showChatPicker(mp.getPhrases(), (phrase) => mp?.sendChat(phrase));
  };
  document.body.appendChild(btn);
}

function isCoarsePointer(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/**
 * Detect weak GPUs for potato mode (Grok perf fix).
 * Heuristics: mobile + low deviceMemory + weak GPU strings.
 */
function detectPotatoMode(): boolean {
  // URL override for testing: ?potato=1 or ?potato=0
  const p = new URLSearchParams(window.location.search).get('potato');
  if (p === '1') return true;
  if (p === '0') return false;

  const nav = navigator as Navigator & { deviceMemory?: number };
  // Low memory devices
  if (nav.deviceMemory && nav.deviceMemory <= 4) return true;
  // Coarse pointer + small screen = likely budget phone
  if (isCoarsePointer() && window.screen.width < 400) return true;
  return false;
}

/**
 * Zone streaming: hide biome groups far from player (Grok perf fix).
 * Only the current + neighboring zones stay visible.
 * Called every 30 frames to avoid per-frame overhead.
 */
function updateZoneStreaming(): void {
  if (!player || biomeGroups.length === 0) return;
  const px = player.group.position.x;
  const pz = player.group.position.z;

  for (const bg of biomeGroups) {
    const d = Math.hypot(px - bg.center.x, pz - bg.center.z);
    // Visible if within zone radius + generous margin (14 units)
    // This keeps current zone + adjacent zones live, hides the rest
    const visible = d < bg.radius * PLANET_RADIUS + 14;
    if (bg.group.visible !== visible) {
      bg.group.visible = visible;
    }
  }
}

const app = document.getElementById('app');
if (!app) throw new Error('#app element missing');
const appEl: HTMLElement = app; // narrowed for use inside init()

/** Honest staged loading: the bar advances on REAL init milestones. */
const loadingEl = document.getElementById('loading')!;
const fillEl = loadingEl.querySelector('.fill') as HTMLElement;
const statusEl = loadingEl.querySelector('.status') as HTMLElement;
function milestone(pct: number, text: string): void {
  fillEl.style.width = `${pct}%`;
  statusEl.textContent = text;
  // Synchronous (2026-10-14): async milestone was hanging in headless browsers.
  // The DOM updates synchronously; no need to wait.
}

// Set once: ?stats=1 enables the draw-call QA hook; ?demo=N auto-walks N seconds.
const PARAMS = (() => {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
})();
const STATS = PARAMS.has('stats');
const DEMO_SECS = Math.max(0, Number(PARAMS.get('demo') ?? '0') || 0);

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let follow: FollowCamera;
let input: Input;
let player: Player;
let director: DeliveryDirector;
let tutorial: KidTutorial | null = null;
let updateBiomes: (dt: number, t: number) => void;
let biomeGroups: Array<{ id: string; group: THREE.Group; center: THREE.Vector3; radius: number }> = [];
let potatoMode = false;
let viewCenter: THREE.Vector3 | null = null;

let paused = false;
let frames = 0;
let demoTime = 0;
let currentZoneId: string | null = null;
// postcard living-loop capture: C starts a 2.5s countdown, then we capture
let captureInfo: PostcardInfo | null = null;
let captureFrame = -1;
// hold-Space skip on the ceremony (Copilot's skip test, shipped)
let skipHold = 0;
// familiar-NPC "wave first" greetings currently animating
const greetings: Array<{ entry: Placed; t: number }> = [];
const clock = new THREE.Clock();

const _camDir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _up = new THREE.Vector3();
const _planeTmp = new THREE.Vector3();
const _tutorialSpawn = new THREE.Vector3();

// ---------- pause ----------
const pauseEl = document.getElementById('pause')!;
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
const resumeBtn = document.getElementById('resume-btn') as HTMLButtonElement;

// ---------- talk prompt ----------
let talkPrompt: HTMLDivElement | null = null;
function ensureTalkPrompt(): void {
  if (talkPrompt) return;
  talkPrompt = document.createElement('div');
  talkPrompt.id = 'talk-prompt';
  talkPrompt.style.cssText =
    'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);' +
    'background:rgba(30,26,20,0.9);color:#fdf6e3;border:2px solid #e8a33d;' +
    'border-radius:12px;padding:10px 18px;font:600 15px system-ui;z-index:25;' +
    'display:none;pointer-events:none;white-space:nowrap;';
  talkPrompt.innerHTML =
    '💬 <span id="talk-name"></span> — ' +
    (window.matchMedia('(pointer: coarse)').matches
      ? 'tap them or the button!'
      : '<b>E</b> to talk');
  document.body.appendChild(talkPrompt);
}

// ---------- carried letter indicator ----------
let carriedEl: HTMLDivElement | null = null;
function ensureCarriedIndicator(): void {
  if (carriedEl) return;
  carriedEl = document.createElement('div');
  carriedEl.id = 'carried-letter';
  carriedEl.style.cssText =
    'position:fixed;top:14px;left:50%;transform:translateX(-50%);' +
    'background:rgba(30,26,20,0.92);color:#fdf6e3;border:2px solid #7fb069;' +
    'border-radius:12px;padding:8px 16px;font:600 14px system-ui;z-index:25;' +
    'display:none;pointer-events:none;white-space:nowrap;';
  document.body.appendChild(carriedEl);
}

function updateCarriedIndicator(): void {
  ensureCarriedIndicator();
  const letter = getCarried();
  if (!carriedEl) return;
  if (letter) {
    carriedEl.style.display = 'block';
    carriedEl.innerHTML = `✉️ Carrying letter for <b>${letter.toName}</b> · ${letter.toNameHi}`;
  } else {
    carriedEl.style.display = 'none';
  }
}

function updateTalkPrompt(): void {
  if (!talkPrompt || !player) return;
  // Match the E-talk range (2.6) so the prompt only shows when E will work.
  const npc = nearestNPC(player.group.position, 2.6);
  if (npc && !isDialogueOpen() && !director?.active) {
    talkPrompt.style.display = 'block';
    const nameEl = talkPrompt.querySelector('#talk-name');
    if (nameEl) nameEl.textContent = npc.name;
  } else {
    talkPrompt.style.display = 'none';
  }
}

function setPaused(p: boolean): void {
  if (paused === p) return;
  paused = p;
  pauseEl.hidden = !p;
  pauseBtn.textContent = p ? '▶' : '⏸';
  pauseBtn.setAttribute('aria-label', p ? 'Resume game' : 'Pause game');
  if (!p) {
    clock.getDelta(); // flush the hidden-tab gap: no physics spike on return
    announce('Game resumed.');
  } else {
    announce('Game paused.');
  }
}

function wirePauseUI(): void {
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  resumeBtn.addEventListener('click', () => setPaused(false));
  const reduced = document.getElementById('set-reduced') as HTMLInputElement;
  const music = document.getElementById('set-music') as HTMLInputElement;
  const sfx = document.getElementById('set-sfx') as HTMLInputElement;
  reduced.checked = settings.reducedMotion;
  music.checked = settings.musicMuted;
  sfx.checked = settings.sfxMuted;
  reduced.addEventListener('change', () => {
    settings.reducedMotion = reduced.checked;
    saveSettings();
    announce(
      reduced.checked ? 'Reduced motion on.' : 'Reduced motion off.',
      true,
    );
  });
  music.addEventListener('change', () => {
    setMusicMuted(music.checked);
    setMusicMutedGen(music.checked);
  });
  sfx.addEventListener('change', () => setSfxMuted(sfx.checked));
  // Outfit picker (dress change)
  const outfitBtns = {
    postal: document.getElementById('outfit-postal') as HTMLButtonElement,
    festive: document.getElementById('outfit-festive') as HTMLButtonElement,
    modern: document.getElementById('outfit-modern') as HTMLButtonElement,
  };
  const refreshOutfitBtns = () => {
    for (const [id, btn] of Object.entries(outfitBtns)) {
      btn.classList.toggle('active', player.outfit === id);
    }
  };
  for (const [id, btn] of Object.entries(outfitBtns)) {
    btn.addEventListener('click', () => {
      player.setOutfit(id as OutfitId);
      refreshOutfitBtns();
      const of = OUTFITS[id as OutfitId];
      announce(`Outfit changed: ${of.name} (${of.nameHi}).`, true);
    });
  }
  refreshOutfitBtns();
}

window.addEventListener('keydown', (e) => {
  startMusic(); // first gesture unlocks Web Audio (autoplay policy)
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (isDialogueOpen()) {
      closeDialogue();
      return;
    }
    if (!e.repeat) setPaused(!paused);
    return;
  }
  if (e.code === 'KeyC' && !e.repeat && !paused) {
    if (!player || !director) return;
    const pending = postcardPending();
    if (pending && !director.active) {
      // 2.5s living loop — the scene keeps animating — then the capture settles
      captureInfo = pending;
      captureFrame = frames + 150;
      clearPostcardOffer();
      const f = getFraming();
      follow.setDolly(f === 'close' ? 0.6 : f === 'wide' ? 1.6 : 1.0);
      announce('Capturing this moment… keep waving!', true);
    } else if (!director.active) {
      // No postcard moment pending — tell the player how to unlock one.
      announce('Deliver a letter to unlock a postcard moment, then press C!', true);
    }
    return;
  }
  if (!e.repeat && !paused && !director.active) {
    if (e.code === 'Digit1') {
      setFraming('close');
      return;
    }
    if (e.code === 'Digit2') {
      setFraming('wide');
      return;
    }
    if (e.code === 'Digit3') {
      setFraming('both');
      return;
    }
  }
  if (e.code !== 'KeyE' || e.repeat) return;
  tryInteract();
});

/** Shared talk/accept/deliver interaction — E key, action button, and tap all route here. */
function tryInteract(): void {
  if (isDialogueOpen()) return; // dialogue.ts advances on E itself
  if (!player || !director || paused || director.active) return;
  const npc = nearestNPC(player.group.position, 2.6);
  if (npc) {
    // Tutorial: player met an NPC
    if (tutorial) tutorial.metNPC();
    const npcObj = nearestNPCObject(player.group.position, 2.6);
    // Delivery flow: accept from sender, or deliver to the addressed recipient.
    // The buttons only appear when the action is valid for this NPC.
    if (canDeliverTo(npc.id) && npcObj) {
      setDeliverHandler(() => {
        clearPostcardOffer();
        const letter = completeDelivery(npc.id);
        // Tutorial: player delivered a letter
        if (tutorial) tutorial.deliveredLetter();
        director.start(npcObj, npc.id, letter?.toName);
      });
      setAcceptHandler(null);
    } else if (canAcceptFrom(npc.id)) {
      setDeliverHandler(null);
      setAcceptHandler(() => {
        const letter = acceptLetter(npc.id);
        if (letter) {
          announce(`Letter accepted for ${letter.toName}. Find them to deliver it.`);
          updateCarriedIndicator();
          // Tutorial: player accepted a letter
          if (tutorial) tutorial.acceptedLetter();
        }
      });
    } else {
      setDeliverHandler(null);
      setAcceptHandler(null);
    }
    // defer past this keydown dispatch so dialogue's own E handler (registered
    // earlier) doesn't immediately consume the opening press as an advance.
    window.setTimeout(() => startDialogue(npc), 0);
  }
}

// ---------- touch-first: ONE big context action button (Copilot UX verdict) ----------
let actionBtn: HTMLButtonElement | null = null;
/** Current context for the action button: talk / accept / deliver / hop. */
function actionContext(): 'talk' | 'accept' | 'deliver' | 'hop' {
  if (!player || isDialogueOpen() || paused || (director && director.active))
    return 'hop';
  const npc = nearestNPC(player.group.position, 2.6);
  if (!npc) return 'hop';
  if (canDeliverTo(npc.id)) return 'deliver';
  if (canAcceptFrom(npc.id)) return 'accept';
  return 'talk';
}

const ACTION_META = {
  talk: { icon: '💬', label: 'Talk' },
  accept: { icon: '📩', label: 'Accept letter' },
  deliver: { icon: '📬', label: 'Deliver' },
  hop: { icon: '🐇', label: 'Hop' },
} as const;

function wireTouchActionButton(): void {
  if (actionBtn) return;
  actionBtn = document.createElement('button');
  actionBtn.id = 'action-btn';
  actionBtn.type = 'button';
  // 72dp touch target, bottom-right, thumb-reachable. Always visible on touch.
  actionBtn.style.cssText =
    'position:fixed;right:18px;bottom:26px;width:72px;height:72px;' +
    'border-radius:50%;border:3px solid rgba(255,255,255,0.85);' +
    'background:radial-gradient(circle at 35% 30%, #ffd98a, #e8a33d);' +
    'font-size:32px;z-index:30;box-shadow:0 4px 14px rgba(0,0,0,0.35);' +
    'touch-action:manipulation;';
  actionBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    const ctx = actionContext();
    if (ctx === 'hop') {
      if (player && !paused && !(director && director.active)) player.tryJump();
    } else {
      tryInteract();
    }
  });
  document.body.appendChild(actionBtn);
}

function updateActionButton(): void {
  if (!actionBtn) return;
  const ctx = actionContext();
  const meta = ACTION_META[ctx];
  if (actionBtn.dataset.ctx !== ctx) {
    actionBtn.dataset.ctx = ctx;
    actionBtn.textContent = meta.icon;
    actionBtn.setAttribute('aria-label', meta.label);
  }
  // Hide while chatting or during the ceremony — the dialogue UI owns the screen.
  const hidden =
    isDialogueOpen() || paused || (director ? director.active : false);
  actionBtn.style.display = hidden ? 'none' : 'block';
}

// ---------- visible music toggle (original-Messenger: music-note button) ----------
let musicBtn: HTMLButtonElement | null = null;
function wireMusicToggle(): void {
  if (musicBtn) return;
  musicBtn = document.createElement('button');
  musicBtn.id = 'music-btn';
  musicBtn.type = 'button';
  musicBtn.setAttribute('aria-label', 'Toggle music');
  musicBtn.style.cssText =
    'position:fixed;top:76px;right:12px;z-index:15;width:52px;height:52px;' +
    'border-radius:16px;border:3px solid #2b2620;background:rgba(255,253,246,0.95);' +
    'font-size:22px;cursor:pointer;box-shadow:3px 3px 0 rgba(43,38,32,0.2);' +
    'touch-action:manipulation;';
  const refresh = () => {
    if (!musicBtn) return;
    musicBtn.textContent = settings.musicMuted ? '🔇' : '🎵';
    musicBtn.style.opacity = settings.musicMuted ? '0.6' : '1';
  };
  musicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settings.musicMuted = !settings.musicMuted;
    saveSettings();
    setMusicMuted(settings.musicMuted);
    setMusicMutedGen(settings.musicMuted);
    if (!settings.musicMuted) startMusic();
    refresh();
    announce(settings.musicMuted ? 'Music off.' : 'Music on.');
  });
  document.body.appendChild(musicBtn);
  refresh();
}

// ---------- touch-first: tap the world to interact ----------
const _tapRay = new THREE.Raycaster();
const _tapNDC = new THREE.Vector2();
const _lookV = new THREE.Vector3();

/** Head look-at: glance toward the nearest NPC within 6 units (alive rule #4). */
function updateHeadLook(): void {
  if (!player) {
    return;
  }
  player.lookYaw = undefined;
  if (isDialogueOpen() || paused || (director && director.active)) return;
  const npcObj = nearestNPCObject(player.group.position, 6);
  if (!npcObj) return;
  _lookV.setFromMatrixPosition(npcObj.matrixWorld).sub(player.group.position);
  if (_lookV.lengthSq() < 0.04) return; // too close to matter
  // world yaw of the direction to the NPC (character front = -Z)
  const worldYaw = Math.atan2(-_lookV.x, -_lookV.z);
  let local = worldYaw - player.group.rotation.y;
  while (local > Math.PI) local -= Math.PI * 2;
  while (local < -Math.PI) local += Math.PI * 2;
  // only glance if roughly ahead (±70°) — no Exorcist spins
  if (Math.abs(local) < 1.22) player.lookYaw = local;
}

function wireTapToInteract(): void {
  if (!input) return;
  input.onTapWorld = (clientX, clientY) => {

    if (!player || !camera || isDialogueOpen() || paused) return;
    if (director && director.active) return;
    _tapNDC.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    _tapRay.setFromCamera(_tapNDC, camera);
    // Raycast against NPC hit-proxies; talk if the tapped NPC is in range.
    const npcObj = nearestNPCObject(player.group.position, 3.2);
    if (npcObj) {
      const hits = _tapRay.intersectObject(npcObj, true);
      if (hits.length > 0) {
        tryInteract();
        return;
      }
    }
  };
}

// Auto-pause when the tab hides (accessibility checklist).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/** Familiar NPCs wave FIRST when you return ("remembered wave"). */
function updateGreetings(dt: number): void {
  for (let i = greetings.length - 1; i >= 0; i--) {
    const g = greetings[i];
    g.t += dt;
    const k = g.t / 1.2;
    if (k >= 1) {
      g.entry.fx.set(0, 0, 0);
      greetings.splice(i, 1);
    } else {
      g.entry.fx
        .set(0, 1, 0)
        .multiplyScalar(Math.abs(Math.sin(k * Math.PI * 3)) * 0.16);
    }
  }
}

/** "You entered: …" announcements for screen readers (+ toast). */
function checkZoneAnnounce(): void {
  planeFromSphere(player.group.position, _planeTmp);
  const px = _planeTmp.x;
  const pz = _planeTmp.z;
  let found: string | null = null;
  for (const [id, z] of Object.entries(BIOME_ZONES)) {
    _up.copy(latLonToDir(z.lat, z.lon));
    if (Math.hypot(px - _up.x, pz - _up.z) < z.radiusRad * PLANET_RADIUS) {
      found = id;
      break;
    }
  }
  if (found !== currentZoneId) {
    currentZoneId = found;
    if (found) {
      const z = BIOME_ZONES[found];
      announce(`You entered: ${z.name}`, true);
      // Act II+: she waves first on entering a new place
      if (wavesFirst() && !director.active) player.character.playWave();
      // remembered wave: familiar neighbours wave first on return visits
      const near = nearestNPC(player.group.position, 6);
      if (near && isVisited(near.id) && !director.active) {
        const obj = nearestNPCObject(player.group.position, 6);
        const entry = obj ? getNPCEntry(obj) : null;
        if (entry && !greetings.some((g) => g.entry === entry)) {
          greetings.push({ entry, t: 0 });
          announce(`${near.name} waves at you!`, true);
        }
      }
    }
  }
}

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // Title screen: slow orbit around the tiny planet behind the title card.
  if (isTitleUp()) {
    const ang = t * 0.12;
    const r = 95;
    camera.position.set(Math.cos(ang) * r, 42, Math.sin(ang) * r);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    updateScenery(dt, settings.reducedMotion);
    updateBiomes(dt, t);
    renderer.render(scene, camera);
    return;
  }

  // Multiplayer: smooth remote player interpolation
  if (mp) mp.update(dt);

  if (!paused) {
    if (director.active) {
      // hold Space to skip the ceremony (Copilot's skip test, shipped)
      if (input.isSpaceHeld()) {
        skipHold += dt;
        if (skipHold > 0.5) {
          director.skip();
          skipHold = 0;
        }
      } else {
        skipHold = 0;
      }
      director.update(dt);
      player.update(dt, _wish.set(0, 0, 0), camera);
    } else if (isDialogueOpen()) {
      input.consumeJump(); // discard hops queued while chatting
      player.update(dt, _wish.set(0, 0, 0), camera); // idle life continues
    } else {
      // Camera is fully automatic — no manual look (touch-first UX verdict).
      const mv = input.moveVec();
      if (input.consumeJump()) player.tryJump();

      // camera-relative movement basis on the flat ground plane
      // (flat world: up is always +Y, not the old spherical radial)
      _up.set(0, 1, 0);
      player.up(_up);
      camera.getWorldDirection(_camDir);
      _fwd.copy(_camDir).addScaledVector(_up, -_camDir.dot(_up));
      if (_fwd.lengthSq() < 1e-6) player.facingDir(_fwd);
      _fwd.normalize();
      _right.crossVectors(_fwd, _up).normalize();
      // A/D strafe is 1.5x faster (Nitesh: "make A and D more rapid")
      _wish.copy(_fwd).multiplyScalar(mv.y).addScaledVector(_right, mv.x * 1.5);

      // QA demo mode: auto-walk forward along the facing direction.
      if (DEMO_SECS > 0 && demoTime < DEMO_SECS) {
        player.facingDir(_wish);
        demoTime += dt;
      }

      player.update(dt, _wish, camera);
    }
    updateGreetings(dt);
    updateBursts(dt);

    follow.update(dt, player, settings.reducedMotion);
    if (viewCenter) {
      // QA establishing shot: park the camera above/outside the biome, looking in.
      camera.position.set(viewCenter.x, 22, viewCenter.z + 26);
      camera.lookAt(viewCenter.x, 0, viewCenter.z);
    }
    updateNPCs(t, settings.reducedMotion);
    updateScenery(dt, settings.reducedMotion);
    updateBiomes(dt, t);

    // Kid tutorial update
    if (tutorial) {
      tutorial.update(dt, t);
      // Auto-advance move phase when player has walked a bit
      if (tutorial.getPhase() === 'move') {
        // Track distance from spawn — if moved >3m, advance
        const spawnDist = player.group.position.distanceTo(_tutorialSpawn);
        if (spawnDist > 3) tutorial.reachedMoveTarget();
      }
    }

    // Zone streaming: hide far biomes (every 30 frames)
    if (frames % 30 === 0) {
      updateZoneStreaming();
      checkZoneAnnounce();
    }
  }

  updateTalkPrompt();
  updateActionButton();
  updateHeadLook();
  renderer.render(scene, camera);
  frames++;

  // Postcard living-loop capture settles here — synchronously after render.
  if (captureInfo && frames >= captureFrame) {
    const url = capturePostcard(renderer, captureInfo);
    follow.setDolly(1);
    if (url) showPostcardCard(url, captureInfo);
    else announce('Postcard capture failed — sorry!', true);
    captureInfo = null;
    captureFrame = -1;
  }

  // Audio is lazy: Howler loads only after the first frame renders.
  if (frames === 1) void initAudio();

  // QA hook: ?stats=1 writes draw calls + triangles into <title> every 120 frames.
  if (STATS && frames % 120 === 0) {
    const info = renderer.info.render;
    document.title = `calls:${info.calls} tris:${info.triangles}`;
  }

  if (frames === 12) {
    loadingEl.classList.add('done');
    window.setTimeout(() => loadingEl.remove(), 900);
  }
}

// Surface boot errors on the loading screen (debug aid — never silent).
function showBootError(msg: string): void {
  const card = document.querySelector('#loading .card');
  if (card) {
    const el = card.querySelector('.status') as HTMLElement | null;
    if (el) {
      el.textContent = 'Error: ' + msg;
      el.style.color = '#a00';
    }
  }
}
window.addEventListener('error', (e) => showBootError(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) =>
  showBootError(e.reason?.message || String(e.reason)),
);

async function init(): Promise<void> {
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isCoarsePointer(), // DeepSeek: no AA on mobile
      powerPreference: 'high-performance',
    });
  } catch {
    loadingEl.innerHTML = '<p>WebGL is not available on this device.</p>';
    throw new Error('webgl-unavailable');
  }

  // De-risk: cap pixel ratio, no shadows, no external textures.
  // Grok perf budget: 0.75–1.0 on low-end (coarse pointers start at 1.0).
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, isCoarsePointer() ? 1.0 : 1.5),
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  appEl.appendChild(renderer.domElement);
  // Ensure canvas can receive keyboard focus (WASD fix)
  renderer.domElement.tabIndex = 0;
  renderer.domElement.style.outline = 'none';
  // Click canvas to focus it for keyboard input
  renderer.domElement.addEventListener('pointerdown', () => {
    renderer.domElement.focus({ preventScroll: true });
  });
  // Auto-focus on load + refocus on any keydown (WASD reliability)
  renderer.domElement.focus({ preventScroll: true });
  window.addEventListener('keydown', () => {
    if (document.activeElement !== renderer.domElement) {
      renderer.domElement.focus({ preventScroll: true });
    }
  });
  milestone(12, 'Waking up the tiny planet…');

  scene = new THREE.Scene();
  scene.add(buildSketchSky()); // flat turquoise sketchbook dome (fog:false)
  scene.fog = new THREE.Fog(PAL.skyHorizon, 45, 120);

  // Sketchbook lighting: bright flat midday, strong ambient wraparound,
  // gentle sun — no harsh shadows. Matches the Messenger "living sketchbook" feel.
  scene.add(new THREE.HemisphereLight(0xe8fbff, 0xc9a86a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sun.position.set(30, 40, 14);
  scene.add(sun);
  milestone(28, 'Raising mountains and seas…');

  scene.add(buildPlanet());
  buildScenery(scene);
  milestone(48, 'Planting the seven corners of Bharat…');

  // All 7 biomes + their NPCs.
  const built = buildBiomes(scene);
  updateBiomes = built.update;
  biomeGroups = built.biomeGroups;

  // Roads connecting landmarks (DeepSeek scenic specs)
  buildRoads(scene);

  // Detect weak GPUs → potato mode (Grok perf fix)
  potatoMode = detectPotatoMode();
  if (potatoMode) {
    renderer.setPixelRatio(1.0);
    console.log('[perf] Potato mode enabled: pixelRatio=1.0, reduced effects');
  }
  milestone(72, 'Waking the neighbours…');

  buildNPCs(scene, built.npcDefs);
  player = new Player(scene);
  milestone(88, 'Packing the mailbag…');

  // Debug/QA: ?biome=<id> drops the player at that biome's zone center.
  // ?view=<id> frames the whole biome from outside (establishing shot).
  const want = PARAMS.get('biome');
  if (want && BIOME_CENTERS[want]) {
    const c = BIOME_CENTERS[want];
    const p = latLonToDir(c.lat, c.lon);
    player.group.position.set(p.x, terrainHeight(p) + 0.05, p.z);
  }
  const view = PARAMS.get('view');
  if (view && BIOME_CENTERS[view]) {
    const c = BIOME_CENTERS[view];
    viewCenter = latLonToDir(c.lat, c.lon);
  }

  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    400,
  );
  follow = new FollowCamera(camera);
  input = new Input(renderer.domElement);
  wireTouchActionButton();
  wireTapToInteract();
  wireMusicToggle();
  director = new DeliveryDirector(player, follow, scene);
  director.onFinish = () => {
    updateCarriedIndicator();
    announce('Delivery complete!');
    // Progress loop: record delivery, award stickers
    const newStickers = recordDelivery();
    for (const s of newStickers) {
      setTimeout(() => showStickerEarned(s), 800);
    }
  };
  initA11y();
  wirePauseUI();
  ensureTalkPrompt();
  buildProgressHUD();

  // --- Multiplayer: show login after a short delay (let world load first) ---
  setTimeout(() => {
    // Skip if ?solo=1
    if (new URLSearchParams(window.location.search).get('solo') === '1') return;
    showLogin((info, serverUrl) => {
      mp = new Multiplayer(scene);
      mp.onError = (msg) => announce(msg);
      mp.onJoin = (name, room) => {
        announce(`Welcome, ${name}! Room: ${room}`);
        buildChatButton();
      };
      mp.onChat = (name, phrase) => {
        // Show in a small toast
        announce(`${name}: ${phrase}`);
      };
      mp.connect(serverUrl, info.name, info.room, info.color, () => {
        // Return player position for sync
        const p = player.group.position;
        return { x: p.x, y: p.y, z: p.z, rot: player.group.rotation.y };
      });
      // Give camera to multiplayer for chat bubbles
      (scene as any).userData.camera = camera;
    });
  }, 2000);

  // QA: expose scene/camera for object identification (?debug or ?stats).
  if (PARAMS.has('debug') || PARAMS.has('stats')) {
    (window as unknown as Record<string, unknown>).__scene = scene;
    (window as unknown as Record<string, unknown>).__camera = camera;
    (window as unknown as Record<string, unknown>).__three = THREE;
  }

  // QA: ?deliver=1 auto-starts the ceremony with the nearest NPC after 2.5s.
  if (PARAMS.has('deliver')) {
    window.setTimeout(() => {
      if (director.active) return;
      const npc = nearestNPC(player.group.position, 9);
      const obj = npc && nearestNPCObject(player.group.position, 9);
      if (npc && obj) director.start(obj, npc.id);
    }, 2500);
  }

  milestone(100, 'Ready — namaste!');

  // Kid tutorial: 60-second guided first delivery (skip if done before)
  if (!isTutorialDone() && !PARAMS.has('notutorial')) {
    _tutorialSpawn.copy(player.group.position);
    tutorial = new KidTutorial(scene, {
      getPlayerPos: () => player.group.position,
      getPlayerYaw: () => player.yaw(),
      onPhaseChange: (phase) => {
        // Phase-specific setup can go here
        console.log('[tutorial] phase:', phase);
      },
      onComplete: () => {
        tutorial = null;
        announce('Tutorial complete! Explore freely!');
      },
    });
  }

  // Title screen (reference: planet + BEGIN). Gameplay starts on tap.
  // Skip with ?notitle=1 for QA.
  if (!PARAMS.has('notitle')) {
    void showTitle();
  }

  animate();
}

void init();
