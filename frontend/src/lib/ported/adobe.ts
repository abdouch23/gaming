// @ts-nocheck
/* Ported from the user's adobe_house_pbr.html: tileable noise, procedural PBR map generator
   (albedo + normal + roughness), plaster / lime / stone / wood / old-wood / bark / cloth / pot / wicker
   surface functions, bevelled slab-with-openings geometry, UV scaler and the clay pot lathe. */
import * as THREE from "three";
const T=THREE;
/* ---------- tileable noise ---------- */
const H=(x,y)=>{let h=Math.imul(x,374761393)+Math.imul(y,668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296};
function N(x,y,px,py){const xi=Math.floor(x),yi=Math.floor(y),u=x-xi,v=y-yi,s=u*u*(3-2*u),t=v*v*(3-2*v),X=i=>((i%px)+px)%px,Y=i=>((i%py)+py)%py;
const a=H(X(xi),Y(yi)),b=H(X(xi+1),Y(yi)),c=H(X(xi),Y(yi+1)),d=H(X(xi+1),Y(yi+1));return a+(b-a)*s+(c-a)*t+(a-b-c+d)*s*t}
const F=(u,v,bx,o=4,sd=0,by=bx)=>{let s=0,a=.5,n=0;for(let i=0;i<o;i++){const fx=bx<<i,fy=by<<i;s+=a*N(u*fx+sd,v*fy+sd*1.7,fx,fy);n+=a;a/=2}return s/n};

/* ---------- PBR map generator: albedo + normal + roughness from a height/colour function ---------- */
function pbr(S,fn,ns=2.5){
 const hh=new Float32Array(S*S),cc=new Uint8ClampedArray(S*S*4),rr=new Uint8ClampedArray(S*S*4),nn=new Uint8ClampedArray(S*S*4);
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){const o=fn(x/S,1-y/S),i=y*S+x;hh[i]=o[0];cc[i*4]=o[1];cc[i*4+1]=o[2];cc[i*4+2]=o[3];cc[i*4+3]=255;rr[i*4]=rr[i*4+1]=rr[i*4+2]=o[4]*255;rr[i*4+3]=255}
 const g=(x,y)=>hh[((y+S)%S)*S+((x+S)%S)];
 for(let y=0;y<S;y++)for(let x=0;x<S;x++){const dx=(g(x+1,y)-g(x-1,y))*ns*S/64,dy=(g(x,y-1)-g(x,y+1))*ns*S/64,l=Math.hypot(dx,dy,1),i=(y*S+x)*4;
  nn[i]=(-dx/l*.5+.5)*255;nn[i+1]=(-dy/l*.5+.5)*255;nn[i+2]=(1/l*.5+.5)*255;nn[i+3]=255}
 const mt=(d,s)=>{const c=document.createElement('canvas');c.width=c.height=S;c.getContext('2d').putImageData(new ImageData(d,S,S),0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;if(s)t.colorSpace=T.SRGBColorSpace;return t};
 return new T.MeshStandardMaterial({map:mt(cc,1),normalMap:mt(nn),roughnessMap:mt(rr),roughness:1,metalness:0,envMapIntensity:.6});
}
const plaster=(u,v)=>{const n=F(u,v,4,6,1),lump=F(u,v,3,3,5),m=F(u,v,3,4,7),cr=Math.abs(F(u,v,6,4,11)-.5)*2,ch=Math.min(1,Math.max(0,(m-.6)*10)),ck=cr<.008?1:0,gr=F(u,v,96,2,3),k=.82+n*.35+gr*.15-ch*.12-ck*.35;
 return[lump*.6+n*.35+gr*.12-ch*.45-ck*.2,(212-ch*30)*k,(158-ch*34)*k,(108-ch*30)*k,.95]};
const stone=(u,v)=>{const n=F(u,v,5,5,2),p=F(u,v,16,2,9)>.7?1:0,vn=Math.abs(F(u,v,4,3,13)-.5)<.02?.15:0,k=.8+n*.35-p*.2-vn;return[n-p*.2,200*k,174*k,138*k,.88]};
const wood=(u,v)=>{const g=F(u,v,12,3,3,2),f=F(u,v,48,2,5,4),e=Math.min(u,1-u)<.03?.35:0,k=(.7+g*.5)*(1-e);return[g*.5+f*.3-e,122*k,82*k,48*k,.75]};
const bark=(u,v)=>{const r=Math.abs(F(u,v,10,3,4,1)-.5)*2,k=.55+r*.6;return[r,112*k,92*k,70*k,.95]};
const PAL={r:[150,30,28],d:[96,18,20],c:[214,190,150],k:[38,26,22]},PT='rrdcrrkrcrdrrckrrdrc';
const cloth=(u,v)=>{const w=Math.sin(u*Math.PI*96)*Math.sin(v*Math.PI*96),p=PAL[PT[Math.floor(u*20)%20]],k=.8+.12*w+F(u,v,64,2,3)*.25;return[w*.3+.5,p[0]*k,p[1]*k,p[2]*k,.95]};
const pot=(u,v)=>{const n=F(u,v,8,3,2),z=Math.abs((u*10)%1*2-1)*.035,ln=Math.min(Math.abs(v-.34-z),Math.abs(v-.43-z),Math.abs(v-.29),Math.abs(v-.48))<.011,k=.75+n*.5;
 return[n*.3-(ln?.15:0),ln?226:176*k,ln?192:88*k,ln?150:54*k,.7]};
const wicker=(u,v)=>{const R=16,C=32,r=Math.floor(v*R),c=Math.floor(u*C),ov=(r+c)&1,lu=(u*C)%1,lv=(v*R)%1,h=ov?Math.sin(lu*Math.PI):Math.sin(lv*Math.PI)*.6,k=.7+h*.4+F(u,v,32,2,3)*.2;return[h,190*k,146*k,78*k,.8]};
const lime=(u,v)=>{const n=F(u,v,4,6,2),lump=F(u,v,3,3,6),m=F(u,v,2,5,9),ch=Math.min(1,Math.max(0,(m-.55)*9)),gr=F(u,v,110,2,3),k=.85+n*.25+gr*.2-ch*.08;
 return[lump*.5+n*.3+gr*.15-ch*.5,(228-ch*36)*k,(212-ch*66)*k,(184-ch*88)*k,.95]};
const oldwood=(u,v)=>{const p=Math.floor(u*5),lu=(u*5)%1,g=F(u,v,20,3,3,2),e=lu<.04||lu>.96?1:0,k=.55+g*.5+H(p,3)*.3-e*.35;return[g*.5-e*.5,92*k,70*k,54*k,.85]};
const ground=(u,v)=>{const n=F(u,v,6,5,3),k=.62+n*.3;return[n*.5,176*k,140*k,98*k,1]};

function slab(w,h,d,b,holes:number[][]=[]){ // bevelled box (optionally with rectangular holes: [x0,y0,x1,y1] relative to centre)
 const s=new T.Shape(),X=w/2-b,Y=h/2-b;s.moveTo(-X,-Y);s.lineTo(X,-Y);s.lineTo(X,Y);s.lineTo(-X,Y);s.closePath();
 for(const[a,c,e,f]of holes){const p=new T.Path();p.moveTo(a+b,c+b);p.lineTo(a+b,f-b);p.lineTo(e-b,f-b);p.lineTo(e-b,c+b);p.closePath();s.holes.push(p)}
 const g=new T.ExtrudeGeometry(s,{depth:d-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:3,curveSegments:1});g.translate(0,0,-(d-2*b)/2);return g}
const U=(g,kx,ky=kx,ox=0,oy=0)=>{const a=g.attributes.uv;for(let i=0;i<a.count;i++)a.setXY(i,a.getX(i)*kx+ox,a.getY(i)*ky+oy);return g};
const cyl=(a,b,h,s=10)=>new T.CylinderGeometry(a,b,h,s);
const lathe=p=>new T.LatheGeometry(p.map(a=>new T.Vector2(a[0],a[1])),32);
const potG=lathe([[0,0],[.22,0],[.3,.1],[.38,.3],[.42,.5],[.38,.72],[.28,.86],[.26,.95],[.3,.99],[.29,1.03],[.24,1.0],[.22,.9],[0,.9]]);
export function createAdobeKit(size=512){
 const s2=Math.max(128,size>>1);
 const A=pbr(size,plaster,5),Lm=pbr(size,lime,5),S=pbr(size,stone),W=pbr(s2,wood),Wo=pbr(size,oldwood,3),B=pbr(s2,bark),C=pbr(s2,cloth,1.5),P=pbr(s2,pot),K=pbr(s2,wicker,3);
 C.side=K.side=T.DoubleSide;
 const iron=new T.MeshStandardMaterial({color:0x2a2724,metalness:.9,roughness:.45});
 return {A,Lm,S,W,Wo,B,C,P,K,iron,slab,U,cyl,potG};
}
