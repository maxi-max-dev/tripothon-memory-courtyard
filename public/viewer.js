// Original, dependency-free WebGL courtyard. This is a labelled procedural sample,
// not a renderer or reconstruction of World Labs assets.
// Matching varying precision avoids strict WebGL 1 linker differences.
const vs=`attribute vec3 aPosition;attribute vec3 aColor;attribute vec3 aNormal;uniform mat4 uProjection;uniform mat4 uView;varying mediump vec3 vColor;varying mediump float vDepth;void main(){vec4 p=uView*vec4(aPosition,1.0);gl_Position=uProjection*p;float light=.64+.36*max(0.,dot(normalize(aNormal),normalize(vec3(-.5,1.,.65))));vColor=aColor*light;vDepth=-p.z;}`;
const fs=`precision mediump float;varying mediump vec3 vColor;varying mediump float vDepth;void main(){float fog=clamp((vDepth-10.)/25.,0.,.65);gl_FragColor=vec4(mix(vColor,vec3(.78,.82,.70),fog),1.);}`;
const viewerError=code=>Object.assign(new Error(code),{code});
export function viewerFailure(error){
  const reasons={WEBGL_UNAVAILABLE:'当前浏览器未提供 WebGL，无法进入 3D。可换支持 WebGL 的浏览器或设备查看。',SHADER_COMPILE_FAILED:'3D 着色器编译失败，当前浏览器无法显示场景。',PROGRAM_LINK_FAILED:'3D 着色器链接失败，当前图形环境不兼容。',CONTEXT_LOST:'图形上下文已丢失，请尝试重新加载 3D。',RENDER_FAILED:'3D 初始化或绘制失败，请尝试重新加载。'};
  const code=error?.code in reasons?error.code:'RENDER_FAILED';return {code,message:reasons[code]};
}
const color = hex => hex.match(/\w\w/g).map(x=>parseInt(x,16)/255);
const subtract=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d);};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function perspective(aspect){const f=1/Math.tan(.88/2),n=.06,z=100;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(z+n)/(n-z),-1,0,0,2*z*n/(n-z),0]);}
function lookAt(eye,target){const z=normalize(subtract(eye,target)),x=normalize(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}

function geometry(spec={}){
  const vertices=[];let random=42;const rand=()=>{random=(random*1664525+1013904223)>>>0;return random/4294967296;};
  function tri(a,b,c,rgb,normal){const n=normal||normalize(cross(subtract(b,a),subtract(c,a)));for(const p of [a,b,c])vertices.push(...p,...rgb,...n);}
  function quad(a,b,c,d,rgb){tri(a,b,c,rgb);tri(a,c,d,rgb);}
  function box(x,y,z,w,h,d,hex){const c=color(hex),l=x-w/2,r=x+w/2,b=y,t=y+h,f=z+d/2,k=z-d/2;
    quad([l,b,f],[r,b,f],[r,t,f],[l,t,f],c);quad([r,b,k],[l,b,k],[l,t,k],[r,t,k],c);
    quad([l,b,k],[l,b,f],[l,t,f],[l,t,k],c);quad([r,b,f],[r,b,k],[r,t,k],[r,t,f],c);
    quad([l,t,f],[r,t,f],[r,t,k],[l,t,k],c);quad([l,b,k],[r,b,k],[r,b,f],[l,b,f],c);
  }
  function sphere(x,y,z,rx,ry,rz,hex,segments=12,rings=8){const c=color(hex),point=(i,j)=>{const a=i/rings*Math.PI,b=j/segments*Math.PI*2;return [x+rx*Math.sin(a)*Math.cos(b),y+ry*Math.cos(a),z+rz*Math.sin(a)*Math.sin(b)];};for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){const a=point(i,j),b=point(i+1,j),c1=point(i+1,j+1),d=point(i,j+1);quad(a,b,c1,d,c);}}
  function cylinder(a,b,r,hex,r2=r,segments=10){const axis=normalize(subtract(b,a)),u=normalize(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(axis,u),c=color(hex);const p=(center,rad,j)=>center.map((x,i)=>x+rad*(u[i]*Math.cos(j/segments*Math.PI*2)+v[i]*Math.sin(j/segments*Math.PI*2)));for(let j=0;j<segments;j++){quad(p(a,r,j),p(b,r2,j),p(b,r2,j+1),p(a,r,j+1),c);tri(b,p(b,r2,j+1),p(b,r2,j),c);}}
  // Muted brick paving and plaster courtyard walls.
  box(0,-.16,0,32,.15,32,'b7bca0');
  box(0,-.09,0,12.2,.08,10.2,'b9b8a0');
  for(let x=-5.7;x<6;x+=.65)for(let z=-4.7;z<5;z+=.7){const shades=['c7c5ae','cecab1','c4c3aa','d0cdb6'];box(x,0,z,.625,.028,.674,shades[Math.floor(rand()*shades.length)]);}
  box(0,0,-5.2,12.5,3.35,.35,'ece0bd');box(-6.15,0,0,.32,3.15,10.7,'e3d5af');box(6.15,0,0,.32,3.15,10.7,'e7dabc');
  for(let x=-6.25;x<=6.25;x+=.3){box(x,3.35,-5.2,.28,.16,.63,'718075');box(x,3.48,-5.26,.29,.09,.42,'809080');}
  for(let z=-5.1;z<5.25;z+=.3){box(-6.15,3.15,z,.64,.13,.28,'718075');box(6.15,3.15,z,.64,.13,.28,'718075');}
  box(0,0,-4.99,2.05,2.82,.2,'baa77f');box(0,0,-4.86,1.72,2.6,.17,'557c72');
  for(let x=-.72;x<.8;x+=.18)box(x,.12,-4.759,.035,2.37,.018,'4c7067');
  box(0,.04,-4.735,.035,2.53,.03,'3f655c');box(0,.86,-4.725,1.65,.12,.035,'50756c');box(0,2.02,-4.725,1.65,.11,.035,'50756c');
  sphere(-.14,1.28,-4.67,.045,.07,.035,'c3a15b');sphere(.14,1.28,-4.67,.045,.07,.035,'c3a15b');
  box(0,0,-4.5,2.5,.1,.72,'b7b9a3');box(0,.1,-4.7,2.1,.1,.45,'ccc6ac');
  for(const x of [-3.85,3.85]){box(x,1.4,-4.98,1.7,1.23,.13,'aa9776');box(x,1.49,-4.87,1.48,1.03,.12,'74897c');for(let i=-.6;i<=.65;i+=.3)box(x+i,1.5,-4.785,.05,1.01,.035,'beac86');box(x,1.99,-4.76,1.5,.055,.035,'beac86');box(x,1.36,-4.75,1.96,.09,.42,'c9b797');}
  for(const z of [-2.6,1.4]){box(-5.96,1.5,z,.17,1.12,1.35,'a59476');box(-5.85,1.58,z,.1,.94,1.18,'758c7e');for(let i=-.44;i<.5;i+=.3)box(-5.76,1.58,z+i,.05,.94,.045,'c4b28b');box(-5.75,2.02,z,.045,.05,1.18,'c4b28b');}
  // Original tree, planted into an octagonal bed.
  const [tx,,tz]=spec.tree||[-2.7,0,-1.3];
  cylinder([tx,.04,tz],[tx,.22,tz],1.05,'b0b09b',1.05,14);cylinder([tx,.23,tz],[tx,.24,tz],.9,'949b78',.9,14);
  cylinder([tx,.18,tz],[tx+.07,2.65,tz+.15],.18,'958467',.1,10);
  cylinder([tx,1.55,tz],[tx-1,3.3,tz-.2],.1,'918166',.04,8);cylinder([tx+.06,1.8,tz+.06],[tx+.92,3.3,tz+.3],.11,'918166',.04,8);
  const clusters=[[-.85,3.35,-.25,1.02],[.08,3.92,.08,1.27],[.94,3.52,.35,1.06],[-.55,3.45,1.06,.85],[.55,3.85,-.77,.95],[-.83,4.05,-.52,.8]];
  for(const [dx,y,dz,r]of clusters)sphere(tx+dx,y,tz+dz,r,r*.8,r,['829263','90a16c','9aab76'][Math.floor(rand()*3)],12,7);
  for(let i=0;i<80;i++){const a=rand()*Math.PI*2,r=rand()*1.5,y=3.1+rand()*1.2;const x=tx+Math.cos(a)*r,z=tz+Math.sin(a)*r;sphere(x,y,z,.035,.032,.03,'e1cc81',5,3);}
  for(let i=0;i<65;i++){const a=rand()*Math.PI*2,r=.8+rand()*2.2;box(tx+Math.cos(a)*r,.04,tz+Math.sin(a)*r,.055,.007,.03,'c6b772');}
  // Wooden table, benches and a ceramic teapot.
  const [mx,,mz]=spec.table||[1.6,0,-1.3];
  for(const dx of [-.65,.65])for(const dz of [-.48,.48])box(mx+dx,.02,mz+dz,.085,.82,.085,'937c55');
  box(mx,.77,mz,1.55,.12,1.24,'b69a69');for(let i=-.5;i<.6;i+=.23)box(mx,.894,mz+i,1.54,.008,.012,'a48b61');
  box(mx,.46,mz-.48,1.38,.065,.06,'a1885d');
  for(const dz of [-1.16,1.2]){box(mx,.44,mz+dz,1.35,.09,.38,'a48a60');for(const dx of[-.47,.47])box(mx+dx,.025,mz+dz,.08,.44,.25,'97805b');}
  sphere(mx-.2,1.015,mz,.12,.13,.12,'a59f7c');cylinder([mx-.2,1.125,mz],[mx-.2,1.155,mz],.064,'bcb294');cylinder([mx-.11,1.04,mz],[mx+.04,1.085,mz],.033,'a59f7c',.025);
  for(const dx of [.27,.55])cylinder([mx+dx,.9,mz+.2],[mx+dx,.975,mz+.2],.047,'ddd1ac',.064);
  // Pots and flowering shrubs.
  for(const [px,pz]of [[-5.3,-4.3],[5.25,-4.1],[5.1,3.7],[4.75,-3.7]]){const r=.24+rand()*.1;cylinder([px,.02,pz],[px,.52,pz],r*.65,'ba9272',r);cylinder([px,.49,pz],[px,.57,pz],r*1.08,'c29d7b');for(let i=0;i<5;i++){const a=i/5*Math.PI*2;sphere(px+Math.cos(a)*.17,.64+rand()*.2,pz+Math.sin(a)*.17,.22,.32,.2,'84956d',7,5);}}
  // Long afternoon shadows, approximated as low contrast flat shapes.
  sphere(tx+1.7,.035,tz+1.4,2.1,.007,1.55,'b4b69d',18,3);
  // Recessed room behind the rear door and a few birds above the wall.
  for(let i=0;i<5;i++){const x=-3.5+i*1.1,y=6.4+Math.sin(i)*.3,z=-13;tri([x-.14,y,z],[x,y-.035,z],[x+.11,y+.035,z],color('7a8d78'));}
  return new Float32Array(vertices);
}

export function createCourtyard(canvas,onFailure=()=>{}){
  let gl;try{gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});}catch{throw viewerError('WEBGL_UNAVAILABLE');}
  if(!gl)throw viewerError('WEBGL_UNAVAILABLE');
  const shaders=[];let program,buffer;
  const release=()=>{if(buffer)gl.deleteBuffer(buffer);for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);};
  function shader(type,source){const s=gl.createShader(type);if(!s)throw viewerError(gl.isContextLost()?'CONTEXT_LOST':'SHADER_COMPILE_FAILED');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw viewerError(gl.isContextLost()?'CONTEXT_LOST':'SHADER_COMPILE_FAILED');return s;}
  try{program=gl.createProgram();const vert=shader(gl.VERTEX_SHADER,vs),frag=shader(gl.FRAGMENT_SHADER,fs);if(!program)throw viewerError('PROGRAM_LINK_FAILED');gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw viewerError(gl.isContextLost()?'CONTEXT_LOST':'PROGRAM_LINK_FAILED');gl.useProgram(program);buffer=gl.createBuffer();if(!buffer)throw viewerError('RENDER_FAILED');gl.bindBuffer(gl.ARRAY_BUFFER,buffer);}catch(error){release();throw error;}
  let count=0,spec={},exploring=false,position=[7.5,5.8,10.7],yaw=-.61,pitch=-.36,destroyed=false,drag=null,last=0;
  const keys=new Set();
  for(const [name,offset]of [['aPosition',0],['aColor',12],['aNormal',24]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,offset);}
  const projection=gl.getUniformLocation(program,'uProjection'),view=gl.getUniformLocation(program,'uView');gl.enable(gl.DEPTH_TEST);gl.clearColor(.76,.815,.73,1);
  const check=()=>{if(gl.isContextLost())throw viewerError('CONTEXT_LOST');if(gl.getError()!==gl.NO_ERROR)throw viewerError('RENDER_FAILED');};
  const load=(world)=>{spec=world?.geometry||{};const data=geometry(spec);count=data.length/9;gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);check();};try{load();}catch(error){release();throw error;}
  const reset=()=>{if(exploring){position=spec.start?[...spec.start]:[0,1.6,3.7];yaw=0;pitch=-.025;}else{position=[7.5,5.8,10.7];yaw=-.61;pitch=-.36;}};
  function move(dx,dz){const nx=position[0]+dx,nz=position[2]+dz,[tx,,tz]=spec.tree||[-2.7,0,-1.3],[mx,,mz]=spec.table||[1.6,0,-1.3];if(Math.abs(nx)>5.6||Math.abs(nz)>4.55||Math.hypot(nx-tx,nz-tz)<1.17||(Math.abs(nx-mx)<1&&Math.abs(nz-mz)<1.55))return;position[0]=nx;position[2]=nz;}
  let frameId=0,checkedAt=-Infinity;
  function draw(time){if(destroyed)return;try{const dt=Math.min((time-last)/1000,.05);last=time;
    const rect=canvas.getBoundingClientRect();if(rect.width&&rect.height){const dpr=Math.min(devicePixelRatio||1,1.8),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
      if(exploring){let f=(keys.has('forward')?1:0)-(keys.has('back')?1:0),s=(keys.has('right')?1:0)-(keys.has('left')?1:0);const d=Math.hypot(f,s)||1;f/=d;s/=d;move((Math.sin(yaw)*f+Math.cos(yaw)*s)*dt*2,( -Math.cos(yaw)*f+Math.sin(yaw)*s)*dt*2);}
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(projection,false,perspective(w/h));const target=[position[0]+Math.sin(yaw)*Math.cos(pitch),position[1]+Math.sin(pitch),position[2]-Math.cos(yaw)*Math.cos(pitch)];gl.uniformMatrix4fv(view,false,lookAt(position,target));gl.drawArrays(gl.TRIANGLES,0,count);
      if(time-checkedAt>=1000){check();checkedAt=time;}
    }frameId=requestAnimationFrame(draw);
  }catch(error){destroyed=true;keys.clear();onFailure(error?.code?error:viewerError('RENDER_FAILED'));}}
  frameId=requestAnimationFrame(draw);
  const down=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});};
  const pointer=e=>{if(!drag)return;yaw+=(e.clientX-drag.x)*.004;pitch=Math.max(-1.1,Math.min(.9,pitch-(e.clientY-drag.y)*.004));drag={x:e.clientX,y:e.clientY};};
  const up=()=>{drag=null;};
  const mapping={w:'forward',ArrowUp:'forward',s:'back',ArrowDown:'back',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
  const keydown=e=>{if(!exploring||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||document.querySelector('dialog[open]'))return;const k=mapping[e.key]||mapping[e.key.toLowerCase()];if(k){e.preventDefault();keys.add(k);}};
  const keyup=e=>keys.delete(mapping[e.key]||mapping[e.key.toLowerCase()]);const clear=()=>keys.clear();
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',pointer);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  const lost=e=>{e.preventDefault();destroyed=true;keys.clear();cancelAnimationFrame(frameId);onFailure(viewerError('CONTEXT_LOST'));};canvas.addEventListener('webglcontextlost',lost);
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);
  return {load,reset,setExploring(value){exploring=value;keys.clear();reset();},move(direction,value){if(value)keys.add(direction);else keys.delete(direction);},destroy(){destroyed=true;keys.clear();cancelAnimationFrame(frameId);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',pointer);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('webglcontextlost',lost);release();}};
}
