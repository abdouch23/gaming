const DEF={seed:11,shape:'natural',pit:'grate',trunk:true,leavesOn:true,cut:false,props:false,turn:false,trunkH:2.5,trunkR:.28,flare:.6,wobble:.3,whiteH:0,branches:5,branchR:.55,reach:.62,cw:3.6,cd:3.6,ch:2.7,crownLift:.35,leaves:6500,leafSize:.23,hue:0,leafVar:.5};
const PRE=[['شجرة مقصوصة',{shape:'cube',ch:1.8,leaves:12000}],
['شجرة ٢ منحنية',{seed:23,cw:3.4,cd:3.2,ch:1.8,wobble:.7,branches:6,leaves:9000,leafSize:.18,trunkR:.24}],
['شجرة طبيعية',{seed:5,shape:'natural',cw:2.3,cd:2.3,ch:2.5,trunkH:2.2,trunkR:.14,wobble:.55,branches:4,leaves:4800,leafSize:.2,whiteH:1.1,flare:.3}],
['جذع مقلّم',{seed:8,cut:true,leavesOn:false,branches:3,wobble:.6,trunkR:.26,whiteH:1.3}],
['سياج مشذّب',{seed:3,trunk:false,pit:'none',props:false,cw:3.2,cd:1.4,ch:1.1,leaves:12000,leafSize:.15}]];
let P={...DEF};
const L={preset:'studio',exposure:1.05,azimuth:45,roughness:.48,normal:.45,coat:.22};
const SC=[['الجذع',[['trunkH','الارتفاع',1.2,4,.05],['trunkR','سماكة الجذع',.1,.5,.01],['flare','توسّع القاعدة',0,1.5,.05],['wobble','التعرّج',0,1.2,.05],['whiteH','ارتفاع الطلاء الأبيض',0,3,.05]]],
['الأغصان',[['branches','عدد الأغصان',2,9,1],['branchR','سماكة الأغصان',.2,.9,.02],['reach','امتداد الأغصان',.3,1,.02]]],
['التاج',[['cw','العرض',1,6,.05],['cd','العمق',.6,6,.05],['ch','الارتفاع',.6,4,.05],['crownLift','رفع التاج',-.8,1,.05]]],
['الأوراق',[['leaves','الكثافة',500,30000,500],['leafSize','حجم الورقة',.06,.4,.01],['hue','درجة اللون',-.08,.1,.005],['leafVar','تباين اللون',0,1,.05]]]];
/* ---------- المشهد ---------- */
const view=document.getElementById('view');
if(!window.THREE){
 view.innerHTML='<div style="padding:28px;max-width:620px;direction:rtl;color:#f1f1f1;font:16px/1.8 system-ui"><h2>تعذّر تحميل محرك العرض Three.js</h2><p>تحقق من اتصال الإنترنت أو اسمح بتحميل المكتبات من CDN ثم أعد فتح الملف.</p></div>';
 throw new Error('Three.js library failed to load');
}
let R,needsRender=true;
try{R=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
catch(err){
 view.innerHTML='<div style="padding:28px;max-width:620px;direction:rtl;color:#f1f1f1;font:16px/1.8 system-ui"><h2>تعذّر إنشاء WebGL Renderer</h2><p>فعّل تسريع الرسوميات (Hardware Acceleration) في المتصفح وتأكد من تحديث تعريف بطاقة الرسوميات.</p><p style="color:#aab">'+String(err.message||err)+'</p></div>';
 throw err;
}
R.setPixelRatio(Math.min(devicePixelRatio,2));R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;R.shadowMap.autoUpdate=false;
R.toneMapping=THREE.ACESFilmicToneMapping;R.outputEncoding=THREE.sRGBEncoding;view.prepend(R.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x202824);scene.fog=new THREE.FogExp2(0x202824,.028);
let contextLost=false;
R.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;document.getElementById('stat').textContent='فُقد اتصال WebGL — أعد تحميل الصفحة';});
R.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;fit();build();});
const cam=new THREE.PerspectiveCamera(24,1,.1,100);
const sky=new THREE.HemisphereLight(0xdce9e8,0x544e39,.8);scene.add(sky);
const sun=new THREE.DirectionalLight(0xfff1dc,2.6);sun.position.set(7,10,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:1,far:30});sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
const rim=new THREE.DirectionalLight(0xe8edce,1.5);rim.position.set(-5,6,-4);scene.add(rim);
const fill=new THREE.DirectionalLight(0xc0d9ec,.45);fill.position.set(-6,3,5);scene.add(fill);
const floorMaterial=new THREE.MeshStandardMaterial({color:0x404740,roughness:.92});
const sp=new THREE.Mesh(new THREE.PlaneGeometry(200,200),floorMaterial);sp.rotation.x=-Math.PI/2;sp.position.y=-.025;sp.receiveShadow=true;scene.add(sp);
/* مدار الكاميرا */
let th=.78,ph=1.32,ds=12.8;const tg=new THREE.Vector3(0,2.3,0);
function place(){cam.position.set(tg.x+ds*Math.sin(ph)*Math.sin(th),tg.y+ds*Math.cos(ph),tg.z+ds*Math.sin(ph)*Math.cos(th));cam.lookAt(tg)}
const ptr=new Map();let pd=0;const el=R.domElement;el.style.touchAction='none';
el.addEventListener('pointerdown',e=>{el.setPointerCapture(e.pointerId);ptr.set(e.pointerId,e);pd=0});
el.addEventListener('pointermove',e=>{const o=ptr.get(e.pointerId);if(!o)return;ptr.set(e.pointerId,e);
 if(ptr.size==1){th-=(e.clientX-o.clientX)*.007;ph=Math.min(1.5,Math.max(.25,ph-(e.clientY-o.clientY)*.007))}
 else if(ptr.size==2){const[a,b]=[...ptr.values()],d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);if(pd)ds=Math.min(40,Math.max(6,ds*pd/d));pd=d}});
