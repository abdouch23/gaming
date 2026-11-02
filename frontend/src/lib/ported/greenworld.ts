// @ts-nocheck
/* Ported verbatim (logic) from the user's green_world.html: procedural terrain splat shading,
   instanced wind-blown grass + wildflowers, procedural trees (oak / birch / conifer / bush) and rocks.
   Adapted to three r187 + the night level: world height/splat come from the level. */
import * as THREE from "three";

export function createGreenKit(o) {
const UT={value:0},UW={value:o.wind??1},UD={value:0},USUN={value:o.sunDir};
const skyMat={uniforms:{uTop:{value:o.skyTop},uHor:{value:o.skyHor}}};
const G=16;const H=o.height;const groundAt=o.splat;const Q=o.quality;
const TAU=Math.PI*2;
const cl=(x,a,b)=>x<a?a:x>b?b:x,lp=(a,b,t)=>a+(b-a)*t,ss=(a,b,x)=>{const t=cl((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hh(x,y,s){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(s|0,1274126177);h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296;}
function vn(x,y,s){const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);const a=hh(ix,iy,s),b=hh(ix+1,iy,s),c=hh(ix,iy+1,s),d=hh(ix+1,iy+1,s);return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;}
function fbm2(x,y,s,o){let a=.5,f=1,sum=0,nr=0;for(let i=0;i<o;i++){sum+=a*vn(x*f+i*17.3,y*f-i*9.1,s+i*7);nr+=a;f*=2.03;a*=.5;}return sum/nr;}
const h3=(x,y,z)=>{let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1274126177);h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296;};
function n3(x,y,z){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let fx=x-ix,fy=y-iy,fz=z-iz;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);
 const a=(i,j,k)=>h3(ix+i,iy+j,iz+k);
 return lp(lp(lp(a(0,0,0),a(1,0,0),fx),lp(a(0,1,0),a(1,1,0),fx),fy),lp(lp(a(0,0,1),a(1,0,1),fx),lp(a(0,1,1),a(1,1,1),fx),fy),fz);}
const fb3=(x,y,z)=>.55*n3(x,y,z)+.3*n3(x*2.1,y*2.1,z*2.1)+.15*n3(x*4.3,y*4.3,z*4.3);
const SKYG=`uniform vec3 uSunD,uSkyT,uSkyH;
vec3 skyG(vec3 d){float h=clamp(d.y,0.,1.);vec3 c=mix(uSkyH,uSkyT,pow(h,.45));float s=max(dot(d,uSunD),0.);c+=vec3(1.,.8,.55)*pow(s,5.)*.16+vec3(1.,.95,.85)*pow(s,400.)*3.;return mix(vec3(.05,.09,.04),c,smoothstep(-.2,.05,d.y));}
`;
const SKYU={uSunD:USUN,uSkyT:skyMat.uniforms.uTop,uSkyH:skyMat.uniforms.uHor};
const NOISE=`float hsh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float nb(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 grassTint(vec2 p){float a=nb(vec3(p*.012,7.)),b=nb(vec3(p*.06,1.)),c=nb(vec3(p*.4,2.));
 vec3 col=mix(vec3(.14,.33,.07),vec3(.07,.23,.06),smoothstep(.4,.7,a));
 col=mix(col,vec3(.3,.33,.09),smoothstep(.55,.9,b*.55+(1.-a)*.55)*.7);
 return col*(.8+.4*c);}
vec3 vor(vec2 p){vec2 i=floor(p),f=fract(p);float md=9.,id=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(hsh(vec3(i+g,1.)),hsh(vec3(i+g,2.)));vec2 r=g+o*.8+.1-f;float d=dot(r,r);if(d<md){md=d;id=hsh(vec3(i+g,3.));}}return vec3(sqrt(md),id,0.);}
vec3 stn(vec2 p,float cov,float rr,float fade){vec3 v=vor(p);float id=v.y,r=rr*(.55+.45*fract(id*7.3)),d=v.x/r,m=step(cov,fract(id*13.1))*fade;return vec3(m*sqrt(max(1.-d*d,0.)),m*smoothstep(.8,1.,d)*(1.-smoothstep(1.,1.35,d)),id);}
vec3 stc(float id){vec3 c=mix(vec3(.3,.29,.28),vec3(.64,.55,.42),fract(id*5.7));c=mix(c,vec3(.46,.3,.18),step(.65,fract(id*2.9))*.7);return c*(.6+.6*fract(id*3.3));}
`;
const PNA=`vec3 pnA(vec3 sp,vec3 sn,vec2 dh,float fdir){vec3 sx=dFdx(sp),sy=dFdy(sp),r1=cross(sy,sn),r2=cross(sn,sx);float det=dot(sx,r1)*fdir;vec3 g=sign(det)*(dh.x*r1+dh.y*r2);return normalize(abs(det)*sn-g);}
`;
const NFIX='#ifdef DOUBLE_SIDED\nnormal*=faceDirection;\n#endif';   // keep normals as authored on both faces
function shade(mat,key,o){
 mat.customProgramCacheKey=()=>key;
 mat.onBeforeCompile=sh=>{
  for(const k in(o.u||{}))sh.uniforms[k]=o.u[k];
  let v=sh.vertexShader,f=sh.fragmentShader;
  v=v.replace('void main() {',(o.vd||'')+'\nvoid main() {');
  if(o.vn)v=v.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n'+o.vn);
  if(o.vb)v=v.replace('#include <begin_vertex>',o.vb);
  if(o.vp)v=v.replace('#include <project_vertex>','#include <project_vertex>\n'+o.vp);
  f=f.replace('#include <common>','#include <common>\n'+(o.fd||''));
  if(o.fc)f=f.replace('#include <color_fragment>',o.fc);
  if(o.fn)f=f.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n'+o.fn);
  if(o.fb)f=f.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+o.fb);
  if(o.fr)f=f.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+o.fr);
  if(o.fe)f=f.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n'+o.fe);
  sh.vertexShader=v;sh.fragmentShader=f;};
}
const WPOS_VP=`#ifdef USE_INSTANCING
vWP=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
#else
vWP=(modelMatrix*vec4(transformed,1.)).xyz;
#endif`;

