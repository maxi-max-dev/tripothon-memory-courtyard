import { gunzipSync, zstdDecompressSync } from 'node:zlib';
// Interoperability implementation of Niantic's MIT SPZ format, documented at
// https://github.com/nianticlabs/spz. See public/samples/NIANTIC-LICENSE.txt.
// Deliberately bounded: no third-party runtime or unbounded archive expansion.
const MAX_PACKED=64*1024*1024,MAX_RAW=128*1024*1024,MAX_POINTS=1_000_000;
function check(ok,message){if(!ok)throw Object.assign(new Error(message),{status:422,code:'INVALID_SPZ'});}
function half(v){const sign=v&32768?-1:1,e=(v>>10)&31,m=v&1023;return sign*(e===0?2**-14*m/1024:e===31?NaN:2**(e-15)*(1+m/1024));}
export function decodeSpz(input,{maxPoints=100000,semantics=null,marble=false}={}){
  const packed=Buffer.from(input);check(packed.length>=16&&packed.length<=MAX_PACKED,'SPZ 文件为空或超过 64 MB。');
  let bytes=packed;
  if(bytes[0]===31&&bytes[1]===139){try{bytes=gunzipSync(bytes,{maxOutputLength:MAX_RAW});}catch{check(false,'SPZ gzip 数据损坏或展开后过大。');}}
  check(bytes.length>=16&&bytes.readUInt32LE(0)===0x5053474e,'不是可识别的 SPZ 文件。');
  const version=bytes.readUInt32LE(4),n=bytes.readUInt32LE(8),degree=bytes[12],fraction=bytes[13],flags=bytes[14];
  check([1,2,3,4].includes(version),'此 SPZ 版本尚不支持。');check(n>0&&n<=MAX_POINTS&&degree<=4&&fraction<=24,'SPZ 点数或头部字段超出支持范围。');
  // Unknown extensions can alter coordinates/packing; refuse rather than silently misrender.
  check(!(flags&2),'此 SPZ 带有扩展坐标/打包信息，轻量查看器暂不支持，请使用 Marble。');
  const sizes=[n*(version===1?6:9),n,n*3,n*3,n*(version>=3?4:3),n*[0,9,24,45,72][degree]];
  const streams=[];
  if(version===4){check(bytes===packed,'SPZ v4 应使用独立 Zstd 属性流。');check(bytes.length>=32,'SPZ v4 头部不完整。');
    const count=bytes[15],toc=bytes.readUInt32LE(16),expected=sizes.filter(x=>x>0);check(count===expected.length&&toc===32&&toc+count*16<=bytes.length,'SPZ v4 属性表无效。');
    let offset=toc+count*16,total=0;
    for(let i=0;i<count;i++){const cs=Number(bytes.readBigUInt64LE(toc+i*16)),us=Number(bytes.readBigUInt64LE(toc+i*16+8));total+=us;check(Number.isSafeInteger(cs)&&cs>0&&us===expected[i]&&offset+cs<=bytes.length&&total<=MAX_RAW,'SPZ 属性流大小不匹配。');
      let stream;try{stream=zstdDecompressSync(bytes.subarray(offset,offset+cs),{maxOutputLength:us});}catch{check(false,'SPZ Zstd 属性流损坏。');}check(stream.length===us,'SPZ 属性流长度无效。');streams.push(stream);offset+=cs;
    }check(offset===bytes.length,'SPZ v4 有未识别的尾部数据。');
  }else{let offset=16;for(const size of sizes){check(offset+size<=bytes.length,'SPZ 属性数据被截断。');streams.push(bytes.subarray(offset,offset+size));offset+=size;}check(offset===bytes.length,'SPZ 有未识别的尾部数据。');}
  const [pos,alpha,colors,scales,rot]=streams;
  let metric=1,ground=0;if(semantics){metric=semantics.metric_scale_factor;ground=semantics.ground_plane_offset;check(Number.isFinite(metric)&&metric>0&&metric<10000&&Number.isFinite(ground),'世界尺度信息无效。');}
  const take=Math.min(n,Math.max(1,Math.min(200000,Math.floor(maxPoints)))),records=new Float32Array(take*14);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<take;i++){
    const index=Math.floor(i*n/take),out=i*14;
    for(let axis=0;axis<3;axis++){
      const p=index*(version===1?6:9)+axis*(version===1?2:3);
      let value=version===1?half(pos.readUInt16LE(p)):pos.readIntLE(p,3)/2**fraction;
      value=value*metric-(axis===1?ground:0);if(marble&&axis>0)value=-value;
      check(Number.isFinite(value),'SPZ 包含非有限坐标。');records[out+axis]=value;min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
      records[out+3+axis]=Math.exp(scales[index*3+axis]/16-10)*metric;
    }
    const q=[0,0,0,0];
    if(version<3){for(let j=0;j<3;j++)q[j]=rot[index*3+j]/127.5-1;q[3]=Math.sqrt(Math.max(0,1-q[0]**2-q[1]**2-q[2]**2));}
    else{let bits=rot.readUInt32LE(index*4),largest=bits>>>30,sum=0;for(let j=3;j>=0;j--)if(j!==largest){q[j]=(bits&511)/511*Math.SQRT1_2*((bits>>>9)&1?-1:1);sum+=q[j]**2;bits>>>=10;}q[largest]=Math.sqrt(Math.max(0,1-sum));}
    // R_x(pi) * q: quaternion xyzw = [w,-z,y,-x].
    const rotation=marble?[q[3],-q[2],q[1],-q[0]]:q,length=Math.hypot(...rotation)||1;for(let j=0;j<4;j++)records[out+6+j]=rotation[j]/length;
    for(let j=0;j<3;j++)records[out+10+j]=Math.max(0,Math.min(1,.5+0.28209479177387814*(colors[index*3+j]/255-.5)/.15));
    records[out+13]=alpha[index]/255;
  }
  // Float records carry centers, linear scales, normalized xyzw quaternion and RGBA.
  return {records,meta:{version,sourcePoints:n,renderedPoints:take,shDegree:degree,bounds:{min,max},coordinateFrame:marble?'marble_raw_opencv → RUB':'RUB',quality:'轻量 DC 颜色预览，省略高阶球谐；无碰撞体。'}};
}

export function encodeViewerPayload(decoded){const metadata=Buffer.from(JSON.stringify(decoded.meta)),header=Buffer.alloc(8);header.write('TSP1');header.writeUInt32LE(metadata.length,4);const pad=Buffer.alloc((4-metadata.length%4)%4);return Buffer.concat([header,metadata,pad,Buffer.from(decoded.records.buffer,decoded.records.byteOffset,decoded.records.byteLength)]);}