['pointerup','pointercancel'].forEach(t=>el.addEventListener(t,e=>{ptr.delete(e.pointerId);pd=0}));
el.addEventListener('wheel',e=>{e.preventDefault();ds=Math.min(40,Math.max(6,ds*(1+e.deltaY*.001)))},{passive:false});
function fit(){needsRender=true;const w=view.clientWidth,h=view.clientHeight;if(!w||!h)return;R.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));R.setSize(w,h,false);cam.aspect=w/h;cam.fov=w/h<.9?38:32;cam.updateProjectionMatrix()}
if('ResizeObserver' in window)new ResizeObserver(fit).observe(view);else window.addEventListener('resize',fit);
/* ---------- خامات إجرائية ---------- */
function cv(w,h,f,srgb=true,rep=true){const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);
 if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.encoding=THREE.sRGBEncoding;t.anisotropy=4;return t}
const barkFn=(g,w,h)=>{g.fillStyle='#4a3b2d';g.fillRect(0,0,w,h);for(let i=0;i<900;i++){const x=Math.random()*w,y=Math.random()*h,l=20+Math.random()*60,d=Math.random()<.5;
 g.strokeStyle=d?'rgba(20,14,9,.35)':'rgba(130,105,78,.3)';g.lineWidth=1+Math.random()*3;g.beginPath();g.moveTo(x,y);g.lineTo(x+(Math.random()-.5)*6,y+l);g.stroke()}};
const barkT=cv(256,256,barkFn),bumpT=cv(256,256,barkFn,false);
const stoneFn=(g,w,h)=>{for(let i=0;i<2;i++)for(let j=0;j<2;j++){g.fillStyle=`hsl(38,8%,${48+Math.random()*12}%)`;g.fillRect(i*w/2,j*h/2,w/2,h/2)}
 for(let i=0;i<3000;i++){g.fillStyle=Math.random()<.5?'rgba(0,0,0,.09)':'rgba(255,255,255,.07)';g.fillRect(Math.random()*w,Math.random()*h,2,2)}
 g.strokeStyle='#4a463f';g.lineWidth=5;g.strokeRect(0,0,w,h);g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.moveTo(0,h/2);g.lineTo(w,h/2);g.stroke()};
