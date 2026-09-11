import { Vector3 } from '../vendor/three.module.js';
import { routeCable, cableLength } from './rope-route.js';

export const DEFAULTS = Object.freeze({
  gravity: 24, range: 115, minLength: 6, maxLength: 115, reelSpeed: 12,
  airControl: 4, damping: 0.003, fallDrag: 0.006, speedAssist: 0, maxAssistSpeed: 25,
  runSpeed: 13, sprintSpeed: 20, jumpSpeed: 12, mass: 75, assistAngle: 22,
  easySwing: false, swingDrive: 0, swingControl: 0, lookControl: 0, groundPullSpeed: 18, groundPullDuration: 1.1,
});

const STEP = 1 / 120;
const EPS = 1e-7;
const HALF = new Vector3(0.45, 1, 0.45);
const AXES = ['x', 'y', 'z'];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Slab intersection. An origin inside the box returns the exit surface.
function rayBox(origin, direction, min, max, range) {
  let near = -Infinity, far = Infinity, nearNormal, farNormal;
  for (const axis of AXES) {
    if (Math.abs(direction[axis]) < EPS) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
      continue;
    }
    let a = (min[axis] - origin[axis]) / direction[axis];
    let b = (max[axis] - origin[axis]) / direction[axis];
    const sign = a <= b ? -1 : 1;
    if (a > b) [a, b] = [b, a];
    if (a > near) { near = a; nearNormal = new Vector3(); nearNormal[axis] = sign; }
    if (b < far) { far = b; farNormal = new Vector3(); farNormal[axis] = -sign; }
    if (near > far) return null;
  }
  const distance = near >= -EPS ? Math.max(near, 0) : far;
  const normal = near >= -EPS ? nearNormal : farNormal;
  return normal && distance >= 0 && distance <= range ? { distance, normal } : null;
}

export function raycastBuildings(origin, direction, range, buildings, padding = 0) {
  if (!Number.isFinite(range) || range <= 0 || direction.lengthSq() < EPS) return null;
  const dir = direction.clone().normalize();
  let nearest = null;
  // ponytail: linear scan is adequate for nine blocks; add a spatial grid for a larger city.
  for (const building of buildings) {
    const min = building.min.clone().addScalar(-padding);
    const max = building.max.clone().addScalar(padding);
    const hit = rayBox(origin, dir, min, max, nearest?.distance ?? range);
    if (hit && (!nearest || hit.distance < nearest.distance)) {
      nearest = { ...hit, point: origin.clone().addScaledVector(dir, hit.distance), buildingId: building.id };
    }
  }
  return nearest;
}

function surfacePoint(point, building) {
  if (!point || !building || !AXES.every(axis => Number.isFinite(point[axis]))) return false;
  if (AXES.some(axis => point[axis] < building.min[axis] - 0.001 || point[axis] > building.max[axis] + 0.001)) return false;
  return AXES.some(axis => Math.min(Math.abs(point[axis] - building.min[axis]), Math.abs(point[axis] - building.max[axis])) < 0.001);
}

function visibleAnchor(position, point, buildingId, buildings) {
  const direction = point.clone().sub(position);
  const distance = direction.length();
  const hit = raycastBuildings(position, direction, distance + 0.02, buildings);
  return hit && hit.buildingId === buildingId && Math.abs(hit.distance - distance) < 0.025;
}

export function selectAnchor(position, aim, buildings, config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  if (aim.lengthSq() < EPS) return null;
  const forward = aim.clone().normalize();
  const range = Math.min(cfg.range, cfg.maxLength);
  const direct = raycastBuildings(position, forward, range, buildings);
  if (direct && direct.distance >= 2) {
    const candidate=comfortableAnchor(direct,position,buildings,cfg);
    if (!cfg.easySwing || candidate.point.y > position.y+2) return candidate;
  }
  const upReference = Math.abs(forward.y) > 0.98 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(forward, upReference).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();
  let best = null, bestScore = Infinity;
  // Every assist candidate comes from a real ray; the fan cannot invent an anchor in empty sky.
  for (const [fraction, count] of [[0.5, 8], [1, 16]]) {
    const angle = clamp(cfg.assistAngle, 0, 45) * Math.PI / 180 * fraction;
    for (let i = 0; i < count; i++) {
      const phi = i * Math.PI * 2 / count;
      const dir = forward.clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(right, Math.cos(phi) * Math.sin(angle))
        .addScaledVector(up, Math.sin(phi) * Math.sin(angle));
      let hit = raycastBuildings(position, dir, range, buildings);
      if (!hit || hit.distance < 2) continue;
      hit=comfortableAnchor(hit,position,buildings,cfg);
      if (cfg.easySwing && hit.point.y <= position.y+2) continue;
      const score = angle * 40 + hit.distance * 0.02 - clamp(hit.point.y - position.y, -20, 35) * 0.07;
      if (score < bestScore) { bestScore = score; best = hit; }
    }
  }
  return best;
}

