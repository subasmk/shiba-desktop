// Local Ollama connection shared by discovery, setup and chat. Do not route
// local chat or screenshots to an arbitrary remote OLLAMA_HOST.
function baseUrl(env=process.env){
 const raw=String(env.OLLAMA_HOST||'http://127.0.0.1:11434').trim();
 let u;try{u=new URL(raw.includes('://')?raw:'http://'+raw);}catch{throw Error('Invalid OLLAMA_HOST. Use a local address such as http://127.0.0.1:11434.');}
 if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]','0.0.0.0','[::]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||(u.pathname&&u.pathname!=='/'))throw Error('Relay only connects to a local Ollama server. Set OLLAMA_HOST to a loopback address and port, then restart Relay.');
 if(u.hostname==='0.0.0.0')u.hostname='127.0.0.1';if(u.hostname==='[::]')u.hostname='[::1]';
 return u.origin;
}
function url(path){return baseUrl()+path;}
async function listModels({fetchImpl=fetch,env=process.env,timeoutMs=8000}={}){
 const base=baseUrl(env);let r;
 try{r=await fetchImpl(base+'/api/tags',{signal:AbortSignal.timeout(timeoutMs)});}catch(e){const code=e?.cause?.code||e?.code||e?.name||'connection failed';throw Error('Cannot reach Ollama at '+base+' ('+code+'). Open the Ollama app or run ollama serve, then Retry. Installed models alone do not start the server. If you use another local port, set OLLAMA_HOST before starting Relay.');}
 if(!r.ok)throw Error('Ollama at '+base+' returned HTTP '+r.status+'. Check that this port is your Ollama server, then Retry.');
 let j;try{j=await r.json();}catch{throw Error('Ollama returned invalid JSON at '+base+'. Check the server address and port.');}
 if(!Array.isArray(j.models))throw Error('No valid model list returned by '+base+'. Check that this is an Ollama server.');
 return [...new Set(j.models.map(m=>m?.name||m?.model).filter(n=>typeof n==='string'&&n.trim()))];
}
module.exports={baseUrl,url,listModels};
