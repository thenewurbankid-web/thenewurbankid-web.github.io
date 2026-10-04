// GLSL for the scene. Procedural surfaces are baked once into equirect textures (cheap at runtime);
// only lighting runs per frame.

export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
float ridged(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ float n=1.0-abs(snoise(p)); s+=a*n*n; p=p*2.1+vec3(4.1,1.3,7.7); a*=0.5; } return s; }
vec3 hash3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453); }
// distance to nearest cell point, and that cell's random value
vec2 worley(vec3 p){ vec3 i=floor(p), f=fract(p); float d=8.0; float id=0.0;
  for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec3 g=vec3(x,y,z); vec3 o=hash3(i+g); vec3 r=g+o-f; float dd=dot(r,r); if(dd<d){ d=dd; id=o.x; } }
  return vec2(sqrt(d), id); }
`;

export const EQUIRECT = /* glsl */ `
const float PI=3.14159265359;
vec3 dirFromUv(vec2 uv){ float lon=(uv.x-0.5)*2.0*PI; float lat=(uv.y-0.5)*PI; return vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon)); }
vec2 uvFromDir(vec3 d){ return vec2(atan(d.z,d.x)/(2.0*PI)+0.5, asin(clamp(d.y,-1.0,1.0))/PI+0.5); }
`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

// Surface bake. uPass 0 -> rgb albedo (linear), a height. uPass 1 -> r spec mask, g emissive, b cloud.
export const BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; uniform int uLook; uniform int uPass; uniform float uSeed;
${NOISE}
${EQUIRECT}
void main(){
  vec3 d=dirFromUv(vUv); vec3 p=d+vec3(uSeed);
  vec3 alb=vec3(0.3); float h=0.5; vec3 m=vec3(0.0);
  if(uLook==0){ // ocean: dark teal, a few dark islands, sparse cloud
    float c=fbm(p*1.6); float land=smoothstep(0.30,0.36,fbm(p*2.2+3.0));
    vec3 deep=vec3(0.006,0.045,0.055), shelf=vec3(0.012,0.10,0.105);
    alb=mix(deep,shelf,smoothstep(-0.4,0.5,c));
    alb=mix(alb,vec3(0.05,0.055,0.042)*(0.8+0.4*fbm(p*9.0)),land);
    h=0.5+land*0.25*fbm(p*12.0);
    vec3 q=vec3(d.x*1.0,d.y*3.2,d.z*1.0)+uSeed;
    float cl=fbm(q*2.4+fbm(q*1.3)*0.9);
    m=vec3((1.0-land), 0.0, smoothstep(0.18,0.6,cl)*0.5);
  } else if(uLook==1){ // violet-grey rock, icy poles
    float r=ridged(p*2.4); float b=fbm(p*1.3);
    alb=mix(vec3(0.10,0.085,0.13),vec3(0.26,0.23,0.30),smoothstep(0.15,0.75,r*0.9+b*0.3));
    alb*=0.85+0.3*fbm(p*14.0);
    float ice=smoothstep(0.70,0.78,abs(d.y)+0.07*fbm(p*5.0));
    alb=mix(alb,vec3(0.70,0.74,0.80)*(0.9+0.1*fbm(p*20.0)),ice);
    h=r*0.8+0.2*fbm(p*18.0); h=mix(h,0.55+0.05*fbm(p*10.0),ice);
  } else if(uLook==2){ // rust desert with basalt fields and ember fissures
    vec3 q=p*1.4; float dune=fbm(vec3(q.x*1.0,q.y*0.6,q.z)*3.0+fbm(q*2.0));
    float basalt=smoothstep(0.18,0.30,fbm(p*1.7+7.0));
    alb=mix(vec3(0.24,0.085,0.035),vec3(0.42,0.17,0.07),smoothstep(-0.5,0.6,dune));
    alb=mix(alb,vec3(0.055,0.035,0.03),basalt);
    float fiss=pow(1.0-abs(snoise(p*6.0+fbm(p*3.0))),28.0)+pow(1.0-abs(snoise(p*13.0)),40.0)*0.6;
    h=0.5+dune*0.15-basalt*0.06+0.08*fbm(p*20.0);
    m=vec3(0.0, clamp(fiss*basalt,0.0,1.0), 0.0);
  } else if(uLook==3){ // ice giant: soft cyan bands, one pale storm
    float t=fbm(p*2.5)*0.06; float y=d.y+t;
    float bands=0.5+0.25*sin(y*18.0)+0.15*sin(y*41.0+1.3)+0.1*sin(y*7.0+0.4);
    alb=mix(vec3(0.20,0.36,0.44),vec3(0.42,0.62,0.70),bands);
    vec3 sc=normalize(vec3(0.6,-0.25,0.76)); float st=smoothstep(0.986,0.997,dot(d,sc)+0.01*snoise(p*20.0));
    alb=mix(alb,vec3(0.62,0.78,0.84),st*0.7);
    h=0.5;
  } else if(uLook==4){ // pale grey-blue rock moon
    vec2 w=worley(p*5.0); float crater=smoothstep(0.42,0.30,w.x)*step(0.55,w.y);
    float rim=smoothstep(0.30,0.40,w.x)*smoothstep(0.50,0.40,w.x)*step(0.55,w.y);
    alb=vec3(0.25,0.27,0.30)*(0.75+0.5*fbm(p*6.0)); alb*=1.0-crater*0.25;
    h=0.5+0.15*fbm(p*8.0)-crater*0.25+rim*0.2;
  } else { // grey cratered moon-world with faint blue city glow
    vec2 w1=worley(p*4.0), w2=worley(p*11.0);
    float c1=step(0.45,w1.y), c2=step(0.6,w2.y);
    float crater=smoothstep(0.40,0.25,w1.x)*c1+0.6*smoothstep(0.38,0.22,w2.x)*c2;
    float rim=smoothstep(0.28,0.40,w1.x)*smoothstep(0.50,0.40,w1.x)*c1+0.5*smoothstep(0.25,0.38,w2.x)*smoothstep(0.46,0.38,w2.x)*c2;
    float mare=smoothstep(0.1,0.35,fbm(p*1.2+2.0));
    alb=vec3(0.30)*(0.8+0.35*fbm(p*7.0)); alb=mix(alb,vec3(0.16,0.165,0.17),mare*0.7); alb*=1.0-0.2*crater;
    h=0.5-0.3*crater+0.25*rim+0.1*fbm(p*20.0);
    float zone=smoothstep(0.15,0.45,fbm(p*2.2+5.0))*(1.0-crater);
    float dots=step(0.86,hash3(floor(p*140.0)).x)*(0.4+0.6*hash3(floor(p*140.0)+3.0).y);
    float grid=pow(1.0-abs(snoise(p*30.0)),18.0);
    m=vec3(0.0, clamp(zone*(dots+grid*0.5),0.0,1.0), 0.0);
  }
  gl_FragColor = uPass==0 ? vec4(alb,clamp(h,0.0,1.0)) : vec4(m,1.0);
}`;

