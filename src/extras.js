import { Vector3 } from '../vendor/three.module.js';
import { Simulation, raycastBuildings } from './physics.js';

export const EXTRA_LIMITS = Object.freeze({ zipRange: 35, zipDuration: 0.35, zipAcceleration: 50, zipApproachSpeed: 32, zipCooldown: 2, wallDuration: 1.5, wallRange: 0.75, climbSpeed: 5, wallRunSpeed: 10 });
const WALL_DIRECTIONS = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Finite powered assists. Ordinary free flight and single-cable physics stay in Simulation. */
export class ExtraSimulation extends Simulation {
  reset(position, velocity = new Vector3()) {
    super.reset(position, velocity);
    this.zipTarget = null;
    this.zipRemaining = 0;
    this.zipCooldown = 0;
    this.zipReady = true;
    this.wallActive = false;
    this.wallStamina = EXTRA_LIMITS.wallDuration;
  }

  stopZip() {
    this.zipTarget = null;
    this.zipRemaining = 0;
  }

  attach(hit) {
    const attached = super.attach(hit);
    if (attached) this.stopZip();
    return attached;
  }

  startZip(hit) {
    if (!this.zipReady || this.zipCooldown > 0 || !hit?.point || this.position.distanceTo(hit.point) > EXTRA_LIMITS.zipRange) return false;
    // Reuse surface, range and occlusion validation; no synthetic target is accepted.
    if (!super.attach(hit)) return false;
    this.zipTarget = { point: this.anchor.point.clone(), buildingId: this.anchor.buildingId };
    super.release('zip');
    this.zipRemaining = EXTRA_LIMITS.zipDuration;
    this.zipCooldown = EXTRA_LIMITS.zipCooldown;
    this.zipReady = false;
    return true;
  }

  _step(dt, input) {
    this.zipCooldown = Math.max(0, this.zipCooldown - dt);
    this.wallActive = false;
    if (this.grounded) {
      this.wallStamina = EXTRA_LIMITS.wallDuration;
      if (this.zipCooldown <= 1e-9) this.zipReady = true;
    }
    let stepInput = input;
    if (this.zipTarget) {
      const direction = this.zipTarget.point.clone().sub(this.position);
      if (direction.length() <= 2 || this.zipRemaining <= 1e-9) this.stopZip();
      else {
        direction.normalize();
        const budget = Math.min(dt, this.zipRemaining);
        const approach = this.velocity.dot(direction);
        const impulse = Math.min(EXTRA_LIMITS.zipAcceleration * budget, Math.max(0, EXTRA_LIMITS.zipApproachSpeed - approach));
        this.velocity.addScaledVector(direction, impulse);
        this.zipRemaining = Math.max(0, this.zipRemaining - dt);
      }
    }
    const climb = clamp(input.climb || 0, -1, 1);
    if (input.wall && !this.anchor && !this.zipTarget && this.wallStamina > 1e-9 && (!this.grounded || climb > 0)) {
      let wall = null;
      for (const direction of WALL_DIRECTIONS) {
        const candidate = raycastBuildings(this.position, direction, EXTRA_LIMITS.wallRange, this.buildings);
        if (candidate && Math.abs(candidate.normal.y) < 0.1 && (!wall || candidate.distance < wall.distance)) wall = candidate;
      }
      if (wall) {
        this.wallActive = true;
        const budget = Math.min(dt, this.wallStamina);
        this.wallStamina = Math.max(0, this.wallStamina - dt);
        if (this.wallStamina < 1e-9) this.wallStamina = 0;
        if (input.jump) {
          this.velocity.addScaledVector(wall.normal, 6);
          this.velocity.y += Math.max(0, Math.min(10, 10 - this.velocity.y));
          this.wallStamina = 0;
          this.wallActive = false;
          stepInput = { ...input, jump: false };
        } else {
          const move = input.move?.clone() ?? new Vector3();
          move.y = 0;
          move.addScaledVector(wall.normal, -move.dot(wall.normal));
          if (move.lengthSq() > 1) move.normalize();
          const lateral = new Vector3(this.velocity.x, 0, this.velocity.z);
          lateral.addScaledVector(wall.normal, -lateral.dot(wall.normal));
          const change = move.multiplyScalar(EXTRA_LIMITS.wallRunSpeed).sub(lateral);
          if (change.length() > 30 * budget) change.setLength(30 * budget);
          this.velocity.add(change);
          // Bounded vertical steering; support cancels gravity only while stamina lasts.
          this.velocity.y += clamp(climb * EXTRA_LIMITS.climbSpeed - this.velocity.y, -40 * budget, 40 * budget) + this.config.gravity * budget;
          if (this.velocity.y > 0) this.grounded = false;
          stepInput = { ...input, move: new Vector3() };
        }
      }
    }
    super._step(dt, stepInput);
    if (this.zipTarget && (this.grounded || this.wallNormal || this.position.distanceTo(this.zipTarget.point) <= 2 || this.zipRemaining <= 1e-9)) this.stopZip();
    if (this.grounded) {
      this.wallActive = false;
      this.wallStamina = EXTRA_LIMITS.wallDuration;
      if (this.zipCooldown <= 1e-9) this.zipReady = true;
    }
    if (this.zipTarget) this.state = 'zip';
    else if (this.wallActive) this.state = climb ? 'climbing' : 'wall-running';
  }
}
