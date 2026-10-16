export const eclipseWords = [
  'an annular eclipse is a ring of sunlight around the moon.',
  'the moon passes between the earth and the sun.',
  'when the moon is farther from earth, it appears smaller in the sky.',
  'its dark silhouette covers the middle of the sun, leaving a luminous edge.',
  'this narrow circle of the solar surface is sometimes called the ring of fire.',
  'the alignment draws a moving shadow across our planet.',
  'clouds drift through the light. little waves scatter gold across the sea.',
  'a distant star, a passing moon, and a world briefly held in shadow.'
].join(' ').split(' ');

export const smoothstep = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
const mix=(a,b,t)=>a+(b-a)*t;
const fract=x=>x-Math.floor(x);
export const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
function gridHash(x,y){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=fract(x),fy=fract(y),u=fx*fx*fx*(fx*(fx*6-15)+10),v=fy*fy*fy*(fy*(fy*6-15)+10);
  return mix(mix(gridHash(ix,iy),gridHash(ix+1,iy),u),mix(gridHash(ix,iy+1),gridHash(ix+1,iy+1),u),v);
}
function fbm(x,y){
  let n=0,w=.5;
  for(let i=0;i<4;i++){n+=w*noise(x,y);const nx=(.8*x-.6*y)*2.03+7.1;y=(.6*x+.8*y)*2.03+3.2;x=nx;w*=.5;}
  return n;
}

function crest(phase,footprint){return mix(Math.pow(.5+.5*Math.sin(phase),8),.1964,smoothstep(.7,3.0,footprint));}
function foregroundCloud(x,y,t,aspect){
  const u=x/aspect+t*.023;
  const bend=.023*Math.sin(u*5.1)+.012*Math.sin(u*11.3+.8);
  const band=Math.exp(-Math.pow((y-.145-bend)/.038,2));
  const n=fbm(u*6.5+13,(y-.13)*34+noise(u*2.8,6.2)*1.4);
  return smoothstep(.34,.64,n)*band;
}
export const sunVisibility=(t,aspect)=>Math.exp(-foregroundCloud(.11*aspect,.13,t,aspect)*2.2);
export function sampleScene(x,y,t,aa=.001,aspect=1,sunTransmission=sunVisibility(t,aspect)){
  const radiusScale=Math.min(1,aspect/.8),cx=.11*aspect,dy=y-.13,r=Math.hypot(x-cx,dy)/radiusScale,angle=Math.atan2(dy,x-cx),horizon=-.125;
  const ringAA=aa/radiusScale;
  const mx=.0020+.00015*Math.sin(t*.055),my=.00012*Math.cos(t*.07);
  const outside=smoothstep(.0277-ringAA,.0277+ringAA,Math.hypot((x-cx)/radiusScale-mx,dy/radiusScale-my));
  let contentMask=outside;
  const sy=Math.max(0,Math.min(1,(y-horizon)/.625));
  const boundary=aspect*(.10-.42*sy);
  const warm=1-smoothstep(boundary-.16*aspect,boundary+.27*aspect,x);
  const up=smoothstep(0,.95,sy),mid=Math.exp(-Math.pow((sy-.40)/.27,2));
  let red=mix(.0025,mix(.21,.42,up)+.20*mid,warm);
  let green=mix(.0055,mix(.025,.20,up)+.038*mid,warm);
  let blue=mix(.016,mix(.022,.058,up),warm);
  if(y>=horizon){
    const qx=x/aspect*2.7+t*.035,qy=(y-.28)*15+Math.sin(t*.11)*.10;
    const warp=fbm(qx*.7+5+t*.003,qy*.27-8-t*.006);
    const n=fbm(qx+warp*1.1,qy+warp*1.9);
    const fine=fbm(qx*2.1+9+t*.025,qy*2.7+warp*2+t*.012);
    const below=fbm(qx+warp*1.1,qy+warp*1.9-.18);
    const envelope=smoothstep(.015,.19,y)*(1-smoothstep(-.02*aspect,.34*aspect,x));
    const density=smoothstep(.35,.63,n+fine*.12)*envelope;
    const rim=Math.max(0,Math.min(1,(n-below)*9));
    const lit=.42+.52*rim+.12*fine;
    const cr=mix(.065,.66,lit),cg=mix(.047,.42,lit),cb=mix(.044,.20,lit);
    red=mix(red,cr,density*.88);green=mix(green,cg,density*.88);blue=mix(blue,cb,density*.88);
    const wisp=smoothstep(.56,.76,fine)*envelope*.20;
    red+=wisp*.34;green+=wisp*.19;blue+=wisp*.065;
    const ring=1-smoothstep(.032-ringAA,.032+ringAA,r);
    const grain=.90+.10*noise((x-cx)*1300,dy*1300+t*.035);
    const left=.5-.5*Math.cos(angle);
    const flare=.65+1.45*Math.pow(left,3)+.25*Math.exp(-Math.pow((angle-2.35)/.55,2));
    const energy=ring*grain*flare*24;
    red+=energy;green+=energy*.76;blue+=energy*.35;
    const distance=Math.max(0,r-.032);
    const halo=Math.exp(-distance*85)*(.5+1.5*left*left)+Math.exp(-Math.pow(distance/.075,1.6))*.20*(.25+left);
    const spill=Math.exp(-Math.pow(((x-cx)/radiusScale+.038)/.085,2)-Math.pow(dy/radiusScale/.050,2))*.14;
    red+=halo+spill;green+=halo*.41+spill*.35;blue+=halo*.065+spill*.04;
    const veil=foregroundCloud(x,y,t,aspect),transmission=Math.exp(-veil*3.3),opacity=1-transmission;
    const glowOnCloud=Math.exp(-r*8)*(.32+.68*left);
    const cloudR=.030+.26*glowOnCloud,cloudG=.027+.12*glowOnCloud,cloudB=.033+.029*glowOnCloud;
    const compression=Math.min(1,5/Math.max(red,green,blue,.001));
    red=red*compression*outside*transmission+cloudR*opacity;
    green=green*compression*outside*transmission+cloudG*opacity;
    blue=blue*compression*outside*transmission+cloudB*opacity;
    contentMask=Math.max(outside*(.55+.45*transmission),opacity*.75);
  }else{
    const d=horizon-y,depth=Math.min(1,d/.375),z=1/(d+.055),relative=x-cx+.006*radiusScale;
    const swell=Math.sin(x*14+t*.11)*.36+Math.sin(x*29-t*.085)*.19;
    const p1=z*47+x*9+swell-t*1.25,p2=z*97-x*27-swell*.7+t*.8,p3=z*211+x*63-t*1.9;
    const w1=crest(p1,aa*2*z*z*47),w2=crest(p2,aa*2*z*z*97),w3=crest(p3,aa*2*z*z*211);
    const ripples=(w1+w2*.54+w3*.32)/1.86;
    const grain=noise(x*175+t*.65,z*2.1-t*.095);
    const width=.009+.068*Math.pow(depth,1.3),center=.0035*Math.sin(z*.31+t*.24)*depth;
    const path=Math.exp(-Math.pow((relative-center)/width,2));
    const shimmer=.8+.2*Math.sin(t*1.3+z*13+grain*3);
    const illumination=.42+.58*sunTransmission;
    const shine=path*Math.pow(ripples,1.55)*(.35+1.4*grain*grain)*(.20+depth*.75)*3.7*shimmer*illumination;
    const haze=path*Math.exp(-d*9)*.032*illumination;
    const texture=.5+.5*noise(x*90,z*5-t*.035);
    red=.0035+.018*ripples*texture+shine+haze;
    green=.009+.042*ripples*texture+shine*.47+haze*.47;
    blue=.020+.065*ripples*texture+shine*.12+haze*.15;
  }
  return [red,green,blue,contentMask];
}

