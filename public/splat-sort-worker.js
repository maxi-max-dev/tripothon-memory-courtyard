let records;
self.onmessage=({data})=>{
  if(data.records){records=new Float32Array(data.records);return;}
  if(!records)return;const m=data.view,n=records.length/14,depth=new Float32Array(n),indices=new Uint32Array(n);
  for(let i=0;i<n;i++){indices[i]=i;depth[i]=m[2]*records[i*14]+m[6]*records[i*14+1]+m[10]*records[i*14+2]+m[14];}
  indices.sort((a,b)=>depth[a]-depth[b]);const sorted=new Float32Array(records.length);for(let i=0;i<n;i++)sorted.set(records.subarray(indices[i]*14,indices[i]*14+14),i*14);
  self.postMessage({sorted:sorted.buffer},[sorted.buffer]);
};