const stoneT=cv(256,256,stoneFn);stoneT.repeat.set(.5,.5);
const textureLoader=new THREE.TextureLoader();
function leafTexture(file,srgb=false){const texture=textureLoader.load('assets/leaf/'+file,()=>{needsRender=true;R.shadowMap.needsUpdate=true},undefined,()=>{document.getElementById('msg').textContent='تعذّر تحميل خامة الورقة. أعد تحميل الصفحة.'});if(srgb)texture.encoding=THREE.sRGBEncoding;texture.anisotropy=Math.min(8,R.capabilities.getMaxAnisotropy());return texture}
const leafT=leafTexture('base-color.png',true),leafNormal=leafTexture('normal.png'),leafRoughness=leafTexture('roughness.png'),leafAO=leafTexture('ao.png');
const signT=cv(128,128,g=>{g.fillStyle='#1f4a9c';g.beginPath();g.arc(64,64,62,0,6.3);g.fill();g.strokeStyle='#c8202a';g.lineWidth=12;g.beginPath();g.arc(64,64,52,0,6.3);g.stroke();g.lineWidth=12;g.beginPath();g.moveTo(30,98);g.lineTo(98,30);g.stroke()},true,false);
const M={bark:new THREE.MeshStandardMaterial({map:barkT,bumpMap:bumpT,bumpScale:.045,roughness:.92}),
 lime:new THREE.MeshStandardMaterial({color:0xece7da,bumpMap:bumpT,bumpScale:.025,roughness:.92}),
 stone:new THREE.MeshStandardMaterial({map:stoneT,roughness:.9}),
 conc:new THREE.MeshStandardMaterial({color:0x8a867d,roughness:.95}),
 soil:new THREE.MeshStandardMaterial({color:0x3a2c20,bumpMap:bumpT,bumpScale:.04,roughness:1}),
 iron:new THREE.MeshStandardMaterial({color:0x2c2623,metalness:.55,roughness:.55}),
 leaf:new THREE.MeshPhysicalMaterial({map:leafT,normalMap:leafNormal,normalScale:new THREE.Vector2(L.normal,L.normal),roughnessMap:leafRoughness,aoMap:leafAO,aoMapIntensity:.35,alphaTest:.4,side:THREE.DoubleSide,roughness:L.roughness,metalness:0,clearcoat:L.coat,clearcoatRoughness:.38,envMapIntensity:.65}),
 lamp:new THREE.MeshStandardMaterial({color:0xffe2a8,emissive:0xffb85a,emissiveIntensity:.6,roughness:.3}),
 sign:new THREE.MeshStandardMaterial({map:signT,roughness:.5,metalness:.1})};
const depthM=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:leafT,alphaTest:.4,side:THREE.DoubleSide});
const leafG=new THREE.PlaneGeometry(1,1.7,2,4);{const p=leafG.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,-.18*p.getX(i)**2+.1*p.getY(i)**2);p.needsUpdate=true;leafG.computeVertexNormals();leafG.setAttribute('uv2',leafG.attributes.uv.clone())}
/* ---------- هندسة ---------- */
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function tube(B,c,t0,t1,seg,r0,r1,o={}){const rad=10,n=B.p.length/3,ref=Math.abs(c.getTangent(.5).y)>.8?V(0,0,1):V(0,1,0),len=c.getLength();
 for(let i=0;i<=seg;i++){const t=t0+(t1-t0)*i/seg,p=c.getPoint(t),T=c.getTangent(t),N=ref.clone().cross(T).normalize(),Bn=T.clone().cross(N);
  const base=(r0+(r1-r0)*Math.pow(t,.8))*(1+(o.flare||0)*Math.exp(-t*8));
  for(let j=0;j<=rad;j++){const a=j/rad*6.2832,g=1+.07*Math.sin(t*26+o.ph)*(.6+.4*Math.sin(a*3+o.ph)),r=base*g*(o.sc||1),cs=Math.cos(a),sn=Math.sin(a);
   B.p.push(p.x+(N.x*cs+Bn.x*sn)*r,p.y+(N.y*cs+Bn.y*sn)*r,p.z+(N.z*cs+Bn.z*sn)*r);B.u.push(j/rad,t*len*.5)}}
 for(let i=0;i<seg;i++)for(let j=0;j<rad;j++){const a=n+i*(rad+1)+j,b=a+rad+1;B.i.push(a,a+1,b,b,a+1,b+1)}
 if(o.cap){const L=n+seg*(rad+1),e=c.getPoint(t1),ci=B.p.length/3;B.p.push(e.x,e.y,e.z);B.u.push(.5,.5);for(let j=0;j<rad;j++)B.i.push(ci,L+j,L+j+1)}}
