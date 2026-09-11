import * as THREE from '../vendor/three.module.js';
import { generateBuildings, buildCity } from './city.js';
import { DEFAULTS, selectAnchor, raycastBuildings } from './physics.js';
import { ExtraSimulation } from './extras.js';
import { createCourier, buildSurroundings } from './visuals.js';
const PLAY_DEFAULTS = { ...DEFAULTS, easySwing:true, swingDrive:2.5, swingControl:24, lookControl:16, maxAssistSpeed:32, assistAngle:32 };

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9ccc7);
scene.fog = new THREE.Fog(0xd1c9b2, 240, 730);
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, .12, 1000);
scene.add(new THREE.HemisphereLight(0xd5efff, 0x635449, 2.3));
const sun = new THREE.DirectionalLight(0xffdab0, 3.2);
sun.position.set(-130, 180, -160);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -175, right: 175, top: 175, bottom: -175, near: 20, far: 470 });
sun.shadow.normalBias = .15;
sun.shadow.bias = -.0003;
scene.add(sun);
scene.add(sun.target);
const buildings = generateBuildings();
const city = buildCity(scene, buildings);
const surroundings=buildSurroundings(scene);
const sim = new ExtraSimulation(buildings, PLAY_DEFAULTS);
let scenarioIndex = 0;
sim.reset(city.spawn);

const courier=createCourier(scene);
const hero=courier.hero;
const bright=new THREE.MeshStandardMaterial({color:0xdcff8b,emissive:0xb5e966,emissiveIntensity:.5});
// Only the visual cable sags. The physics always uses an inequality distance constraint.
const ropePoints = new Float32Array(33 * 3);
const ropeGeometry = new THREE.BufferGeometry();
ropeGeometry.setAttribute('position', new THREE.BufferAttribute(ropePoints,3));
const rope = new THREE.Line(ropeGeometry, new THREE.LineBasicMaterial({ color: 0xf6ffde, transparent:true, opacity:.97 }));
rope.frustumCulled = false;
rope.visible = false;
scene.add(rope);
const anchorOrb = new THREE.Mesh(new THREE.SphereGeometry(.19,8,6), bright);
scene.add(anchorOrb);
anchorOrb.visible = false;
const markerRing = new THREE.Mesh(new THREE.TorusGeometry(.7,.055,5,28), bright);
scene.add(markerRing);
markerRing.visible = false;

const keys = new Set();
let yaw = 0, pitch = .34;
let started = false, paused = true, locked = false, dragging = false, mouseCable = false;
let currentCandidate = null, telemetryVisible = true, toastUntil = 0;
let previousTime = performance.now(), gameTime = 0, lastHud = 0;
let fps = 60, travel = 0, peak = 0, landSquash = 0, wasGrounded = false;
let manualTrick=false;
let cameraSteerUntil=0;
let soundOn = false, audioContext, windGain, windFilter;
let lastMouse = { x:0,y:0 };
const aim = new THREE.Vector3(), right = new THREE.Vector3(), forward = new THREE.Vector3();
const smoothedFocus = sim.position.clone();
const desiredCamera = new THREE.Vector3();
const oldPosition = new THREE.Vector3();
const projected = new THREE.Vector3();
let cameraDistance = 13;
let cameraClearance = Infinity;
let displayedState = 'NO TELHADO';