export const fieldSource = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 fragColor;
uniform float uAspect;
uniform float uTime;
uniform float uZoom;
uniform vec2 uPan;
uniform float uHDRScale;
uniform float uSunTransmission;
float hash(vec2 p){uvec2 q=uvec2(ivec2(p));uint h=q.x*374761393u+q.y*668265263u;h=(h^(h>>13))*1274126177u;return float(h^(h>>16))/4294967296.0;}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.0,w=.5;for(int i=0;i<4;i++){n+=w*noise(p);p=mat2(.8,.6,-.6,.8)*p*2.03+vec2(7.1,3.2);w*=.5;}return n;}
float crest(float phase){float value=pow(.5+.5*sin(phase),8.0);return mix(value,.1964,smoothstep(.7,3.0,fwidth(phase)));}
float foregroundCloud(vec2 p,float t){
  float u=p.x/uAspect+t*.023;
  float bend=.023*sin(u*5.1)+.012*sin(u*11.3+.8);
  float band=exp(-pow((p.y-.145-bend)/.038,2.0));
  float n=fbm(vec2(u*6.5+13.0,(p.y-.13)*34.0+noise(vec2(u*2.8,6.2))*1.4));
  return smoothstep(.34,.64,n)*band;
}
void main(){
  vec2 p=(vUv-.5)*vec2(uAspect,1.0)/uZoom+uPan;
  float radiusScale=min(1.0,uAspect/.8);
  float t=uTime,cx=.11*uAspect,dy=p.y-.13,r=length(vec2(p.x-cx,dy))/radiusScale,angle=atan(dy,p.x-cx),horizon=-.125;
  float aa=max(fwidth(r)*.65,.00015);
  vec2 moon=vec2(.0020+.00015*sin(t*.055),.00012*cos(t*.07));
  float outside=smoothstep(.0277-aa,.0277+aa,length(vec2(p.x-cx,dy)/radiusScale-moon));
  float sunTransmission=uSunTransmission;
  float contentMask=outside;
  float sy=clamp((p.y-horizon)/.625,0.0,1.0),boundary=uAspect*(.10-.42*sy);
  float warm=1.0-smoothstep(boundary-.16*uAspect,boundary+.27*uAspect,p.x);
  float up=smoothstep(0.0,.95,sy),mid=exp(-pow((sy-.40)/.27,2.0));
  vec3 warmSky=mix(vec3(.21,.025,.022),vec3(.42,.20,.058),up)+vec3(.20,.038,0)*mid;
  vec3 color=mix(vec3(.0025,.0055,.016),warmSky,warm);
  if(p.y>=horizon){
    vec2 q=vec2(p.x/uAspect*2.7+t*.035,(p.y-.28)*15.0+sin(t*.11)*.10);
    float warp=fbm(q*vec2(.7,.27)+vec2(5.0+t*.003,-8.0-t*.006));
    float n=fbm(q+vec2(warp*1.1,warp*1.9));
    float fine=fbm(q*vec2(2.1,2.7)+vec2(9.0+t*.025,warp*2.0+t*.012));
    float below=fbm(q+vec2(warp*1.1,warp*1.9-.18));
    float envelope=smoothstep(.015,.19,p.y)*(1.0-smoothstep(-.02*uAspect,.34*uAspect,p.x));
    float density=smoothstep(.35,.63,n+fine*.12)*envelope;
    float rim=clamp((n-below)*9.0,0.0,1.0),lit=.42+.52*rim+.12*fine;
    vec3 cloudColor=mix(vec3(.065,.047,.044),vec3(.66,.42,.20),lit);
    color=mix(color,cloudColor,density*.88);
    float wisp=smoothstep(.56,.76,fine)*envelope*.20;
    color+=vec3(.34,.19,.065)*wisp;
    float ring=1.0-smoothstep(.032-aa,.032+aa,r);
    float grain=.90+.10*noise(vec2((p.x-cx)*1300.0,dy*1300.0+t*.035));
    float left=.5-.5*cos(angle);
    float flare=.65+1.45*pow(left,3.0)+.25*exp(-pow((angle-2.35)/.55,2.0));
    color+=vec3(1,.76,.35)*ring*grain*flare*24.0;
    float distance=max(0.0,r-.032);
    float halo=exp(-distance*85.0)*(.5+1.5*left*left)+exp(-pow(distance/.075,1.6))*.20*(.25+left);
    float spill=exp(-pow(((p.x-cx)/radiusScale+.038)/.085,2.0)-pow(dy/radiusScale/.050,2.0))*.14;
    color+=vec3(1,.41,.065)*halo+vec3(1,.35,.04)*spill;
    float veil=foregroundCloud(p,t),transmission=exp(-veil*3.3),opacity=1.0-transmission;
    float glowOnCloud=exp(-r*8.0)*(.32+.68*left);
    vec3 cloudLight=vec3(.030,.027,.033)+vec3(.26,.12,.029)*glowOnCloud;
    color*=min(1.0,5.0/max(max(color.r,max(color.g,color.b)),.001));
    color=color*outside*transmission+cloudLight*opacity;
    contentMask=max(outside*(.55+.45*transmission),opacity*.75);
  }else{
    float d=horizon-p.y,depth=min(1.0,d/.375),z=1.0/(d+.055),relative=p.x-cx+.006*radiusScale;
    float swell=sin(p.x*14.0+t*.11)*.36+sin(p.x*29.0-t*.085)*.19;
    float p1=z*47.0+p.x*9.0+swell-t*1.25,p2=z*97.0-p.x*27.0-swell*.7+t*.8,p3=z*211.0+p.x*63.0-t*1.9;
    float ripples=(crest(p1)+crest(p2)*.54+crest(p3)*.32)/1.86;
    float grain=noise(vec2(p.x*175.0+t*.65,z*2.1-t*.095));
    float width=.009+.068*pow(depth,1.3),center=.0035*sin(z*.31+t*.24)*depth;
    float path=exp(-pow((relative-center)/width,2.0));
    float shimmer=.8+.2*sin(t*1.3+z*13.0+grain*3.0);
    float illumination=.42+.58*sunTransmission;
    float shine=path*pow(ripples,1.55)*(.35+1.4*grain*grain)*(.20+depth*.75)*3.7*shimmer*illumination;
    float haze=path*exp(-d*9.0)*.032*illumination;
    float texture=.5+.5*noise(vec2(p.x*90.0,z*5.0-t*.035));
    color=vec3(.0035,.009,.020)+vec3(.018,.042,.065)*ripples*texture+vec3(1,.47,.12)*shine+vec3(1,.47,.15)*haze;
  }
  fragColor=vec4(color*uHDRScale,contentMask);
}`;
