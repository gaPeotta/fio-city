import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3 as V} from '../vendor/three.module.js';
import {Simulation,selectAnchor} from '../src/physics.js';
import {generateBuildings} from '../src/city.js';

test('holding a real city cable lifts a stationary grounded player without jumping or reeling',()=>{
  const sim=new Simulation(generateBuildings(),{easySwing:true,swingDrive:2.5,assistAngle:32,maxAssistSpeed:32});
  sim.reset(new V(-44,1,113));
  const hit=selectAnchor(sim.position,new V(0,.15,-1),sim.buildings,sim.config);
  assert.ok(hit);assert.ok(sim.attach(hit));
  const anchor=sim.anchor,point=anchor.point.toArray(),length=sim.ropeLength;
  let peak=1,loaded=0;
  for(let i=0;i<180;i++){
    const previous=sim.position.clone();sim.step(1/120);
    peak=Math.max(peak,sim.position.y);if(sim.tension>1)loaded++;
    assert.equal(sim.anchor,anchor);assert.deepEqual(sim.anchor.point.toArray(),point);
    assert.ok(previous.distanceTo(sim.position)<.5,'launch must not teleport');
  }
  assert.ok(peak>8);assert.ok(loaded>60);assert.equal(sim.groundPullRemaining,0);
  assert.ok(length-sim.ropeLength<=sim.config.groundPullSpeed*sim.config.groundPullDuration+.01);
  const velocity=sim.velocity.toArray();sim.release();assert.deepEqual(sim.velocity.toArray(),velocity);
  const midair=selectAnchor(sim.position,new V(0,.5,-1),sim.buildings,sim.config);
  if(midair){assert.ok(sim.attach(midair));assert.equal(sim.groundPullRemaining,0,'no repeated launch motor in air');}
});

test('cable contact preserves the fixed anchor and routes around the obstacle',()=>{
  const buildings=[{id:'anchor',min:new V(10,0,-2),max:new V(12,60,2)},
    {id:'obstacle',min:new V(4,0,-5),max:new V(6,50,-1)}];
  const sim=new Simulation(buildings,{gravity:0,damping:0,airControl:0});
  sim.reset(new V(0,20,12),new V(0,0,-20));
  assert.ok(sim.attach({point:new V(10,30,0),buildingId:'anchor'}));
  const anchor=sim.anchor,point=anchor.point.toArray();let blocked=false,routed=false,contact=null,stalls=0;
  for(let i=0;i<240;i++){
    const previous=sim.position.clone();sim.step(1/120);blocked||=sim.cableBlocked;routed||=sim.ropeBends.length>0;
    if(sim.cableBlocked&&!contact)contact=sim.position.clone();
    if(contact&&sim.position.distanceTo(previous)<1e-5)stalls++;
    assert.equal(sim.anchor,anchor);assert.deepEqual(sim.anchor.point.toArray(),point);
    assert.equal(sim.releaseReason,'');assert.ok(sim.position.distanceTo(anchor.point)<=sim.ropeLength+.002);
  }
  assert.ok(blocked,'scenario must actually obstruct the cable');
  assert.equal(stalls,0,'every subsequent frame must retain real position movement');
  assert.ok(sim.velocity.length()>3,'slide velocity must not be erased');
  assert.ok(sim.position.distanceTo(contact)>3,'do not merely retain velocity while freezing position');
  assert.ok(routed,'the cable must route around the obstacle rather than crossing it');
  assert.equal(sim.attach({point:new V(10,35,0),buildingId:'anchor'}),false);
  assert.deepEqual(sim.anchor.point.toArray(),point);
  sim.release();assert.equal(sim.anchor,null);
});

test('passing the original anchor during a swing never changes it',()=>{
  const beam={id:'beam',min:new V(-2,90,-2),max:new V(2,92,2)};
  const sim=new Simulation([beam],{damping:0,airControl:0});
  sim.reset(new V(0,50,20),new V(0,0,-30));
  assert.ok(sim.attach({point:new V(0,90,0),buildingId:'beam'}));
  const anchor=sim.anchor;let passed=false;
  for(let i=0;i<360;i++){sim.step(1/120);passed||=sim.position.z<0;assert.equal(sim.anchor,anchor);}
  assert.ok(passed);assert.deepEqual(anchor.point.toArray(),[0,90,0]);
});