function comfortableAnchor(hit, position, buildings, cfg) {
  if (!cfg.easySwing || cfg.assistAngle <= 0) return hit;
  const building = buildings.find(b => b.id === hit.buildingId);
  const target = hit.point.clone();
  const horizontalSq = (target.x-position.x)**2 + (target.z-position.z)**2;
  // Choose a higher REAL face point, giving the arc clearance where that facade allows it.
  const clearance = Math.min(10, position.y*.3);
  const safeHeight = (horizontalSq+position.y**2-clearance**2)/(2*(position.y-clearance));
  const desiredHeight=position.y<5?position.y+Math.max(16,Math.sqrt(horizontalSq)*1.2):Math.max(position.y+14,safeHeight+5);
  target.y = Math.min(building.max.y-.05, Math.max(target.y,desiredHeight));
  const original = hit.point.clone().sub(position), adjusted = target.sub(position);
  if (original.angleTo(adjusted)>(position.y<5?60:Math.min(35,cfg.assistAngle))*Math.PI/180) return hit;
  const higher = raycastBuildings(position,adjusted,Math.min(cfg.range,cfg.maxLength),buildings);
  return higher?.buildingId===hit.buildingId && higher.point.y>hit.point.y ? higher : hit;
}

export class Simulation {
  constructor(buildings, config = {}) {
    this.buildings = buildings;
    this.config = { ...DEFAULTS, ...config };
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.reset(new Vector3(0, 1, 0));
  }

  reset(position, velocity = new Vector3()) {
    this.position.copy(position);
    this.velocity.copy(velocity);
    this.anchor = null;
    this.ropeLength = 0;
    this.tension = 0;
    this.grounded = position.y <= HALF.y + 0.001;
    this.wallNormal = null;
    this.state = this.grounded ? 'grounded' : 'falling';
    this.releaseReason = '';
    this.accumulator = 0;
    this.pendingJump = false;
    this.groundPullRemaining = 0;
    this.groundPullStartY = position.y;
    this.cableBlocked = false;
    this.ropeBends = [];
    this._depenetrate();
  }

  attach(hit) {
    if (this.anchor) return false;
    const building = hit && this.buildings.find(item => item.id === hit.buildingId);
    if (!hit || !surfacePoint(hit.point, building)) return false;
    const distance = this.position.distanceTo(hit.point);
    if (distance < 2 || distance > Math.min(this.config.range, this.config.maxLength) + EPS) return false;
    if (!visibleAnchor(this.position, hit.point, hit.buildingId, this.buildings)) return false;
    this.anchor = { point: hit.point.clone(), buildingId: hit.buildingId };
    this.ropeLength = clamp(distance, this.config.minLength, this.config.maxLength);
    this.tension = 0;
    this.releaseReason = '';
    this.cableBlocked = false;
    this.ropeBends = [];
    this.groundPullRemaining = this.config.easySwing && this.grounded && hit.point.y>this.position.y+2 ? this.config.groundPullDuration : 0;
    this.groundPullStartY = this.position.y;
    this.state = 'swinging';
    return true;
  }

  release(reason = '') {
    this.anchor = null;
    this.tension = 0;
    this.releaseReason = reason;
    this.groundPullRemaining = 0;
    this.cableBlocked = false;
    this.ropeBends = [];
    this.state = this.grounded ? 'grounded' : this.velocity.y > 0 ? 'rising' : 'falling';
    // Deliberately no velocity operation: releasing a cable is not a launch impulse.
  }