const geo=B=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(B.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(B.u,2));g.setIndex(B.i);g.computeVertexNormals();return g};
const mesh=(g,m,y=0)=>{const o=new THREE.Mesh(g,m);o.position.y=y;o.castShadow=o.receiveShadow=true;return o};
function sq(s){const h=s/2,sh=new THREE.Shape();sh.moveTo(-h,-h);sh.lineTo(h,-h);sh.lineTo(h,h);sh.lineTo(-h,h);sh.closePath();return sh}
function hole(sh,pts){const p=new THREE.Path();pts.forEach((q,i)=>i?p.lineTo(q[0],q[1]):p.moveTo(q[0],q[1]));p.closePath();sh.holes.push(p)}
function slab(sh,d,m,y){const g=new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:false});g.rotateX(-Math.PI/2);return mesh(g,m,y)}
let G=null,cy=0,ph0=0;
function samp(r){const hx=P.cw/2,hy=P.ch/2,hz=P.cd/2;let q,rho;
 if(P.shape==='cube'){q=V(r()*2-1,r()*2-1,r()*2-1);if(r()<.72){const ax=r()<.37?0:r()<.5?1:2,s=ax==1?(r()<.88?1:-1):(r()<.5?1:-1),f=1-r()*r()*.45;q.setComponent(ax,s*f)}
  const L=q.length();if(L>1.45)q.multiplyScalar(1.45/L);rho=Math.max(Math.abs(q.x),Math.abs(q.y),Math.abs(q.z))}
 else{q=V(r()*2-1,r()*2-1,r()*2-1).normalize();let k=.65+.35*Math.pow(r(),.4);if(P.shape==='natural')k*=1+.18*Math.sin(q.x*3.7+ph0)*Math.cos(q.z*3.1+ph0*1.7)+.1*Math.sin(q.y*5+ph0);q.multiplyScalar(k);rho=Math.min(1.2,k)}
 return{p:V(q.x*hx,cy+q.y*hy,q.z*hz),rho}}
