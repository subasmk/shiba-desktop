// One-time Tamil voice preparation - library form, callable in-app (no terminal).
//
// What this does (all on this laptop; the only network traffic is these downloads):
//   1. Downloads ta_IN-ValluvarNeural-medium (Piper/VITS Tamil voice, ONNX) from
//      the public HuggingFace repo Jeyaram-K/piper-tamil-voices and verifies it
//      against the HARD-PINNED sha256 below.
//   2. Downloads the official k2-fsa/sherpa-onnx v2.0.1 wasm release bundle and
//      extracts only the piper-phonemize/ files (the shipped sherpa WASM has no
//      espeak frontend; the voice worker phonemizes Tamil text with these).
//   3. Generates ta-tokens.txt from the model's own phoneme_id_map and appends
//      the metadata sherpa-onnx needs (protobuf field-14 concatenation merge).
//
// Provenance / licensing (see LASTMILE.md for details):
//   - Voice model: HuggingFace Jeyaram-K/piper-tamil-voices, license declared
//     Apache-2.0 by that repo. Third-party source, not an official Piper repo.
//   - piper-phonemize: from the official k2-fsa/sherpa-onnx release (Apache-2.0);
//     embeds espeak-ng data (GPL-3.0). Both assets are downloaded to the user's
//     machine at setup time only - the app and repo never ship them.
//
// Both sha256 pins were verified against a fresh download on 2026-11-05. If a
// source file ever changes, setup fails loudly with the checksum mismatch -
// it never silently installs unverified bytes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https'),os=require('node:os');
const {execFile}=require('node:child_process');

const MODEL_URL='https://huggingface.co/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-ValluvarNeural-medium/ta_IN-ValluvarNeural-medium.onnx';
const CONF_URL='https://huggingface.co/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-ValluvarNeural-medium/ta_IN-ValluvarNeural-medium.onnx.json';
const BUNDLE_URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-wasm-simd-2.0.1-vits-piper-en_US-libritts_r-medium.tar.bz2';
const MODEL_SHA256='42b910a553962c11c78c994adb649c9e74c2f9b286a859706eb161b1645100c4';
const BUNDLE_SHA256='dabcdcbde457756143a28e1b3d249dcee8899477774009fa53e9d01404bc4947';
const MODEL_FILE='ta_IN-ValluvarNeural-medium.onnx';
const TOKENS_FILE='ta-tokens.txt';
const PHONEMIZER_FILES=['piper-phonemize-wasm-main.js','piper-phonemize-wasm-main.wasm','piper-phonemize-wasm-main.data','piper-phonemize.js'];
const META=[['model_type','vits'],['comment','piper'],['language','Tamil'],['voice','ta'],['has_espeak','1'],['n_speakers','1'],['sample_rate','22050'],['url','https://huggingface.co/Jeyaram-K/piper-tamil-voices'],['maintainer','piper-tamil-voices']];

// --- pure helpers (unit-tested) ---
function varint(n){const b=[];while(n>127){b.push((n&127)|128);n=Math.floor(n/128);}b.push(n);return Buffer.from(b);}
function field(num,bytes){return Buffer.concat([varint(num*8+2),varint(bytes.length),bytes]);}
function metaEntry(k,v){return field(14,Buffer.concat([field(1,Buffer.from(k,'utf8')),field(2,Buffer.from(v,'utf8'))]));}
function parseLastMeta(buf){
 function rdVarint(b,p){let n=0,sh=0;while(true){const t=b[p++];n+= (t&127)*Math.pow(2,sh);if(!(t&128))break;sh+=7;}return[n,p];}
 for(let start=Math.max(0,buf.length-4096);start<buf.length;start++){
  if(buf[start]!==0x72)continue;
  let p=start;const out=[];let ok=true;
  while(p<buf.length&&ok){
   if(buf[p]!==0x72){ok=false;break;}
   let L;[L,p]=rdVarint(buf,p+1);
   const e=buf.slice(p,p+L);p+=L;
   let q=0;try{
    if(e[q]!==0x0A)throw 0;let kl;[kl,q]=rdVarint(e,q+1);const k=e.slice(q,q+kl).toString();q+=kl;
    if(e[q]!==0x12)throw 0;let vl;[vl,q]=rdVarint(e,q+1);const v=e.slice(q,q+vl).toString();q+=vl;
    out.push([k,v]);
   }catch{ok=false;}
  }
  if(ok&&p===buf.length&&out.length>=META.length)return out;
 }
 return [];
}
function assertVoiceConfig(cfg){
 if(!cfg||cfg.phoneme_type!=='espeak'||!cfg.espeak||cfg.espeak.voice!=='ta')throw Error('Unexpected Tamil voice config - refusing to set up an unrecognized model.');
 if(!cfg.phoneme_id_map||typeof cfg.phoneme_id_map!=='object')throw Error('Tamil voice config has no phoneme map.');
}
function tokensFromConfig(cfg){
 assertVoiceConfig(cfg);
 return Object.entries(cfg.phoneme_id_map).map(([t,ids])=>t+' '+ids[0]).join('\n')+'\n';
}
function modelReady(outDir){
 try{return fs.existsSync(path.join(outDir,MODEL_FILE))&&fs.existsSync(path.join(outDir,TOKENS_FILE));}catch{return false;}
}
function phonemizerReady(outDir){
 try{return PHONEMIZER_FILES.every(f=>fs.existsSync(path.join(outDir,'piper-phonemize',f)));}catch{return false;}
}
function tamilVoiceReady(outDir){return modelReady(outDir)&&phonemizerReady(outDir);}