export const PLANET_VERT = /* glsl */ `
varying vec3 vObjN; varying vec3 vWorldPos; varying vec3 vWorldN;
void main(){ vObjN=normalize(position); vec4 wp=modelMatrix*vec4(position,1.0); vWorldPos=wp.xyz;
  vWorldN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*wp; }`;

export const PLANET_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tAlb; uniform sampler2D tMask; uniform vec3 uSun; uniform vec3 uSunColor;
uniform float uSpec; uniform vec3 uEmit; uniform vec3 uAtmo; uniform float uAtmoK; uniform float uBump;
uniform vec2 uTexel; uniform mat4 modelMatrix;
varying vec3 vObjN; varying vec3 vWorldPos; varying vec3 vWorldN;
${EQUIRECT}
void main(){
  vec3 n=normalize(vObjN); vec2 uv=uvFromDir(n);
  vec4 A=texture2D(tAlb,uv); vec4 M=texture2D(tMask,uv);
  vec3 Ng=normalize(vWorldN); vec3 N=Ng;
  vec3 L=normalize(uSun-vWorldPos); vec3 V=normalize(cameraPosition-vWorldPos);
  // bump: finite differences of the baked height across neighbouring texels (smooth when magnified)
  if(uBump>0.0){
    vec2 ex=vec2(uTexel.x*1.5,0.0), ey=vec2(0.0,uTexel.y*1.5);
    float hx=(texture2D(tAlb,uv+ex).a-texture2D(tAlb,uv-ex).a)/(2.0*ex.x*2.0*PI);
    float hy=(texture2D(tAlb,uv+ey).a-texture2D(tAlb,uv-ey).a)/(2.0*ey.y*PI);
    float cl=max(sqrt(1.0-n.y*n.y),0.05);
    vec3 T=normalize(vec3(-n.z,0.0,n.x)+1e-5); vec3 B=cross(n,T);
    vec3 nP=normalize(n-uBump*(hx/cl*T+hy*B));
    N=normalize(mat3(modelMatrix)*nP);
  }
  float geo=dot(Ng,L);
  float lit=smoothstep(-0.015,0.03,geo); // hard terminator
  float ndl=max(dot(N,L),0.0)*lit;
  vec3 col=A.rgb*uSunColor*ndl*2.4 + A.rgb*0.0035;
  // clouds sit above the surface: lit by the geometric normal
  col=mix(col, vec3(0.72,0.76,0.78)*uSunColor*max(geo,0.0)*lit*1.9, M.b);
  vec3 H=normalize(L+V); col+=uSunColor*pow(max(dot(N,H),0.0),140.0)*M.r*(1.0-M.b)*uSpec*lit;
  float night=1.0-smoothstep(-0.12,0.18,geo);
  col+=uEmit*M.g*night;
  float rim=pow(1.0-max(dot(Ng,V),0.0),5.0);
  col+=uAtmo*rim*smoothstep(-0.2,0.35,geo)*uAtmoK;
  gl_FragColor=vec4(col,1.0);
}`;

export const RING_VERT = /* glsl */ `
varying vec3 vWorldPos; varying vec2 vLocal; varying vec3 vWorldN;
void main(){ vLocal=position.xy; vec4 wp=modelMatrix*vec4(position,1.0); vWorldPos=wp.xyz; vWorldN=normalize(mat3(modelMatrix)*vec3(0,0,1)); gl_Position=projectionMatrix*viewMatrix*wp; }`;

export const RING_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uCenter; uniform float uR; uniform float uInner; uniform float uOuter;
varying vec3 vWorldPos; varying vec2 vLocal; varying vec3 vWorldN;
float h1(float x){ return fract(sin(x*127.1)*43758.5453); }
float n1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(h1(i),h1(i+1.0),f); }
void main(){
  float r=(length(vLocal)-uInner)/(uOuter-uInner); if(r<0.0||r>1.0) discard;
  float fw=fwidth(r);
  float d=0.55*mix(n1(r*34.0),0.5,clamp(fw*40.0,0.0,1.0))+0.3*mix(n1(r*80.0),0.5,clamp(fw*90.0,0.0,1.0))+0.15*mix(n1(r*150.0),0.5,clamp(fw*170.0,0.0,1.0));
  d*=smoothstep(0.0,0.06,r)*smoothstep(1.0,0.9,r);
  d*=1.0-0.85*smoothstep(0.60,0.62,r)*smoothstep(0.68,0.66,r); // a gap
  vec3 L=normalize(uSun-vWorldPos);
  vec3 oc=vWorldPos-uCenter; float b=dot(oc,L); float c=dot(oc,oc)-uR*uR; float disc=b*b-c;
  float shadow=(disc>0.0 && (-b-sqrt(disc))>0.0)?0.04:1.0;
  float face=0.35+0.65*abs(dot(normalize(vWorldN),L));
  vec3 col=vec3(0.50,0.55,0.55)*uSunColor*face*shadow*0.9*(0.75+0.5*n1(r*50.0));
  gl_FragColor=vec4(col*d, d*0.85);
}`;

