import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Scene } from '../vendor/three.module.js';
import { Simulation, selectAnchor } from '../src/physics.js';
import { createCourier } from '../src/visuals.js';
const v=(x,y,z)=>new Vector3(x,y,z);
const buildings=[{id:'tower',min:v(-12,0,-60),max:v(12,120,-50)}];

test('simple aim raises the attachment on the same real facade; holding needs no reel input',()=>{
  const sim=new Simulation(buildings,{easySwing:true,swingDrive:2.5});
  sim.reset(v(0,75,0),v(12,0,-14));
  const hit=selectAnchor(sim.position,v(0,0,-1),buildings,sim.config);
  assert.equal(hit.buildingId,'tower');assert.equal(hit.point.z,-50);assert.ok(hit.point.y>75);
  assert.ok(sim.attach(hit));const length=sim.ropeLength;
  for(let i=0;i<120;i++)sim.step(1/120);
  assert.ok(sim.anchor);assert.equal(sim.ropeLength,length);assert.ok(sim.position.y>10);
  const velocity=sim.velocity.toArray();sim.release();assert.deepEqual(sim.velocity.toArray(),velocity);
  assert.equal(selectAnchor(v(0,150,0),v(0,1,0),buildings,sim.config),null);
});

test('swing assistance adds no acceleration above its cap or without a cable',()=>{
  for(const tethered of [false,true]){
    const assisted=new Simulation(buildings,{gravity:0,damping:0,airControl:0,swingDrive:4,maxAssistSpeed:10});
    const physical=new Simulation(buildings,{gravity:0,damping:0,airControl:0,swingDrive:0});
    for(const sim of [assisted,physical]){sim.reset(v(0,75,0),v(20,0,0));if(tethered)assert.ok(sim.attach({point:v(0,100,-50),buildingId:'tower'}));}
    for(let i=0;i<60;i++){assisted.step(1/120);physical.step(1/120);}
    assert.ok(assisted.velocity.distanceTo(physical.velocity)<1e-9);
  }
});

test('automatic release somersault and arm pose never change physics state',()=>{
  const courier=createCourier(new Scene());const sim=new Simulation(buildings);
  sim.reset(v(0,75,0),v(24,3,0));assert.ok(sim.attach({point:v(0,100,-50),buildingId:'tower'}));
  courier.update(.016,sim);sim.release();
  const p=sim.position.toArray(),velocity=sim.velocity.toArray();
  courier.update(.2,sim);
  assert.ok(Math.abs(courier.rig.rotation.x)>.5);
  assert.deepEqual(sim.position.toArray(),p);assert.deepEqual(sim.velocity.toArray(),velocity);
  assert.ok(courier.getCableOrigin().toArray().every(Number.isFinite));
});
