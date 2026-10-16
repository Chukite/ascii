import {fieldSource,sampleScene,sunVisibility,eclipseWords,smoothstep,hash} from './scene.js?v=3';
(() => {
  'use strict';
  let canvas=document.getElementById('universe');
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  const settings={size:1.25,glow:1.7};
  const view={zoom:1,x:0,y:0},target={...view},lastPointer={x:null,y:null};
  let paused=motionPreference.matches,time=0,lastFrame=0,lastPaint=0,renderer,width=0,height=0,columns=0,rows=0,contextLost=false;
  function characterLayout(){const scale=Math.min(10,Math.max(1,Math.pow(view.zoom,2.7)));return {columns:Math.max(16,Math.round(columns/scale)),rows:Math.max(12,Math.round(rows/scale)),reveal:smoothstep(1.08,1.62,view.zoom)};}
  function textLines(lineColumns,lineRows){let word=0;const lines=[];for(let row=0;row<lineRows;row++){let line='';while(true){const next=eclipseWords[word%eclipseWords.length];if(line.length+(line?1:0)+next.length>lineColumns)break;line+=(line?' ':'')+next;word++;}lines.push(line.padEnd(lineColumns,' '));}return lines;}
  const vertexSource = `#version 300 es
  layout(location=0) in vec2 aPosition;
  out vec2 vUv;
  void main() { vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }`;

  const bloomSource = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uSource;
  uniform vec2 uDirection;
  uniform bool uExtract;
  vec3 source(vec2 uv){vec4 sampleColor=texture(uSource,uv);float peak=max(sampleColor.r,max(sampleColor.g,sampleColor.b));return sampleColor.rgb*(uExtract?sampleColor.a*smoothstep(.18,.75,peak):1.0);}
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
    vec3 halo=texture(uBloom,vUv).rgb*uDecodeScale;
    vec3 wideHalo=texture(uWideBloom,vUv).rgb*uDecodeScale;
    vec3 radiance=direct+halo*0.30;
    vec3 color=1.0-exp(-radiance*0.93);
    float luminance=max(color.r,max(color.g,color.b));
    vec3 voidColor=vec3(0.003,0.004,0.007);
    float tone=clamp(pow(luminance,0.52)*60.0+hash(cell)*2.0,0.0,63.0);
    float index=floor(tone);
    vec2 local=fract(vUv*uGrid);
    float glyph=texture(uAtlas,vec2((index+local.x)/160.0,1.0-local.y)).r;
    float nextGlyph=texture(uAtlas,vec2((min(index+1.0,63.0)+local.x)/160.0,1.0-local.y)).r;
    glyph=mix(glyph,nextGlyph,fract(tone));
    float threshold=hash(cell+vec2(31.2,73.5));
    float visibility=smoothstep(.0015,.005,luminance)*mix(smoothstep(threshold-.10,threshold+.10,luminance*11.0),1.0,smoothstep(.05,.07,luminance));
    visibility=max(visibility,smoothstep(.004,.014,luminance)*.38);
    glyph*=visibility;
    vec2 textUv=vec2(cell.x+0.5,uGrid.y-cell.y-0.5)/uGrid;
    float letter=64.0+floor(texture(uText,textUv).r*255.0+0.5);
    float textGlyph=texture(uAtlas,vec2((letter+local.x)/160.0,1.0-local.y)).r;
    glyph=mix(glyph,textGlyph,uTextReveal);
    vec3 ink=color*1.95;
    float outsideShadow=texture(uField,vUv).a;
    ink=max(ink,vec3(0.16,0.085,0.035)*uTextReveal*outsideShadow);
    vec3 glow=max(halo-vec3(0.02),vec3(0))*0.11+max(wideHalo-vec3(0.008),vec3(0))*0.13;
    glow*=uGlow*outsideShadow*mix(1.0,0.62,uTextReveal);
    fragColor=vec4(voidColor+pow(max(ink*glyph*outsideShadow+glow,vec3(0)),vec3(1.0/2.2)),1);
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
    const fieldProgram = program(fieldSource);
    const bloomProgram = program(bloomSource);
    const glyphProgram = program(glyphSource);
    const locations = new Map();
    function uniform(prog, name) {
      const key = (prog === fieldProgram ? 'f' : prog === bloomProgram ? 'b' : 'g') + name;
      if (!locations.has(key)) locations.set(key,gl.getUniformLocation(prog,name));
      return locations.get(key);
    }
    const vertexArray = gl.createVertexArray();
    gl.bindVertexArray(vertexArray);
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    for(const prog of [fieldProgram,bloomProgram,glyphProgram]) {
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
        allocate(field,framebuffer,columns,rows);
        allocate(bloomH,bloomHFramebuffer,bloomColumns,bloomRows);allocate(bloomV,bloomVFramebuffer,bloomColumns,bloomRows);
        allocate(wideBloomH,wideBloomHFramebuffer,wideBloomColumns,wideBloomRows);allocate(wideBloomV,wideBloomVFramebuffer,wideBloomColumns,wideBloomRows);
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
        gl.useProgram(fieldProgram);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,columns,rows);
        gl.uniform1f(uniform(fieldProgram,'uAspect'),width/height);
        gl.uniform1f(uniform(fieldProgram,'uTime'),time);
        gl.uniform2f(uniform(fieldProgram,'uPan'),view.x,view.y);
        gl.uniform1f(uniform(fieldProgram,'uZoom'),view.zoom);
        gl.uniform1f(uniform(fieldProgram,'uHDRScale'),hdrScale);
        gl.uniform1f(uniform(fieldProgram,'uSunTransmission'),sunVisibility(time,width/height));
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


  function createCanvasRenderer(){
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw new Error('Canvas is unavailable');
    const glyphs=[' .,:','.,:;',':;-~','-=+~','+*!i','!/*t','tfrs','xvuY','znco','aesu','2357','6904','%$&#','8#MW','8MW@','@@@@'].join('');
    const lightCanvas=document.createElement('canvas'),lightContext=lightCanvas.getContext('2d');
    let textColumns=0,textRows=0,lines=[];
    return {type:'canvas2d',resize(){lightCanvas.width=canvas.width;lightCanvas.height=canvas.height;},render(){
      const layout=characterLayout(),cols=layout.columns,rs=layout.rows;
      if(layout.reveal>0&&(textColumns!==cols||textRows!==rs)){lines=textLines(cols,rs);textColumns=cols;textRows=rs;}
      const cw=width/cols,ch=height/rs,dpr=canvas.width/width,aspect=width/height,sunLight=sunVisibility(time,aspect),emptyCells=[];
      context.setTransform(dpr,0,0,dpr,0,0);context.globalAlpha=1;context.fillStyle='#030711';context.fillRect(0,0,width,height);
      context.font=(ch*.93)+'px "Courier New",monospace';context.textAlign='center';context.textBaseline='middle';
      for(let row=0;row<rs;row++)for(let col=0;col<cols;col++){
        const sx=((col+.5)*cw-width/2)/height,sy=.5-(row+.5)/rs;
        const x=sx/view.zoom+view.x,y=sy/view.zoom+view.y;
        const sample=sampleScene(x,y,time,cw/height/view.zoom*.65,aspect,sunLight),mask=sample[3];
        if(mask<.001)emptyCells.push([col,row]);
        const color=sample.slice(0,3).map(v=>1-Math.exp(-v*.93));
        const luminance=Math.max(...color),light=color.map((v,i)=>Math.pow(Math.max(v*1.95,[.16,.085,.035][i]*layout.reveal*mask),1/2.2));
        const tone=Math.min(63,Math.pow(luminance,.52)*60+hash(col,rs-1-row)*2),index=Math.floor(tone),fraction=tone-index;
        const threshold=hash(col+31.2,rs-1-row+73.5);
        const visible=Math.max(smoothstep(.0015,.005,luminance)*(smoothstep(threshold-.1,threshold+.1,luminance*11)*(1-smoothstep(.05,.07,luminance))+smoothstep(.05,.07,luminance)),smoothstep(.004,.014,luminance)*.38);
        context.fillStyle='rgb('+light.map(v=>Math.round(Math.min(1,v+.003)*255)).join(',')+')';
        if(layout.reveal<1&&visible>0){context.globalAlpha=(1-layout.reveal)*visible*(1-fraction);context.fillText(glyphs[index],(col+.5)*cw,(row+.5)*ch);if(fraction>0){context.globalAlpha=(1-layout.reveal)*visible*fraction;context.fillText(glyphs[Math.min(63,index+1)],(col+.5)*cw,(row+.5)*ch);}}
        if(layout.reveal>0&&mask>.001){context.globalAlpha=layout.reveal;context.fillText(lines[row][col],(col+.5)*cw,(row+.5)*ch);}
      }
      context.globalAlpha=1;lightContext.clearRect(0,0,lightCanvas.width,lightCanvas.height);lightContext.drawImage(canvas,0,0);
      context.save();context.setTransform(1,0,0,1,0,0);context.globalCompositeOperation='screen';context.globalAlpha=.18*settings.glow;
      context.filter='blur('+(4*dpr)+'px)';context.drawImage(lightCanvas,0,0);context.globalAlpha=.12*settings.glow;
      context.filter='blur('+(20*dpr)+'px)';context.drawImage(lightCanvas,0,0);context.restore();
      context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle='#010205';for(const [col,row] of emptyCells)context.fillRect(col*cw,row*ch,cw,ch);
    }};
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
    constrainTarget();
    const size=settings.size*(width<650?.9:1);
    columns=Math.max(40,Math.floor(width/size));rows=Math.max(30,Math.floor(height/(size*1.75)));
    const gridLimit=renderer.type==='webgl2'?550000:28000;
    if(columns*rows>gridLimit){const ratio=Math.sqrt(gridLimit/(columns*rows));columns=Math.floor(columns*ratio);rows=Math.floor(rows*ratio);}
    renderer.resize();
    drawStill();
  }
  function drawStill(){if(renderer&&!contextLost)renderer.render();}
  function animate(now){
    requestAnimationFrame(animate);
    if(document.hidden||contextLost){lastFrame=now;return;}
    const delta=Math.min((now-(lastFrame||now))/1000,.1);lastFrame=now;
    if(!paused)time+=delta;
    const smoothing=1-Math.exp(-delta*10);
    let moving=false;
    const inverseDifference=1/target.zoom-1/view.zoom;
    if(Math.abs(inverseDifference)>.000005){view.zoom=1/(1/view.zoom+inverseDifference*smoothing);moving=true;}else{moving ||= view.zoom!==target.zoom;view.zoom=target.zoom;}
    for(const key of ['x','y']){const difference=target[key]-view[key];if(Math.abs(difference)>.000005){view[key]+=difference*smoothing;moving=true;}else{moving ||= view[key]!==target[key];view[key]=target[key];}}
    if((!paused||moving)&&(renderer.type==='webgl2'||moving||now-lastPaint>42)){renderer.render();lastPaint=now;}
  }
  function togglePlay(){paused=!paused;}
  function constrainTarget(){
    const limitY=.5*(1-1/target.zoom),limitX=limitY*width/Math.max(1,height);
    target.x=Math.max(-limitX,Math.min(limitX,target.x));target.y=Math.max(-limitY,Math.min(limitY,target.y));
    canvas.classList.toggle('zoomed',target.zoom>1.01);
  }
  function zoom(factor,clientX=lastPointer.x??width/2,clientY=lastPointer.y??height/2){
    const beforeX=view.x+(clientX-width/2)/height/view.zoom,beforeY=view.y+(.5-clientY/height)/view.zoom;
    target.zoom=Math.min(8,Math.max(1,target.zoom*factor));
    target.x=beforeX-(clientX-width/2)/height/target.zoom;target.y=beforeY-(.5-clientY/height)/target.zoom;
    constrainTarget();
  }
  function resetView(){Object.assign(target,{zoom:1,x:0,y:0});constrainTarget();}
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
      link.href=url;link.download=`annulus-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
      link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    },'image/png');
  }
  function bindCanvasEvents(){
    const pointers=new Map();let pinchDistance=0,pinchZoom=1,pinchWorldX=0,pinchWorldY=0;
    canvas.addEventListener('pointerdown',event=>{pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);canvas.classList.toggle('dragging',target.zoom>1.01);if(pointers.size===2){const p=[...pointers.values()],midX=(p[0].x+p[1].x)/2,midY=(p[0].y+p[1].y)/2;pinchDistance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);pinchZoom=view.zoom;pinchWorldX=view.x+(midX-width/2)/height/view.zoom;pinchWorldY=view.y+(.5-midY/height)/view.zoom;}});
    canvas.addEventListener('pointermove',event=>{
      lastPointer.x=event.clientX;lastPointer.y=event.clientY;
      const previous=pointers.get(event.pointerId);if(!previous)return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===2){
        const p=[...pointers.values()],distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
        const midX=(p[0].x+p[1].x)/2,midY=(p[0].y+p[1].y)/2;
        if(pinchDistance>0){target.zoom=Math.min(8,Math.max(1,pinchZoom*distance/pinchDistance));target.x=pinchWorldX-(midX-width/2)/height/target.zoom;target.y=pinchWorldY-(.5-midY/height)/target.zoom;constrainTarget();}
      }else if(target.zoom>1.01){
        target.x-=(event.clientX-previous.x)/height/target.zoom;target.y+=(event.clientY-previous.y)/height/target.zoom;constrainTarget();
      }
    });
    const release=event=>{pointers.delete(event.pointerId);pinchDistance=0;canvas.classList.remove('dragging');};
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
    canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-event.deltaY*.001),event.clientX,event.clientY);},{passive:false});
    canvas.addEventListener('dblclick',event=>{zoom(target.zoom<7.5?2:1/target.zoom,event.clientX,event.clientY);});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;});
    canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;replaceCanvas();initializeRenderer();});
  }
  addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{lastFrame=0;});
  motionPreference.addEventListener('change',event=>{if(event.matches){paused=true;drawStill();}});
  addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const key=event.key.toLowerCase();
    if(event.code==='Space'){event.preventDefault();togglePlay();}
    else if(key==='r')resetView();else if(key==='f')toggleFullscreen();else if(key==='s')capture();
    else if(key==='+'||key==='=')zoom(1.12);else if(key==='-'||key==='_')zoom(1/1.12);
    else if(key.startsWith('arrow')&&target.zoom>1.01){event.preventDefault();if(key==='arrowleft')target.x-=.04/target.zoom;if(key==='arrowright')target.x+=.04/target.zoom;if(key==='arrowup')target.y+=.04/target.zoom;if(key==='arrowdown')target.y-=.04/target.zoom;constrainTarget();}
  });

  try{
    initializeRenderer();requestAnimationFrame(animate);
  }catch(error){
    console.error('Unable to start the eclipse:',error);
  }
})();
