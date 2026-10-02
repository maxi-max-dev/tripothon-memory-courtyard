// Portable preview server. No dependencies, model calls, uploads or public bind.
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../docs/',import.meta.url)),port=Number(process.env.PORT||4319);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.tsp':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
  try{
    const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=resolve(root,'.'+name);
    if(!file.startsWith(resolve(root)+sep)){res.writeHead(403);return res.end();}
    const info=await stat(file);if(!info.isFile()){res.writeHead(404);return res.end();}
    let start=0,end=info.size-1,status=200;
    if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}
      if(!match[1])start=Math.max(0,info.size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(start>end||start<0||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}status=206;
    }
    const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
    if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
    res.writeHead(status,headers);if(req.method==='HEAD'||info.size===0)return res.end();createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404);res.end('File not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Return There demo: http://127.0.0.1:${server.address().port}`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port is in use. Try PORT=4321 node scripts/serve-preview.mjs':'Preview server could not start.');process.exitCode=1;});