function build(){
 needsRender=true;R.shadowMap.needsUpdate=true;
 if(G){G.traverse(o=>{if(o.geometry&&o.geometry!==leafG)o.geometry.dispose()});scene.remove(G)}
 G=new THREE.Group();scene.add(G);const r=rng(P.seed);ph0=r()*10;
 cy=P.trunk?P.trunkH+P.crownLift:P.ch/2;
 if(P.pit!=='none'||P.trunk){const sh=sq(3.2);if(P.pit!=='none')hole(sh,[[-.75,-.75],[-.75,.75],[.75,.75],[.75,-.75]]);G.add(slab(sh,.14,M.stone,0));
  if(P.pit!=='none'){const cs=sq(1.64);hole(cs,[[-.75,-.75],[-.75,.75],[.75,.75],[.75,-.75]]);G.add(slab(cs,.05,M.conc,.14));G.add(mesh(new THREE.BoxGeometry(1.5,.05,1.5),M.soil,.07))}
  if(P.pit==='grate'){const pl=sq(1.46),rr=Math.max(.3,P.trunkR*(1+P.flare*.6)+.04),c=new THREE.Path();c.absarc(0,0,rr,0,6.2832,true);pl.holes.push(c);
   for(let k=0;k<4;k++)for(const off of[.54,.64]){const a=k*Math.PI/2,co=Math.cos(a),si=Math.sin(a);hole(pl,[[-.45,off],[-.45,off+.05],[.45,off+.05],[.45,off]].map(([x,y])=>[x*co-y*si,x*si+y*co]))}
   G.add(slab(pl,.04,M.iron,.1))}}
 const T=new THREE.Group();T.position.y=P.pit==='none'?.14:.09;G.add(T);
 if(P.trunk){const B=mesh0(),tc=(()=>{let x=0,z=0;const pts=[V(0,0,0)];for(let k=1;k<=4;k++){x+=(r()-.5)*P.wobble*.9;z+=(r()-.5)*P.wobble*.9;pts.push(V(x,P.trunkH*k/4,z))}return new THREE.CatmullRomCurve3(pts)})();
  tube(B,tc,0,1,22,P.trunkR,P.trunkR*.62,{flare:P.flare,cap:true,ph:r()*9});
  const n=P.branches,off=r()*6.28;
  for(let i=0;i<n;i++){const a=off+(i+.3*r())/n*6.2832,s=tc.getPoint(.8+.18*r()),
    e=V(Math.cos(a)*P.cw/2*P.reach*(.5+.5*r()),cy+(r()-.3)*P.ch*.35,Math.sin(a)*P.cd/2*P.reach*(.5+.5*r())),
    mid=s.clone().lerp(e,.5);mid.y+=.15+r()*.2;mid.x+=(r()-.5)*.3;mid.z+=(r()-.5)*.3;
    const bc=new THREE.CatmullRomCurve3([s,s.clone().add(V(Math.cos(a)*.12,.18,Math.sin(a)*.12)),mid,e]),b0=P.trunkR*P.branchR*(.85+.3*r());
    if(P.cut)tube(B,bc,0,.5+.22*r(),12,b0,b0*.62,{cap:true,ph:r()*9});else{tube(B,bc,0,1,12,b0,b0*.25,{ph:r()*9});
     for(let k=0;k<2;k++){const p0=bc.getPoint(.5+.3*r()),d=V(Math.cos(a+(r()-.5)*1.6),.2+r()*.5,Math.sin(a+(r()-.5)*1.6)).multiplyScalar(.5+r()*.6),
      tw=new THREE.CatmullRomCurve3([p0,p0.clone().addScaledVector(d,.5).add(V(0,.1,0)),p0.clone().add(d)]);tube(B,tw,0,1,6,b0*.38,.01,{ph:r()*9})}}}
  T.add(mesh(geo(B),M.bark));
  if(P.whiteH>0){const W=mesh0();tube(W,tc,0,Math.min(1,P.whiteH/P.trunkH),14,P.trunkR,P.trunkR*.62,{flare:P.flare,cap:true,sc:1.035,ph:r()*9});T.add(mesh(geo(W),M.lime))}}
 if(P.leavesOn){const N=P.leaves,m=new THREE.InstancedMesh(leafG,M.leaf,N),d=new THREE.Object3D(),c=new THREE.Color();
  for(let i=0;i<N;i++){const s=samp(r);d.position.copy(s.p);d.rotation.set(r()*6.28,r()*6.28,r()*6.28);d.scale.setScalar(P.leafSize*(.7+.6*r()));d.updateMatrix();m.setMatrixAt(i,d.matrix);
   c.setHSL(.22+P.hue+(r()-.5)*P.leafVar*.12,.12+P.leafVar*.12,.66+.22*Math.min(1,s.rho)+(r()-.5)*P.leafVar*.14);m.setColorAt(i,c)}
  m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;
  m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;m.customDepthMaterial=depthM;T.add(m)}
 if(P.props){const lm=new THREE.Group(),add=(g,y,m=M.iron)=>{const o=mesh(g,m,y);lm.add(o)};
  add(new THREE.CylinderGeometry(.16,.2,.3,10),.15);add(new THREE.CylinderGeometry(.09,.12,.5,10),.5);add(new THREE.CylinderGeometry(.045,.07,2.5,10),1.9);
  add(new THREE.CylinderGeometry(.2,.12,.5,6),3.35,M.lamp);
  add(new THREE.ConeGeometry(.28,.22,6),3.7);add(new THREE.SphereGeometry(.05,8,6),3.86);lm.position.set(2.7,0,-.4);G.add(lm);
  const sg=new THREE.Group();sg.add(mesh(new THREE.CylinderGeometry(.03,.03,2.4,8),M.iron,1.2));
  const face=mesh(new THREE.CylinderGeometry(.24,.24,.03,24),M.sign,2.25);face.rotation.x=Math.PI/2;face.position.z=.05;sg.add(face);
  sg.position.set(-2.6,0,.4);sg.rotation.y=.78;G.add(sg)}
 document.getElementById('stat').textContent=(P.leavesOn?P.leaves.toLocaleString('ar-EG')+' ورقة · ':'')+'البذرة '+P.seed}
