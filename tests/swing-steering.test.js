import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3 as V} from '../vendor/three.module.js';
import {Simulation,selectAnchor} from '../src/physics.js';
import {generateBuildings} from '../src/city.js';
const wall={id:'wall',min:new V(-40,0,-40),max:new V(40,100,-30)};
const config={easySwing:true,swingControl:24,swingDrive:2.5,maxAssistSpeed:32};
function nearWall(extra={}){
  const sim=new Simulation([wall],{...config,...extra});sim.reset(new V(0,35,-29.55));
  assert.ok(sim.attach({point:new V(0,70,-30),buildingId:'wall'}));return sim;
}

test('away steering moves more than eight metres off the facade while keeping the rope and anchor',()=>{
  const sim=nearWall(),original=sim.anchor,length=sim.ropeLength;
  for(let i=0;i<120;i++){
    sim.step(1/120,{move:new V(0,0,1)});
    assert.equal(sim.anchor,original);assert.ok(sim.position.z>=-29.55-1e-4);
  }
  assert.ok(sim.position.z>-21.55);assert.ok(sim.velocity.z>10);assert.equal(sim.ropeLength,length);
});

test('left and right steering change the arc and player input overrides automatic drive',()=>{
  for(const sign of [-1,1]){
    const driven=nearWall(),noDrive=nearWall({swingDrive:0});
    for(let i=0;i<120;i++){driven.step(1/120,{move:new V(sign,0,0)});noDrive.step(1/120,{move:new V(sign,0,0)});}
    assert.ok(sign*driven.position.x>8);
    assert.ok(driven.position.distanceTo(noDrive.position)<1e-9,'automatic assistance must not fight held input');
    assert.ok(driven.velocity.distanceTo(noDrive.velocity)<1e-9);
  }
});

test('strong swing steering does not turn free flight into flying',()=>{
  const strong=new Simulation([],{...config}),normal=new Simulation([],{...config,swingControl:0});
  for(const sim of [strong,normal])sim.reset(new V(0,70,0));
  for(let i=0;i<120;i++){strong.step(1/120,{move:new V(1,0,0)});normal.step(1/120,{move:new V(1,0,0)});}
  assert.ok(strong.position.distanceTo(normal.position)<1e-9);assert.ok(strong.velocity.y< -20);
});

test('active camera aim steers a tethered arc without keyboard movement',()=>{
  const steered=nearWall({lookControl:16}),neutral=nearWall({lookControl:0});
  for(let i=0;i<120;i++){
    steered.step(1/120,{aim:new V(0,0,1)});
    neutral.step(1/120,{aim:new V(0,0,1)});
  }
  assert.ok(steered.position.z>neutral.position.z+3,'camera direction must add a tangential swing input');
  assert.ok(steered.anchor&&neutral.anchor,'camera steering must not release or replace the anchor');
});

test('away input ends the ground winch once airborne instead of continuing to pull toward the building',()=>{
  const sim=new Simulation(generateBuildings(),{...config,assistAngle:32});sim.reset(new V(-44,1,113));
  assert.ok(sim.attach(selectAnchor(sim.position,new V(0,.15,-1),sim.buildings,sim.config)));
  while(sim.position.y<4.1&&sim.groundPullRemaining>0)sim.step(1/120);
  assert.ok(sim.groundPullRemaining>0);
  const away=sim.position.clone().sub(sim.anchor.point).setY(0).normalize();
  const length=sim.ropeLength;sim.step(1/120,{move:away});
  assert.equal(sim.groundPullRemaining,0);assert.equal(sim.ropeLength,length);assert.equal(sim.grounded,false);
});
