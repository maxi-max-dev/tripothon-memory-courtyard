// Deliberately allowlisted: no URLs, user input, account IDs, GPU names or UA.
export const DIAGNOSTIC_VERSION=2;
const failures={
  WEBGL_UNAVAILABLE:['当前环境无法打开 3D','未能建立 WebGL 1 绘图上下文。页面无法区分浏览器设置、远程环境策略或图形驱动限制。','可以在允许 WebGL 的浏览器中打开，或直接查看完整全景。',false],
  INSTANCING_UNAVAILABLE:['当前环境缺少 3D 绘图能力','WebGL 1 可用，但本查看器需要的实例化扩展不可用。','换用提供 WebGL 1 和实例化扩展的浏览器环境，或查看完整全景。',false],
  WORKER_UNAVAILABLE:['当前环境无法启动 3D 计算','浏览器没有提供 Web Worker 接口，无法进行世界图层排序。','可以换用允许 Web Worker 的浏览器环境，或查看完整全景。',false],
  WORKER_START_FAILED:['3D 计算线程未能启动','Worker 脚本启动失败，可能与脚本加载或浏览器策略有关。','可检查网络和浏览器策略后重新检测，或查看完整全景。',false],
  WORKER_TIMEOUT:['3D 计算线程没有响应','Worker 未在规定时间内完成启动或排序。','可以稍后重新检测；受限远程环境也可能无法运行 Worker。',false],
  WORKER_FAILED:['3D 计算暂时中断','世界图层排序线程运行失败。','可重新打开；如持续失败，请查看全景或更换浏览器环境。',true],
  MANIFEST_HTTP:['世界信息暂时无法读取','生成清单返回了非成功的 HTTP 状态。','稍后重新读取；具体 HTTP 状态可在下方诊断中查看。',false],
  MANIFEST_INVALID:['世界信息格式不正确','获取的生成清单不是有效的 JSON 数据。','可重新读取，或先查看完整全景。',false],
  MANIFEST_NETWORK:['世界信息没有下载完成','生成清单请求失败，可能与网络或访问策略有关。','检查连接后重新读取，或直接查看全景。',false],
  ASSET_HTTP:['3D 文件暂时无法读取','世界文件返回了非成功的 HTTP 状态。','稍后重新下载；HTTP 状态保留在下方诊断中。',false],
  ASSET_NETWORK:['3D 文件没有下载完成','世界文件请求或传输失败，可能与网络、跨域或访问策略有关。','检查连接后重试，也可以打开完整全景。',false],
  ASSET_INVALID:['3D 文件格式不正确','世界文件缺失、被截断，或不是查看器支持的数据格式。','重新下载；若持续出现，请保留诊断代码并使用全景。',false],
  VERTEX_SHADER_FAILED:['当前环境无法编译 3D 绘图程序','顶点着色器编译失败。WebGL 接口存在并不保证绘图程序可运行。','可以更换浏览器或图形环境，完整全景不依赖这段绘图程序。',false],
  FRAGMENT_SHADER_FAILED:['当前环境无法编译 3D 绘图程序','片元着色器编译失败。','可以更换浏览器或图形环境，或查看完整全景。',false],
  PROGRAM_LINK_FAILED:['3D 绘图程序初始化失败','着色器已编译，但图形环境未能完成程序连接。','可以更换浏览器或图形环境，或查看完整全景。',false],
  GPU_MEMORY:['当前图形资源不足','图形环境报告内存分配失败。','可尝试轻量画质；若仍失败，请关闭其他 3D 页面或查看全景。',true],
  GPU_DRAW_FAILED:['当前环境未能绘制世界','绘图调用没有成功完成，因此没有标记为已载入。','可以尝试轻量画质，或在其他浏览器环境中打开。',true],
  CONTEXT_LOST:['3D 绘图连接已中断','浏览器报告 WebGL 上下文丢失；可能与资源压力或图形环境有关。','可以重新检测，或尝试轻量画质；全景仍可使用。',true],
  LOAD_TIMEOUT:['3D 打开超时','加载未在 45 秒内完成，已停止本次读取。','可以尝试较小的轻量文件，或直接查看全景。',true],
  CANCELED:['已停止打开世界','本次读取已取消。','可以再次打开。',false],
  UNKNOWN:['3D 暂时没能打开','查看器遇到尚未分类的错误，已保留最后一个成功阶段。','可查看下方诊断，或使用完整全景。',false]
};
const phases={'idle':'尚未开始','manifest':'读取世界信息','capabilities':'检查绘图能力','worker-start':'启动计算线程','download':'下载世界文件','decode':'校验世界数据','shaders':'编译绘图程序','buffers':'分配绘图资源','first-sort':'检查图层排序','first-frame':'检查首帧绘制','rendering':'正在绘制世界'};
const states=new Set(['unchecked','ready','failed']);
const flag=x=>typeof x==='boolean'?x:null;
const http=x=>Number.isInteger(x)&&x>=100&&x<=599?x:null;
export function cleanDiagnostics(d={}){
  return {version:DIAGNOSTIC_VERSION,stage:Object.hasOwn(phases,d.stage)?d.stage:'idle',status:['idle','loading','ready','failed'].includes(d.status)?d.status:'idle',code:Object.hasOwn(failures,d.code)?d.code:null,quality:d.quality==='clear'?'clear':'light',webgl1:flag(d.webgl1),instancing:flag(d.instancing),workerAPI:flag(d.workerAPI),manifestHTTP:http(d.manifestHTTP),assetHTTP:http(d.assetHTTP),bytesLoaded:Number.isSafeInteger(d.bytesLoaded)&&d.bytesLoaded>=0&&d.bytesLoaded<=64*1024*1024?d.bytesLoaded:0,shader:states.has(d.shader)?d.shader:'unchecked',worker:states.has(d.worker)?d.worker:'unchecked',firstFrame:states.has(d.firstFrame)?d.firstFrame:'unchecked'};
}
export function viewerError(code,diagnostic={}){
  const known=Object.hasOwn(failures,code)?code:'UNKNOWN';
  const e=new Error(failures[known][1]);e.name='WorldViewerError';e.code=known;e.diagnostic=cleanDiagnostics({...diagnostic,code:known,status:'failed'});return e;
}
export function explainViewerFailure(error,previous={}){
  const code=Object.hasOwn(failures,error?.code)?error.code:'UNKNOWN',entry=failures[code];
  return {code,title:entry[0],reason:entry[1],suggestion:entry[2],canTryLight:entry[3],diagnostic:cleanDiagnostics({...previous,...error?.diagnostic,code,status:'failed'}),retryLabel:['WEBGL_UNAVAILABLE','INSTANCING_UNAVAILABLE','WORKER_UNAVAILABLE','WORKER_START_FAILED','WORKER_TIMEOUT','VERTEX_SHADER_FAILED','FRAGMENT_SHADER_FAILED','PROGRAM_LINK_FAILED'].includes(code)?'重新检测支持':'重新打开 3D'};
}
export function diagnosticText(value){
  const d=cleanDiagnostics(value),yes=v=>v===true?'可用':v===false?'不可用':'尚未检测',state=v=>({unchecked:'尚未完成',ready:'通过',failed:'失败'}[v]);
  return [`查看器诊断 v${d.version}`,`状态：${{idle:'尚未开始',loading:'处理中',ready:'首帧已绘制',failed:'已切换备用内容'}[d.status]}`,`阶段：${phases[d.stage]}`,`原因代码：${d.code||'无'}`,`画质：${d.quality==='clear'?'清晰':'轻量'}`,`WebGL 1：${yes(d.webgl1)}`,`实例化扩展：${yes(d.instancing)}`,`Web Worker 接口：${yes(d.workerAPI)}`,`生成清单 HTTP：${d.manifestHTTP??'未收到响应'}`,`世界文件 HTTP：${d.assetHTTP??'未请求或未收到响应'}`,`已读取世界文件：${d.bytesLoaded.toLocaleString('en-US')} 字节`,`绘图程序：${state(d.shader)}`,`计算线程：${state(d.worker)}`,`首帧绘制：${state(d.firstFrame)}`].join('\n');
}
export async function loadWorldManifest(url,{signal,onDiagnostic=()=>{},quality='light'}={}){
  let d=cleanDiagnostics({stage:'manifest',status:'loading',quality});onDiagnostic(d);
  let response;try{response=await fetch(url,{signal});}catch{if(signal?.aborted)throw signal.reason;throw viewerError('MANIFEST_NETWORK',d);}
  d=cleanDiagnostics({...d,manifestHTTP:response.status});onDiagnostic(d);if(!response.ok)throw viewerError('MANIFEST_HTTP',d);
  try{const value=await response.json();if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{if(signal?.aborted)throw signal.reason;throw viewerError('MANIFEST_INVALID',d);}
}
