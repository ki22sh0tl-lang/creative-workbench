import * as THREE from '/vendor/three.module.js';

// A single renderer; layout coordinates also position the accessible HTML nodes.
export function createUniverse(canvas, onFrame) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' }); }
  catch { canvas.classList.add('universe-fallback'); return { layout: () => {}, pause: () => {}, dispose: () => {} }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 3000);
  camera.position.z = 1000;
  scene.add(new THREE.AmbientLight(0xb8c7dc, 2));
  const light = new THREE.PointLight(0xffd591, 18000, 900, 1.4); light.position.set(-50, 60, 170); scene.add(light);
  const fill = new THREE.DirectionalLight(0xe3e6ff, 3); fill.position.set(1, 1, 2); scene.add(fill);
  let seed = 752;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.08,'rgba(255,255,255,.8)'); g.addColorStop(.25,'rgba(255,255,255,.22)'); g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,128,128); return new THREE.CanvasTexture(c);
  }
  const glow = glowTexture();
  function sprite(color, scale, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(scale,scale,1); return s;
  }
  function constellation(radius, count, color, spread = 1, lineOpacity = null) {
    const points = [], links = [];
    for (let i=0;i<count;i++) {
      const z = random()*2-1, theta = random()*Math.PI*2, r = radius*(.85+random()*.4);
      points.push(new THREE.Vector3(Math.sqrt(1-z*z)*Math.cos(theta)*r, z*r*spread, Math.sqrt(1-z*z)*Math.sin(theta)*r));
    }
    for(let i=0;i<count;i++) for(let j=i+1;j<count;j++) if(points[i].distanceToSquared(points[j]) < (radius*.34)**2) links.push(...points[i].toArray(),...points[j].toArray());
    const group = new THREE.Group();
    const pg = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Points(pg, new THREE.PointsMaterial({ color, size: radius>80?3.8:2, map: glow, transparent:true, opacity:.85, blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:false })));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(links,3));
    if(lineOpacity!==0)group.add(new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color,transparent:true,opacity:lineOpacity??(radius>80?.10:.24),depthWrite:false})));
    return group;
  }
  function coreOrb(radius, color, main=false) {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const geometry = new THREE.IcosahedronGeometry(radius, main?3:2);
    const pos = geometry.attributes.position;
    for(let i=0;i<pos.count;i++) {
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      const distortion=1+.11*Math.sin(x*.037+y*.025)*Math.cos(z*.052)+.07*Math.sin(y*.086+z*.033);
      pos.setXYZ(i,x*distortion,y*distortion,z*distortion);
    }
    geometry.computeVertexNormals();
    body.add(new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({color:main?0x17181d:0x24272d,metalness:.9,roughness:.34,transparent:true,opacity:main?.40:.26,side:THREE.DoubleSide,depthWrite:false})));
    body.add(new THREE.LineSegments(new THREE.WireframeGeometry(geometry),new THREE.LineBasicMaterial({color:main?0xabb0bc:color,transparent:true,opacity:main?.18:.25,depthWrite:false})));
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(radius*.50,2),new THREE.MeshStandardMaterial({color:0x09090d,metalness:1,roughness:.36,flatShading:true})); body.add(inner);
    const net=constellation(radius*1.6,main?200:65,color,main?.64:1); body.add(net);
    const aura=sprite(main?0xbbc1d0:color,radius*5,main?.13:.10); aura.position.z=-radius; group.add(aura);
    const sparks = new THREE.Group(); body.add(sparks);
    const shards=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1,0),new THREE.MeshBasicMaterial({transparent:true,opacity:.80}),main?24:6);
    const dummy=new THREE.Object3D();sparks.add(shards);
    for(let i=0;i<(main?24:6);i++) {
      const angle=random()*Math.PI*2, polar=random()*Math.PI, r=radius*(.45+random()*.30);
      const size=main?3+random()*8:1.8;
      const colorValue=main?new THREE.Color().setHSL(.10+random()*.04,.65,.55+random()*.35):new THREE.Color(color);
      const shard=dummy;shard.scale.setScalar(size);
      shard.position.set(Math.cos(angle)*Math.sin(polar)*r,Math.cos(polar)*r,Math.sin(angle)*Math.sin(polar)*r);
      shard.rotation.set(random()*6,random()*6,random()*6); shard.updateMatrix();shards.setMatrixAt(i,shard.matrix);shards.setColorAt(i,colorValue);
      if(i%4===0) { const flame=sprite(main?0xffca79:color,main?56:15,main?.9:.6); flame.position.copy(shard.position); sparks.add(flame); }
    }
    if(main) {
      const heart=sprite(0xffd38c,95,.82); heart.position.set(-16,-12,35); body.add(heart);
      const dots=constellation(radius*.63,100,0xe9c793); body.add(dots);
      const rays=[];
      for(let i=0;i<40;i++){const a=random()*Math.PI*2,z=(random()-.5)*100,r=radius*(1.25+random()*.2),end=r+20+random()*80;rays.push(Math.cos(a)*r,Math.sin(a)*r,z,Math.cos(a)*end,Math.sin(a)*end,z);}
      const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rays,3));
      body.add(new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:0xc7c5be,transparent:true,opacity:.12})));
    }
    scene.add(group); return { group, body, net, sparks };
  }
  function orb(radius, color) {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const geometry = new THREE.IcosahedronGeometry(radius, 2);
    const pos = geometry.attributes.position;
    for(let i=0;i<pos.count;i++) {
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      const distortion=1+.11*Math.sin(x*.037+y*.025)*Math.cos(z*.052)+.07*Math.sin(y*.086+z*.033);
      pos.setXYZ(i,x*distortion,y*distortion,z*distortion);
    }
    geometry.computeVertexNormals();
    body.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x24272d,metalness:.8,roughness:.4,transparent:true,opacity:.20,depthWrite:false})));
    body.add(new THREE.LineSegments(new THREE.WireframeGeometry(geometry),new THREE.LineBasicMaterial({color,transparent:true,opacity:.28,depthWrite:false})));
    const net=constellation(radius*1.6,55,color); body.add(net);
    const aura=sprite(color,radius*5,.13); aura.position.z=-radius; group.add(aura);
    const sparks = new THREE.Group(); body.add(sparks);
    const shards=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1.8,0),new THREE.MeshBasicMaterial({color}),6),dummy=new THREE.Object3D();
    for(let i=0;i<6;i++){
      const angle=random()*Math.PI*2,r=radius*.63;
      dummy.position.set(Math.cos(angle)*r,Math.sin(angle)*r,(random()-.5)*radius);dummy.rotation.set(random()*6,random()*6,random()*6);dummy.updateMatrix();shards.setMatrixAt(i,dummy.matrix);
    }
    sparks.add(shards);
    scene.add(group); return { group, body, net, sparks };
  }
  const core=coreOrb(108,0xbdc0d5,true);
  const colors=[0xbbc5e6,0xd9c99d,0x9dcac6,0xc2b5e0,0xd5b8a5];
  const satellites=colors.map(c=>orb(29,c));
  const orbs=[core,...satellites];
  const background=constellation(700,110,0x9498a9,.65,0); background.position.z=-400;scene.add(background);
  let width=1,height=1, current=null, from=null,target=null, started=0, raf=0, enabled=true, moving=false;
  let pointer={x:0,y:0}, previous=0, elapsed=0, dirty=true, disposed=false;
  // Opt-in, DOM-readable frame diagnostics for repeatable local profiling.
  const profiling = new URLSearchParams(location.search).has('perf');
  let samples=[], lastSample=0, reportAt=0, transitionSamples=[], wasMoving=false;
  const summarize=samples=>{
    const frames=samples.map(s=>s.frame).sort((a,b)=>a-b),cpu=samples.map(s=>s.cpu).sort((a,b)=>a-b);
    return {samples:samples.length,fps:+(1000/(samples.reduce((a,s)=>a+s.frame,0)/samples.length)).toFixed(1),frameP95:+frames[Math.floor(frames.length*.95)].toFixed(2),cpuP95:+cpu[Math.floor(cpu.length*.95)].toFixed(2),framesOver33ms:samples.filter(s=>s.frame>33.4).length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio()};
  };
  function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;if(width<1||height<1)return;renderer.setSize(width,height,false);camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();dirty=true;}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  const move=e=>{pointer.x=(e.clientX/innerWidth-.5);pointer.y=(e.clientY/innerHeight-.5);};window.addEventListener('pointermove',move,{passive:true});
  function render(now){
    if(disposed)return;
    raf=requestAnimationFrame(render);
    if(document.hidden||!target||(!enabled&&!moving)){previous=now;lastSample=0;return;}
    if(reduced.matches&&!dirty&&!moving)return;
    // Render on every display refresh; never discard alternate animation frames.
    const cpuStart=profiling?performance.now():0;
    wasMoving=moving;
    const dt=Math.min(previous?(now-previous)/1000:0,.05); previous=now; if(enabled&&!reduced.matches)elapsed+=dt;
    if(moving){
      const p=reduced.matches?1:Math.min(1,(now-started)/760),ease=1-Math.pow(1-p,4);
      for(let i=0;i<target.length;i++){
        current[i].x=from[i].x+(target[i].x-from[i].x)*ease;
        current[i].y=from[i].y+(target[i].y-from[i].y)*ease;
        current[i].s=from[i].s+(target[i].s-from[i].s)*ease;
      }
      onFrame?.(current,p);moving=p<1;
    }
    orbs.forEach((orb,i)=>{
      const v=current[i];orb.group.position.set(v.x-width/2,height/2-v.y,0);orb.group.scale.setScalar(v.s);
      orb.body.rotation.y=elapsed*(i? .035 : .052)+i;
      orb.body.rotation.z=Math.sin(elapsed*.10+i)*.06;
      if(!reduced.matches){orb.body.rotation.x=pointer.y*.10;orb.body.rotation.y+=pointer.x*.08;}
      orb.sparks.rotation.z=-elapsed*.09;orb.net.rotation.y=elapsed*.025;
    });
    light.position.set(core.group.position.x-40,core.group.position.y+50,150);
    background.rotation.y=elapsed*.002;
    renderer.render(scene,camera);
    dirty=false;
    if(profiling){
      if(lastSample){
        const sample={frame:now-lastSample,cpu:performance.now()-cpuStart};samples.push(sample);
        if(wasMoving)transitionSamples.push(sample);
      }
      lastSample=now;
      if(samples.length>300)samples.shift();
      if(now-reportAt>1000&&samples.length>15){
        canvas.dataset.perf=JSON.stringify(summarize(samples));reportAt=now;
      }
      if(wasMoving&&!moving&&transitionSamples.length>5)canvas.dataset.transitionPerf=JSON.stringify(summarize(transitionSamples));
    }
  }
  raf=requestAnimationFrame(render);
  return {
    layout(values,force=false){
      if(!force&&target&&values.every((v,i)=>v.x===target[i].x&&v.y===target[i].y&&v.s===target[i].s)){dirty=true;return;}
      from=(current||values).map(v=>({...v}));current=from.map(v=>({...v}));target=values;started=performance.now();moving=true;dirty=true;transitionSamples=[];onFrame?.(current,0);
    },
    pause(value){enabled=!value;previous=0;lastSample=0;dirty=true;},
    dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('pointermove',move);scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});glow.dispose();renderer.dispose();}
  };
}
