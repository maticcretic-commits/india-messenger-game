import * as THREE from 'three';
import { PLANET_RADIUS, terrainHeight } from './planet';
import { speedMultiplierAt } from './biomes/registry';
import { settings } from './settings';
import { createPostwoman, type Postwoman, type OutfitId, OUTFITS } from './character';
import { walkBounceAmp } from './arc';
import { latLonToDir, surfacePos, surfaceQuat } from './biomes/geo';
import { resolveCollision } from './collision';

const SPEED = 4.6;
const HOVER = 0.05; // capsule feet sit ~0.07 above group origin; keep group near the surface
const GRAVITY = 26;
const JUMP_VELOCITY = 8.5;

// Movement research (2026-10-14) tunables — kinematic controller, no physics engine.
// TINY PLANET: gameplay integrates in the 2D lon/lat plane (x=lon, z=-lat);
// rendering maps plane -> sphere. "Up" is the sphere normal at the player.
const STEP_H = 0.35; // max Quake-style step-up height (world units; player ~1.7 tall)
const SLOPE_LIMIT_DEG = 50; // steeper than this: no climbing, gentle slide
const SLIDE_SPEED = 1.5; // cozy-game slide on too-steep slopes (units/s)
const COYOTE_TIME = 0.1; // grace to jump just after leaving a ledge
const JUMP_BUFFER = 0.12; // jump pressed just before landing fires on touchdown
const GRAD_EPS = 0.35; // terrain-gradient sample distance for slope math
const NUDGE = 0.15; // corner-correction lateral retry distance

const UP_Y = new THREE.Vector3(0, 1, 0);
const _wish2 = new THREE.Vector3(); // flattened wish (XZ)
const _tangent = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _hv = new THREE.Vector3();
const _hd = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _eastW = new THREE.Vector3();
const _northW = new THREE.Vector3();
const _planePos = new THREE.Vector3(); // 2D gameplay coords (x=lon, z=-lat)
const _upVec = new THREE.Vector3();
const _fwdVec = new THREE.Vector3();
const _rightVec = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _basisM = new THREE.Matrix4();

function dampRate(fast: boolean): number {
  return fast ? 18 : 7; // T1: snap up fast onto stairs, ease down slowly off ledges
}

/** Terrain height at an XZ point (scratch-vector friendly). */
function groundAt(x: number, z: number): number {
  _probe.set(x, 0, z);
  return terrainHeight(_probe);
}

/**
 * Kinematic TINY-PLANET character controller — NO physics engine.
 * Gameplay integrates in the 2D lon/lat plane (x=lon, z=-lat) with damped
 * ground following, step-up, slope limit + slide, speed zones, and
 * coyote time / jump buffer. Rendering maps the plane position onto the
 * sphere each frame; "up" is the sphere normal.
 *
 * The visible body is the rigged postwoman (character.ts): the controller
 * feeds it speed/accel/turn each frame; the mixer timeScale follows velocity.
 */
export class Player {
  readonly group = new THREE.Group();
  character: Postwoman;
  outfit: OutfitId = 'postal';
  /** Head-local yaw for the character to glance toward; set by main.ts. */
  lookYaw: number | undefined = undefined;
  private facing = new THREE.Vector3(1, 0, 0); // plane direction, y=0
  /** 2D gameplay position (x=lonDeg, z=-latDeg). Rendered on the sphere. */
  private coord = new THREE.Vector3();
  private verticalVel = 0;
  private jumpOffset = 0;
  private grounded = true;

  // T1: smoothed ground height that chases the terrain (persists across frames).
  private smoothGroundY: number;
  // T4: smoothed combined speed multiplier (slope × zone).
  private speedMult = 1;
  // T5: grace timers.
  private coyoteTimer = 0;
  private bufferTimer = 0;
  private wasSupported = true;

  // character animation metrics
  private readonly prevPos = new THREE.Vector3();
  private readonly prevFacing = new THREE.Vector3(1, 0, 0);
  private speedSmooth = 0;
  private accelSmooth = 0;
  private turnSmooth = 0;
  private forceMoving = false;
  private wasGroundedAnim = true;

