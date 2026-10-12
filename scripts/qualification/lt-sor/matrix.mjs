export const kinds={waiting:{},noop:{},'local-transcription':{mediaPath:'/media/synthetic.txt',alignWords:false},'elevenlabs-scribe':{mediaPath:'/media/synthetic.txt',allowOnlineProvider:false},'youtube-caption':{url:'https://www.youtube.com/watch?v=abcdefghijk',language:'en',allowPublicRead:false},'embedded-subtitle-list':{mediaPath:'/media/synthetic.txt'},'embedded-subtitle-extract':{mediaPath:'/media/synthetic.txt',streamIndex:0,outputFormat:'srt',role:'target',language:'en'},'source-audio-snippet':{mediaPath:'/media/synthetic.txt',startMs:0,endMs:100}};
export function rows({waitingId,snippetId,snapshot,revision}){return [
{method:'GET',path:'/api/status',effect:'private-read'},
{method:'GET',path:'/api/state',effect:'private-read'},
{method:'GET',path:'/api/jobs/'+waitingId,effect:'private-read'},
{method:'GET',path:'/api/snippets/'+snippetId,effect:'private-read-LRU'},
{method:'PUT',path:'/api/state',body:JSON.stringify({snapshot,expectedRevision:revision}),effect:'durable-save'},
{method:'POST',path:'/api/jobs/'+waitingId+'/cancel',body:'{}',effect:'cancel'},
{method:'DELETE',path:'/api/snippets/'+snippetId,effect:'delete'},
{method:'POST',path:'/api/artifacts/cleanup',body:'{}',effect:'cleanup'},
...Object.entries(kinds).map(([kind,payload])=>({method:'POST',path:'/api/jobs',body:JSON.stringify({kind,payload}),kind,effect:'job-allocation'}))];}
export async function runSeeded({http,origin,token,oracle,emit,check}){
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const submit=async(kind,payload)=>{const r=await http(origin+'/api/jobs',{method:'POST',headers,body:JSON.stringify({kind,payload})});const value=await r.json();emit({type:'control',stage:'submit-'+kind,status:r.status,jobId:value.job?.id});check('accepted-'+kind,r.status===201);return value.job.id;};
const poll=async id=>{for(let i=0;i<200;i++){const r=await http(origin+'/api/jobs/'+id,{headers:{Authorization:'Bearer '+token}});const job=(await r.json()).job;if(['completed','failed'].includes(job.status))return job;await new Promise(r=>setTimeout(r,5));}throw new Error('JobDeadline');};
const waitingId=await submit('waiting',{});const snippet=await poll(await submit('source-audio-snippet',kinds['source-audio-snippet']));check('seed-snippet-completed',snippet.status==='completed');const state=(await oracle()).runtime.state;
const matrix=rows({waitingId,snippetId:snippet.result.snippetId,snapshot:state.snapshot,revision:state.revision});
for(const fault of ['foreign','null','missing','wrong'])for(const [index,row] of matrix.entries()){
const before=await oracle();emit({type:'row-before',fault,index,method:row.method,path:row.path,oracle:before});
const r=await http(origin+row.path,{method:row.method,headers:{Origin:fault==='foreign'?'http://127.0.0.1:18349':fault==='null'?'null':origin,...(fault==='missing'?{}:{Authorization:'Bearer '+(fault==='wrong'?'A'.repeat(43):token)}),...(row.body?{'Content-Type':'application/json'}:{})},body:row.body});const text=await r.text();const after=await oracle();
const privateAbsent=!text.includes('snapshot')&&!text.includes('Private synthetic')&&!text.includes('RIFF')&&!text.includes(token);
emit({type:'row-after',fault,index,method:row.method,path:row.path,status:r.status,privateAbsent,before,after});
check('denial-'+fault+'-'+index,r.status===(['foreign','null'].includes(fault)?403:401)&&privateAbsent&&JSON.stringify(before)===JSON.stringify(after));
}
for(const [kind,payload] of Object.entries(kinds)){const id=await submit(kind,payload);if(kind==='waiting')continue;const job=await poll(id);emit({type:'control-result',kind,status:job.status,acceptedJobBusinessFailure:job.status==='failed'});check('terminal-'+kind,['completed','failed'].includes(job.status));}
const before=await oracle();const positive=await http(origin+snippet.result.url,{headers:{Authorization:'Bearer '+token}});const bytes=(await positive.arrayBuffer()).byteLength;const after=await oracle();emit({type:'control-LRU',status:positive.status,bytes,before,after});check('authorized-private-byte-LRU-control',positive.status===200&&bytes===3244&&after.runtime.snippetAccessCounter===before.runtime.snippetAccessCounter+1&&after.providers===0);
return {denialRows:matrix.length*4,routeRows:matrix.length,jobKindControls:Object.keys(kinds).length};
}