/* ---- terrain material ---- */
const tMat=new THREE.MeshStandardMaterial({roughness:.96,metalness:0});
shade(tMat,'terrain',{u:{...SKYU,uDbg:UD},fr:'roughnessFactor=mix(roughnessFactor,.03,pud);',
 fr:'roughnessFactor=mix(roughnessFactor,.03,pud);',
 vd:'attribute vec4 aSplat;varying vec4 vSplat;varying vec3 vWP;',
 vp:'vSplat=aSplat;vWP=(modelMatrix*vec4(transformed,1.)).xyz;',
 fd:'varying vec4 vSplat;varying vec3 vWP;uniform float uDbg;\n'+SKYG+NOISE+PNA,
 fe:`{vec3 vdr=normalize(vWP-cameraPosition),wnp=normalize(mix(inverseTransformDirection(normal,viewMatrix),vec3(0.,1.,0.),pud));
float Fp=.2+.8*pow(1.-clamp(dot(-vdr,wnp),0.,1.),4.);vec3 rf=reflect(vdr,wnp);
vec2 cq=rf.xz/(max(rf.y,0.)+.18)*1.2+vWP.xz*0.;float cl_=smoothstep(.5,.7,nb(vec3(cq*1.3,5.))*.65+nb(vec3(cq*2.6,6.))*.35);
vec3 sk=mix(skyG(rf),uSkyH*1.8,cl_*.7*step(0.,rf.y));
totalEmissiveRadiance+=sk*Fp*pud*.45;}`,
 fc:`float dC=distance(vWP,cameraPosition);vec2 q=vWP.xz;
float n1=1.-smoothstep(12.,40.,dC),n2=1.-smoothstep(3.,16.,dC),n3=1.-smoothstep(.7,5.,dC);
float g2=nb(vec3(q*1.7,3.)),g3=nb(vec3(q*7.,4.)),g4=nb(vec3(q*30.,5.)),g5=nb(vec3(q*130.,6.));
vec3 gc=grassTint(q)*mix(.5,1.,smoothstep(6.,60.,dC))*(.8+.4*g2);
gc*=1.+(g3-.5)*.55*n1+(g4-.5)*.55*n2+(g5-.5)*.7*n3;
float jag=(nb(vec3(q*2.7,13.))-.5)*.55*n1+(nb(vec3(q*.6,14.))-.5)*.3;
float wd=smoothstep(.35,.65,vSplat.g+jag),wr=smoothstep(.4,.62,vSplat.b+jag*.6);
float pud=wd*(1.-wr)*smoothstep(.62,.69,nb(vec3(q*.55,31.))*.7+nb(vec3(q*2.,32.))*.3)*(1.-smoothstep(45.,120.,dC));
float stH=0.,stM=0.,stR=0.;vec3 stC=vec3(.4);
if(wd+wr>.04&&dC<60.){
 vec3 sa=stn(q*2.3,.93,.45,1.-smoothstep(20.,60.,dC)),sb=stn(q*6.,.64,.42,1.-smoothstep(10.,40.,dC)),sc=stn(q*16.,.45,.4,1.-smoothstep(4.,16.,dC));
 float ha=sa.x*1.3,hb2=sb.x*.7,hc=sc.x*.4;stH=max(ha,max(hb2,hc));stC=stc(sa.z);
 if(hb2>ha){stC=stc(sb.z);}if(hc>max(ha,hb2)){stC=stc(sc.z);}
 stM=smoothstep(.02,.12,max(sa.x,max(sb.x,sc.x)));stR=max(sa.y,max(sb.y,sc.y));}
vec3 dc=mix(vec3(.27,.19,.12),vec3(.45,.34,.23),g2)*(1.+(g3-.5)*.5*n1+(g4-.5)*.7*n2+(g5-.5)*.5*n3);
dc=mix(dc,vec3(.34,.2,.1)*(.8+.4*g3),smoothstep(.55,.8,nb(vec3(q*.9,15.)))*.5);
vec3 rc=mix(vec3(.36,.35,.33),vec3(.56,.52,.45),nb(vec3(q*.7,9.)))*(1.+(g4-.5)*.6*n2+(g3-.5)*.4*n1);
dc=mix(dc*(1.-.55*stR),stC*(.6+.5*stH),stM);rc=mix(rc*(1.-.5*stR),stC*(.6+.5*stH),stM*.6);
vec3 col=mix(gc,dc,wd);col=mix(col,rc,wr);
col*=1.-.5*pud;
if(uDbg>.5){vec3 lc=vSplat.a<.5?vec3(1.,.35,.3):vSplat.a<1.5?vec3(1.,.85,.3):vec3(.35,.6,1.);col=mix(col,lc,.5);
 vec2 cm=mod(q,48.);float eb=min(min(cm.x,48.-cm.x),min(cm.y,48.-cm.y));col*=1.-.6*(1.-smoothstep(0.,.5+dC*.012,eb));}
diffuseColor.rgb=col;`,
 fb:`float hb=nb(vec3(q*2.2,21.))*.5+nb(vec3(q*8.,22.))*.3*n1+nb(vec3(q*28.,23.))*.2*n2+nb(vec3(q*105.,24.))*.15*n3+stH*.9;
normal=pnA(-vViewPosition,normal,vec2(dFdx(hb),dFdy(hb))*.035*(1.-pud*.95),faceDirection);`});

/* ---- grass blades + flowers (instanced, continuous density thinning) ---- */
const BLADE_VD='attribute vec3 aPos;attribute vec4 aRnd;attribute float aH;uniform float uT,uWind;varying vec3 vGC,vWP;varying float vGust;\n'+NOISE;
const BLADE_VN=`float ang=aRnd.x*6.2831853;float ca=cos(ang),sa=sin(ang);
vec3 bn=vec3(ca*normal.x+sa*normal.z,normal.y,-sa*normal.x+ca*normal.z);
objectNormal=normalize(mix(vec3(0.,1.,0.),bn,.4));`;
const WIND=`float bend=aH*aH;
vec2 wv=vec2(sin(uT*1.9+aPos.x*.55+aPos.z*.35),cos(uT*1.5+aPos.z*.6-aPos.x*.25))*.05*(.3+uWind)+vec2(sin(uT*.7+aPos.x*.07+aPos.z*.05),.4*cos(uT*.6+aPos.z*.06))*.16*uWind+vec2(.8,.6)*pow(.5+.5*sin(dot(aPos.xz,vec2(.8,.6))*.09-uT*1.3+sin(aPos.x*.03)*2.),2.)*.14*uWind;`;
const GRASS_VB=`float dd=distance(aPos,cameraPosition);
float fd=dd<20.?mix(1.,.25,smoothstep(7.,20.,dd)):dd<42.?mix(.25,.06,smoothstep(20.,42.,dd)):mix(.06,0.,smoothstep(42.,80.,dd));
float keep=step(aRnd.z,fd);
float sc=(.75+.75*aRnd.y)*keep*(1.-smoothstep(66.,80.,dd));
float ws=clamp(inversesqrt(max(fd,.05)),1.,3.4);
vec3 lpos=vec3(position.x*ws,position.y*sc,position.z*ws);
vec3 r=vec3(ca*lpos.x+sa*lpos.z,lpos.y,-sa*lpos.x+ca*lpos.z);
${'WIND'}
r.xz+=wv*bend*sc;r.y-=length(wv)*bend*sc*.35;
vec3 transformed=aPos+r;`.replace('${WIND}',WIND).replace('WIND',WIND);
const GRASS_VP=`vec3 tn=grassTint(aPos.xz);
float dry=smoothstep(.55,.9,nb(vec3(aPos.xz*.05,3.)))*.6+smoothstep(.88,1.,aRnd.w)*.5;
vec3 cb=tn*vec3(.5,.62,.4)*(.45+.55*aH),ct=tn*vec3(1.1,1.05,.65)+vec3(.02,.03,0.);
ct=mix(ct,vec3(.62,.52,.28)*(.8+.4*aRnd.w),dry*smoothstep(.2,1.,aH));
vGC=mix(cb,ct,smoothstep(0.,1.,aH))*(.7+.55*aRnd.w);vWP=transformed;
vGust=pow(.5+.5*sin(dot(aPos.xz,vec2(.8,.6))*.09-uT*1.3+sin(aPos.x*.03)*2.),2.);`;
const dbgCols=[new THREE.Color(1,.3,.25),new THREE.Color(1,.85,.25),new THREE.Color(.3,.55,1)];
const grassMats=[0,1,2].map(l=>{const m=new THREE.MeshStandardMaterial({roughness:.5,metalness:0,side:THREE.DoubleSide});
 shade(m,'grass',{u:{...SKYU,uT:UT,uWind:UW,uDbg:UD,uLC:{value:dbgCols[l]}},vd:BLADE_VD,vn:BLADE_VN,vb:GRASS_VB,vp:GRASS_VP,
  fd:'varying vec3 vGC,vWP;varying float vGust;uniform float uDbg;uniform vec3 uLC;\n'+SKYG,fc:'diffuseColor.rgb=mix(vGC,uLC,uDbg*.65);',fn:NFIX,fe:'{vec3 vdr=normalize(vWP-cameraPosition),wn=inverseTransformDirection(normal,viewMatrix);float F=.04+.96*pow(1.-clamp(abs(dot(vdr,wn)),0.,1.),3.);totalEmissiveRadiance+=skyG(reflect(vdr,wn))*F*(.12+.5*vGust)*.6;}float bl=pow(clamp(dot(normalize(vWP-cameraPosition),uSunD),0.,1.),2.5)*smoothstep(0.,.2,uSunD.y);totalEmissiveRadiance+=vGC*(.04+.55*bl)*vec3(1.,.95,.55);'});return m;});