  constructor(scene: THREE.Scene) {
    // The rigged postwoman (22 bones, ~1.7k tris, 1 draw call).
    this.character = createPostwoman();
    this.group.add(this.character.group);

    // Spawn at the Himalayan village post office (72.05°N, 2.8°E) —
    // the player starts where the roads and buildings are.
    const p0 = latLonToDir(72.05, 2.8);
    this.coord.set(p0.x, 0, p0.z);
    this.smoothGroundY = groundAt(p0.x, p0.z) + HOVER;
    this.syncTransform();
    this.prevPos.copy(this.group.position);
    this.prevFacing.copy(this.facing);
    scene.add(this.group);
  }

  /** Tiny planet: up is the sphere normal at the player's position. */
  up(out = new THREE.Vector3()): THREE.Vector3 {
    _planePos.set(this.coord.x, 0, this.coord.z);
    const latR = (-_planePos.z) * (Math.PI / 180);
    const lonR = _planePos.x * (Math.PI / 180);
    const cosLat = Math.cos(latR);
    return out.set(
      cosLat * Math.sin(lonR),
      Math.sin(latR),
      -cosLat * Math.cos(lonR),
    );
  }

  /** Push the 2D gameplay coord onto the sphere (position + orientation). */
  private syncTransform(): void {
    _planePos.set(this.coord.x, 0, this.coord.z);
    surfacePos(_planePos, this.smoothGroundY + this.jumpOffset, this.group.position);
    // Orient: +Y -> sphere normal, local -Z -> facing (tangent).
    this.up(_upVec);
    _fwdVec.copy(this.facing);
    // facing is in plane space; project onto the tangent plane
    _fwdVec.addScaledVector(_upVec, -_fwdVec.dot(_upVec));
    if (_fwdVec.lengthSq() < 1e-8) _fwdVec.set(0, 0, -1).addScaledVector(_upVec, _upVec.z);
    _fwdVec.normalize();
    _zAxis.copy(_fwdVec).negate(); // local -Z = forward
    _rightVec.crossVectors(_upVec, _zAxis).normalize();
    // re-orthogonalize z against x/y
    _zAxis.crossVectors(_rightVec, _upVec).normalize();
    _basisM.makeBasis(_rightVec, _upVec, _zAxis);
    this.group.quaternion.setFromRotationMatrix(_basisM);
  }

