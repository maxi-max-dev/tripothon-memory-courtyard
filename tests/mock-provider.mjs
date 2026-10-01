// Preload ONLY in integration tests. Every external request is intercepted;
// no fallback to real fetch exists. Keys are synthetic and never logged.
import {appendFileSync,readFileSync} from 'node:fs';
globalThis.fetch=async(url,options={})=>{
  const record=kind=>appendFileSync(process.env.MOCK_COUNTS_FILE,kind+'\n');
  const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
  if(url==='https://api.openai.com/v1/responses'){
    record('agent');await pause();const input=JSON.parse(options.body),evidence=JSON.parse(input.input[0].content[0].text).evidence;
    return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({title:'合成测试',description:'蓝色门的院子',facts:[{text:evidence[0].text,sourceIds:[evidence[0].id],certainty:'reported'}],questions:[],assumptions:[]})}]}]}));
  }
  if(url==='https://api.openai.com/v1/images/generations'){
    record('image');await pause();return new Response(JSON.stringify({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII='}]}));
  }
  if(url==='https://api.worldlabs.ai/marble/v1/worlds:generate'){record('world');await pause();if(process.env.MOCK_WORLD_OUTCOME==='success')return new Response(JSON.stringify({operation_id:'mock-op',done:true,response:{id:'mock-world'}}));throw new Error('Synthetic ambiguous outcome; never contacts World Labs.');}
  if(url==='https://api.worldlabs.ai/marble/v1/worlds/mock-world')return new Response(JSON.stringify({world:{id:'mock-world',assets:{splats:{spz_urls:{'100k':'https://cdn.worldlabs.ai/mock-sample.spz'},semantics_metadata:{metric_scale_factor:1,ground_plane_offset:0}}}}}));
  if(url==='https://cdn.worldlabs.ai/mock-sample.spz'){record('asset');return new Response(readFileSync(new URL('../public/samples/hornedlizard.spz',import.meta.url)));}
  throw new Error('Test refuses every unrecognized external request.');
};
