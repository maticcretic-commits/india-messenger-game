import * as THREE from 'three';
import type { Player } from './player';

const _head = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _newPos = new THREE.Vector3();

/**
 * Third-person follow camera for the TINY PLANET.
 * The camera sits above/behind the player along the sphere normal,
 * looking at the player. Fully automatic — no manual look.
 */
export class FollowCamera {
  private readonly pitch = 0.42;
  private readonly dist = 7.4;
  private readonly height = 1.7;
  private dolly = 1; // camera pull-in/out multiplier (ceremony framing)
  private dollyTarget = 1;
  private readonly pos = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  private readonly prevSmooth = new THREE.Vector3();
  private initialized = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Ceremony/postcard framing: 1 = normal, <1 close-up, >1 pull-away. */
  setDolly(mult: number): void {
    this.dollyTarget = THREE.MathUtils.clamp(mult, 0.45, 2.2);
  }

  update(dt: number, player: Player, reducedMotion: boolean): void {
    player.headAnchor(_head);
    player.up(_up);
    player.facingDir(_fwd);

    if (!this.initialized) {
      this.pos.copy(_head);
      this.smoothTarget.copy(_head);
      this.prevSmooth.copy(_head);
      this.initialized = true;
    }

    // smooth the follow target, then carry the camera by its translation
    this.smoothTarget.lerp(_head, 1 - Math.exp(-6 * dt));
    _delta.copy(this.smoothTarget).sub(this.prevSmooth);
    this.prevSmooth.copy(this.smoothTarget);
    this.pos.add(_delta);

    // orbit offset: behind the player (tangent) + above (normal)
    this.dolly += (this.dollyTarget - this.dolly) * (1 - Math.exp(-3 * dt));
    const dist = this.dist * this.dolly;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    _desired
      .copy(this.smoothTarget)
      .addScaledVector(_fwd, -dist * cp)
      .addScaledVector(_up, this.height + dist * sp);
    _newPos.copy(this.pos).lerp(_desired, 1 - Math.exp(-9 * dt));

    // keep the camera above the planet surface
    const camR = _newPos.length();
    const minR = 40 + 0.6; // PLANET_RADIUS + margin
    if (camR < minR) _newPos.setLength(minR);
    this.pos.copy(_newPos);

    this.camera.position.copy(this.pos);
    // camera up: blend world Y with the surface normal for stability
    this.camera.up.copy(_up).lerp(new THREE.Vector3(0, 1, 0), 0.35).normalize();
    this.camera.lookAt(this.smoothTarget);
  }
}