const mesh0=()=>({p:[],u:[],i:[]});
/* ---------- الواجهة ---------- */
const ui=document.getElementById('generator'),ctl={};let q=0;
const redraw=()=>{if(!q)q=requestAnimationFrame(()=>{q=0;build()})};
const h=(t,a={},k=[])=>{const e=document.createElement(t);Object.assign(e,a);k.forEach(c=>e.append(c));return e};
function sync(){for(const k in ctl){const c=ctl[k];if(c.t==='r'){c.i.value=P[k];c.o.textContent=P[k]}else if(c.t==='c')c.i.checked=P[k];else c.i.value=P[k]}}
const topRow=h('div',{className:'row'}),seedI=h('input',{type:'number',value:P.seed,ariaLabel:'البذرة'});ctl.seed={t:'n',i:seedI};
seedI.oninput=()=>{P.seed=+seedI.value||0;redraw()};
const smartB=h('button',{className:'pri',textContent:'توليد ذكي'}),diceB=h('button',{textContent:'بذرة جديدة'});
topRow.append(smartB,diceB,seedI);ui.append(topRow);
diceB.onclick=()=>{P.seed=Math.floor(Math.random()*9999);sync();redraw()};
smartB.onclick=()=>{const r=Math.random;P.shape=r()<.55?'cube':r()<.6?'natural':'sphere';P.cw=+(2.2+r()*2.2).toFixed(2);P.cd=+(P.cw*(.85+.3*r())).toFixed(2);P.ch=+(1.2+r()*1.2).toFixed(2);
 P.trunkH=+(1.8+r()*1.3).toFixed(2);P.trunkR=+Math.min(.5,.12+P.trunkH*.05+r()*.08).toFixed(2);P.leaves=Math.min(24000,Math.max(2500,Math.round(P.cw*P.cd*P.ch*(P.shape==='cube'?420:520)/500)*500));
 P.leafSize=+(.13+r()*.08).toFixed(2);P.wobble=+(r()*.7).toFixed(2);P.branches=3+Math.floor(r()*5);P.whiteH=+(P.trunkH*(.35+.25*r())).toFixed(2);P.seed=Math.floor(r()*9999);P.trunk=true;P.leavesOn=true;P.cut=false;sync();redraw()};
const pr=h('div',{className:'row'});PRE.forEach(([n,o])=>{const b=h('button',{textContent:n});b.onclick=()=>{P={...DEF,...o};sync();redraw()};pr.append(b)});ui.append(pr);
SC.forEach(([title,items],si)=>{const d=h('details',{open:false});d.append(h('summary',{textContent:title}));
 items.forEach(([k,l,mn,mx,st])=>{const i=h('input',{type:'range',min:mn,max:mx,step:st,value:P[k],ariaLabel:l}),o=h('output',{textContent:P[k]});
  i.oninput=()=>{P[k]=+i.value;o.textContent=P[k];redraw()};ctl[k]={t:'r',i,o};d.append(h('div',{className:'ctl'},[h('span',{textContent:l}),o,i]))});ui.append(d)});