export const SUN_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; varying vec3 vObjN; varying vec3 vWorldPos; varying vec3 vWorldN;
${NOISE}
void main(){
  vec3 n=normalize(vObjN); float g=fbm(n*9.0+vec3(uTime*0.03))*0.5+0.5;
  vec3 V=normalize(cameraPosition-vWorldPos); float mu=max(dot(normalize(vWorldN),V),0.0);
  float limb=0.55+0.45*pow(mu,0.5);
  vec3 col=mix(vec3(1.0,0.78,0.52),vec3(1.0,0.95,0.86),g)*limb*6.0;
  gl_FragColor=vec4(col,1.0);
}`;

export const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aBright; attribute vec3 aColor; attribute float aPhase;
uniform float uPx; uniform float uTime; uniform float uTwinkle;
varying float vB; varying vec3 vC;
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
  gl_PointSize=aSize*uPx; vB=aBright*(1.0+uTwinkle*0.18*sin(uTime*(0.6+aPhase*1.7)+aPhase*40.0)); vC=aColor; }`;

export const STAR_FRAG = /* glsl */ `
precision highp float; varying float vB; varying vec3 vC;
void main(){ vec2 c=gl_PointCoord-0.5; float d=dot(c,c)*4.0; float core=exp(-d*7.0); if(core<0.01) discard;
  gl_FragColor=vec4(vC*vB*core,1.0); }`;