const flowerMat=new THREE.MeshStandardMaterial({roughness:.5,metalness:0,side:THREE.DoubleSide});
shade(flowerMat,'flower',{u:{uT:UT,uWind:UW,uSunD:USUN},vd:BLADE_VD+'attribute float aK;\n',vn:BLADE_VN,
 vb:`float dd=distance(aPos,cameraPosition);float sc=(.7+.7*aRnd.y)*(1.-smoothstep(16.,26.,dd));
vec3 lpos=position*sc;vec3 r=vec3(ca*lpos.x+sa*lpos.z,lpos.y,-sa*lpos.x+ca*lpos.z);
${'WIND'}
r.xz+=wv*bend*sc*.8;
vec3 transformed=aPos+r;`.replace('${WIND}',WIND).replace('WIND',WIND),
 vp:`vec3 tn=grassTint(aPos.xz);float pr=aRnd.w;
vec3 pet=pr<.55?vec3(.97,.97,.93):pr<.8?vec3(.98,.8,.1):pr<.9?vec3(.62,.38,.78):vec3(.98,.5,.55);
vec3 stw=vec3(.66,.55,.3)*(.75+.5*aRnd.x),lf=tn*vec3(1.,1.25,.7)*(.6+.6*aH)*(.8+.5*aRnd.x);
vGC=aK<.5?tn*vec3(.9,1.1,.6)*(.6+.5*aH):aK<1.5?pet:aK<2.5?vec3(.95,.62,.05):aK<3.5?stw*(.8+.4*aH):lf;vWP=transformed;`,
 fd:'varying vec3 vGC,vWP;uniform vec3 uSunD;',fc:'diffuseColor.rgb=vGC;',fn:NFIX,fe:'float bl=pow(clamp(dot(normalize(vWP-cameraPosition),uSunD),0.,1.),2.5)*smoothstep(0.,.2,uSunD.y);totalEmissiveRadiance+=vGC*(.06+.5*bl)*vec3(1.,.95,.6);'});

/* ---- trees: bark / leaves / solid (far LOD) ---- */
const TREE_VD='uniform float uT,uWind;varying vec3 vWP;\n';
const TREE_VB=`vec3 transformed=vec3(position);
{vec3 ip=vec3(0.);
#ifdef USE_INSTANCING
ip=instanceMatrix[3].xyz;
#endif
float ph=uT*1.3+ip.x*.09+ip.z*.07+position.y*.35;
float sw=smoothstep(.6,10.,position.y)*(.04+.05*uWind);
transformed.x+=sin(ph)*sw;transformed.z+=cos(ph*.83+1.)*sw*.8;}`;
const TREE_FD='varying vec3 vWP;\n'+NOISE+PNA;
function barkMat(key,extra){const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:0,side:THREE.DoubleSide});
 shade(m,key,{u:{uT:UT,uWind:UW},vd:TREE_VD,vb:TREE_VB,vp:WPOS_VP,fd:TREE_FD,fn:NFIX,
  fc:`#include <color_fragment>
float bd=1.-smoothstep(5.,40.,distance(vWP,cameraPosition));
float s1=nb(vec3(vWP.x*8.,vWP.y*1.4,vWP.z*8.)),s2=nb(vec3(vWP.x*26.,vWP.y*4.,vWP.z*26.));
diffuseColor.rgb*=.7+.55*s1*(.55+.45*s2*bd);
${'EXTRA'}`.replace('${EXTRA}',extra||'').replace('EXTRA',extra||''),
  fb:'float hbk=s1*.6+s2*.4*bd;normal=pnA(-vViewPosition,normal,vec2(dFdx(hbk),dFdy(hbk))*.06,faceDirection);'});return m;}
const barkMats=[barkMat('barkOak'),
 barkMat('barkBirch','float mk=smoothstep(.55,.72,nb(vec3(vWP.x*3.,vWP.y*16.,vWP.z*3.)));diffuseColor.rgb*=1.-.8*mk;'),
 barkMat('barkConi')];
function leafMat(tex,key){const m=new THREE.MeshStandardMaterial({map:tex,alphaTest:.5,side:THREE.DoubleSide,vertexColors:true,roughness:.5,metalness:0});
 shade(m,key,{u:{...SKYU,uT:UT,uWind:UW},vd:TREE_VD,vb:TREE_VB,vp:WPOS_VP,fd:TREE_FD+SKYG,fn:NFIX,fc:'#include <color_fragment>\ndiffuseColor.rgb*=.84+.32*nb(vWP*.7);',
  fe:'float bl=pow(clamp(dot(normalize(vWP-cameraPosition),uSunD),0.,1.),3.)*smoothstep(0.,.25,uSunD.y);totalEmissiveRadiance+=diffuseColor.rgb*bl*.6*vec3(1.,.92,.55);{vec3 vdr=normalize(vWP-cameraPosition),wn=inverseTransformDirection(normal,viewMatrix);float F=.04+.96*pow(1.-clamp(abs(dot(vdr,wn)),0.,1.),3.);totalEmissiveRadiance+=skyG(reflect(vdr,wn))*F*.2;}'});return m;}
const solidMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:0,side:THREE.DoubleSide});
shade(solidMat,'solid',{u:{uT:UT,uWind:UW},vd:TREE_VD,vb:TREE_VB,vp:WPOS_VP,fd:TREE_FD,fn:NFIX,fc:'#include <color_fragment>\ndiffuseColor.rgb*=.8+.4*nb(vWP*.9);'});
const rockMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:0});
shade(rockMat,'rock',{vd:'varying vec3 vWP;\n',vp:WPOS_VP,fd:'varying vec3 vWP;\n'+NOISE+PNA,
 fb:`float hr=nb(vWP*1.5)*.5+nb(vWP*4.)*.2+nb(vWP*11.)*.08+nb(vWP*30.)*.03;normal=pnA(-vViewPosition,normal,vec2(dFdx(hr),dFdy(hr))*.35,faceDirection);
vec3 wn=inverseTransformDirection(normal,viewMatrix);float up=smoothstep(.4,.85,wn.y);
float mo=up*smoothstep(.3,.58,nb(vWP*2.3))*(.6+.4*nb(vWP*9.));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.1,.22,.05)*(.7+.6*nb(vWP*22.)),mo*.85);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.62,.42),smoothstep(.6,.72,nb(vWP*5.))*.3);
diffuseColor.rgb*=.8+.4*nb(vWP*38.)*(.6+.4*nb(vWP*90.));`});

const v3={add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],scl:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
 cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len:a=>Math.hypot(a[0],a[1],a[2]),nor:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];}};
class GB{constructor(){this.p=[];this.n=[];this.c=[];this.u=[];this.i=[];}
 vc(){return this.p.length/3;}
 vert(p,n,c,u,v){this.p.push(p[0],p[1],p[2]);this.n.push(n[0],n[1],n[2]);this.c.push(c[0],c[1],c[2]);this.u.push(u||0,v||0);return this.p.length/3-1;}
 geo(uv){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(this.u,2));g.setIndex(this.i);return g;}}
function tube(g,pts,rads,radial,c0,c1){const m=pts.length,base=g.vc();let u=null;
 for(let k=0;k<m;k++){const a=pts[Math.max(0,k-1)],b=pts[Math.min(m-1,k+1)],t=v3.nor(v3.sub(b,a));
  if(!u){u=v3.nor(v3.cross(t,Math.abs(t[1])<.9?[0,1,0]:[1,0,0]));}else{u=v3.nor(v3.sub(u,v3.scl(t,v3.dot(u,t))));}
  const w=v3.cross(t,u),f=k/(m-1),col=[lp(c0[0],c1[0],f),lp(c0[1],c1[1],f),lp(c0[2],c1[2],f)];
  for(let s=0;s<=radial;s++){const th=s/radial*TAU,cs=Math.cos(th),sn=Math.sin(th),nn=[u[0]*cs+w[0]*sn,u[1]*cs+w[1]*sn,u[2]*cs+w[2]*sn];g.vert(v3.add(pts[k],v3.scl(nn,rads[k])),nn,col,s/radial,f);}}
 for(let k=0;k<m-1;k++)for(let s=0;s<radial;s++){const a=base+k*(radial+1)+s,b=a+1,c=a+radial+1,d=c+1;g.i.push(a,c,b,b,c,d);}}
function card(g,base,ux,uy,w,h,col,nf,col2){const a=v3.add(base,v3.scl(ux,-w/2)),b=v3.add(base,v3.scl(ux,w/2)),c=v3.add(b,v3.scl(uy,h)),d=v3.add(a,v3.scl(uy,h));
 const P=[a,b,c,d],UV=[[0,0],[1,0],[1,1],[0,1]],id=P.map((p,k)=>g.vert(p,nf(p),k<2?col:(col2||col),UV[k][0],UV[k][1]));g.i.push(id[0],id[1],id[2],id[0],id[2],id[3]);}
function blob(g,cn,r,col,sd){const nu=11,nv=7,base=g.vc();
 for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const th=i/nu*TAU,ph=j/nv*Math.PI,x=Math.sin(ph)*Math.cos(th),y=Math.cos(ph),z=Math.sin(ph)*Math.sin(th),rr=r*(.8+.4*vn(x*2.1+cn[0]*.37+sd,y*2.1+z*1.7+cn[2]*.29,5)),sh=.62+.5*(y*.5+.5);
  g.vert([cn[0]+x*rr,cn[1]+y*rr*.8,cn[2]+z*rr],v3.nor([x,y*.9+.2,z]),[col[0]*sh,col[1]*sh,col[2]*sh],i/nu,j/nv);}
 for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=base+j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;g.i.push(a,c,b,b,c,d);}}
function cone(g,x,z,y0,y1,r0,col){const radial=9,rings=[[y0,r0,.62],[y0+(y1-y0)*.55,r0*.5,.85],[y1,.001,1]],base=g.vc();
 for(const[y,r,sh]of rings)for(let s=0;s<=radial;s++){const th=s/radial*TAU,cs=Math.cos(th),sn=Math.sin(th),jr=r*(1+.12*Math.sin(th*3+y));g.vert([x+cs*jr,y,z+sn*jr],v3.nor([cs,.55,sn]),[col[0]*sh,col[1]*sh,col[2]*sh],s/radial,0);}
 for(let k=0;k<2;k++)for(let s=0;s<radial;s++){const a=base+k*(radial+1)+s,b=a+1,c=a+radial+1,d=c+1;g.i.push(a,c,b,b,c,d);}}

