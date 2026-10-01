import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeSpz, encodeViewerPayload } from './spz.mjs';
const limit=64*1024*1024;
export function checkedAssetUrl(value){
  let url;try{url=new URL(value);}catch{throw new Error('世界没有可读取的 SPZ 地址。');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    !(url.hostname.endsWith('.worldlabs.ai')||url.hostname==='storage.googleapis.com'||url.hostname.endsWith('.storage.googleapis.com')))
    throw new Error('SPZ 来自尚未核对的资产主机，请在 Marble 打开。');
  return url.href;
}
export async function boundedAsset(value,fetcher=fetch){
  const response=await fetcher(checkedAssetUrl(value),{redirect:'error',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error(`资产读取返回 HTTP ${response.status}，可使用 Marble 或稍后重试。`);
  if(Number(response.headers.get('content-length'))>limit)throw new Error('SPZ 超过 64 MB 预览上限。');
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('SPZ 超过 64 MB 预览上限。');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
// Only accepts a saved, membership-authorized job, never a client-provided URL.
export async function worldPayload(job,dataDir,fetcher=fetch){
  const folder=join(dataDir,'world-assets');await mkdir(folder,{recursive:true});
  const path=join(folder,`${job.id}.spz`);let bytes;
  try{bytes=await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;
    const urls=job.world.assets?.splats?.spz_urls||{};
    bytes=await boundedAsset(urls['100k']||urls['500k']||urls.full_res,fetcher);
    // Validate before archiving. No export request or API key sent to asset CDN.
    decodeSpz(bytes,{maxPoints:1});await writeFile(`${path}.part`,bytes);await rename(`${path}.part`,path);
  }
  const s=job.world.assets?.splats?.semantics_metadata;
  const semantics=s&&Number.isFinite(s.metric_scale_factor)&&Number.isFinite(s.ground_plane_offset)?s:null;
  return encodeViewerPayload(decodeSpz(bytes,{maxPoints:100000,semantics,marble:true}));
}