const ds2=h('details',{open:true});ds2.append(h('summary',{textContent:'الشكل والمشهد'}));
function sel(k,l,opts){const s=h('select',{ariaLabel:l});opts.forEach(([v,t])=>s.append(h('option',{value:v,textContent:t})));s.onchange=()=>{P[k]=s.value;redraw()};ctl[k]={t:'s',i:s};ds2.append(h('label',{className:'sel'},[h('span',{textContent:l}),s]))}
function chk(k,l){const i=h('input',{type:'checkbox'});i.onchange=()=>{P[k]=i.checked;redraw()};ctl[k]={t:'c',i};ds2.append(h('label',{className:'chk'},[i,h('span',{textContent:l})]))}
sel('shape','شكل التاج',[['cube','مكعّب مشذّب'],['sphere','كروي'],['natural','طبيعي']]);sel('pit','حفرة الشجرة',[['grate','شبك حديدي'],['soil','تربة مكشوفة'],['none','بدون']]);
chk('trunk','إظهار الجذع');chk('leavesOn','إظهار الأوراق');chk('cut','تقليم الأغصان (جذع مقلّم)');chk('props','عمود إنارة ولافتة');
const tc=h('input',{type:'checkbox'});tc.onchange=()=>{P.turn=tc.checked};ctl.turn={t:'c',i:tc};ds2.append(h('label',{className:'chk'},[tc,h('span',{textContent:'دوران تلقائي'})]));
ui.append(ds2);
const cp=h('button',{textContent:'نسخ الإعدادات'}),msg=h('div',{id:'copy-message'});
cp.onclick=async()=>{const t=JSON.stringify({tree:P,lighting:L},null,2);try{await navigator.clipboard.writeText(t);msg.textContent='تم نسخ الإعدادات (JSON).'}catch(e){msg.textContent=t}};
ui.append(h('div',{className:'row'},[cp]),msg);
const lightingPresets={
 studio:{sun:2.8,sky:.85,rim:1.8,fill:.6,color:0xffefd5,bg:0x202824,ground:0x404740},
 daylight:{sun:3.2,sky:1.3,rim:.65,fill:.4,color:0xfff6e5,bg:0x81949b,ground:0x626858},
 sunset:{sun:2.6,sky:.55,rim:2.2,fill:.3,color:0xffb565,bg:0x37302d,ground:0x55483b}
};
function updateLighting(){needsRender=true;R.shadowMap.needsUpdate=true;const p=lightingPresets[L.preset];R.toneMappingExposure=L.exposure;sun.color.setHex(p.color);sun.intensity=p.sun;sky.intensity=p.sky;rim.intensity=p.rim;fill.intensity=p.fill;const a=L.azimuth*Math.PI/180;sun.position.set(Math.sin(a)*8,9,Math.cos(a)*8);scene.background.setHex(p.bg);scene.fog.color.setHex(p.bg);floorMaterial.color.setHex(p.ground);M.leaf.roughness=L.roughness;M.leaf.normalScale.setScalar(L.normal);M.leaf.clearcoat=L.coat;document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.light===L.preset)))}
document.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>{L.preset=b.dataset.light;updateLighting()});
for(const [key,label,min,max,step] of [['exposure','التعريض',.4,2,.05],['azimuth','اتجاه الشمس',0,360,5],['roughness','خشونة الورقة',.15,1,.05],['normal','تفاصيل السطح',0,1,.05],['coat','لمعان الطبقة الشمعية',0,.6,.02]]){const input=h('input',{type:'range',min,max,step,value:L[key],ariaLabel:label}),out=h('output',{textContent:L[key]});input.dataset.setting=key;input.oninput=()=>{L[key]=+input.value;out.textContent=L[key];updateLighting()};document.getElementById(key==='exposure'||key==='azimuth'?'light-controls':'material-controls').append(h('div',{className:'ctl'},[h('span',{textContent:label}),out,input]))}
document.getElementById('reset-view').onclick=()=>{th=.78;ph=1.32;ds=12.8;tg.set(0,2.3,0)};
document.getElementById('save-image').onclick=()=>{place();R.render(scene,cam);const a=document.createElement('a');a.download='arboreal-tree-'+P.seed+'.png';a.href=R.domElement.toDataURL('image/png');a.click()};
document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{document.getElementById('map-image').src='assets/leaf/'+b.dataset.map;document.getElementById('map-title').textContent=b.getAttribute('aria-label');document.getElementById('map-dialog').showModal()});
document.getElementById('close-map').onclick=()=>document.getElementById('map-dialog').close();
updateLighting();sync();fit();build();
let lastCamera='';
(function loop(){if(!contextLost){if(P.turn&&!matchMedia('(prefers-reduced-motion: reduce)').matches)th+=.004;const cameraKey=[th,ph,ds,cam.aspect].join(',');if(needsRender||cameraKey!==lastCamera){place();R.render(scene,cam);needsRender=false;lastCamera=cameraKey}}requestAnimationFrame(loop)})();