function notify(message, duration=3.2) {
  $('toast').textContent=message;
  $('toast').classList.add('visible');
  toastUntil=performance.now()+duration*1000;
}
function setVisible(id,value) { $(id).classList.toggle('hidden',!value); }
function clearInput() { keys.clear(); dragging=false; if(mouseCable) sim.release(); mouseCable=false; }
function setPaused(value) {
  paused=value;
  previousTime=performance.now();
  if(value) clearInput();
  setVisible('pause',value && started && $('help').classList.contains('hidden') && $('tuning').classList.contains('hidden'));
}
async function captureMouse() {
  try { await canvas.requestPointerLock(); }
  catch { notify('Cursor livre: arraste para mirar ou use as setas; E alterna o cabo.'); }
}
function resume() {
  setPaused(false);
  setVisible('welcome',false);
  setVisible('pause',false);
  captureMouse();
}
function start() {
  started=true;
  for(const id of ['state-pill','reticle','speed-hud','map-hud','controls']) setVisible(id,true);
  setVisible('telemetry',telemetryVisible);
  resetScenario(0,false);
  resume();
  notify('W para sair do telhado. Salte e mire acima na fachada à frente.',6);
}
function resetScenario(index, announce=true) {
  scenarioIndex=clamp(index,0,city.checkpoints.length-1);
  const cp=city.checkpoints[scenarioIndex];
  sim.reset(cp.position.clone());
  yaw=cp.yaw; pitch=.34; travel=0; peak=0;
  smoothedFocus.copy(sim.position);
  camera.position.copy(sim.position).add(new THREE.Vector3(0,5,14));
  $('scenario').value=String(scenarioIndex);
  if(announce) notify(`${scenarioIndex+1} · ${cp.name} — ${cp.description}`,5);
}
function showDialog(id) {
  setVisible('help',false);setVisible('tuning',false);
  setVisible(id,true);setPaused(true);setVisible('pause',false);
  if(document.pointerLockElement) document.exitPointerLock();
  $(id).querySelector('button').focus();
}
function closeDialog(id) { setVisible(id,false);if(started) resume(); }
$('start').onclick=start;
$('resume').onclick=resume;
$('reset').onclick=()=>resetScenario(scenarioIndex);
$('help-button').onclick=()=>showDialog('help');
$('tuning-button').onclick=()=>showDialog('tuning');
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeDialog(button.dataset.close));
document.addEventListener('pointerlockchange',()=>{
  locked=document.pointerLockElement===canvas;
  if(!locked && started && !paused) setPaused(true);
});
window.addEventListener('blur',()=>{if(started)setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden && started)setPaused(true);});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('mousedown',event=>{
  if(!started)return;
  if(paused){resume();return;}
  dragging=true;lastMouse={x:event.clientX,y:event.clientY};
  if(event.button===0){mouseCable=!!sim.anchor||tryAttach();}
});
window.addEventListener('mouseup',event=>{
  dragging=false;
  if(event.button===0){if(mouseCable)sim.release();mouseCable=false;}
});
window.addEventListener('mousemove',event=>{
  if(!started || paused)return;
  if(locked || dragging) {
    const dx=locked?event.movementX:event.clientX-lastMouse.x;
    const dy=locked?event.movementY:event.clientY-lastMouse.y;
    yaw+=dx*.0025;
    pitch=clamp(pitch-dy*.0022,-.95,1.05);
    cameraSteerUntil=performance.now()+170;
    lastMouse={x:event.clientX,y:event.clientY};
  }
});
window.addEventListener('keydown',event=>{
  if(['INPUT','SELECT'].includes(event.target.tagName))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
  if(event.repeat){keys.add(event.code);return;}
  if(event.code==='KeyH'){showDialog('help');return;}
  if(event.code==='KeyP'){showDialog('tuning');return;}
  if(event.code==='Escape'){
    if(!$('help').classList.contains('hidden'))closeDialog('help');
    else if(!$('tuning').classList.contains('hidden'))closeDialog('tuning');
    else if(started)setPaused(true);
    return;
  }
  if(!started || paused)return;
  keys.add(event.code);
  if(event.code==='KeyE'){if(sim.anchor)sim.release();else tryAttach();}
  if(event.code==='Digit0')resetScenario(scenarioIndex);
  if(/^Digit[1-4]$/.test(event.code))resetScenario(Number(event.code.slice(-1))-1);
  if(event.code==='KeyV'){telemetryVisible=!telemetryVisible;setVisible('telemetry',telemetryVisible);}
  if(event.code==='KeyX')manualTrick=true;
  if(event.code==='KeyF'){const hit=selectAnchor(sim.position,getAim(),buildings,{...sim.config,range:35});if(!sim.startZip(hit))notify('Zip: mire a até 35 m. A carga recarrega após pousar.');}
});
window.addEventListener('keyup',event=>keys.delete(event.code));