function genBroad(seed,P){
 const R=rng(seed),br=[],anc=[],cls=[];
 function grow(pos,dir,len,rad,lvl){
  const segs=lvl===0?8:lvl===1?5:4,pts=[pos.slice()],rads=[rad];let p=pos.slice(),d=dir.slice();
  for(let s=1;s<=segs;s++){d=v3.nor([d[0]+(R()-.5)*P.wob,d[1]+(R()-.5)*P.wob*.5+P.up*(lvl?1:.35)*2/segs,d[2]+(R()-.5)*P.wob]);p=v3.add(p,v3.scl(d,len/segs));pts.push(p);rads.push(Math.max(rad*(1-.8*s/segs),.012));}
  br.push({pts,rads,lvl});
  if(lvl===1)for(let s=Math.ceil(segs*.6);s<=segs;s++)if(R()<.6)anc.push({p:pts[s],d:v3.nor(v3.sub(pts[Math.min(s+1,segs)],pts[Math.max(s-1,0)]))});
  if(lvl<2){const nc=lvl===0?P.n0:P.n1;
   for(let k=0;k<nc;k++){const t=lvl===0?P.t0+(1-P.t0)*R():.2+.75*R(),i=Math.min(segs-1,Math.floor(t*segs)),bp=v3.add(pts[i],v3.scl(v3.sub(pts[i+1],pts[i]),t*segs-i)),pd=v3.nor(v3.sub(pts[i+1],pts[i]));
    const u=v3.nor(v3.cross(pd,Math.abs(pd[1])<.9?[0,1,0]:[1,0,0])),w=v3.cross(pd,u),a=R()*TAU,sp=(lvl===0?P.a0:P.a1)*(.75+.5*R());
    const nd=v3.nor(v3.add(v3.scl(pd,Math.cos(sp)),v3.scl(v3.add(v3.scl(u,Math.cos(a)),v3.scl(w,Math.sin(a))),Math.sin(sp))));
    grow(bp,nd,len*(lvl===0?P.l0*(.7+.6*R()):P.l1*(.75+.5*R())),rads[i]*.62,lvl+1);}
  }else{for(let s=Math.floor(segs*.3);s<=segs;s++)anc.push({p:pts[s],d:v3.nor(v3.sub(pts[Math.min(s+1,segs)],pts[Math.max(s-1,0)]))});
   const m=pts.reduce((q,x)=>v3.add(q,x),[0,0,0]);cls.push({p:v3.scl(m,1/pts.length),r:len*.45+P.ls*1.1});}
 }
 grow([0,-.35,0],v3.nor([P.lean*(R()-.5),1,P.lean*(R()-.5)]),P.H*P.tf,P.R,0);
 const cc=v3.scl(anc.reduce((q,a)=>v3.add(q,a.p),[0,0,0]),1/anc.length);let cr=1;for(const a of anc)cr=Math.max(cr,v3.len(v3.sub(a.p,cc)));
 const nf=p=>{const d=v3.sub(p,cc);return v3.nor([d[0],d[1]*.8+cr*.25,d[2]]);};
 const b0=new GB(),b1=new GB(),l0=new GB(),l1=new GB(),s2=new GB();
 for(const b of br){const c0=v3.scl(P.bark,1-.1*b.lvl),c1=v3.scl(c0,1.12);
  tube(b0,b.pts,b.rads,b.lvl===0?10:b.lvl===1?6:4,c0,c1);
  if(b.lvl<2)tube(b1,b.pts,b.rads,b.lvl===0?6:4,c0,c1);
  if(b.lvl===0)tube(s2,b.pts,b.rads,5,c0,c1);}
 const shd=p=>lp(.55,1.1,cl(v3.len(v3.sub(p,cc))/cr,0,1));
 for(const a of anc)for(let k=0;k<P.cards;k++){
  const out=v3.nor(v3.sub(a.p,cc)),uy=v3.nor(v3.add(v3.add(v3.scl(a.d,.5),v3.scl(out,.7)),[(R()-.5)*1.6,(R()-.3)*1.2,(R()-.5)*1.6]));
  let ux=v3.nor(v3.cross(uy,Math.abs(uy[1])<.9?[0,1,0]:[1,0,0]));const ro=R()*TAU;ux=v3.add(v3.scl(ux,Math.cos(ro)),v3.scl(v3.cross(uy,ux),Math.sin(ro)));
  const s=P.ls*(.75+.5*R()),c=shd(a.p)*(.85+.3*R());card(l0,a.p,ux,uy,s*.9,s*1.15,[c*P.lc[0],c*P.lc[1],c*P.lc[2]],nf);}
 for(const c of cls){const s=c.r*2.1,sh=shd(c.p)*1.05;
  for(let k=0;k<3;k++){const yaw=R()*TAU+k*1.05,ux=k<2?[Math.cos(yaw),0,Math.sin(yaw)]:[1,0,0],uy=k<2?v3.nor([(R()-.5)*.5,1,(R()-.5)*.5]):[0,0,1],base=v3.sub(c.p,v3.scl(uy,s/2));
   const ux2=k<2?v3.nor(v3.cross(uy,v3.cross(ux,uy))):ux;card(l1,base,ux2,uy,s,s,[sh*P.lc[0],sh*P.lc[1],sh*P.lc[2]],nf);}
  blob(s2,c.p,c.r*.95,P.solid,seed);}
 return{b0,b1,l0,l1,s2};}

function genConifer(seed,P){
 const R=rng(seed),Ht=P.H,b0=new GB(),b1=new GB(),l0=new GB(),l1=new GB(),s2=new GB(),nw=Math.floor((Ht*.95-1.5)/P.step);
 const tp=t=>[Math.sin(t*3+seed)*.35*t,-.3+(Ht+.3)*t,Math.cos(t*2.3+seed)*.3*t];
 const tpts=[],trad=[];for(let k=0;k<=10;k++){const t=k/10;tpts.push(tp(t));trad.push(P.R*(1-t)*(1-t*.3)*(1-.5*t*t*t)+.012);}
 const cb0=P.bark,cb1=v3.scl(P.bark,1.1);tube(b0,tpts,trad,10,cb0,cb1);tube(b1,tpts,trad,6,cb0,cb1);tube(s2,tpts,trad,5,cb0,cb1);
 const nf=p=>v3.nor([p[0],.45,p[2]]);
 for(let w=0;w<nw;w++){
  const h=1.5+w*P.step,t=cl((h-1.5)/(Ht*.97-1.5),0,1),bp0=tp((h+.3)/(Ht+.3)),nbr=6+((R()*3)|0),Lb=P.rad*Math.pow(1-t,.8)*(.85+.3*R())+.3,off=R()*TAU;
  for(let k=0;k<nbr;k++){
   const a=off+k/nbr*TAU+(R()-.5)*.6,dx=Math.cos(a),dz=Math.sin(a),L=Lb*(.85+.3*R()),bp=[],br=[];
   for(let s=0;s<=4;s++){const u=s/4;bp.push([bp0[0]+dx*L*u,bp0[1]+L*(.16*u-.62*(1-.4*t)*u*u),bp0[2]+dz*L*u]);br.push(Math.max(.012,.05*(1-.6*t)*(1-.8*u)));}
   tube(b0,bp,br,4,cb0,cb1);
   const s0=bp[1],dir=v3.sub(bp[4],s0),len=v3.len(dir),uy=v3.nor(dir),side=v3.nor(v3.cross(uy,[0,1,0])),hgt=len*1.12+.25,wid=hgt*.78,c=(.8+.3*t)*(.88+.24*R());
   for(const ang of[0,.7,-.7,1.45]){const ux=v3.add(v3.scl(side,Math.cos(ang)),v3.scl(v3.cross(uy,side),Math.sin(ang)));card(l0,s0,ux,uy,wid,hgt,[c*.38,c*.42,c*.38],nf,[c*1.05,c*1.12,c*.95]);}
   if(w%2===0)card(l1,s0,side,uy,wid*1.45,hgt*1.3,[c*.45,c*.48,c*.45],nf,[c*1.05,c*1.1,c*.95]);}}
 for(let i=0;i<5;i++){const y0=1.2+i*(Ht-1.2)*.17,y1=Math.min(Ht+.2,y0+(Ht-y0)*.62+1.2);cone(s2,0,0,y0,y1,P.rad*(1-i*.19),v3.scl(P.solid,.85+.06*i));}
 return{b0,b1,l0,l1,s2};}