  facingDir(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.facing);
  }

  /** Yaw angle matching the current facing (for markers, etc.). */
  yaw(): number {
    return Math.atan2(-this.facing.x, -this.facing.z);
  }

  /** Camera anchor: a point just above the player's head. */
  headAnchor(out = new THREE.Vector3()): THREE.Vector3 {
    this.up(_upVec);
    return out.copy(this.group.position).addScaledVector(_upVec, 1.5);
  }

  /** Instantly face a world position (ceremony staging; short blend in anim). */
  faceToward(worldPos: THREE.Vector3): void {
    this.up(_upVec);
    _tmpC.copy(worldPos).sub(this.group.position);
    _tmpC.addScaledVector(_upVec, -_tmpC.dot(_upVec)); // tangent plane
    if (_tmpC.lengthSq() > 1e-6) this.facing.copy(_tmpC.normalize());
  }

  /** Current smoothed ground height (for ceremony approach movement). */
  groundY(): number {
    return this.smoothGroundY;
  }

  /** Force the walk animation (ceremony approach) even with zero wish. */
  setForceMoving(b: boolean): void {
    this.forceMoving = b;
  }

  private doJump(): void {
    this.grounded = false;
    this.coyoteTimer = 0;
    this.bufferTimer = 0;
    this.verticalVel = JUMP_VELOCITY;
    this.jumpOffset = 0.0001;
    this.character.playJump();
  }

  tryJump(): void {
    // T5: jump works while supported, during coyote grace, else it buffers.
    if (this.grounded || this.coyoteTimer > 0) {
      this.doJump();
    } else {
      this.bufferTimer = JUMP_BUFFER;
    }
  }

  /** wish: desired move direction in world space (tangent plane). */
  update(dt: number, wish: THREE.Vector3, camera?: THREE.Camera): void {
    // Local ENU frame at the player for wish <-> plane conversion.
    this.up(_upVec);
    _eastW.crossVectors(UP_Y, _upVec);
    if (_eastW.lengthSq() < 1e-6) _eastW.set(1, 0, 0); // at poles
    _eastW.normalize();
    _northW.crossVectors(_upVec, _eastW).normalize();

    // wish (world tangent) -> plane coords (x=east/lon, z=-north/lat)
    _wish2.set(wish.dot(_eastW), 0, -wish.dot(_northW));
    _tangent.copy(_wish2);
    const moving = _tangent.lengthSq() > 0.0004;
    if (moving) _tangent.normalize();

    const px = this.coord.x;
    const pz = this.coord.z;
    const curH = groundAt(px, pz);

    // ---- T3: local slope from terrain gradient along the move direction ----
    let grade = 0;
    let slopeDeg = 0;
    if (moving) {
      const hAhead = groundAt(px + _tangent.x * GRAD_EPS, pz + _tangent.z * GRAD_EPS);
      const hBehind = groundAt(px - _tangent.x * GRAD_EPS, pz - _tangent.z * GRAD_EPS);
      grade = (hAhead - hBehind) / (2 * GRAD_EPS);
      slopeDeg = Math.abs(Math.atan(grade)) * (180 / Math.PI);
    }

    // ---- T4: speed modulation (slope × biome zones), lerped transitions ----
    _probe.set(px, 0, pz);
    const zoneMult = speedMultiplierAt(_probe);
    let slopeMult = 1;
    if (moving) {
      if (grade > 0.02) slopeMult = 1 + (0.75 - 1) * Math.min(1, grade * 1.6);
      else if (grade < -0.02)
        slopeMult = 1 + (1.1 - 1) * Math.min(1, -grade * 1.6);
    }
    const targetMult = (moving ? slopeMult : 1) * zoneMult;
    this.speedMult += (targetMult - this.speedMult) * (1 - Math.exp(-4 * dt));

    // ---- horizontal move with T2 step-up / T3 slope limit / T7 nudge ----
    const tooSteep = slopeDeg > SLOPE_LIMIT_DEG;
    let nx = px;
    let nz = pz;
    if (moving && !(tooSteep && grade > 0)) {
      const dist = SPEED * this.speedMult * dt;
      const tx = px + _tangent.x * dist;
      const tz = pz + _tangent.z * dist;
      const rise = groundAt(tx, tz) - curH;

      let accepted = false;
      let ax = tx;
      let az = tz;
      if (rise <= STEP_H) {
        accepted = true; // T2: glide up small steps; step down handled by T1
      } else {
        // T7: corner correction — retry nudged ±NUDGE sideways before giving up.
        _perp.set(-_tangent.z, 0, _tangent.x); // perpendicular in plane
        for (const s of [1, -1]) {
          const px2 = tx + _perp.x * NUDGE * s;
          const pz2 = tz + _perp.z * NUDGE * s;
          if (groundAt(px2, pz2) - curH <= STEP_H) {
            accepted = true;
            ax = px2;
            az = pz2;
            break;
          }
        }
      }
      if (accepted) {
        // Collision: don't walk through buildings
        const resolved = resolveCollision(ax, az);
        nx = resolved.x;
        nz = resolved.z;
        // turn to face travel direction (world tangent space)
        _tmpA.set(_tangent.x, 0, _tangent.z); // plane -> world tangent
        _tmpB.copy(_eastW).multiplyScalar(_tmpA.x).addScaledVector(_northW, -_tmpA.z);
        this.facing.lerp(_tmpB.normalize(), 1 - Math.exp(-12 * dt));
        this.facing.addScaledVector(_upVec, -this.facing.dot(_upVec)).normalize();
      }
    }

    // T3: gentle downhill slide on too-steep slopes (cozy, not punishing).
    if (tooSteep && moving) {
      const slideAmt =
        SLIDE_SPEED * Math.min(1, (slopeDeg - SLOPE_LIMIT_DEG) / 25) * dt;
      const sx = nx - _tangent.x * Math.sign(grade) * slideAmt;
      const sz = nz - _tangent.z * Math.sign(grade) * slideAmt;
      if (groundAt(sx, sz) - curH <= STEP_H) {
        nx = sx;
        nz = sz;
      }
    }

    // ---- T5: timers ----
    this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    this.bufferTimer = Math.max(0, this.bufferTimer - dt);

    // ---- hop physics along +Y ----
    if (!this.grounded) {
      this.verticalVel -= GRAVITY * dt;
      this.jumpOffset += this.verticalVel * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.verticalVel = 0;
        this.grounded = true;
        if (this.bufferTimer > 0) this.doJump(); // buffered jump fires on landing
      }
    }

    // ---- T1: damped ground follow REPLACES the hard snap ----
    const targetY = groundAt(nx, nz) + HOVER;
    const rate = dampRate(targetY > this.smoothGroundY);
    this.smoothGroundY +=
      (targetY - this.smoothGroundY) * (1 - Math.exp(-rate * dt));

    // supported? -> coyote grace when walking off a ledge (not jumping)
    const supported =
      this.jumpOffset <= 0 && this.smoothGroundY - targetY < 0.3;
    if (this.wasSupported && !supported && this.jumpOffset <= 0) {
      this.coyoteTimer = COYOTE_TIME;
    }
    this.wasSupported = supported;
    if (supported) this.grounded = true;

    // Commit the 2D gameplay position, then map onto the sphere.
    this.coord.set(nx, 0, nz);
    this.syncTransform();

    // ---- character animation metrics ----
    _hv.copy(this.group.position).sub(this.prevPos);
    // tangent displacement only (remove radial component)
    _hv.addScaledVector(_upVec, -_hv.dot(_upVec));
    const instSpeed = dt > 1e-6 ? _hv.length() / dt : 0;
    this.prevPos.copy(this.group.position);
    const instAccel = dt > 1e-6 ? (instSpeed - this.speedSmooth) / dt : 0;
    this.speedSmooth += (instSpeed - this.speedSmooth) * (1 - Math.exp(-8 * dt));
    this.accelSmooth +=
      (instAccel - this.accelSmooth) * (1 - Math.exp(-6 * dt));
    _hd.crossVectors(this.prevFacing, this.facing);
    // turn rate about the local up (not world Y)
    const turnRate = dt > 1e-6 ? Math.asin(THREE.MathUtils.clamp(_hd.dot(_upVec), -1, 1)) / dt : 0;
    this.turnSmooth += (turnRate - this.turnSmooth) * (1 - Math.exp(-6 * dt));
    this.prevFacing.copy(this.facing);

    // landing thump → the satchel bumps her hip (silhouette ✓)
    // + squash & stretch so landings have weight (alive rule #2)
    if (!this.wasGroundedAnim && this.grounded) {
      this.character.addBagImpulse(0.45);
      this.character.addLandSquash();
    }
    this.wasGroundedAnim = this.grounded;

    const animMoving = moving || this.forceMoving;
    this.character.update(dt, {
      speedRatio: THREE.MathUtils.clamp(this.speedSmooth / 1.8, 0, 1.5),
      moving: animMoving,
      accel: this.accelSmooth,
      turnRate: this.turnSmooth,
      walkBounceAmp: walkBounceAmp(),
      lookYaw: this.lookYaw,
      camera: camera ?? null,
      reducedMotion: settings.reducedMotion,
    });
  }

  /** Swap the postwoman's outfit (dress change). Rebuilds the character rig. */
  setOutfit(id: OutfitId): void {
    if (id === this.outfit) return;
    this.outfit = id;
    // Remove the old rig
    this.group.remove(this.character.group);
    this.character.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
      }
    });
    // Build the new one (same bones/animations, new look)
    this.character = createPostwoman(id);
    this.group.add(this.character.group);
  }
}
