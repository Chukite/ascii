(() => {
  'use strict';

  let canvas = document.getElementById('universe');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const fullTurn = Math.PI * 2;
  const keyboardOrbitStep = fullTurn / 90;
  const defaults = { speed: 1, size: 1.5, brightness: 1, glow: 1.2, shading: 1.15, palette: 0, stars: true, autoOrbit: false };
  const settings = { ...defaults };
  const view = { yaw: 0, pitch: 0.09, roll: 0, zoom: 1 };
  const target = { ...view };
  let paused = motionPreference.matches;
  let time = 4;
  let lastFrame = 0;
  let renderer;
  let width = 0;
  let height = 0;
  let columns = 0;
  let rows = 0;
  let contextLost = false;

  const blackHoleWords = [
    'a black hole packs enormous mass into a tiny region of space.',
    'inside the event horizon, even light cannot escape.',
    'the horizon is a boundary, not a solid surface.',
    'hot gas and dust can orbit outside it in an accretion disk.',
    'the glow belongs to this surrounding matter.',
    'gravity bends the path of light, revealing the far side of the disk above and below the shadow.',
    'distant starlight is distorted by gravitational lensing.',
    'astronomers study black holes through their effects on nearby stars and gas.',
    'merging black holes send gravitational waves across the universe.',
    'some black holes form when massive stars collapse.',
    'the milky way holds a supermassive black hole called sagittarius a*.'
  ].join(' ').split(' ');
  const smoothstep = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };
  function characterLayout(){
    const scale=Math.min(10,Math.max(1,Math.pow(view.zoom,2.7)));
    return {columns:Math.max(16,Math.round(columns/scale)),rows:Math.max(12,Math.round(rows/scale)),reveal:smoothstep(1.08,1.62,view.zoom)};
  }
  function textLines(lineColumns,lineRows){
    let word=0;const lines=[];
    for(let row=0;row<lineRows;row++){
      let line='';
      while(true){
        const next=blackHoleWords[word%blackHoleWords.length];
        if(line.length+(line?1:0)+next.length>lineColumns)break;
        line+=(line?' ':'')+next;word++;
      }
      lines.push(line.padEnd(lineColumns,' '));
    }
    return lines;
  }

  const vertexSource = `#version 300 es
  layout(location=0) in vec2 aPosition;
  out vec2 vUv;
  void main() { vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const lensSource = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform float uAspect;
  uniform float uPitch;
  uniform float uRoll;
  uniform float uZoom;
  const float PI=3.14159265359;
  void main(){
    vec2 uv=(vUv-0.5)*2.0;uv.y+=0.025;uv.x*=uAspect;
    float cr=cos(uRoll),sr=sin(uRoll);uv=mat2(cr,sr,-sr,cr)*uv;
    vec3 eye=22.0*vec3(0.0,sin(uPitch),cos(uPitch));
    vec3 forward=normalize(-eye);
    vec3 right=vec3(1,0,0),up=cross(right,forward);
    vec3 velocity=normalize(forward*min(3.35,uAspect*2.05)*uZoom+uv.x*right+uv.y*up);
    vec3 position=eye, angularMomentum=cross(position,velocity);
    float h2=dot(angularMomentum,angularMomentum);
    float photon=exp(-pow((sqrt(h2)-2.603)/0.038,2.0));
    for(int i=0;i<185;i++){
      float r=length(position);
      if(r<1.02){fragColor=vec4(0,0,0,photon);return;}
      if(r>35.0)break;
      float dt=clamp(r*0.075,0.035,1.3);
      vec3 previous=position;
      vec3 acceleration=-1.5*h2*position/(r*r*r*r*r);
      position+=velocity*dt+acceleration*(0.5*dt*dt);
      float nr=max(length(position),0.8);
      velocity+=(acceleration-1.5*h2*position/(nr*nr*nr*nr*nr))*(0.5*dt);
      if(previous.y*position.y<0.0){
        float f=abs(previous.y)/(abs(previous.y)+abs(position.y));
        vec3 hit=mix(previous,position,f);
        float radius=length(hit.xz);
        if(radius>2.65&&radius<11.3){
          fragColor=vec4(radius/12.0,(atan(hit.z,hit.x)+PI)/(2.0*PI),0,photon);return;
        }
      }
    }
    vec3 escaped=normalize(velocity);
    fragColor=vec4(1.0,atan(escaped.z,escaped.x)/(2.0*PI)+0.5,asin(clamp(escaped.y,-1.0,1.0))/PI+0.5,photon);
  }`;

  const fieldSource = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform vec2 uGrid;
  uniform float uAspect;
  uniform float uTime;
  uniform float uYaw;
  uniform float uPitch;
  uniform float uRoll;
  uniform float uZoom;
  uniform float uBrightness;
  uniform int uPalette;
  uniform bool uStars;
  uniform sampler2D uMap;
  uniform float uHDRScale;
  uniform float uShading;
  const float PI = 3.14159265359;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){
    float n=0.0,weight=0.5;
    mat2 turn=mat2(0.8,-0.6,0.6,0.8);
    for(int i=0;i<5;i++){n+=weight*noise(p);p=turn*p*2.03+vec2(7.1,3.2);weight*=0.5;}
    return n;
  }
  vec3 diskColor(float heat) {
    vec3 ember=vec3(0.56,0.055,0.008),gold=vec3(1.0,0.39,0.055),cream=vec3(1.0,0.79,0.36),white=vec3(1.0,0.985,0.91);
    if(uPalette==1){ember=vec3(0.035,0.15,0.44);gold=vec3(0.16,0.55,1);cream=vec3(0.58,0.87,1);white=vec3(0.94,0.99,1);}
    if(uPalette==2){ember=vec3(0.32);gold=vec3(0.62);cream=vec3(0.83);white=vec3(1);}
    vec3 color=mix(ember,gold,smoothstep(0.10,0.48,heat));
    color=mix(color,cream,smoothstep(0.45,0.74,heat));
    return mix(color,white,smoothstep(0.72,0.96,heat));
  }
  vec3 disk(float radius,float angle){
    float orbital=0.10+1.45*pow(3.0/radius,1.5);
    float phase=angle+uTime*orbital;
    vec2 flow=vec2(cos(phase),sin(phase));
    float eddy=fbm(flow*(3.0+radius*0.7)+radius*vec2(1.8,0.6));
    float warped=radius+0.065*sin(phase*4.0+radius*1.8)+0.075*(eddy-0.5);
    float footprint=fwidth(warped);
    float large=pow(0.5+0.5*sin(warped*9.5+0.16*sin(phase*7.0)),3.0);
    large=mix(large,0.31,smoothstep(0.14,0.55,footprint));
    float fine=pow(0.5+0.5*sin(warped*28.5+eddy*0.8),5.0);
    fine=mix(fine,0.24,smoothstep(0.045,0.20,footprint));
    float dust=noise(flow*(38.0+radius*3.0)+vec2(radius*38.0,radius*27.0));
    float knots=pow(noise(flow*(13.0+radius)+radius*9.0),5.0);
    float ribbons=0.035+1.65*large+0.18*fine;
    float texture=(0.70+0.30*dust)*(0.85+0.30*eddy);
    float edge=smoothstep(2.66,3.02,radius)*(1.0-smoothstep(8.0,11.3,radius));
    float radial=pow(3.0/max(radius,3.0),1.42);
    float approaching=0.5-0.5*cos(angle-uYaw);
    float beaming=0.35+2.2*pow(approaching,2.5);
    float heat=clamp(0.94*pow(3.0/max(radius,3.0),0.9)+0.32*approaching-0.18,0.0,1.0);
    float energy=(ribbons*texture+knots*0.18)*edge*radial*beaming*4.5*uBrightness;
    return diskColor(heat)*energy;
  }
  float starLayer(vec2 p,float threshold){
    vec2 cell=floor(p),local=fract(p)-vec2(0.18+hash(cell+2.1)*0.64,0.18+hash(cell+9.2)*0.64);
    float chance=hash(cell);
    float elongation=mix(1.0,2.6,step(0.997,chance));
    float distance=length(local*vec2(1.0,1.0/elongation));
    return step(threshold,chance)*exp(-distance*distance/0.016)*(0.8+2.6*hash(cell+32.0));
  }
  vec3 background(vec3 direction){
    if(!uStars)return vec3(0);
    vec2 sphere=vec2(atan(direction.z,direction.x)/(2.0*PI),asin(clamp(direction.y,-1.0,1.0))/PI);
    sphere+=vec2(uTime*0.00010,uTime*0.000012);
    float stars=starLayer(sphere*vec2(750,430),0.95);
    stars+=starLayer(sphere*vec2(1700,980)+51.7,0.963)*0.85;
    float twinkle=0.8+0.2*sin(uTime*0.9+hash(floor(sphere*750.0))*140.0);
    vec3 tint=mix(vec3(0.48,0.66,1.0),vec3(1.0,0.88,0.69),noise(sphere*110.0));
    vec2 cloudSpace=sphere*vec2(24,34)+vec2(2.4,-7.1);
    float mist=fbm(cloudSpace+vec2(fbm(cloudSpace+9.3),fbm(cloudSpace-7.8))*2.1);
    float tendril=fbm(cloudSpace*2.5+vec2(0.0,uTime*0.002));
    float cloud=pow(mist,3.8)*(0.45+0.75*tendril);
    vec3 nebula=mix(vec3(0.035,0.11,0.24),vec3(0.19,0.045,0.19),fbm(cloudSpace*0.7+17.0));
    float grain=0.55+0.45*hash(floor(vUv*uGrid));
    if(uPalette==2){nebula=vec3(dot(nebula,vec3(0.2126,0.7152,0.0722)));tint=vec3(0.90);}
    return tint*stars*twinkle+nebula*cloud*2.6*grain;
  }

  void main() {
    vec4 lens=texture(uMap,vUv);
    vec2 uv = (vUv-0.5)*2.0;
    uv.y += 0.025;
    uv.x *= uAspect;
    float cr=cos(uRoll),sr=sin(uRoll);uv=mat2(cr,sr,-sr,cr)*uv;
    vec3 radiance = vec3(0.0);
    if(lens.r>0.99){
      float azimuth=(lens.g-0.5)*(2.0*PI)+uYaw,elevation=(lens.b-0.5)*PI;
      vec3 direction=vec3(cos(azimuth)*cos(elevation),sin(elevation),sin(azimuth)*cos(elevation));
      radiance=background(direction);
    }else if(lens.r>0.0){
      float radius=lens.r*12.0,angle=lens.g*(2.0*PI)-PI+uYaw;
      radiance=disk(radius,angle);
    }
    float rimHeat=0.76-0.22*uv.x;
    radiance+=diskColor(rimHeat)*lens.a*2.0*uBrightness;
    float luminance=dot(radiance,vec3(0.2126,0.7152,0.0722));
    radiance=max(mix(vec3(luminance),radiance,uShading),vec3(0));
    float glowSource=clamp(step(0.0001,lens.r)*(1.0-step(0.99,lens.r))+step(0.001,lens.a),0.0,1.0);
    fragColor=vec4(radiance*uHDRScale,glowSource);
  }`;

  const bloomSource = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uSource;
  uniform vec2 uDirection;
  uniform bool uExtract;
  vec3 source(vec2 uv){vec4 sampleColor=texture(uSource,uv);return sampleColor.rgb*(uExtract?sampleColor.a:1.0);}
  void main(){
    vec3 light=source(vUv)*0.227027;
    light+=(source(vUv+uDirection*1.0)+source(vUv-uDirection*1.0))*0.194595;
    light+=(source(vUv+uDirection*2.0)+source(vUv-uDirection*2.0))*0.121622;
    light+=(source(vUv+uDirection*3.0)+source(vUv-uDirection*3.0))*0.054054;
    light+=(source(vUv+uDirection*4.0)+source(vUv-uDirection*4.0))*0.016216;
    fragColor=vec4(light,1.0);
  }`;

  const glyphSource = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uField;
  uniform sampler2D uAtlas;
  uniform sampler2D uBloom;
  uniform sampler2D uWideBloom;
  uniform sampler2D uLens;
  uniform sampler2D uText;
  uniform vec2 uGrid;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uDecodeScale;
  uniform float uGlow;
  uniform float uTextReveal;
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  void main() {
    vec2 cell=floor(vUv*uGrid);
    vec2 sampleUv=(cell+0.5)/uGrid;
    vec3 direct=texture(uField,sampleUv).rgb*uDecodeScale;
    vec3 halo=texture(uBloom,sampleUv).rgb*uDecodeScale;
    vec3 wideHalo=texture(uWideBloom,sampleUv).rgb*uDecodeScale;
    vec3 radiance=direct+halo*0.30;
    vec3 color=1.0-exp(-radiance*0.93);
    float luminance=max(color.r,max(color.g,color.b));
    vec3 voidColor=vec3(0.003,0.004,0.007);
    float flicker=hash(cell+floor(uTime*4.0)*vec2(0.13,0.29));
    float index=floor(clamp(pow(luminance,0.52)*60.0+flicker*3.0,0.0,63.0));
    vec2 local=fract(vUv*uGrid);
    float glyph=texture(uAtlas,vec2((index+local.x)/160.0,1.0-local.y)).r;
    if(luminance<0.0035||(luminance<0.07&&hash(cell+vec2(31.2,73.5))>luminance*11.0))glyph=0.0;
    vec2 textUv=vec2(cell.x+0.5,uGrid.y-cell.y-0.5)/uGrid;
    float letter=64.0+floor(texture(uText,textUv).r*255.0+0.5);
    float textGlyph=texture(uAtlas,vec2((letter+local.x)/160.0,1.0-local.y)).r;
    glyph=mix(glyph,textGlyph,uTextReveal);
    vec3 ink=color*1.95;
    vec4 lens=texture(uLens,sampleUv);
    float outsideShadow=step(0.0001,lens.r);
    ink=max(ink,vec3(0.16,0.085,0.035)*uTextReveal*outsideShadow);
    vec3 glow=max(halo-vec3(0.04),vec3(0))*0.075+max(wideHalo-vec3(0.025),vec3(0))*0.07;
    glow*=uGlow*outsideShadow*mix(1.0,0.62,uTextReveal);
    fragColor=vec4(voidColor+pow(max(ink*glyph+glow,vec3(0)),vec3(1.0/2.2)),1);
  }`;

  function createWebGLRenderer() {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL 2 is unavailable');

    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
      return result;
    }
    function program(fragment) {
      const result = gl.createProgram();
      const vs=shader(gl.VERTEX_SHADER,vertexSource), fs=shader(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(result,vs); gl.attachShader(result,fs); gl.linkProgram(result);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(result,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
      return result;
    }
    const lensProgram = program(lensSource);
    const fieldProgram = program(fieldSource);
    const bloomProgram = program(bloomSource);
    const glyphProgram = program(glyphSource);
    const locations = new Map();
    function uniform(prog, name) {
      const key = (prog === fieldProgram ? 'f' : prog === lensProgram ? 'l' : prog === bloomProgram ? 'b' : 'g') + name;
      if (!locations.has(key)) locations.set(key,gl.getUniformLocation(prog,name));
      return locations.get(key);
    }
    const vertexArray = gl.createVertexArray();
    gl.bindVertexArray(vertexArray);
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    for(const prog of [lensProgram,fieldProgram,bloomProgram,glyphProgram]) {
      const location=gl.getAttribLocation(prog,'aPosition');
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    }
    function texture() {
      const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      return t;
    }
    const atlasCanvas=document.createElement('canvas');
    atlasCanvas.width=160*20; atlasCanvas.height=32;
    const atlasContext=atlasCanvas.getContext('2d');
    atlasContext.fillStyle='black';atlasContext.fillRect(0,0,atlasCanvas.width,32);
    atlasContext.fillStyle='white';atlasContext.font='bold 34px "Courier New", monospace';
    atlasContext.textAlign='center';atlasContext.textBaseline='middle';
    const glyphGroups=[' .,:','.,:;',':;-~','-=+~','+*!i','!/*t','tfrs','xvuY','znco','aesu','2357','6904','%$&#','8#MW','8MW@','@@@@'];
    for(let i=0;i<64;i++)atlasContext.fillText(glyphGroups[Math.floor(i/4)][i%4],i*20+10,17);
    atlasContext.font='bold 28px "Courier New", monospace';
    for(let i=0;i<96;i++)atlasContext.fillText(String.fromCharCode(i+32),(i+64)*20+10,17);
    const atlas=texture();
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const field=texture(), framebuffer=gl.createFramebuffer();
    const textMap=texture();
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([0]));
    let textColumns=0,textRows=0;
    const lensMap=texture(),lensFramebuffer=gl.createFramebuffer();
    const floatTargets=!!gl.getExtension('EXT_color_buffer_float');
    const bloomH=texture(),bloomHFramebuffer=gl.createFramebuffer();
    const bloomV=texture(),bloomVFramebuffer=gl.createFramebuffer();
    const wideBloomH=texture(),wideBloomHFramebuffer=gl.createFramebuffer();
    const wideBloomV=texture(),wideBloomVFramebuffer=gl.createFramebuffer();
    for(const tex of [bloomH,bloomV,wideBloomH,wideBloomV]){
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    }
    const hdrScale=floatTargets?1:0.125;
    let bloomColumns,bloomRows,wideBloomColumns,wideBloomRows;
    let mapPitch=Infinity,mapRoll=Infinity,mapZoom=Infinity;

    function allocate(tex,fb,w,h){
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texImage2D(gl.TEXTURE_2D,0,floatTargets?gl.RGBA16F:gl.RGBA,w,h,0,gl.RGBA,floatTargets?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('The character light field could not be created');
    }

    return {
      type:'webgl2',
      resize() {
        bloomColumns=Math.ceil(columns/2);bloomRows=Math.ceil(rows/2);
        wideBloomColumns=Math.ceil(columns/4);wideBloomRows=Math.ceil(rows/4);
        allocate(field,framebuffer,columns,rows);allocate(lensMap,lensFramebuffer,columns,rows);
        allocate(bloomH,bloomHFramebuffer,bloomColumns,bloomRows);allocate(bloomV,bloomVFramebuffer,bloomColumns,bloomRows);
        allocate(wideBloomH,wideBloomHFramebuffer,wideBloomColumns,wideBloomRows);allocate(wideBloomV,wideBloomVFramebuffer,wideBloomColumns,wideBloomRows);
        mapPitch=Infinity;mapRoll=Infinity;mapZoom=Infinity;
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      },
      render() {
        const layout=characterLayout();
        if(layout.reveal>0&&(textColumns!==layout.columns||textRows!==layout.rows)){
          const lines=textLines(layout.columns,layout.rows),characters=new Uint8Array(layout.columns*layout.rows);
          for(let row=0;row<layout.rows;row++)for(let col=0;col<layout.columns;col++)characters[row*layout.columns+col]=lines[row].charCodeAt(col)-32;
          gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,textMap);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,layout.columns,layout.rows,0,gl.RED,gl.UNSIGNED_BYTE,characters);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
          textColumns=layout.columns;textRows=layout.rows;
        }
        gl.bindVertexArray(vertexArray);
        if(Math.abs(mapPitch-view.pitch)>.0002||Math.abs(mapRoll-view.roll)>.0002||Math.abs(mapZoom-view.zoom)>.0002){
          gl.useProgram(lensProgram);gl.bindFramebuffer(gl.FRAMEBUFFER,lensFramebuffer);gl.viewport(0,0,columns,rows);
          gl.uniform1f(uniform(lensProgram,'uAspect'),width/height);
          gl.uniform1f(uniform(lensProgram,'uPitch'),view.pitch);gl.uniform1f(uniform(lensProgram,'uZoom'),view.zoom);
          gl.uniform1f(uniform(lensProgram,'uRoll'),view.roll);
          gl.drawArrays(gl.TRIANGLES,0,6);mapPitch=view.pitch;mapRoll=view.roll;mapZoom=view.zoom;
        }
        gl.useProgram(fieldProgram);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,columns,rows);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,lensMap);gl.uniform1i(uniform(fieldProgram,'uMap'),0);
        gl.uniform2f(uniform(fieldProgram,'uGrid'),columns,rows);
        gl.uniform1f(uniform(fieldProgram,'uAspect'),width/height);
        gl.uniform1f(uniform(fieldProgram,'uTime'),time);
        gl.uniform1f(uniform(fieldProgram,'uYaw'),view.yaw);
        gl.uniform1f(uniform(fieldProgram,'uPitch'),view.pitch);
        gl.uniform1f(uniform(fieldProgram,'uRoll'),view.roll);
        gl.uniform1f(uniform(fieldProgram,'uZoom'),view.zoom);
        gl.uniform1f(uniform(fieldProgram,'uBrightness'),settings.brightness);
        gl.uniform1i(uniform(fieldProgram,'uPalette'),settings.palette);
        gl.uniform1i(uniform(fieldProgram,'uStars'),settings.stars?1:0);
        gl.uniform1f(uniform(fieldProgram,'uHDRScale'),hdrScale);
        gl.uniform1f(uniform(fieldProgram,'uShading'),settings.shading);
        gl.drawArrays(gl.TRIANGLES,0,6);

        gl.useProgram(bloomProgram);gl.viewport(0,0,bloomColumns,bloomRows);
        gl.uniform1i(uniform(bloomProgram,'uSource'),0);
        gl.uniform1i(uniform(bloomProgram,'uExtract'),1);
        gl.bindFramebuffer(gl.FRAMEBUFFER,bloomHFramebuffer);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,field);
        gl.uniform2f(uniform(bloomProgram,'uDirection'),3.0/columns,0.0);gl.drawArrays(gl.TRIANGLES,0,6);
        gl.uniform1i(uniform(bloomProgram,'uExtract'),0);
        gl.bindFramebuffer(gl.FRAMEBUFFER,bloomVFramebuffer);gl.bindTexture(gl.TEXTURE_2D,bloomH);
        gl.uniform2f(uniform(bloomProgram,'uDirection'),0.0,1.65/rows);gl.drawArrays(gl.TRIANGLES,0,6);

        gl.viewport(0,0,wideBloomColumns,wideBloomRows);
        gl.bindFramebuffer(gl.FRAMEBUFFER,wideBloomHFramebuffer);gl.bindTexture(gl.TEXTURE_2D,bloomV);
        gl.uniform2f(uniform(bloomProgram,'uDirection'),12.0/columns,0.0);gl.drawArrays(gl.TRIANGLES,0,6);
        gl.bindFramebuffer(gl.FRAMEBUFFER,wideBloomVFramebuffer);gl.bindTexture(gl.TEXTURE_2D,wideBloomH);
        gl.uniform2f(uniform(bloomProgram,'uDirection'),0.0,6.8/rows);gl.drawArrays(gl.TRIANGLES,0,6);

        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
        gl.useProgram(glyphProgram);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,field);gl.uniform1i(uniform(glyphProgram,'uField'),0);
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,atlas);gl.uniform1i(uniform(glyphProgram,'uAtlas'),1);
        gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,bloomV);gl.uniform1i(uniform(glyphProgram,'uBloom'),2);
        gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,wideBloomV);gl.uniform1i(uniform(glyphProgram,'uWideBloom'),3);
        gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,lensMap);gl.uniform1i(uniform(glyphProgram,'uLens'),4);
        gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,textMap);gl.uniform1i(uniform(glyphProgram,'uText'),5);
        gl.uniform2f(uniform(glyphProgram,'uGrid'),layout.columns,layout.rows);
        gl.uniform1f(uniform(glyphProgram,'uTextReveal'),layout.reveal);
        gl.uniform2f(uniform(glyphProgram,'uResolution'),canvas.width,canvas.height);
        gl.uniform1f(uniform(glyphProgram,'uTime'),time);
        gl.uniform1f(uniform(glyphProgram,'uDecodeScale'),1/hdrScale);
        gl.uniform1f(uniform(glyphProgram,'uGlow'),settings.glow);
        gl.drawArrays(gl.TRIANGLES,0,6);
      }
    };
  }

  function createCanvasRenderer() {
    const context=canvas.getContext('2d',{alpha:false});
    if(!context) throw new Error('Canvas is unavailable');
    const glyphs=' .,:;-~=+!*?%$#@';
    const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
    const glowCanvas=document.createElement('canvas'),glowContext=glowCanvas.getContext('2d');
    let textColumns=0,textRows=0,lines=[];
    return {
      type:'canvas2d',resize(){glowCanvas.width=canvas.width;glowCanvas.height=canvas.height;},
      render(){
        const layout=characterLayout(),renderColumns=layout.columns,renderRows=layout.rows;
        if(layout.reveal>0&&(textColumns!==renderColumns||textRows!==renderRows)){lines=textLines(renderColumns,renderRows);textColumns=renderColumns;textRows=renderRows;}
        const cw=width/renderColumns,ch=height/renderRows,dpr=canvas.width/width;
        context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle='#060709';context.fillRect(0,0,width,height);
        context.font=`${ch*.93}px "Courier New",monospace`;context.textAlign='center';context.textBaseline='middle';
        const scale=Math.min(width*.43,height*.63)*view.zoom;
        const tilt=Math.sin(view.pitch)*.7+.065;
        const cr=Math.cos(view.roll),sr=Math.sin(view.roll);
        for(let row=0;row<renderRows;row++)for(let col=0;col<renderColumns;col++){
          const sx=((col+.5)*cw-width/2)/scale,sy=((row+.5)*ch-height*.4875)/scale;
          const x=cr*sx+sr*sy,y=-sr*sx+cr*sy;
          const radius=Math.hypot(x,y), angle=Math.atan2(y,x);
          const elliptical=Math.hypot(x,y/tilt);
          const arc=Math.hypot(x,y*1.05);
          let b=0;
          if(elliptical>.29&&elliptical<1){
            b=(1-elliptical)*(.46+.54*Math.pow(Math.sin(elliptical*140+Math.sin(angle*5+time*2)*2),2));
            b*=1+.45*Math.cos(angle+view.yaw+time*.1);
          }
          if(arc>.29&&arc<.59){
            const lens=(1-(arc-.29)/.3)*Math.pow(Math.abs(Math.sin(arc*150+angle*2+time*.35)),3);
            b+=lens*(y<0?.83:.6)*(1-Math.abs(x)*.4);
          }
          const shadow=radius<.29&&y<-tilt*.26;
          if(shadow)b=0;
          if(Math.abs(radius-.294)<.004)b+=.5;
          b*=settings.brightness;
          let star=false;
          if(b<.02&&settings.stars&&radius>.31&&hash(col+Math.floor(view.yaw*20),row)>.994){b=.15+hash(col+2,row)*.4;star=true;}
          if(!shadow)b=Math.max(b,.08*layout.reveal);
          if(b<.025)continue;
          const light=Math.min(1,b);
          let color;
          if(settings.palette===2||star)color=[light*238,light*233,light*221];
          else if(settings.palette===1)color=[75+light*180,120+light*135,170+light*85];
          else color=[130+light*125,50+light*205,8+light*210];
          const luma=color[0]*.2126+color[1]*.7152+color[2]*.0722;
          context.fillStyle=`rgb(${color.map(value=>Math.round(Math.max(0,Math.min(255,luma+(value-luma)*settings.shading)))).join(',')})`;
          if(layout.reveal<1){context.globalAlpha=1-layout.reveal;context.fillText(glyphs[Math.min(glyphs.length-1,Math.floor(light*(glyphs.length-2))+1)],(col+.5)*cw,(row+.5)*ch);}
          if(layout.reveal>0){context.globalAlpha=layout.reveal;context.fillText(lines[row][col],(col+.5)*cw,(row+.5)*ch);}
        }
        context.globalAlpha=1;
        if(settings.glow>0){
          glowContext.clearRect(0,0,glowCanvas.width,glowCanvas.height);glowContext.drawImage(canvas,0,0);
          context.save();context.setTransform(1,0,0,1,0,0);context.globalCompositeOperation='screen';
          context.filter=`blur(${5*dpr}px)`;context.globalAlpha=Math.min(.8,settings.glow*.38);context.drawImage(glowCanvas,0,0);
          context.filter=`blur(${22*dpr}px)`;context.globalAlpha=Math.min(.5,settings.glow*.18);context.drawImage(glowCanvas,0,0);context.restore();
        }
      }
    };
  }

  function replaceCanvas() {
    const replacement=canvas.cloneNode(false);
    canvas.replaceWith(replacement);canvas=replacement;
  }
  function initializeRenderer() {
    try { renderer=createWebGLRenderer(); }
    catch(error) {
      console.info('Using the Canvas ASCII renderer:',error.message);
      replaceCanvas();renderer=createCanvasRenderer();
    }
    bindCanvasEvents(); resize();
  }
  function resize() {
    width=innerWidth;height=innerHeight;
    const dpr=Math.min(Math.max(devicePixelRatio||1,renderer.type==='webgl2'?1.5:1),2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    const size=settings.size*(width<650?.9:1);
    columns=Math.max(40,Math.floor(width/size));rows=Math.max(30,Math.floor(height/(size*1.75)));
    const gridLimit=renderer.type==='webgl2'?480000:65000;
    if(columns*rows>gridLimit){const ratio=Math.sqrt(gridLimit/(columns*rows));columns=Math.floor(columns*ratio);rows=Math.floor(rows*ratio);}
    renderer.resize();
    drawStill();
  }
  function drawStill(){if(renderer&&!contextLost)renderer.render();}
  function animate(now){
    requestAnimationFrame(animate);
    if(document.hidden||contextLost){lastFrame=now;return;}
    const delta=Math.min((now-(lastFrame||now))/1000,.05);lastFrame=now;
    if(!paused){time+=delta*settings.speed;if(settings.autoOrbit)target.yaw+=delta*.055;}
    const smoothing=1-Math.exp(-delta*10);
    let moving=false;
    for(const key of ['yaw','pitch','roll','zoom']){const difference=target[key]-view[key];if(Math.abs(difference)>.00005){view[key]+=difference*smoothing;moving=true;}else view[key]=target[key];}

    for(const axis of ['yaw','pitch','roll']){
      const turns=Math.trunc(view[axis]/fullTurn);
      if(turns){view[axis]-=turns*fullTurn;target[axis]-=turns*fullTurn;}
    }
    if(!paused||moving)renderer.render();
  }
  function togglePlay(){paused=!paused;}
  function zoom(factor){target.zoom=Math.min(2.3,Math.max(.55,target.zoom*factor));}
  function resetView(){Object.assign(target,{yaw:0,pitch:.09,roll:0,zoom:1});}
  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    }catch{/* Fullscreen may be unavailable in an embedded browser. */}
  }
  function capture(){
    drawStill();
    canvas.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`singularity-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
      link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    },'image/png');
  }
  function bindCanvasEvents(){
    const pointers=new Map();let pinchDistance=0,pinchAngle=0;
    canvas.addEventListener('pointerdown',event=>{pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);if(pointers.size===2){const p=[...pointers.values()];pinchDistance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);pinchAngle=Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x);}});
    canvas.addEventListener('pointermove',event=>{
      const previous=pointers.get(event.pointerId);if(!previous)return;
      const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===2){
        const p=[...pointers.values()],distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
        const angle=Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x);
        if(pinchDistance>0){zoom(distance/pinchDistance);target.roll+=Math.atan2(Math.sin(angle-pinchAngle),Math.cos(angle-pinchAngle));}
        pinchDistance=distance;pinchAngle=angle;
      }else if(event.shiftKey){target.roll+=(dx+dy)*.005;}
      else{target.yaw-=dx*.005;target.pitch+=dy*.005;}
    });
    const release=event=>{pointers.delete(event.pointerId);pinchDistance=0;pinchAngle=0;};
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
    canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-event.deltaY*.001));},{passive:false});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;});
    canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;replaceCanvas();initializeRenderer();});
  }
  addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{lastFrame=0;});
  motionPreference.addEventListener('change',event=>{if(event.matches){paused=true;settings.autoOrbit=false;drawStill();}});
  addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const key=event.key.toLowerCase();
    if(event.code==='Space'){event.preventDefault();togglePlay();}
    else if(key==='r')resetView();else if(key==='f')toggleFullscreen();else if(key==='s')capture();
    else if(key==='q')target.roll-=keyboardOrbitStep;else if(key==='e')target.roll+=keyboardOrbitStep;
    else if(key==='+'||key==='=')zoom(1.12);else if(key==='-'||key==='_')zoom(1/1.12);
    else if(key.startsWith('arrow')){event.preventDefault();if(event.shiftKey&&(key==='arrowleft'||key==='arrowright'))target.roll+=(key==='arrowright'?1:-1)*keyboardOrbitStep;else{if(key==='arrowleft')target.yaw-=keyboardOrbitStep;if(key==='arrowright')target.yaw+=keyboardOrbitStep;if(key==='arrowup')target.pitch+=keyboardOrbitStep;if(key==='arrowdown')target.pitch-=keyboardOrbitStep;}}
  });

  try{
    initializeRenderer();requestAnimationFrame(animate);
  }catch(error){
    console.error('Unable to start the observatory:',error);
  }
})();