/* leaf textures drawn once on canvases (alpha-cut cards) */
function mkCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function leafShape(g,x,y,len,wid,ang,col,vein){g.save();g.translate(x,y);g.rotate(ang);g.fillStyle=col;g.beginPath();g.moveTo(0,0);g.bezierCurveTo(wid*.9,-len*.25,wid*.7,-len*.75,0,-len);g.bezierCurveTo(-wid*.7,-len*.75,-wid*.9,-len*.25,0,0);g.fill();
 if(vein){g.strokeStyle=vein;g.lineWidth=Math.max(1,len*.04);g.beginPath();g.moveTo(0,0);g.lineTo(0,-len*.9);g.stroke();}g.restore();}
function texSprig(cols,vein,len,wid,count,twig,seed){const c=mkCanvas(512,512),g=c.getContext('2d'),R=rng(seed);
 g.strokeStyle=twig;g.lineWidth=5;g.lineCap='round';g.beginPath();g.moveTo(256,510);g.quadraticCurveTo(246,330,256,70);g.stroke();
 for(let i=0;i<count;i++){const t=i/count,y=495-t*410,side=i%2?1:-1,ang=side*(.65+.55*R()),l=len*(1.15-.45*t)*(.85+.3*R()),x=256+Math.sin(t*3)*6;
  leafShape(g,x,y,l,wid*(1.1-.35*t),ang,cols[(R()*cols.length)|0],vein);}
 for(let k=0;k<3;k++)leafShape(g,256+(R()-.5)*14,90+R()*20,len*.7,wid*.7,(R()-.5)*.8,cols[(R()*cols.length)|0],vein);
 const t=new THREE.CanvasTexture(c);t.anisotropy=8;return t;}
function texClump(cols,dark,N,len,wid,seed){const c=mkCanvas(512,512),g=c.getContext('2d'),R=rng(seed);
 for(let pass=0;pass<2;pass++)for(let i=0;i<N;i++){const a=R()*TAU,r=Math.pow(R(),.6)*(pass?1:.86)*(1-.12*R())*232,x=256+Math.cos(a)*r,y=256+Math.sin(a)*r*.86;
  const arr=pass?cols:dark;leafShape(g,x,y,len*(.7+.6*R()),wid*(.8+.4*R()),R()*TAU,arr[(R()*arr.length)|0],null);}
 const t=new THREE.CanvasTexture(c);t.anisotropy=8;return t;}
function texBough(seed){const c=mkCanvas(512,512),g=c.getContext('2d'),R=rng(seed),cols=['#10301a','#173d22','#0e2916','#1f4b2b','#285a33','#3b7442'];g.lineCap='round';
 g.strokeStyle='#33261a';g.lineWidth=5;g.beginPath();g.moveTo(256,512);g.lineTo(256,10);g.stroke();
 const needles=(px,py,dx,dy,n,L)=>{for(let k=0;k<n;k++){const sg=k%2?1:-1,l=L*(.7+.6*R()),ax=-dy*sg*.8+dx*.55,ay=dx*sg*.8+dy*.55+.35;g.strokeStyle=cols[(R()*(R()<.12?6:5))|0];g.lineWidth=2.4;g.beginPath();g.moveTo(px,py);g.lineTo(px+ax*l,py+ay*l);g.stroke();}};
 for(let i=0;i<46;i++){const t=i/46,y=505-t*480,len=(1-Math.pow(t,1.2)*.88)*240*(.85+.3*R());
  for(const side of[-1,1]){const ang=1.1-.35*t,ex=256+side*Math.sin(ang)*len,ey=y-Math.cos(ang)*len*.55+len*.16,mx=(256+ex)/2,my=y-len*.12;
   g.strokeStyle='#42331f';g.lineWidth=3;g.beginPath();g.moveTo(256,y);g.quadraticCurveTo(mx,my,ex,ey);g.stroke();
   for(let j=1;j<=20;j++){const u=j/20,x=(1-u)*(1-u)*256+2*u*(1-u)*mx+u*u*ex,yy=(1-u)*(1-u)*y+2*u*(1-u)*my+u*u*ey,dx=side*.9,dy=.1;
    needles(x,yy,dx,dy,2,13*(1-u*.35));
    if(j%3===0){const hl=(30+R()*22)*(1-u*.6);g.strokeStyle='#2c2218';g.lineWidth=1.6;g.beginPath();g.moveTo(x,yy);g.lineTo(x+side*5,yy+hl);g.stroke();
     for(let m=1;m<=5;m++)needles(x+side*5*m/5,yy+hl*m/5,0,1,2,10*(1-m/7));}}}}
 const t=new THREE.CanvasTexture(c);t.anisotropy=8;return t;}
const leafTex=[
 texSprig(['#285a18','#32691e','#234f14','#3f7826','#4d8a2e'],'#1d4410',118,52,26,'#4b3a26',5),
 texClump(['#2f6a1c','#3a7a22','#4a8a2a','#285a18'],['#143a0e','#1a4510','#112f0a'],300,64,30,6),
 texSprig(['#4a7d24','#568a2b','#417020','#63953a'],null,70,42,40,'#3a2d22',7),
 texClump(['#558a28','#629a30','#72aa3a','#4a7d22'],['#2f5a16','#365f18','#2a4f12'],360,40,24,8),
 texBough(9)];