function getAim() {
  camera.getWorldDirection(aim);
  return aim;
}
function tryAttach(silent=false) {
  if(sim.anchor)return true;
  currentCandidate=selectAnchor(sim.position,getAim(),buildings,sim.config);
  if(!currentCandidate){if(!silent)notify('Sem ancoragem. Mire numa fachada acima e clique novamente.');return false;}
  const attached=sim.attach(currentCandidate);
  if(attached){pulseSound(180,.07);return true;}
  if(!silent)notify('Ancoragem obstruída ou fora do alcance.');
  return false;
}

const sliders = [
  ['gravity','Gravidade',8,35,.5,'m/s²'],['range','Alcance da mira',30,150,1,'m'],
  ['swingDrive','Ajuda no balanço',0,4,.25,'m/s²'],['damping','Amortecimento',0,.15,.003,'s⁻¹'],
  ['swingControl','Direção durante o balanço',0,30,1,'m/s²'],
  ['lookControl','Direção pela câmera',0,20,1,'m/s²'],
  ['airControl','Controle aéreo',0,7,.25,'m/s²'],['assistAngle','Cone da mira',0,40,1,'°'],
  ['speedAssist','Assistência de velocidade',0,5,.25,'m/s²'],
];
function buildSliders() {
  $('sliders').replaceChildren();
  for(const [key,label,min,max,step,unit] of sliders) {
    const row=document.createElement('div');row.className='slider-row';
    const input=document.createElement('input');Object.assign(input,{type:'range',id:`setting-${key}`,min,max,step,value:sim.config[key]??DEFAULTS[key]});
    const caption=document.createElement('label');caption.htmlFor=input.id;caption.textContent=label;
    const output=document.createElement('output');output.htmlFor=input.id;
    const update=()=>{sim.config[key]=Number(input.value);output.textContent=`${Number(input.value)} ${unit}`;};
    input.oninput=update;update();row.append(caption,input,output);$('sliders').append(row);
  }
}
buildSliders();
$('physical-preset').onclick=()=>{Object.assign(sim.config,{speedAssist:0,swingDrive:0,swingControl:0,lookControl:0,easySwing:false,airControl:0,damping:0,fallDrag:0,assistAngle:0});buildSliders();};
$('default-preset').onclick=()=>{Object.assign(sim.config,PLAY_DEFAULTS);buildSliders();};
$('quality').onchange=()=>{
  const high=$('quality').value==='high';renderer.setPixelRatio(high?Math.min(devicePixelRatio,1.5):1);renderer.shadowMap.enabled=high;
};
city.checkpoints.forEach((cp,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1} · ${cp.name}`;$('scenario').append(option);});
$('scenario').onchange=()=>resetScenario(Number($('scenario').value));

// Browser-generated noise and tones; no downloaded audio or licensed samples.
function setupAudio() {
  if(audioContext){audioContext.resume();return;}
  audioContext=new (window.AudioContext||window.webkitAudioContext)();
  const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.35;
  const source=audioContext.createBufferSource();source.buffer=buffer;source.loop=true;
  windFilter=audioContext.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=400;
  windGain=audioContext.createGain();windGain.gain.value=0;
  source.connect(windFilter).connect(windGain).connect(audioContext.destination);source.start();
}
function pulseSound(frequency,duration) {
  if(!soundOn||!audioContext)return;
  const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();
  oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency*1.7,audioContext.currentTime+duration);
  gain.gain.setValueAtTime(.045,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);
  oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+duration);
}
$('sound').onclick=()=>{soundOn=!soundOn;if(soundOn)setupAudio();$('sound').textContent=`Áudio: ${soundOn?'on':'off'}`;};

function updateCamera(dt) {
  const speed=sim.velocity.length();
  const cos=Math.cos(pitch);
  const look=new THREE.Vector3(Math.sin(yaw)*cos,Math.sin(pitch),-Math.cos(yaw)*cos);
  right.set(Math.cos(yaw),0,Math.sin(yaw));
  const focus=sim.position.clone().add(new THREE.Vector3(0,.7,0));
  const prediction=sim.velocity.clone().multiplyScalar(.07);prediction.clampLength(0,3.2);focus.add(prediction);
  smoothedFocus.lerp(focus,1-Math.exp(-16*dt));
  cameraDistance=THREE.MathUtils.lerp(cameraDistance,12+Math.min(speed*.15,6),1-Math.exp(-5*dt));
  desiredCamera.copy(smoothedFocus).addScaledVector(look,-cameraDistance).add(new THREE.Vector3(0,4,0)).addScaledVector(right,2.2);
  // Collide a small camera box, including the smoothed final path: no wall clipping on lerp.
  const origin=sim.position.clone().add(new THREE.Vector3(0,.7,0));
  const offset=desiredCamera.clone().sub(origin),distance=offset.length();
  const hit=raycastBuildings(origin,offset.clone().normalize(),distance,buildings,.32);
  cameraClearance=hit?hit.distance:distance;
  if(hit)desiredCamera.copy(origin).addScaledVector(offset.normalize(),Math.max(.15,hit.distance-.18));
  desiredCamera.y=Math.max(.45,desiredCamera.y);
  camera.position.lerp(desiredCamera,1-Math.exp(-18*dt));
  const finalOffset=camera.position.clone().sub(origin),finalDist=finalOffset.length();
  const finalHit=raycastBuildings(origin,finalOffset.clone().normalize(),finalDist,buildings,.32);
  if(finalHit)camera.position.copy(origin).addScaledVector(finalOffset.normalize(),Math.max(.15,finalHit.distance-.18));
  camera.position.y=Math.max(.45,camera.position.y);
  camera.lookAt(smoothedFocus.clone().addScaledVector(look,8));
  const bank=clamp(sim.velocity.dot(right)*-.0015,-.045,.045);
  camera.rotateZ(bank);
  camera.fov=THREE.MathUtils.lerp(camera.fov,66+clamp((speed-15)*.2,0,9),1-Math.exp(-4*dt));
  camera.updateProjectionMatrix();
  hero.visible=camera.position.distanceTo(sim.position)>1.4;
}

function updateHero(dt) {
  courier.update(dt,sim,{dive:(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!sim.anchor,manualTrick});
  manualTrick=false;
}

function updateRope() {
  const active=sim.anchor??sim.zipTarget;
  rope.visible=!!active;anchorOrb.visible=!!active;
  if(!active)return;
  const a=courier.getCableOrigin(),route=[...sim.ropeBends,active.point];
  const distance=route.reduce((sum,point,index)=>sum+(index?route[index-1]:a).distanceTo(point),0);
  const sag=sim.anchor?Math.min(12,Math.sqrt(Math.max(0,sim.ropeLength**2-distance**2))*.42):0;
  for(let i=0;i<=32;i++){
    const t=i/32;
    const total=distance*t;let walked=0,from=a,to=route[0];
    for(const point of route){const segment=from.distanceTo(point);if(total<=walked+segment){to=point;break;}walked+=segment;from=point;to=point;}
    const ratio=to===from?0:(total-walked)/Math.max(.001,from.distanceTo(to));
    ropePoints[i*3]=THREE.MathUtils.lerp(from.x,to.x,ratio);
    ropePoints[i*3+1]=THREE.MathUtils.lerp(from.y,to.y,ratio)-4*t*(1-t)*sag;
    ropePoints[i*3+2]=THREE.MathUtils.lerp(from.z,to.z,ratio);
  }
  ropeGeometry.attributes.position.needsUpdate=true;
  anchorOrb.position.copy(active.point);
}

const mapContext=$('minimap').getContext('2d');
function drawMap() {
  const ctx=mapContext,s=200/328;
  ctx.clearRect(0,0,200,200);ctx.fillStyle='#1d3638';ctx.fillRect(0,0,200,200);
  for(const b of buildings){ctx.fillStyle=`rgba(169,190,171,${.2+b.max.y/240})`;ctx.fillRect((b.min.x+164)*s,(b.min.z+164)*s,(b.max.x-b.min.x)*s,(b.max.z-b.min.z)*s);}
  const x=(sim.position.x+164)*s,z=(sim.position.z+164)*s;
  if(sim.anchor){ctx.strokeStyle='#ddff8b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,z);ctx.lineTo((sim.anchor.point.x+164)*s,(sim.anchor.point.z+164)*s);ctx.stroke();}
  ctx.save();ctx.translate(x,z);ctx.rotate(yaw);ctx.fillStyle='#e4ff94';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,5);ctx.lineTo(0,3);ctx.lineTo(-4,5);ctx.closePath();ctx.fill();ctx.restore();
}
function updateHUD() {
  const speed=sim.velocity.length();peak=Math.max(peak,speed);
  $('speed-value').textContent=Math.round(speed*3.6);
  $('speed-bar').style.width=`${Math.min(100,speed/65*100)}%`;
  $('rope-value').textContent=sim.anchor?`${sim.ropeLength.toFixed(1)} m · ${sim.tension>1?'tenso':'frouxo'}`:'livre';
  $('tension-value').textContent=`${Math.round(sim.tension||0).toLocaleString('pt-BR')} N`;
  $('altitude-value').textContent=`${Math.max(0,sim.position.y-1).toFixed(1)} m`;
  $('anchor-value').textContent=sim.anchor?.buildingId??'—';
  $('anchor-pos').textContent=sim.anchor?sim.anchor.point.toArray().map(n=>n.toFixed(1)).join(' / '):'—';
  $('fps-value').textContent=`${Math.round(fps)} fps · ${renderer.info.render.calls} draws`;
  $('tension-bar').style.width=`${Math.min(100,(sim.tension||0)/7000*100)}%`;
  displayedState=sim.grounded?(speed>1?'CORRENDO':sim.position.y>3?'NO TELHADO':'NO CHÃO'):sim.anchor?(sim.tension>1?'EM BALANÇO':'CABO FROUXO'):(keys.has('ShiftLeft')||keys.has('ShiftRight'))?'MERGULHO':sim.velocity.y>1?'EM ASCENSÃO':'QUEDA LIVRE';
  if(sim.zipTarget)displayedState='ZIP';else if(sim.wallActive)displayedState='NA PAREDE';else if(sim.cableBlocked)displayedState='CABO CONTORNANDO';else if(sim.groundPullRemaining>0)displayedState='PUXADA INICIAL';
  $('state-pill').querySelector('span').textContent=displayedState;
  $('hint').textContent=sim.cableBlocked?'O cabo contornou a quina. Continue a virar a câmera ou use WASD.':sim.anchor?'Vire a câmera para conduzir o arco. W segue a mira; S afasta; A/D desviam.':sim.grounded?'Mire no prédio e segure: a puxada inicial tira você do chão.':currentCandidate?'Ancoragem disponível. Segure o clique ou pressione E.':'Mire numa fachada próxima. O cabo não se prende ao céu.';
  $('distance-value').textContent=`${Math.round(travel)} m percorridos`;
  $('reticle').classList.toggle('valid',!!currentCandidate);
  drawMap();
}
function updateAnchorMarker() {
  const target=sim.anchor??currentCandidate;
  markerRing.visible=!!target && started && !paused;
  if(target) {
    markerRing.position.copy(target.point);markerRing.lookAt(camera.position);
    markerRing.scale.setScalar(clamp(camera.position.distanceTo(target.point)/40,.5,2.5));
    projected.copy(target.point).project(camera);
    const visible=projected.z<1 && projected.z>-1 && Math.abs(projected.x)<.95 && Math.abs(projected.y)<.9 && !paused && started;
    setVisible('anchor-marker',visible);
    if(visible){$('anchor-marker').style.left=`${(projected.x*.5+.5)*innerWidth+12}px`;$('anchor-marker').style.top=`${(-projected.y*.5+.5)*innerHeight-8}px`;$('anchor-marker').querySelector('span').textContent=`${sim.anchor?'CONECTADO':'SUPERFÍCIE'} · ${Math.round(sim.position.distanceTo(target.point))} m`;}
  } else setVisible('anchor-marker',false);
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt=(now-previousTime)/1000;previousTime=now;
  const dt=Math.min(rawDt,.1);
  if(rawDt>0)fps=THREE.MathUtils.lerp(fps,1/rawDt,.04);
  if(started&&!paused) {
    gameTime+=dt;
    if(keys.has('ArrowLeft'))yaw-=dt*1.4;
    if(keys.has('ArrowRight'))yaw+=dt*1.4;
    if(keys.has('ArrowUp'))pitch=clamp(pitch+dt*.8,-.95,1.05);
    if(keys.has('ArrowDown'))pitch=clamp(pitch-dt*.8,-.95,1.05);
    forward.set(Math.sin(yaw),0,-Math.cos(yaw));right.set(Math.cos(yaw),0,Math.sin(yaw));
    const move=forward.clone().multiplyScalar((keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)).addScaledVector(right,(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0));
    if(move.lengthSq()>1)move.normalize();
    oldPosition.copy(sim.position);
    const previousAnchor=sim.anchor;
    sim.step(dt,{move,aim:now<cameraSteerUntil?forward.clone():null,jump:keys.has('Space'),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight'),dive:keys.has('ShiftLeft')||keys.has('ShiftRight'),reel:0,wall:keys.has('KeyC'),climb:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)});
    keys.delete('Space');
    if(previousAnchor&&!sim.anchor)notify('Cabo liberado: o trajeto encontrou um obstáculo.');
    travel+=sim.position.distanceTo(oldPosition);
    if(Math.abs(sim.position.x)>170||Math.abs(sim.position.z)>170||sim.position.y< -5){resetScenario(scenarioIndex,false);notify('Limite do distrito. Você voltou ao ponto de teste.');}
    updateCamera(dt);
    currentCandidate=selectAnchor(sim.position,getAim(),buildings,sim.config);
    updateHero(dt);
  } else if(!started) {
    camera.position.set(174,138,215);camera.lookAt(-6,43,-5);
    hero.position.copy(sim.position);
  }
  updateRope();updateAnchorMarker();
  if(now-lastHud>90){updateHUD();lastHud=now;}
  const speed=sim.velocity.length();
  $('speed-lines').style.opacity=paused?0:clamp((speed-24)/100,0,.38);
  if(windGain){windGain.gain.setTargetAtTime(soundOn&&!paused?clamp(speed/80,0,.4):0,audioContext.currentTime,.2);windFilter.frequency.setTargetAtTime(250+speed*18,audioContext.currentTime,.2);}
  if(toastUntil&&now>toastUntil){$('toast').classList.remove('visible');toastUntil=0;}
  surroundings.update(now/1000,camera);
  renderer.render(scene,camera);
}
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
// A narrow inspection surface for repeatable local acceptance checks.
window.fio={sim,buildings,city,camera,renderer,courier,resetScenario,tryAttach,setPaused,
  setView:(y,p)=>{yaw=y;pitch=p;},
  get status(){return {started,paused,fps,travel,peak,state:displayedState,cameraClearance,candidate:currentCandidate?.buildingId??null};}
};
$('loading').classList.add('hidden');
requestAnimationFrame(frame);
