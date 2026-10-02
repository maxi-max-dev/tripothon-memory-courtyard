import {cleanDiagnostics,viewerError} from './viewer-diagnostics.js';
const VERT=`attribute vec2 corner;attribute vec3 center;attribute vec3 scale;attribute vec4 rotation;attribute vec4 color;uniform mat4 view;uniform mat4 projection;uniform vec2 viewport;varying mediump vec2 local;varying mediump vec4 rgba;
void main(){vec4 p=view*vec4(center,1.);float d=-p.z;if(d<.02){gl_Position=vec4(2.,2.,2.,1.);local=vec2(10.);rgba=vec4(0.);return;}vec4 q=rotation;float x=q.x,y=q.y,z=q.z,w=q.w;mat3 R=mat3(1.-2.*(y*y+z*z),2.*(x*y+z*w),2.*(x*z-y*w),2.*(x*y-z*w),1.-2.*(x*x+z*z),2.*(y*z+x*w),2.*(x*z+y*w),2.*(y*z-x*w),1.-2.*(x*x+y*y));mat3 A=mat3(view)*R*mat3(scale.x,0.,0.,0.,scale.y,0.,0.,0.,scale.z);float f=projection[1][1]*viewport.y*.5;vec3 jx=vec3(f/d,0.,f*p.x/(d*d)),jy=vec3(0.,f/d,f*p.y/(d*d));vec3 ax=vec3(dot(jx,A[0]),dot(jx,A[1]),dot(jx,A[2])),ay=vec3(dot(jy,A[0]),dot(jy,A[1]),dot(jy,A[2]));float a=dot(ax,ax)+.3,b=dot(ax,ay),c=dot(ay,ay)+.3,mid=.5*(a+c),radius=length(vec2(.5*(a-c),b));float l1=max(.1,mid+radius),l2=max(.1,mid-radius);vec2 e1=abs(b)>.00001?normalize(vec2(b,l1-a)):(a>=c?vec2(1.,0.):vec2(0.,1.));vec2 e2=vec2(-e1.y,e1.x);local=corner*3.;vec2 delta=(local.x*e1*min(sqrt(l1),512.)+local.y*e2*min(sqrt(l2),512.))*2./viewport;vec4 clip=projection*p;gl_Position=clip+vec4(delta*clip.w,0.,0.);rgba=color;}`;
const FRAG=`precision mediump float;varying mediump vec2 local;varying mediump vec4 rgba;void main(){float v=dot(local,local);if(v>9.)discard;float a=rgba.a*exp(-.5*v);if(a<.003)discard;gl_FragColor=vec4(rgba.rgb,min(.99,a));}`;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d);};
function look(eye,yaw,pitch){const z=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
function projection(aspect){const f=1/Math.tan(.85/2),n=.025,z=3000;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(z+n)/(n-z),-1,0,0,2*z*n/(n-z),0]);}
export function parseViewerPayload(bytes,diagnostic={}){
  try{
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<12||bytes.byteLength>64*1024*1024)throw Error();
    const head=new DataView(bytes);if(head.getUint32(0,true)!==0x31505354)throw Error();
    const len=head.getUint32(4,true),offset=8+len+(4-len%4)%4;
    if(!len||len>10000||offset>=bytes.byteLength||(bytes.byteLength-offset)%4)throw Error();
    const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,8,len)));
    if(!Number.isSafeInteger(meta.renderedPoints)||meta.renderedPoints<1||meta.renderedPoints>1000000||!Number.isSafeInteger(meta.sourcePoints)||meta.sourcePoints<meta.renderedPoints)throw Error();
    const records=new Float32Array(bytes,offset);
    if(records.length!==meta.renderedPoints*14||!records.every(Number.isFinite))throw Error();
    return {meta,records};
  }catch{throw viewerError('ASSET_INVALID',diagnostic);}
}
export async function loadSpzViewer(canvas,url,{onStatus=()=>{},onFailure=()=>{},onDiagnostic=()=>{},diagnostic={},signal,startPose}={}){
  let d=cleanDiagnostics({...diagnostic,status:'loading'}),gl=null,inst=null,worker=null,program=null,vs=null,fs=null,buffer=null,corners=null;
  let destroyed=false,active=false,frame=0,pending=null,initFailure=null,sorting=false,dirty=true,last=0,lastSort=0,yaw=0,pitch=-.14,drag=null;
  const keys=new Set(),handlers=[],internal=new AbortController();
  const emit=patch=>{d=cleanDiagnostics({...d,...patch});onDiagnostic(d);};
  const listen=(target,event,fn,options)=>{target.addEventListener(event,fn,options);handlers.push(()=>target.removeEventListener(event,fn,options));};
  const cancelWait=error=>{if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}};
  function destroy(){
    if(destroyed)return;destroyed=true;active=false;keys.clear();cancelAnimationFrame(frame);
    cancelWait(viewerError('CANCELED',d));for(const remove of handlers)remove();worker?.terminate();
    if(gl){if(buffer)gl.deleteBuffer(buffer);if(corners)gl.deleteBuffer(corners);if(program)gl.deleteProgram(program);if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  }
  function fail(code){
    if(destroyed)return;const e=viewerError(code,d);emit(e.diagnostic);
    if(!active){initFailure=e;internal.abort(e);cancelWait(e);}else{destroy();onFailure(e.message,e.diagnostic);}
  }
  function checkGL(fallback='GPU_DRAW_FAILED'){
    if(gl.isContextLost())throw viewerError('CONTEXT_LOST',d);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw viewerError(error===gl.OUT_OF_MEMORY?'GPU_MEMORY':fallback,d);
  }
  const abort=()=>internal.abort(signal.reason||viewerError('CANCELED',d));
  if(signal){if(signal.aborted)abort();else listen(signal,'abort',abort,{once:true});}
  listen(internal.signal,'abort',()=>{cancelWait(internal.signal.reason);if(active)destroy();},{once:true});
  const waitWorker=(message,accept,transfer=[])=>new Promise((resolve,reject)=>{
    pending={resolve,reject,accept,timer:setTimeout(()=>{emit({worker:'failed'});fail('WORKER_TIMEOUT');},10000)};
    try{worker.postMessage(message,transfer);}catch{cancelWait(viewerError('WORKER_START_FAILED',d));}
  });
  try{
    internal.signal.throwIfAborted();emit({stage:'capabilities',workerAPI:typeof Worker==='function'});onStatus('正在检查当前环境的 3D 支持…');
    try{gl=canvas.getContext('webgl',{antialias:false,alpha:false,depth:false,stencil:false,preserveDrawingBuffer:true});}catch{gl=null;}
    emit({webgl1:!!gl});if(!gl)throw viewerError('WEBGL_UNAVAILABLE',d);
    listen(canvas,'webglcontextlost',e=>{e.preventDefault();fail('CONTEXT_LOST');});
    inst=gl.getExtension('ANGLE_instanced_arrays');emit({instancing:!!inst});if(!inst)throw viewerError('INSTANCING_UNAVAILABLE',d);
    if(!d.workerAPI)throw viewerError('WORKER_UNAVAILABLE',d);
    emit({stage:'worker-start'});onStatus('正在检查世界图层排序线程…');
    try{worker=new Worker(new URL('./splat-sort-worker.js?protocol=2',import.meta.url));}catch{emit({worker:'failed'});throw viewerError('WORKER_START_FAILED',d);}
    worker.onerror=e=>{e.preventDefault();emit({worker:'failed'});fail(d.stage==='worker-start'?'WORKER_START_FAILED':'WORKER_FAILED');};
    worker.onmessageerror=()=>{emit({worker:'failed'});fail('WORKER_FAILED');};
    let recordByteLength=0;
    worker.onmessage=({data})=>{
      if(destroyed)return;
      if(pending&&pending.accept(data)){const p=pending;pending=null;clearTimeout(p.timer);p.resolve(data);return;}
      if(active&&data?.sorted){
        if(!(data.sorted instanceof ArrayBuffer)||data.sorted.byteLength!==recordByteLength){fail('WORKER_FAILED');return;}
        try{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data.sorted),gl.DYNAMIC_DRAW);checkGL();sorting=false;}catch(e){fail(e.code||'GPU_DRAW_FAILED');}
      }
    };
    await waitWorker({probe:true},data=>data?.ready===2);emit({worker:'ready'});
    internal.signal.throwIfAborted();emit({stage:'download'});onStatus('正在下载已保存的 3D 文件…');
    let response,bytes;
    try{response=await fetch(url,{signal:internal.signal});}catch{throw initFailure|| (internal.signal.aborted?internal.signal.reason:viewerError('ASSET_NETWORK',d));}
    emit({assetHTTP:response.status});if(!response.ok)throw viewerError('ASSET_HTTP',d);
    try{bytes=await response.arrayBuffer();}catch{throw initFailure||(internal.signal.aborted?internal.signal.reason:viewerError('ASSET_NETWORK',d));}
    emit({bytesLoaded:bytes.byteLength,stage:'decode'});onStatus('世界文件已收到，正在校验数据…');
    const {meta,records}=parseViewerPayload(bytes,d);recordByteLength=records.byteLength;
    internal.signal.throwIfAborted();emit({stage:'shaders'});onStatus('正在检查 3D 绘图程序…');
    const compile=(type,source,code)=>{const shader=gl.createShader(type);if(!shader)throw viewerError('GPU_MEMORY',d);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);emit({shader:'failed'});throw viewerError(code,d);}return shader;};
    vs=compile(gl.VERTEX_SHADER,VERT,'VERTEX_SHADER_FAILED');fs=compile(gl.FRAGMENT_SHADER,FRAG,'FRAGMENT_SHADER_FAILED');program=gl.createProgram();
    if(!program)throw viewerError('GPU_MEMORY',d);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){emit({shader:'failed'});throw viewerError('PROGRAM_LINK_FAILED',d);}gl.useProgram(program);emit({shader:'ready',stage:'buffers'});
    for(let i=0;i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);i++){gl.disableVertexAttribArray(i);inst.vertexAttribDivisorANGLE(i,0);}
    corners=gl.createBuffer();buffer=gl.createBuffer();if(!corners||!buffer)throw viewerError('GPU_MEMORY',d);
    gl.bindBuffer(gl.ARRAY_BUFFER,corners);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(program,'corner');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,records,gl.DYNAMIC_DRAW);
    for(const[name,size,offset]of[['center',3,0],['scale',3,12],['rotation',4,24],['color',4,40]]){const l=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,size,gl.FLOAT,false,56,offset);inst.vertexAttribDivisorANGLE(l,1);}
    const vloc=gl.getUniformLocation(program,'view'),ploc=gl.getUniformLocation(program,'projection'),sizeLoc=gl.getUniformLocation(program,'viewport');gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(.15,.20,.17,1);checkGL();
    // Quantile framing ignores isolated splats. No collision or historical-accuracy claim.
    const centers=[[],[],[]];for(let i=0;i<records.length;i+=14*13)for(let a=0;a<3;a++)centers[a].push(records[i+a]);for(const c of centers)c.sort((a,b)=>a-b);
    const lo=centers.map(c=>c[Math.floor(c.length*.2)]),hi=centers.map(c=>c[Math.floor(c.length*.8)]),target=lo.map((x,i)=>(x+hi[i])/2),radius=Math.max(.3,Math.hypot(...hi.map((x,i)=>x-lo[i]))/2);let pos=[];
    const validPose=startPose&&Array.isArray(startPose.position)&&startPose.position.length===3&&startPose.position.every(Number.isFinite)&&Number.isFinite(startPose.yaw)&&Number.isFinite(startPose.pitch);
    const reset=()=>{pos=validPose?[...startPose.position]:[target[0],target[1]+radius*.55,target[2]+radius*2.8];yaw=validPose?startPose.yaw:0;pitch=validPose?startPose.pitch:-.19;dirty=true;};reset();
    emit({stage:'first-sort'});onStatus('正在核对首帧的世界图层…');
    const workerRecords=records.buffer.slice(records.byteOffset,records.byteOffset+records.byteLength);worker.postMessage({records:workerRecords},[workerRecords]);
    const first=await waitWorker({view:Array.from(look(pos,yaw,pitch))},data=>data?.sorted instanceof ArrayBuffer);
    if(first.sorted.byteLength!==recordByteLength)throw viewerError('WORKER_FAILED',d);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(first.sorted),gl.DYNAMIC_DRAW);checkGL();
    function drawOnce(){
      const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5),w=rect.width?Math.round(rect.width*ratio):Math.max(1,canvas.width),h=rect.height?Math.round(rect.height*ratio):Math.max(1,canvas.height);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true;}
      gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniformMatrix4fv(vloc,false,look(pos,yaw,pitch));gl.uniformMatrix4fv(ploc,false,projection(w/h));gl.uniform2f(sizeLoc,w,h);inst.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP,0,4,meta.renderedPoints);checkGL();
    }
    emit({stage:'first-frame'});onStatus('正在确认首帧绘制…');internal.signal.throwIfAborted();drawOnce();
    emit({firstFrame:'ready',stage:'rendering',status:'ready'});active=true;
    function draw(t){
      if(destroyed)return;const dt=Math.min((t-last)/1000,.05);last=t;
      const forward=(keys.has('forward')?1:0)-(keys.has('back')?1:0),side=(keys.has('right')?1:0)-(keys.has('left')?1:0);
      if(forward||side){const speed=Math.min(2,Math.max(.3,radius*.35))*dt;pos[0]+=(Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed;pos[2]+=(-Math.cos(yaw)*forward+Math.sin(yaw)*side)*speed;dirty=true;}
      try{
        if(dirty&&!sorting&&t-lastSort>120){sorting=true;dirty=false;lastSort=t;worker.postMessage({view:Array.from(look(pos,yaw,pitch))});}
        drawOnce();
      }catch(e){fail(e.code||'GPU_DRAW_FAILED');return;}
      frame=requestAnimationFrame(draw);
    }
    const down=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});},move=e=>{if(drag){yaw+=(e.clientX-drag[0])*.004;pitch=Math.max(-1.4,Math.min(1.4,pitch-(e.clientY-drag[1])*.004));drag=[e.clientX,e.clientY];dirty=true;}},up=()=>drag=null;
    const mapping={w:'forward',s:'back',a:'left',d:'right',ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right'},keyDown=e=>{if(document.activeElement!==canvas)return;const k=mapping[e.key];if(k){e.preventDefault();keys.add(k);}},keyUp=e=>keys.delete(mapping[e.key]),clear=()=>keys.clear(),wheel=e=>{e.preventDefault();const amount=Math.sign(e.deltaY)*radius*.08;pos[0]+=Math.sin(yaw)*amount;pos[1]+=Math.sin(pitch)*amount;pos[2]-=Math.cos(yaw)*amount;dirty=true;};
    for(const [name,fn]of[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]])listen(canvas,name,fn);
    listen(canvas,'wheel',wheel,{passive:false});listen(window,'keydown',keyDown);listen(window,'keyup',keyUp);listen(window,'blur',clear);frame=requestAnimationFrame(draw);
    onStatus(`已验证首帧 · ${meta.renderedPoints.toLocaleString()} 个高斯 · 真实生成世界`);
    return {meta,reset,load(){},setExploring(value){keys.clear();if(value)canvas.focus({preventScroll:true});},move(key,value){if(value)keys.add(key);else keys.delete(key);},destroy};
  }catch(error){
    const e=initFailure|| (error?.code&&error?.diagnostic?error:viewerError(internal.signal.aborted?'CANCELED':'UNKNOWN',d));
    emit(e.diagnostic);destroy();throw e;
  }
}