const leafMats=[leafMat(leafTex[0],'leafOakS'),leafMat(leafTex[1],'leafOakC'),leafMat(leafTex[2],'leafBirS'),leafMat(leafTex[3],'leafBirC'),leafMat(leafTex[4],'leafCon')];
const depthMats=leafTex.map(t=>new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:t,alphaTest:.5,side:THREE.DoubleSide}));
const OAK={H:9.5,tf:.46,R:.3,lean:.25,wob:.22,up:.35,n0:7,n1:5,t0:.5,a0:1.0,a1:.9,l0:1.15,l1:.62,ls:.62,cards:3,lc:[1,1,1],bark:[.34,.27,.2],solid:[.11,.25,.06]};
const BIRCH={H:11.5,tf:.55,R:.12,lean:.12,wob:.1,up:.45,n0:9,n1:4,t0:.35,a0:.55,a1:.7,l0:.85,l1:.55,ls:.34,cards:4,lc:[1,1,1],bark:[.8,.78,.7],solid:[.2,.37,.09]};
const BUSH={H:1.3,tf:.3,R:.03,lean:.2,wob:.5,up:.2,n0:8,n1:4,t0:.2,a0:.9,a1:.9,l0:1.7,l1:.6,ls:.26,cards:3,lc:[1.05,1.1,.85],bark:[.3,.24,.17],solid:[.22,.4,.09]};
const CONI={H:13,R:.3,rad:2.9,step:.42,bark:[.26,.18,.12],solid:[.06,.16,.09]};
// species: [generator, seed, params, bark mat, LOD0 leaf mat, LOD1 leaf mat]
const VDEF=[['b',11,OAK,0,0,1],['b',37,{...OAK,H:8.5,wob:.3,n0:6},0,0,1],['b',5,BIRCH,1,2,3],['b',23,{...BIRCH,H:10},1,2,3],['c',7,CONI,2,4,4],['c',19,{...CONI,H:15,rad:3.5},2,4,4],['b',3,BUSH,0,0,1]];
const CAP=[700,1200,2500];
function mkRock(seed,ws,hs_){const g=new THREE.SphereGeometry(1,ws,hs_),P=g.attributes.position,col=new Float32Array(P.count*3),rr=rng(seed*977+5),pl=[[0,1,0,.7+rr()*.2]];
 for(let i=0;i<17;i++){const a=rr()*TAU,y=rr()*1.7-.55,l=Math.sqrt(Math.max(0,1-y*y));pl.push([Math.cos(a)*l,y,Math.sin(a)*l,.55+rr()*.5]);}
 const sx=1+rr()*.5,sz=1+rr()*.5,hsc=.55+rr()*.3;
 for(let i=0;i<P.count;i++){let x=P.getX(i),y=P.getY(i),z=P.getZ(i);const l=Math.hypot(x,y,z);x/=l;y/=l;z/=l;
  let sm=0,m1=9,m2=9;for(const q of pl){const d=x*q[0]+y*q[1]+z*q[2],ri=d>.02?q[3]/d:99;sm+=Math.exp(-11*Math.min(ri,6));if(ri<m1){m2=m1;m1=ri;}else if(ri<m2)m2=ri;}
  let r=cl(-Math.log(sm)/11,.3,1.6);const fn=fb3(x*5+seed,y*5,z*5)-.5,fn2=n3(x*14+seed,y*14,z*14)-.5;r+=.12*fn+.045*fn2+.025*(n3(x*30+seed,y*30,z*30)-.5);
  let X=x*r*sx,Y=y*r*hsc,Z=z*r*sz;if(Y<-.12)Y=-.12+(Y+.12)*.1;P.setXYZ(i,X,Y,Z);
  const edge=ss(.12,0,m2-m1),strata=.5+.5*Math.sin(Y*10+fn*5),v=(.5+.16*(fb3(x*2.2,y*2.2,z*2.2+seed)-.5))*(.82+.22*strata)*(1-.42*edge)*(.9+.2*fn2),moss=ss(.5,.95,y)*.3*ss(.4,.6,n3(x*3+seed,y*3,z*3));
  col[i*3]=lp(v*1.02,.22,moss);col[i*3+1]=lp(v*.97,.34,moss);col[i*3+2]=lp(v*.9,.12,moss);}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();return g;}
const DENS=22,GR=24,LV=[20,42,80];
function tuftTemplate(blades,rows,seed){
 const R=rng(seed),P=[],N=[],A=[],I=[];
 for(let b=0;b<blades;b++){
  const ang=b/blades*TAU+R()*1.2,off=blades>1?.02+.05*R():0,ox=Math.cos(ang)*off,oz=Math.sin(ang)*off,h=.45+.5*R(),w=.028+.016*R(),lean=.1+.3*R(),face=R()*TAU,fx=Math.cos(face),fz=Math.sin(face),dx=Math.cos(ang),dz=Math.sin(ang),base=P.length/3;
  for(let k=0;k<rows;k++){const t=k/rows,ww=w*(1-.5*t),lx=ox+dx*lean*h*t*t,lz=oz+dz*lean*h*t*t,y=h*t*(1-.15*lean*t);
   for(const sg of[-1,1]){P.push(lx+fx*ww*sg*.5,y,lz+fz*ww*sg*.5);N.push(-fz,0,fx);A.push(t);}}
  P.push(ox+dx*lean*h,h*(1-.15*lean),oz+dz*lean*h);N.push(-fz,0,fx);A.push(1);
  for(let k=0;k<rows-1;k++){const a=base+2*k;I.push(a,a+1,a+2,a+1,a+3,a+2);}
  const l=base+2*(rows-1);I.push(l,l+1,l+2*rows-(l-base));}
 return mkTemplate(P,N,A,null,I);}
function mkTemplate(P,N,A,K,I){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));g.setAttribute('aH',new THREE.Float32BufferAttribute(A,1));if(K)g.setAttribute('aK',new THREE.Float32BufferAttribute(K,1));g.setIndex(I);return g;}
function stemPts(P,N,A,K,h,lx,rows){for(let k=0;k<rows;k++){const t=k/rows,x=lx*t*t,y=h*t;for(const sg of[-1,1]){P.push(x,y,sg*.004);N.push(1,0,0);A.push(t);K.push(0);}}
 P.push(lx,h,0);N.push(1,0,0);A.push(1);K.push(0);}
function stemIdx(I,rows){for(let k=0;k<rows-1;k++){const a=2*k;I.push(a,a+1,a+2,a+1,a+3,a+2);}I.push(2*(rows-1),2*(rows-1)+1,2*rows);}
function daisyTemplate(){
 const P=[],N=[],A=[],K=[],I=[],h=.3,rows=3,lx=.03;stemPts(P,N,A,K,h,lx,rows);stemIdx(I,rows);
 const v=(x,y,z,k)=>{P.push(x,y,z);N.push(0,1,0);A.push(1);K.push(k);return P.length/3-1;};
 const c=v(lx,h+.012,0,2),ring=[];for(let p=0;p<6;p++){const a=p/6*TAU;ring.push(v(lx+Math.cos(a)*.012,h+.012,Math.sin(a)*.012,2));}
 for(let p=0;p<6;p++)I.push(c,ring[p],ring[(p+1)%6]);
 for(let p=0;p<9;p++){const a=p/9*TAU,a0=a-.2,a1=a+.2;
  const i0=v(lx+Math.cos(a0)*.011,h+.008,Math.sin(a0)*.011,1),i1=v(lx+Math.cos(a1)*.011,h+.008,Math.sin(a1)*.011,1),t=v(lx+Math.cos(a)*.05,h-.004,Math.sin(a)*.05,1);I.push(i0,t,i1);}
 return mkTemplate(P,N,A,K,I);}
function seedTemplate(){
 const P=[],N=[],A=[],K=[],I=[],h=.58,rows=4,lx=.07;stemPts(P,N,A,K,h,lx,rows);stemIdx(I,rows);
 const v=(x,y,z,k,a)=>{P.push(x,y,z);N.push(0,0,1);A.push(a);K.push(k);return P.length/3-1;};
 const rr=[.0,.012,.016,.012,.0],y0=h-.01,L=.2;let prev=null;
 for(let k=0;k<5;k++){const t=k/4,a=v(lx+t*.02,y0+t*L,-rr[k],3,1),b=v(lx+t*.02,y0+t*L,rr[k],3,1);if(prev){I.push(prev[0],prev[1],a,prev[1],b,a);}prev=[a,b];}
 for(let b=0;b<5;b++){const ang=(b/5)*Math.PI-Math.PI/2,sy=y0+L*(.25+.12*b),a=v(lx,sy,0,3,1),t=v(lx+Math.sin(ang)*.07,sy+.1,Math.cos(ang)*.06,3,1),c=v(lx+.004,sy+.01,.004,3,1);I.push(a,t,c);}
 return mkTemplate(P,N,A,K,I);}
