// First-run setup: local hardware check, Ollama detection, conservative free model pull,
// voice weights download from fixed k2-fsa URLs. Nothing leaves the laptop except these downloads.
const os=require('node:os'),fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const WHISPER_URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2';
const KOKORO_URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2';
function pickModel(totalBytes,freeBytes){const t=Number(totalBytes)||0,f=Number(freeBytes)||0;return (t>=12*1024**3&&f>=8*1024**3)?'qwen3:1.7b':'qwen3:0.6b';}
async function hardware(){
 const ram=os.totalmem();let diskFree=null;try{diskFree=(await fs.promises.statfs(app_path())).bavail*4096;}catch{}
 let gpu=null;
 if(process.platform==='win32')gpu=await new Promise(res=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM) | ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000},(e,out)=>{if(e)return res(null);try{res(JSON.parse(out.replace(/^﻿/,'')))}catch{res(null)}}));
 const free=os.freemem();return {ramBytes:ram,freeRamBytes:free,diskFreeBytes:diskFree,gpu,recommendedModel:pickModel(ram,free)};
 function app_path(){try{return require('electron').app.getPath('userData');}catch{return os.tmpdir();}}
}
async function ollamaStatus(){
 try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3000)});if(!r.ok)return{running:false};return{running:true,models:((await r.json()).models||[]).map(m=>m.name)};}catch{return{running:false};}
}
async function pullModel(name,onProgress,signal){
 const r=await fetch('http://127.0.0.1:11434/api/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,stream:true}),signal:sig(signal,30*60000)});
 if(!r.ok)throw Error('Ollama model download failed ('+r.status+').');
 const reader=r.body.getReader();let buf='';
 for(;;){const {done,value}=await reader.read();if(done)break;buf+=Buffer.from(value).toString('utf8');let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);try{const j=JSON.parse(line);if(j.status&&onProgress)onProgress(j.completed&&j.total?Math.round(100*j.completed/j.total):null,j.status);}catch{}}}
}
function voiceModelsStatus(dir){
 const need=[['sherpa-onnx-whisper-tiny','tiny-encoder.int8.onnx'],['sherpa-onnx-whisper-tiny','tiny-decoder.int8.onnx'],['sherpa-onnx-whisper-tiny','tiny-tokens.txt'],['kokoro-int8-multi-lang-v1_0','model.int8.onnx'],['kokoro-int8-multi-lang-v1_0','voices.bin'],['kokoro-int8-multi-lang-v1_0','tokens.txt'],['kokoro-int8-multi-lang-v1_0','lexicon-us-en.txt'],['kokoro-int8-multi-lang-v1_0','lexicon-zh.txt'],['kokoro-int8-multi-lang-v1_0','phone-zh.fst']];
 const missing=need.filter(([d,f])=>!fs.existsSync(path.join(dir,d,f)));
 return {ready:missing.length===0,missing:missing.map(([d,f])=>d+'/'+f)};
}
async function downloadAndExtract(url,dir,onProgress,signal){
 if(process.platform!=='win32'&&process.platform!=='linux')throw Error('Voice setup supports Windows and Linux only.');
 fs.mkdirSync(dir,{recursive:true});
 const tmp=path.join(dir,'download-'+Date.now()+'.tar.bz2');
 const r=await fetch(url,{signal:sig(signal,30*60000)});
 if(!r.ok)throw Error('Voice model download failed ('+r.status+').');
 const total=Number(r.headers.get('content-length'))||0;let got=0;
 const out=fs.createWriteStream(tmp);const reader=r.body.getReader();
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;out.write(Buffer.from(value));got+=value.length;if(onProgress&&total)onProgress(Math.round(100*got/total));}
  await new Promise((res,rej)=>out.end(e=>e?rej(e):res()));
  await new Promise((res,rej)=>execFile(process.platform==='win32'?'tar.exe':'tar',['-xf',tmp,'-C',dir],{windowsHide:true,timeout:120000},e=>e?rej(Error('Voice model unpack failed.')):res()));
 }finally{try{out.destroy();}catch{}fs.rmSync(tmp,{force:true});}
}
async function ensureVoiceModels(dir,onProgress,signal){
 const s=voiceModelsStatus(dir);if(s.ready)return s;
 if(s.missing.some(m=>m.startsWith('sherpa-onnx-whisper')))if(signal?.aborted)throw Error('Setup cancelled.');await downloadAndExtract(WHISPER_URL,dir,p=>onProgress?.('speech recognition',p),signal);
 if(s.missing.some(m=>m.startsWith('kokoro')))if(signal?.aborted)throw Error('Setup cancelled.');await downloadAndExtract(KOKORO_URL,dir,p=>onProgress?.('voice',p),signal);
 const after=voiceModelsStatus(dir);if(!after.ready)throw Error('Voice setup incomplete. No fallback voice was substituted.');
 return after;
}
async function pullWithFallback(preferred,onProgress,signal){
 const order=[preferred,...['qwen3:1.7b','qwen3:0.6b'].filter(m=>m!==preferred)];
 let lastErr=null;
 for(const name of order){
  if(signal?.aborted)throw Error('Setup cancelled.');try{await pullModel(name,onProgress,signal);
   const probe=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:name,messages:[{role:'user',content:'hi'}],stream:false,options:{num_predict:4}}),signal:sig(signal,120000)});
   if(probe.ok)return{model:name,fellBack:name!==preferred};
   lastErr=Error('Model '+name+' could not run on this laptop ('+probe.status+').');
  }catch(e){lastErr=e;}
 }
 throw Error('No local brain model could run here. '+(lastErr?lastErr.message:''));
}
const OLLAMA_SETUP_URL='https://ollama.com/download/OllamaSetup.exe';
async function downloadOllamaInstaller(destDir,onProgress,signal){
 if(process.platform!=='win32')throw Error('Automatic Ollama setup is only built for Windows. Install Ollama, then run setup again.');
 const r=await fetch(OLLAMA_SETUP_URL,{redirect:'follow',signal:sig(signal,20*60000)});
 if(!r.ok)throw Error('Could not download the Ollama installer ('+r.status+').');
 const total=Number(r.headers.get('content-length'))||0;let got=0;
 const dest=require('node:path').join(destDir,'OllamaSetup.exe');
 const out=fs.createWriteStream(dest);const reader=r.body.getReader();
 for(;;){const {done,value}=await reader.read();if(done)break;out.write(Buffer.from(value));got+=value.length;if(onProgress&&total)onProgress(Math.round(100*got/total));}
 await new Promise((res,rej)=>out.end(e=>e?rej(e):res()));
 return dest;
}
async function waitForOllama(timeoutMs,signal){
 const end=Date.now()+timeoutMs;
 while(Date.now()<end){if(signal?.aborted)throw Error('Setup cancelled.');const s=await ollamaStatus();if(s.running)return s;await new Promise(r=>setTimeout(r,3000));}
 return {running:false};
}
let runController=null;
function beginRun(){runController=new AbortController();return runController.signal;}
function cancelRun(){if(runController)runController.abort();}
function sig(signal,ms){const t=AbortSignal.timeout(ms);return signal?(AbortSignal.any?AbortSignal.any([signal,t]):t):t;}
async function headSize(url){try{const r=await fetch(url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(8000)});const n=Number(r.headers.get('content-length'));return Number.isFinite(n)&&n>0?n:null;}catch{return null;}}
async function downloadSizes(){const [whisper,kokoro,ollama]=await Promise.all([headSize(WHISPER_URL),headSize(KOKORO_URL),process.platform==='win32'?headSize(OLLAMA_SETUP_URL):Promise.resolve(null)]);return {whisperBytes:whisper,kokoroBytes:kokoro,ollamaInstallerBytes:ollama,brainBytesApprox:{'qwen3:1.7b':1400000000,'qwen3:0.6b':520000000}};}
module.exports={hardware,beginRun,cancelRun,downloadSizes,ollamaStatus,pullModel,pullWithFallback,voiceModelsStatus,ensureVoiceModels,pickModel,downloadOllamaInstaller,waitForOllama,OLLAMA_SETUP_URL};
