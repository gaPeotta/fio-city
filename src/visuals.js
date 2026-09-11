import * as T from '../vendor/three.module.js';

export function createCourier(scene) {
  const hero = new T.Group(), rig = new T.Group();
  hero.add(rig); scene.add(hero);
  const material = color => new T.MeshStandardMaterial({ color, roughness: .65 });
  const suit = material(0x173e49), armor = material(0x287181), sand = material(0xf2dcad);
  const orange = material(0xf9844d), dark = material(0x142834), light = material(0xddff91);
  light.emissive.set(0x8bbd4f); light.emissiveIntensity = .35;
  function mesh(geometry, mat, x, y, z, parent = rig) {
    const m = new T.Mesh(geometry, mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
  }
  const box = (x,y,z) => new T.BoxGeometry(x,y,z);
  const capsule = (r,h) => new T.CapsuleGeometry(r,h,3,10);
  mesh(capsule(.26,.42),suit,0,.12,0);
  mesh(box(.47,.36,.1),armor,0,.22,-.24);
  mesh(box(.53,.12,.39),orange,0,-.15,0);
  for(const x of [-.18,.18])mesh(box(.055,.51,.45),orange,x,.15,0).rotation.z=x*.4;
  mesh(box(.14,.14,.045),light,0,.24,-.305).rotation.z=Math.PI/4;
  mesh(box(.32,.38,.17),dark,0,.27,.3);
  mesh(new T.CylinderGeometry(.14,.14,.22,12),orange,0,.17,.41).rotation.x=Math.PI/2;
  mesh(new T.TorusGeometry(.105,.018,5,16),light,0,.17,.535);
  mesh(new T.SphereGeometry(.235,16,12),sand,0,.71,0);
  mesh(new T.SphereGeometry(.241,16,8,0,Math.PI*2,0,Math.PI*.48),armor,0,.72,0);
  mesh(box(.34,.12,.12),dark,0,.73,-.212);
  mesh(box(.28,.023,.018),light,0,.75,-.28);
  for(const x of [-.23,.23])mesh(new T.CylinderGeometry(.09,.09,.05,10),orange,x,.71,0).rotation.z=Math.PI/2;
  const scarf=mesh(box(.2,.07,.54),orange,0,.47,.27);
  const shoulders=[], elbows=[], hands=[], hips=[], knees=[];
  for(const side of [-1,1]) {
    const arm=new T.Group();arm.position.set(side*.32,.4,0);rig.add(arm);shoulders.push(arm);
    mesh(new T.SphereGeometry(.145,10,7),armor,0,0,0,arm);
    mesh(capsule(.087,.17),suit,0,-.17,0,arm);
    const elbow=new T.Group();elbow.position.y=-.31;arm.add(elbow);elbows.push(elbow);
    mesh(capsule(.082,.15),armor,0,-.13,0,elbow);
    mesh(box(.17,.12,.19),orange,0,-.235,0,elbow);
    const hand=mesh(new T.SphereGeometry(.096,10,7),dark,0,-.31,0,elbow);hands.push(hand);
    const leg=new T.Group();leg.position.set(side*.155,-.24,0);rig.add(leg);hips.push(leg);
    mesh(capsule(.115,.17),suit,0,-.16,0,leg);
    const knee=new T.Group();knee.position.y=-.3;leg.add(knee);knees.push(knee);
    mesh(new T.SphereGeometry(.125,8,6),armor,0,0,-.055,knee);
    mesh(capsule(.097,.17),suit,0,-.16,0,knee);
    mesh(box(.09,.19,.06),sand,0,-.16,-.105,knee);
    mesh(box(.215,.15,.32),dark,0,-.325,-.055,knee);
    mesh(box(.22,.035,.33),orange,0,-.392,-.055,knee);
  }
  let clock=0, attached=false, grounded=false, flip=0, cooldown=0, squash=0;
  const localDirection=new T.Vector3(), inverse=new T.Quaternion(), down=new T.Vector3(0,-1,0);
  function clearance(sim) {
    let floor=0;
    for(const b of sim.buildings)if(sim.position.x>b.min.x-3&&sim.position.x<b.max.x+3&&sim.position.z>b.min.z-3&&sim.position.z<b.max.z+3&&b.max.y<sim.position.y)floor=Math.max(floor,b.max.y);
    return sim.position.y-floor;
  }
  return {hero,rig,hands,
    update(dt,sim,{dive=false,manualTrick=false}={}) {
      clock+=dt;cooldown=Math.max(0,cooldown-dt);
      hero.position.copy(sim.position);
      const speed=sim.velocity.length(), horizontal=Math.hypot(sim.velocity.x,sim.velocity.z);
      if(horizontal>1){const a=Math.atan2(-sim.velocity.x,-sim.velocity.z);hero.rotation.y+=Math.atan2(Math.sin(a-hero.rotation.y),Math.cos(a-hero.rotation.y))*(1-Math.exp(-12*dt));}
      const justReleased=attached&&!sim.anchor;
      const space=clearance(sim);
      // Somersaults only change the rig. Never position, velocity or the collision shape.
      if(!sim.grounded&&!sim.anchor&&cooldown===0&&space>20&&sim.velocity.y>-12&&((justReleased&&speed>17)||manualTrick)){flip=1;cooldown=1.4;}
      if(sim.grounded||sim.anchor||space<7)flip=0;
      if(sim.grounded&&!grounded)squash=.22;
      attached=!!sim.anchor;grounded=sim.grounded;squash=Math.max(0,squash-dt);
      const blend=1-Math.exp(-12*dt),run=sim.grounded?Math.sin(clock*Math.max(4,horizontal)*1.65)*Math.min(horizontal/16,.7):0;
      const lean=sim.anchor?T.MathUtils.clamp(-sim.velocity.y*.014,-.6,.45):dive?-1.1:sim.velocity.y>2?-.18:.16;
      rig.rotation.x=T.MathUtils.lerp(rig.rotation.x,lean,blend);rig.rotation.z=0;
      rig.scale.set(1+squash*.35,1-squash*.8,1+squash*.35);
      for(let i=0;i<2;i++){
        const sign=i===0?1:-1;
        hips[i].rotation.x=T.MathUtils.lerp(hips[i].rotation.x,run*sign+(sim.anchor?.45+i*.2:flip?.95:0),blend);
        knees[i].rotation.x=T.MathUtils.lerp(knees[i].rotation.x,sim.anchor?-.6-i*.25:flip?-1.6:-Math.max(0,run*sign),blend);
        shoulders[i].rotation.set(-run*sign+(dive?.4:-.1),0,sign*(sim.grounded?.08:.42));
        elbows[i].rotation.x=T.MathUtils.lerp(elbows[i].rotation.x,sim.anchor?-.08:flip?-1.3:-.25,blend);
      }
      if(flip>0){flip=Math.max(0,flip-dt/ .8);const t=1-flip;rig.rotation.x=flip>0?lean-2*Math.PI*(t*t*(3-2*t)):lean;}
      scarf.rotation.x=-.2-Math.min(speed/70,.8)+Math.sin(clock*13)*Math.min(speed/140,.15);
      if(sim.anchor){
        rig.updateWorldMatrix(true,true);
        inverse.copy(rig.getWorldQuaternion(new T.Quaternion())).invert();
        const shoulder=shoulders[1].getWorldPosition(new T.Vector3());
        localDirection.copy(sim.ropeBends?.[0] ?? sim.anchor.point).sub(shoulder).normalize().applyQuaternion(inverse);
        shoulders[1].quaternion.setFromUnitVectors(down,localDirection);
        shoulders[0].rotation.x=1.9+Math.sin(clock*2)*.12;
      }
      hero.updateWorldMatrix(true,true);
    },
    getCableOrigin(target=new T.Vector3()){return hands[1].getWorldPosition(target);}
  };
}

export function buildSurroundings(scene) {
  const sky = new T.Mesh(new T.SphereGeometry(850,32,18),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,
    uniforms:{top:{value:new T.Color(0x6dacc9)},horizon:{value:new T.Color(0xf7d8b1)}},
    vertexShader:'varying vec3 world; void main(){ world=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'uniform vec3 top; uniform vec3 horizon; varying vec3 world; void main(){ float h=clamp(normalize(world).y,0.,1.); gl_FragColor=vec4(mix(horizon,top,pow(h,.65)),1.); }'}));
  sky.name='Gradient sky';scene.add(sky);
  const disk = new T.Mesh(new T.SphereGeometry(24,24,16),new T.MeshBasicMaterial({color:0xffedbd,fog:false}));
  disk.position.set(-330,360,-510);disk.name='Visible sun';scene.add(disk);
  const glow = new T.Sprite(new T.SpriteMaterial({map:glowTexture(),color:0xffc980,transparent:true,opacity:.45,depthWrite:false,fog:false}));
  glow.position.copy(disk.position);glow.scale.set(165,165,1);scene.add(glow);
  const water = new T.Mesh(new T.PlaneGeometry(1800,1800),new T.ShaderMaterial({
    uniforms:{time:{value:0}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float time;varying vec3 p;void main(){float w=sin(p.x*.14+p.y*.31+time*.5)*sin(p.y*.7-time*.7);float line=pow(max(0.,w),9.);gl_FragColor=vec4(mix(vec3(.13,.33,.39),vec3(.52,.66,.65),line*.38),1.);}'
  }));water.rotation.x=-Math.PI/2;water.position.y=-4.1;water.name='Harbor water';scene.add(water);
  const items=[],trees=[],trunks=[],lamps=[],clouds=[];
  const add=(list,x,y,z,sx,sy,sz,color)=>list.push({x,y,z,sx,sy,sz,color});
  add(items,0,-2.1,0,346,4,346,0x787b70);
  for(const s of [-1,1]){
    add(items,s*169,-.015,0,8,.03,342,0xa6a38c);add(items,0,-.015,s*169,342,.03,8,0xa6a38c);
    // Decorative piers and trees are beyond the playable district boundary.
    add(items,s*177,-.25,0,8,.5,346,0x758368);add(items,0,-.25,s*177,346,.5,8,0x758368);
    for(let p=-154;p<=154;p+=22){
      for(const [x,z] of [[s*177,p],[p,s*177]]){
        add(trunks,x,1.8,z,.35,3.6,.35,0x655649);add(trees,x,5,z,3.7,4.7,3.7,0x5c8066);
        add(items,x+(Math.abs(x)>170?-2:0),.42,z+(Math.abs(z)>170?-2:0),2,.18,.5,0x8d6b50);
      }
    }
    for(let p=-145;p<=145;p+=40){add(lamps,s*171,2.2,p,.1,4.4,.1,0x374c4d);add(lamps,p,2.2,s*171,.1,4.4,.1,0x374c4d);}
  }
  // Distant boroughs are scenery: outside the district and outside cable range.
  for(let i=0;i<90;i++){
    const angle=i/90*Math.PI*2,radius=440+(i%7)*19;
    const height=22+(i*37%105);
    add(items,Math.sin(angle)*radius,height/2-4,Math.cos(angle)*radius,17+i%15,height,20+i%11,i%3?0x80969b:0x9ba6a0);
  }
  for(let i=0;i<16;i++)add(clouds,Math.sin(i*2.2)*520,260+(i%4)*30,Math.cos(i*2.2)*520,50+i%3*20,8,22,0xffefda);
  const dummy=new T.Object3D();
  function batch(list,geometry,mat){const m=new T.InstancedMesh(geometry,mat,list.length);list.forEach((a,i)=>{dummy.position.set(a.x,a.y,a.z);dummy.scale.set(a.sx,a.sy,a.sz);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,new T.Color(a.color));});m.computeBoundingSphere();scene.add(m);return m;}
  batch(items,new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({roughness:.95}));
  batch(trunks,new T.CylinderGeometry(.5,.6,1,6),new T.MeshStandardMaterial({roughness:1}));
  batch(trees,new T.IcosahedronGeometry(.65,1),new T.MeshStandardMaterial({roughness:1}));
  batch(lamps,new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({roughness:.6}));
  batch(clouds,new T.IcosahedronGeometry(.7,1),new T.MeshBasicMaterial({color:0xfff2df,transparent:true,opacity:.45,depthWrite:false,fog:false}));
  return {update(time,camera){water.material.uniforms.time.value=time;sky.position.copy(camera.position);}};
}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,235,190,1)');g.addColorStop(.28,'rgba(255,225,170,.6)');g.addColorStop(1,'rgba(255,220,165,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new T.CanvasTexture(c);}