function leafyTemplate(){
 const P=[],N=[],A=[],K=[],I=[];
 const v=(x,y,z,a,k)=>{P.push(x,y,z);N.push(0,1,0);A.push(a);K.push(k);return P.length/3-1;};
 for(let l=0;l<7;l++){const a=l/7*TAU+.4*Math.sin(l*2.3),ca=Math.cos(a),sa=Math.sin(a),px=-sa,pz=ca,len=.13+.04*Math.sin(l*1.7),w=.05;
  const b=v(ca*.01,.02,sa*.01,0,4),ml=v(ca*len*.5+px*w,.07+l%2*.02,sa*len*.5+pz*w,.5,4),mr=v(ca*len*.5-px*w,.07+l%2*.02,sa*len*.5-pz*w,.5,4),t=v(ca*len,.08+l%2*.03,sa*len,1,4);
  I.push(b,ml,mr,ml,t,mr);}
 const hh_=.2,rows=2;const base=P.length/3;
 for(let k=0;k<=rows;k++){const t=k/rows;P.push(0,.02+(hh_-.02)*t,0);N.push(1,0,0);A.push(t);K.push(0);}
 I.push(base,base+1,base+2);
 const c=v(0,hh_+.01,0,1,2),ring=[];for(let p=0;p<5;p++){const a=p/5*TAU;ring.push(v(Math.cos(a)*.03,hh_,Math.sin(a)*.03,1,1));}
 for(let p=0;p<5;p++)I.push(c,ring[p],ring[(p+1)%5]);
 return mkTemplate(P,N,A,K,I);}
const TUFT=[tuftTemplate(3,4,1),tuftTemplate(2,3,2),tuftTemplate(1,2,3)],DAISY=daisyTemplate(),SEED=seedTemplate(),LEAFY=leafyTemplate();

function sampleGrid(px,pz){
 const n=GR+1,w=n+2,hg=new Float32Array(w*w),x0=px*G,z0=pz*G,st=G/GR;
 for(let j=-1;j<=n;j++)for(let i=-1;i<=n;i++)hg[(j+1)*w+i+1]=H(x0+i*st,z0+j*st);
 const hy=new Float32Array(n*n),gw=new Float32Array(n*n);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const c=(j+1)*w+i+1,a=hg[c-1]-hg[c+1],b=hg[c-w]-hg[c+w],l=Math.hypot(a,2*st,b);hy[j*n+i]=hg[c];gw[j*n+i]=groundAt(x0+i*st,z0+j*st,2*st/l)[0];}
 return{hy,gw,n,x0,z0,st,hmid:hy[(n>>1)*n+(n>>1)]};}
function bil(a,gd,x,z){const n=gd.n,u=(x-gd.x0)/gd.st,v=(z-gd.z0)/gd.st,i=Math.min(n-2,Math.max(0,Math.floor(u))),j=Math.min(n-2,Math.max(0,Math.floor(v))),fu=u-i,fv=v-j;
 return a[j*n+i]*(1-fu)*(1-fv)+a[j*n+i+1]*fu*(1-fv)+a[(j+1)*n+i]*(1-fu)*fv+a[(j+1)*n+i+1]*fu*fv;}
function buildBlades(px,pz,lv,gd){
 const full=Math.round(DENS*Q*G*G),cnt=Math.round(full*[1,.25,.06][lv]),pos=new Float32Array(cnt*3),rnd=new Float32Array(cnt*4);
 const o1=hh(px,pz,1),o2=hh(px,pz,2),s=(px*73+pz*151)|0,jit=.6/Math.sqrt(Math.max(1,full));let k=0;
 for(let i=0;i<cnt;i++){
  let u=(o1+(i+1)*.7548776662466927)%1,v=(o2+(i+1)*.5698402909980532)%1;u=(u+(hh(i,s,3)-.5)*jit+1)%1;v=(v+(hh(i,s,4)-.5)*jit+1)%1;
  const x=gd.x0+u*G,z=gd.z0+v*G;if(hh(i,s,5)>=ss(.2,.7,bil(gd.gw,gd,x,z)))continue;
  pos[k*3]=x;pos[k*3+1]=bil(gd.hy,gd,x,z);pos[k*3+2]=z;rnd[k*4]=hh(i,s,6);rnd[k*4+1]=hh(i,s,7);rnd[k*4+2]=(i+.5)/full;rnd[k*4+3]=hh(i,s,8);k++;}
 return{pos:pos.subarray(0,k*3),rnd:rnd.subarray(0,k*4),count:k};}
function buildScatter(px,pz,gd,salt,nf,pf){
 const pos=new Float32Array(nf*3),rnd=new Float32Array(nf*4),s=(px*91+pz*37)|0;let k=0;
 for(let i=0;i<nf*3&&k<nf;i++){const x=gd.x0+hh(i,s,salt)*G,z=gd.z0+hh(i,s,salt+1)*G;if(bil(gd.gw,gd,x,z)<.75)continue;
  if(hh(i,s,salt+3)>pf(x,z))continue;
  pos[k*3]=x;pos[k*3+1]=bil(gd.hy,gd,x,z);pos[k*3+2]=z;rnd[k*4]=hh(i,s,salt+4);rnd[k*4+1]=hh(i,s,salt+5);rnd[k*4+2]=0;rnd[k*4+3]=hh(i,s,salt+6);k++;}
 return{pos:pos.subarray(0,k*3),rnd:rnd.subarray(0,k*4),count:k};}
const SCAT=[
 {T:DAISY,salt:21,n:q=>Math.round(170*q+20),pf:(x,z)=>vn(x*.12,z*.12,77)>.58?.9:.08},
 {T:SEED,salt:31,n:q=>Math.round(300*q+30),pf:(x,z)=>vn(x*.09,z*.09,78)>.4?.85:.22},
 {T:LEAFY,salt:41,n:q=>Math.round(80*q+10),pf:(x,z)=>vn(x*.15,z*.15,79)>.5?.8:.12}];
function instGeo(T,B,gd,px,pz,attrs){
 const g=new THREE.InstancedBufferGeometry();for(const k of attrs)g.setAttribute(k,T.attributes[k].clone());g.setIndex(T.index.clone());
 g.setAttribute('aPos',new THREE.InstancedBufferAttribute(B.pos,3));g.setAttribute('aRnd',new THREE.InstancedBufferAttribute(B.rnd,4));
 g.instanceCount=B.count;g.boundingSphere=new THREE.Sphere(new THREE.Vector3(px*G+G/2,gd.hmid,pz*G+G/2),G*.75+4);return g;}
return {UT,UW,UD,USUN,tMat,grassMats,flowerMat,barkMats,leafMats,depthMats,solidMat,rockMat,genBroad,genConifer,OAK,BIRCH,BUSH,CONI,VDEF,mkRock,TUFT,SCAT,sampleGrid,buildBlades,buildScatter,instGeo,G,LV};
}
