import {loadSpzViewer} from './spz-viewer.js';
const $=id=>document.getElementById(id);
let viewer=null, manifest=null, loading=false, controller=null, epoch=0;
const metadata=fetch('./worlds/osmanthus-demo/manifest.json').then(r=>{if(!r.ok)throw Error('生成记录暂不可用');return r.json();}).then(data=>{
  manifest=data;
  $('generation-detail').textContent=`World Labs · ${data.model} · ${new Date(data.generatedAt).toLocaleDateString('zh-CN')} 已保存`;
  return data;
});
metadata.catch(()=>{$('generation-detail').textContent='World Labs · 合成文字生成；记录暂不可用';});
function ready(value){$('explore-tools').hidden=!value;$('walk').hidden=!value;$('hint').hidden=!value;for(const b of document.querySelectorAll('[data-move]'))b.disabled=!value;}
function fallback(message){
  loading=false;controller?.abort();viewer?.destroy();viewer=null;
  ready(false);$('world').hidden=true;$('cover').hidden=false;$('shade').hidden=false;
  $('welcome-overlay').hidden=true;$('viewer-message').hidden=false;$('retry').hidden=false;
  $('message-title').textContent='3D 暂时没能打开';$('message-detail').textContent=message+' 下方仍可打开已保存的全景。';
  $('scene-tag').textContent='已保留生成画面与备用全景';$('status').textContent='这不会触发重新生成，也不会再次扣除生成额度。';
}
async function start(){
  if(loading)return;loading=true;const current=++epoch;controller?.abort();controller=new AbortController();
  viewer?.destroy();viewer=null;ready(false);$('welcome-overlay').hidden=true;$('viewer-message').hidden=false;$('retry').hidden=true;
  $('message-title').textContent='正在打开院子';$('message-detail').textContent='读取已保存的 3D 文件，请稍候。';
  try{
    const data=await metadata;if(current!==epoch)return;
    const old=$('world');old.replaceWith(old.cloneNode(false));
    const loaded=await loadSpzViewer($('world'),new URL(data.viewerFile,new URL('./worlds/osmanthus-demo/',location.href)).href,{
      signal:controller.signal,startPose:data.startPose,
      onStatus:text=>{if(current===epoch)$('status').textContent=text;},
      onFailure:message=>{if(current===epoch)fallback(message);}
    });
    if(current!==epoch){loaded.destroy();return;}
    viewer=loaded;loading=false;$('world').hidden=false;$('cover').hidden=true;$('shade').hidden=true;$('viewer-message').hidden=true;
    $('scene-tag').textContent='正在探索已保存的世界';$('status').textContent='已载入真实生成的空间 · 轻量画质 · 浏览不调用生成接口';ready(true);viewer.setExploring(true);
  }catch(error){if(current===epoch&&error.name!=='AbortError')fallback(error.message);}
}
$('enter').onclick=start;$('retry').onclick=start;$('reset').onclick=()=>viewer?.reset();
$('show-cover').onclick=()=>{epoch++;controller?.abort();viewer?.destroy();viewer=null;loading=false;ready(false);$('world').hidden=true;$('cover').src='./worlds/osmanthus-demo/panorama.png';$('cover').hidden=false;$('shade').hidden=false;$('welcome-overlay').hidden=false;$('viewer-message').hidden=true;$('enter').textContent='再次走进院子 ↗';$('scene-tag').textContent='已保存的全景 · 可反复查看';};
for(const b of document.querySelectorAll('[data-move]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);viewer?.move(b.dataset.move,true);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>viewer?.move(b.dataset.move,false));}
ready(false);