// Nebula bake: two far patches, filaments not haze. rgb colour, a filament strength (for lightning).
export const NEBULA_BAKE_FRAG = /* glsl */ `
precision highp float; varying vec2 vUv;
${NOISE}
${EQUIRECT}
float patchMask(vec3 d, vec3 c, float size, vec3 seed){ float w=fbm(d*2.0+seed)*0.12; return smoothstep(size, size+0.22, dot(d,c)+w); }
void main(){
  vec3 d=dirFromUv(vUv);
  vec3 c1=normalize(vec3(-0.75,0.22,-0.62)); vec3 c2=normalize(vec3(0.70,-0.18,0.69));
  float m1=patchMask(d,c1,0.86,vec3(2.0)); float m2=patchMask(d,c2,0.89,vec3(9.0));
  vec3 q=d*3.0+fbm(d*2.5)*0.6;
  float f=pow(1.0-abs(snoise(q*1.5)),7.0)*0.8+pow(1.0-abs(snoise(q*3.4+1.3)),10.0)*0.55;
  float body=smoothstep(0.1,0.7,fbm(q*1.2))*0.05;
  vec3 purple=vec3(0.22,0.06,0.34), teal=vec3(0.03,0.20,0.22);
  float dark=smoothstep(0.35,0.6,fbm(q*2.0+4.0)); // dust lanes cut the filaments
  vec3 col=purple*(f+body)*m1 + teal*(f+body)*m2;
  col*=1.0-dark*0.8;
  float fil=clamp(f*(m1+m2)*(1.0-dark*0.8),0.0,1.0);
  gl_FragColor=vec4(clamp(col*0.2*4.0,0.0,1.0), fil);
}`;

export const NEBULA_VERT = /* glsl */ `
varying vec3 vDir; void main(){ vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`;

export const NEBULA_FRAG = /* glsl */ `
precision highp float; uniform sampler2D tNeb; uniform vec3 uFlashDir; uniform float uFlash; uniform vec3 uFlashCol;
varying vec3 vDir;
${EQUIRECT}
void main(){ vec3 d=normalize(vDir); vec4 t=texture2D(tNeb,uvFromDir(d)); t.rgb*=0.25;
  float near=smoothstep(0.90,0.995,dot(d,uFlashDir));
  vec3 col=t.rgb + uFlashCol*t.a*near*uFlash*0.9 + uFlashCol*near*near*uFlash*0.04*t.a;
  gl_FragColor=vec4(col,1.0); }`;

export const SCREEN_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

export const SCREEN_FRAG = /* glsl */ `
precision highp float; uniform sampler2D tMap; uniform float uTime; uniform float uOpacity; uniform vec2 uSize;
varying vec2 vUv;
void main(){
  float z=1.06+0.04*sin(uTime*0.11); vec2 pan=vec2(sin(uTime*0.07),cos(uTime*0.05))*0.025;
  vec2 uv=(vUv-0.5)/z+0.5+pan;
  vec3 col=texture2D(tMap,uv).rgb*0.72;
  float sweep=smoothstep(0.03,0.0,abs(fract(uTime*0.06)-vUv.y))*0.05; col+=sweep;
  vec2 px=vUv*uSize; vec2 e=min(px,uSize-px); float edge=min(e.x,e.y);
  float frame=smoothstep(1.2,0.4,edge); col=mix(col,vec3(0.6,0.65,0.7),frame*0.35);
  float corner=smoothstep(0.0,1.0,min(e.x,e.y)/max(uSize.x,uSize.y));
  gl_FragColor=vec4(col, uOpacity);
}`;

export const POST_FRAG = /* glsl */ `
precision highp float; uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrain; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;
  float lum=dot(c,vec3(0.299,0.587,0.114));
  float g=hash(floor(vUv*uRes)+fract(uTime*7.31)*91.0)-0.5;
  c+=g*uGrain*(0.008+min(lum,1.0)*0.12);
  vec2 q=(vUv-0.5)*vec2(uRes.x/uRes.y,1.0); float v=smoothstep(1.15,0.25,length(q)); c*=mix(0.55,1.0,v);
  gl_FragColor=vec4(max(c,0.0),1.0); }`;
