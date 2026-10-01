import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const target=join(root,'docs');mkdirSync(target,{recursive:true});
// Deliberate allowlist: no SQLite, env, user uploads, screenshots, invitations,
// raw SPZ samples or server/provider code can enter the public preview.
const files=['index.html','style.css','app.js','viewer.js','spz-viewer.js','splat-sort-worker.js','static-preview.js','materials.html','materials.css','icon.svg','courtyard.svg'];
for(const file of files){let content=readFileSync(join(root,'public',file),'utf8');content=content.replaceAll('src="/','src="./').replaceAll('href="/','href="./').replaceAll("'/courtyard.svg'","'./courtyard.svg'");if(file==='index.html')content=content.replace('<html lang="zh-CN">','<html lang="zh-CN" data-preview="static">');if(file==='materials.html')content=content.replaceAll('打开本地 Demo','打开静态预览').replace('亲切、安静、有来处。像翻开一本大家一起写的旧相册。','公开静态素材板 · 合成案例，非真实生成结果。多人同步仅在本地后端实现，本页不提供远程共享服务。');writeFileSync(join(target,file),content);}
writeFileSync(join(target,'.nojekyll'),'');
console.log(`Static preview: ${files.length} allowlisted files, generated in docs/`);