// --- network / fs steps ---
function downloadToFile(url,dest,o={}){
 return new Promise((resolve,reject)=>{
  if(o.signal&&o.signal.aborted)return reject(Error('Setup cancelled.'));
  let settled=false;const fail=e=>{if(!settled){settled=true;try{fs.rmSync(dest,{force:true});}catch{}reject(e);}};
  const get=u=>https.get(u,r=>{
   if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){r.resume();return get(new URL(r.headers.location,u).href);}
   if(r.statusCode!==200){r.resume();return fail(Error('Download failed (HTTP '+r.statusCode+'). Check the internet connection and try again.'));}
   const total=Number(r.headers['content-length'])||0;let got=0;
   const out=fs.createWriteStream(dest);
   r.on('data',c=>{got+=c.length;o.onProgress?.({bytes:got,total});});
   r.on('error',fail);out.on('error',fail);
   out.on('finish',()=>out.close(()=>{if(!settled){settled=true;resolve({bytes:got});}}));
   r.pipe(out);
   if(o.signal)o.signal.addEventListener('abort',()=>{r.destroy();out.destroy();fail(Error('Setup cancelled.'));},{once:true});
  }).on('error',()=>fail(Error('Could not reach the download server. Check the internet connection and try again.')));
  get(url);
 });
}
function fetchBuffer(url){
 return new Promise((resolve,reject)=>{
  const get=u=>https.get(u,r=>{
   if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){r.resume();return get(new URL(r.headers.location,u).href);}
   if(r.statusCode!==200){r.resume();return reject(Error('HTTP '+r.statusCode));}
   const c=[];r.on('data',d=>c.push(d));r.on('end',()=>resolve(Buffer.concat(c)));
  }).on('error',reject);
  get(url);
 });
}
function sha256File(p){
 return new Promise((resolve,reject)=>{
  const h=crypto.createHash('sha256');const s=fs.createReadStream(p);
  s.on('data',d=>h.update(d));s.on('end',()=>resolve(h.digest('hex')));s.on('error',reject);
 });
}
async function prepareModel(outDir,o){
 if(modelReady(outDir))return{already:true};
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shiba-ta-model-'));
 try{
  const dl=path.join(tmp,'model.onnx');
  await downloadToFile(MODEL_URL,dl,{...o,onProgress:p=>o.onProgress?.({step:'Tamil voice model',...p})});
  const sha=await sha256File(dl);
  if(sha!==MODEL_SHA256)throw Error('Tamil model checksum mismatch (expected pinned '+MODEL_SHA256.slice(0,12)+'..., got '+sha.slice(0,12)+'...). The download was NOT installed.');
  const conf=JSON.parse((await fetchBuffer(CONF_URL)).toString('utf8'));
  fs.writeFileSync(path.join(outDir,TOKENS_FILE),tokensFromConfig(conf));
  const injected=Buffer.concat([fs.readFileSync(dl),...META.map(([k,v])=>metaEntry(k,v))]);
  const back=parseLastMeta(injected);
  for(const [k,v] of META)if(!back.some(([bk,bv])=>bk===k&&bv===v))throw Error('metadata round-trip failed for '+k);
  fs.writeFileSync(path.join(outDir,MODEL_FILE),injected);
  return{already:false,modelBytes:injected.length,tokens:Object.keys(conf.phoneme_id_map).length};
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
async function preparePhonemizer(outDir,o){
 if(phonemizerReady(outDir))return{already:true};
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shiba-ta-bundle-'));
 try{
  const tarPath=path.join(tmp,'bundle.tar.bz2');
  await downloadToFile(BUNDLE_URL,tarPath,{...o,onProgress:p=>o.onProgress?.({step:'Tamil phonemizer',...p})});
  const sha=await sha256File(tarPath);
  if(sha!==BUNDLE_SHA256)throw Error('Phonemizer bundle checksum mismatch (expected pinned '+BUNDLE_SHA256.slice(0,12)+'..., got '+sha.slice(0,12)+'...). The download was NOT installed.');
  await new Promise((res,rej)=>execFile('tar',['-xjf',tarPath,'-C',tmp],{maxBuffer:16*1024*1024},e=>e?rej(Error('Could not extract the phonemizer bundle - a system tar that reads .tar.bz2 is required (built into Windows 10+, macOS, Linux): '+e.message)):res()));
  const found=fs.readdirSync(tmp,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name.startsWith('sherpa-onnx-wasm')).map(d=>path.join(tmp,d.name,'piper-phonemize')).find(p=>fs.existsSync(p));
  if(!found)throw Error('piper-phonemize folder not found inside the bundle.');
  fs.cpSync(found,path.join(outDir,'piper-phonemize'),{recursive:true});
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 if(!phonemizerReady(outDir))throw Error('Phonemizer extraction incomplete.');
 return{already:false};
}

// One call prepares everything. onProgress receives {step, bytes, total}.
// Idempotent: already-prepared parts are skipped. Safe to re-run after a failure.
async function prepareTamilVoice(outDir,o={}){
 if(!outDir||typeof outDir!=='string')throw Error('Tamil voice output folder is not configured.');
 fs.mkdirSync(outDir,{recursive:true});
 if(tamilVoiceReady(outDir))return{ok:true,already:true};
 const model=await prepareModel(outDir,o);
 const ph=await preparePhonemizer(outDir,o);
 if(!tamilVoiceReady(outDir))throw Error('Tamil voice setup did not complete - some files are missing.');
 return{ok:true,already:false,model,phonemizer:ph};
}

module.exports={prepareTamilVoice,tamilVoiceReady,modelReady,phonemizerReady,tokensFromConfig,assertVoiceConfig,parseLastMeta,metaEntry,MODEL_URL,CONF_URL,BUNDLE_URL,MODEL_SHA256,BUNDLE_SHA256,PHONEMIZER_FILES,MODEL_FILE,TOKENS_FILE};
