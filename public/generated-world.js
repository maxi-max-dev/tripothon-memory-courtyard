import {loadSpzViewer} from './spz-viewer.js';
import {cleanDiagnostics,viewerError,explainViewerFailure,diagnosticText,loadWorldManifest} from './viewer-diagnostics.js';
const $=id=>document.getElementById(id),base='./worlds/osmanthus-demo/';
let viewer=null,loading=false,controller=null,epoch=0,lastDiagnostic=cleanDiagnostics();
function showDiagnostic(d){lastDiagnostic=cleanDiagnostics(d);$('world-diagnostics').hidden=false;$('diagnostic-text').textContent=diagnosticText(lastDiagnostic);}
function showMetadata(data){$('generation-detail').textContent=`World Labs · ${data.model} · ${new Date(data.generatedAt).toLocaleDateString('zh-CN')} 已保存`;}
fetch(base+'manifest.json').then(r=>r.ok?r.json():Promise.reject()).then(showMetadata).catch(()=>{$('generation-detail').textContent='World Labs · 合成文字生成；记录暂不可用';});
function ready(value){$('explore-tools').hidden=!value;$('walk').hidden=!value;$('hint').hidden=!value;for(const b of document.querySelectorAll('[data-move]'))b.disabled=!value;}
function stop(){epoch++;loading=false;controller?.abort();controller=null;viewer?.destroy();viewer=null;}
function fallback(error){
  const result=explainViewerFailure(error,lastDiagnostic);stop();showDiagnostic(result.diagnostic);
  ready(false);$('world').hidden=true;$('cover').hidden=false;$('shade').hidden=false;
  $('welcome-overlay').hidden=true;$('viewer-message').hidden=false;$('retry').hidden=false;$('failure-panorama').hidden=false;
  $('message-title').textContent=result.title;$('message-detail').textContent=result.reason+' '+result.suggestion;$('retry').textContent=result.retryLabel;
  $('scene-tag').textContent='已保留生成画面与备用全景';$('status').textContent='原因代码：'+result.code+' · 不会触发生成或再次扣费。';
}
async function start(){
  if(loading)return;stop();loading=true;const current=epoch;controller=new AbortController();const currentController=controller,signal=controller.signal;
  const timeout=setTimeout(()=>currentController.abort(viewerError('LOAD_TIMEOUT',lastDiagnostic)),45000);
  ready(false);$('world').hidden=true;$('cover').hidden=false;$('shade').hidden=false;$('welcome-overlay').hidden=true;$('viewer-message').hidden=false;$('retry').hidden=true;$('failure-panorama').hidden=true;
  $('message-title').textContent='正在打开院子';$('message-detail').textContent='读取已保存的 3D 文件，请稍候。';
  try{
    const data=await loadWorldManifest(base+'manifest.json',{signal,onDiagnostic:d=>{if(current===epoch)showDiagnostic(d);}});if(current!==epoch)return;showMetadata(data);
    const old=$('world');old.replaceWith(old.cloneNode(false));
    const loaded=await loadSpzViewer($('world'),base+'world.tsp',{
      signal,startPose:data.startPose,diagnostic:lastDiagnostic,onDiagnostic:d=>{if(current===epoch)showDiagnostic(d);},
      onStatus:text=>{if(current===epoch)$('status').textContent=text;},
      onFailure:(_message,d)=>{if(current===epoch)fallback(viewerError(d?.code,d));}
    });
    if(current!==epoch){loaded.destroy();return;}
    viewer=loaded;loading=false;$('world').hidden=false;$('cover').hidden=true;$('shade').hidden=true;$('viewer-message').hidden=true;
    $('scene-tag').textContent='正在探索已保存的世界';$('status').textContent='已载入真实生成的空间 · 轻量画质 · 浏览不调用生成接口';ready(true);viewer.setExploring(true);
  }catch(error){if(current===epoch)fallback(error);}finally{clearTimeout(timeout);}
}
$('enter').onclick=start;$('retry').onclick=start;$('reset').onclick=()=>viewer?.reset();
$('show-cover').onclick=()=>{stop();ready(false);$('world').hidden=true;$('cover').src=base+'panorama.png';$('cover').hidden=false;$('shade').hidden=false;$('welcome-overlay').hidden=false;$('viewer-message').hidden=true;$('enter').textContent='再次走进院子 ↗';$('scene-tag').textContent='已保存的全景 · 可反复查看';};
for(const b of document.querySelectorAll('[data-move]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);viewer?.move(b.dataset.move,true);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>viewer?.move(b.dataset.move,false));}
window.addEventListener('pagehide',stop);
ready(false);
