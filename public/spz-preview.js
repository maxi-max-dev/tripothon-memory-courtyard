import {loadSpzViewer} from './spz-viewer.js';
const $=id=>document.getElementById(id);let viewer;
const failure=message=>{$('failure').textContent=message;$('fallback').hidden=false;$('status').textContent='已保留来源和重试入口';};
async function start(){viewer?.destroy();viewer=null;const old=$('splat');old.replaceWith(old.cloneNode(false));$('fallback').hidden=true;try{viewer=await loadSpzViewer($('splat'),'/api/samples/hornedlizard/splats',{onStatus:s=>$('status').textContent=s,onFailure:failure});}catch(error){failure(error.message);}}
$('reset').onclick=()=>viewer?.reset();$('retry').onclick=start;
for(const button of document.querySelectorAll('[data-move]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);viewer?.move(button.dataset.move,true);};for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>viewer?.move(button.dataset.move,false));}
start();

$('save-frame').onclick=()=>{const a=document.createElement('a');a.href=$('splat').toDataURL('image/png');a.download='tripothon-spz-public-sample.png';a.click();};