  step(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.pendingJump ||= Boolean(input.jump);
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator + EPS >= STEP) {
      this._step(STEP, { ...input, jump: this.pendingJump });
      this.pendingJump = false;
      this.accumulator -= STEP;
    }
  }

  _step(dt, input) {
    const cfg = this.config;
    this._depenetrate();
    const move = input.move?.clone() ?? new Vector3();
    move.y = 0;
    if (move.lengthSq() > 1) move.normalize();
    if (this.grounded && input.jump) {
      this.velocity.y = cfg.jumpSpeed;
      this.grounded = false;
    }
    const acceleration = new Vector3(0, -cfg.gravity, 0);
    if (this.grounded) {
      const speed = input.sprint ? cfg.sprintSpeed : cfg.runSpeed;
      const desired = move.multiplyScalar(speed);
      const change = desired.sub(new Vector3(this.velocity.x, 0, this.velocity.z));
      if (change.length() > 80 * dt) change.setLength(80 * dt);
      this.velocity.add(change);
    } else {
      const aim = input.aim?.clone() ?? new Vector3();
      aim.y = 0;
      const steeringInput = move.lengthSq()>EPS ? move : aim;
      const steeringPower = move.lengthSq()>EPS ? cfg.swingControl : cfg.lookControl;
      if(this.anchor && steeringPower>0 && steeringInput.lengthSq()>EPS){
        const radius=this.position.clone().sub(this._target()).normalize();
        const steering=steeringInput.addScaledVector(radius,-steeringInput.dot(radius));
        if(steering.lengthSq()>EPS){
          const magnitude=steering.length();steering.normalize();
          const budget=Math.max(0,(cfg.maxAssistSpeed-this.velocity.dot(steering))/dt);
          acceleration.addScaledVector(steering,Math.min(steeringPower*magnitude,budget));
        }
      }else acceleration.addScaledVector(move,cfg.airControl);
      const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
      if (cfg.speedAssist > 0 && horizontal < cfg.maxAssistSpeed && move.lengthSq() > EPS) {
        acceleration.addScaledVector(move, Math.min(cfg.speedAssist, (cfg.maxAssistSpeed - horizontal) / dt));
      }
      if (!this.anchor && this.velocity.y < 0 && cfg.gravity > 0) {
        const drag = Math.max(0, cfg.fallDrag) * (input.dive ? 0.15 : 1);
        acceleration.y += Math.min(cfg.gravity, drag * this.velocity.y ** 2);
      }
    }
    const drag = Math.exp(-Math.max(0, cfg.damping) * dt * (input.dive ? 0.25 : 1));
    if (this.anchor && move.lengthSq()<EPS && cfg.swingDrive > 0 && this.velocity.length() < cfg.maxAssistSpeed) {
      const radius = this.position.clone().sub(this._target()).normalize();
      const drive = this.velocity.clone();
      drive.addScaledVector(radius,-drive.dot(radius));
      if (drive.lengthSq()>EPS) acceleration.addScaledVector(drive.normalize(),Math.min(cfg.swingDrive,(cfg.maxAssistSpeed-this.velocity.length())/dt));
    }
    this.velocity.multiplyScalar(drag);
    const previous = this.position.clone();
    const oldLength = this.ropeLength;
    let lengthRate = 0;
    if (this.anchor) {
      let reelVelocity=clamp(input.reel ?? 0,-1,1)*cfg.reelSpeed;
      if(!cfg.easySwing)this.groundPullRemaining=0;
      const heightGained=this.position.y-this.groundPullStartY;
      const away=move.dot(this.anchor.point.clone().sub(this.position).setY(0).normalize())<-.15;
      if(heightGained>=8 || (heightGained>=3 && away))this.groundPullRemaining=0;
      if(this.groundPullRemaining>0){
        // One finite winch stroke per grounded attachment, ramped over 0.18 s.
        // It lifts through the same swept collision and cable solver, never a teleport.
        const elapsed=cfg.groundPullDuration-this.groundPullRemaining+dt;
        reelVelocity=-cfg.groundPullSpeed*Math.min(1,elapsed/.18);
        this.groundPullRemaining=Math.max(0,this.groundPullRemaining-dt);
      }
      this.ropeLength = clamp(oldLength + reelVelocity * dt, cfg.minLength, cfg.maxLength);
      lengthRate = (this.ropeLength - oldLength) / dt;
    }
    this.velocity.addScaledVector(acceleration, dt * 0.5);
    let desired = previous.clone().addScaledVector(this.velocity, dt);
    if (this.anchor) this._route(desired);
    let tensionImpulse = 0;
    if (this.anchor) {
      const target=this._target(), tail=this._tailLength();
      const usableLength=Math.max(this.config.minLength,this.ropeLength-tail);
      const relative = desired.clone().sub(target);
      const distance = relative.length();
      if (distance > usableLength) {
        const oldRadius = previous.clone().sub(target);
        const wasTaut = Math.abs(oldRadius.length() - oldLength) < 0.002;
        const normal = oldRadius.normalize();
        const projection = relative.dot(normal);
        const discriminant = usableLength ** 2 - (relative.lengthSq() - projection ** 2);
        if (wasTaut && discriminant > 0) {
          // RATTLE position correction along the previous radius avoids the energy loss
          // of projecting position then deleting radial velocity every frame.
          const correction = Math.max(0, projection - Math.sqrt(discriminant));
          desired.addScaledVector(normal, -correction);
          this.velocity.addScaledVector(normal, -correction / dt);
          tensionImpulse += correction / dt;
        } else {
          relative.normalize();
          desired.copy(target).addScaledVector(relative, usableLength);
          const outward = Math.max(0, this.velocity.dot(relative) - lengthRate);
          this.velocity.addScaledVector(relative, -outward);
          tensionImpulse += outward;
        }
      }
    }
    this.velocity.addScaledVector(acceleration, dt * 0.5);
    this.grounded = false;
    this.wallNormal = null;
    this._moveSwept(desired.sub(previous));
    if (this.anchor) {
      this._route(this.position);
      const target=this._target(),tail=this._tailLength();
      const relative=this.position.clone().sub(target),distance=relative.length();
      this.cableBlocked=this.ropeBends.length>0;
      if(distance+tail>this.ropeLength+.002){
        // Collision has priority over retraction. Passive payout avoids a tug-of-war
        // between the wall and cable constraints; it never adds velocity or moves the anchor.
        this.ropeLength=distance+tail;this.groundPullRemaining=0;lengthRate=0;
      }
      if (distance >= this.ropeLength-tail - 0.002) {
        relative.normalize();
        const outward = Math.max(0, this.velocity.dot(relative) - lengthRate);
        this.velocity.addScaledVector(relative, -outward);
        tensionImpulse += outward;
      }
    }
    this.tension = this.anchor ? Math.max(0, tensionImpulse * cfg.mass / dt) : 0;
    this.state = this.anchor ? (this.tension > 1 ? 'swinging' : 'slack') : this.grounded ? (move.lengthSq() ? 'running' : 'grounded') : input.dive ? 'diving' : this.velocity.y > 0 ? 'rising' : 'falling';
  }

  _target() { return this.ropeBends[0] ?? this.anchor.point; }
  _tailLength() { return cableLength(this._target(), this.ropeBends.slice(1), this.anchor.point); }
  _route(position) {
    const next=routeCable(position,this.anchor.point,this.buildings,this.anchor.buildingId,this.ropeBends);
    this.ropeBends=next;
    if(next.length)this.ropeLength=Math.max(this.ropeLength,cableLength(position,next,this.anchor.point));
  }

  _contact(normal) {
    const inward = this.velocity.dot(normal);
    if (inward < 0) this.velocity.addScaledVector(normal, -inward);
    if (normal.y > 0.5) this.grounded = true;
    else if (Math.abs(normal.y) < 0.5) this.wallNormal = normal.clone();
  }

  _depenetrate() {
    if (this.position.y < HALF.y) {
      this.position.y = HALF.y;
      this._contact(new Vector3(0, 1, 0));
    }
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const building of this.buildings) {
        const min = building.min.clone().sub(HALF);
        const max = building.max.clone().add(HALF);
        if (!AXES.every(axis => this.position[axis] > min[axis] + EPS && this.position[axis] < max[axis] - EPS)) continue;
        let depth = Infinity, normal;
        for (const axis of AXES) {
          for (const sign of [-1, 1]) {
            const d = sign < 0 ? this.position[axis] - min[axis] : max[axis] - this.position[axis];
            if (d < depth) { depth = d; normal = new Vector3(); normal[axis] = sign; }
          }
        }
        this.position.addScaledVector(normal, depth + EPS * 10);
        this._contact(normal);
        moved = true;
      }
      if (!moved) break;
    }
  }

  _moveSwept(displacement) {
    let remaining = displacement.clone();
    for (let iteration = 0; iteration < 4 && remaining.lengthSq() > EPS * EPS; iteration++) {
      const length = remaining.length();
      const direction = remaining.clone().divideScalar(length);
      let collision = null;
      if (remaining.y < 0 && this.position.y + remaining.y < HALF.y) {
        collision = { distance: Math.max(0, (HALF.y - this.position.y) / direction.y), normal: new Vector3(0, 1, 0) };
      }
      for (const building of this.buildings) {
        const hit = rayBox(this.position, direction, building.min.clone().sub(HALF), building.max.clone().add(HALF), collision?.distance ?? length);
        if (hit && direction.dot(hit.normal) < -EPS && (!collision || hit.distance < collision.distance)) collision = hit;
      }
      if (!collision) { this.position.add(remaining); break; }
      const travel = Math.max(0, collision.distance - 0.00001);
      this.position.addScaledVector(direction, travel);
      remaining.addScaledVector(direction, -travel);
      remaining.addScaledVector(collision.normal, -Math.min(0, remaining.dot(collision.normal)));
      this._contact(collision.normal);
    }
    if (this.position.y <= HALF.y + 0.0001 && this.velocity.y <= 0) {
      this.position.y = HALF.y;
      this._contact(new Vector3(0, 1, 0));
    }
  }
}
