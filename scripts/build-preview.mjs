import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const target=join(root,'docs');mkdirSync(target,{recursive:true});
// Explicit publishable files only: never copy data/, secrets, private receipts,
// research scripts, raw samples, invitations, or arbitrary world directories.
const files=['style.css','app.js','viewer.js','spz-viewer.js','viewer-diagnostics.js','viewer-diagnostics.css','splat-sort-worker.js','static-preview.js','materials.html','materials.css','icon.svg','courtyard.svg','generated-world.html','generated-world.css','generated-world.js','demo.html','demo.css','demo.js','demo-state.js','notebook.js','notebook-state.js','notebook.css','submission.html','submission.css','walkthrough.zh.vtt','walkthrough.en.vtt','walkthrough-info.json'];
function prepare(content){return content.replaceAll('src="/','src="./').replaceAll('href="/','href="./').replaceAll("'/courtyard.svg'","'./courtyard.svg'");}
for(const file of files){let content=prepare(readFileSync(join(root,'public',file),'utf8'));if(file==='demo.html')content=content.replace('data-mode="local"','data-mode="preview"');writeFileSync(join(target,file),content);}
// The public entry point is the complete case; the old workspace stays a
// separately labelled static preview. The live backend keeps its own index.
writeFileSync(join(target,'index.html'),readFileSync(join(target,'demo.html')));
writeFileSync(join(target,'workspace.html'),prepare(readFileSync(join(root,'public/index.html'),'utf8')).replace('<html lang="zh-CN">','<html lang="zh-CN" data-preview="static">'));
for(const directory of['osmanthus-demo','osmanthus-revision']){
  const worldPath=`worlds/${directory}`;mkdirSync(join(target,worldPath),{recursive:true});
  for(const file of['manifest.json','world.tsp','world-hq.tsp','thumbnail.webp','panorama.png','viewer.png'])copyFileSync(join(root,'public',worldPath,file),join(target,worldPath,file));
}
mkdirSync(join(target,'screens'),{recursive:true});
for(const file of ['app-home.png','app-local-scene.png'])if(existsSync(join(root,'public/screens',file)))copyFileSync(join(root,'public/screens',file),join(target,'screens',file));
if(existsSync(join(root,'public/walkthrough.mp4')))copyFileSync(join(root,'public/walkthrough.mp4'),join(target,'walkthrough.mp4'));
writeFileSync(join(target,'.nojekyll'),'');
console.log('Static submission demo built from explicit allowlists. No publication performed.');
