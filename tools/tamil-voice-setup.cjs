// Reproducible Tamil voice prep for the optional Tamil voice route.
// Downloads ta_IN-ValluvarNeural-medium (pinned sha256), generates tokens.txt from
// the model's own phoneme_id_map, and injects the metadata sherpa-onnx requires by
// APPENDING protobuf field-14 (metadata_props) entries to the ModelProto stream
// (protobuf concatenation merge - no onnx dependency). Output is validated by
// parsing the appended tail back, then (in the app) by a wasm load smoke.
//
// Last-mile: also fetches the piper-phonemize WASM (runtime + espeak-ng
// data, ~18 MB extracted) from the sherpa-onnx v2.0.1 wasm release bundle
// into <dir>/piper-phonemize/. The shipped sherpa WASM has no built-in
// espeak frontend, so the voice worker phonemizes Tamil text with this
// bundle and passes phoneme codepoints to the model - the spike's route.
// The release tarball is ~85 MB (it also carries an English model we do
// not use); only the piper-phonemize/ folder is extracted, via the system
// `tar` (Windows 10+, macOS and Linux all ship one). Bundle sha256 is
// printed; set TA_BUNDLE_SHA256 to enforce it (verified value from the
// first prepared run is in LASTMILE.md).
const fs=require('fs'),path=require('path'),crypto=require('crypto'),https=require('https');
const {execFile}=require('child_process');
const MODEL_URL='https://huggingface.co/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-ValluvarNeural-medium/ta_IN-ValluvarNeural-medium.onnx';
const CONF_URL='https://huggingface.co/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-ValluvarNeural-medium/ta_IN-ValluvarNeural-medium.onnx.json';
const MODEL_SHA256=process.env.TA_MODEL_SHA256||''; // pin after first verified fetch; empty = print and require explicit pinning
const BUNDLE_URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-wasm-simd-2.0.1-vits-piper-en_US-libritts_r-medium.tar.bz2';
const BUNDLE_SHA256=process.env.TA_BUNDLE_SHA256||''; // optional pin; actual is always printed
const PHONEMIZER_FILES=['piper-phonemize-wasm-main.js','piper-phonemize-wasm-main.wasm','piper-phonemize-wasm-main.data','piper-phonemize.js'];
const META=[['model_type','vits'],['comment','piper'],['language','Tamil'],['voice','ta'],['has_espeak','1'],['n_speakers','1'],['sample_rate','22050'],['url','https://huggingface.co/Jeyaram-K/piper-tamil-voices'],['maintainer','piper-tamil-voices']];
function fetchBuf(url){return new Promise((res,rej)=>{const get=u=>https.get(u,r=>{if(r.statusCode>=300&&r.statusCode<400)return get(new URL(r.headers.location,u).href);if(r.statusCode!==200)return rej(Error('HTTP '+r.statusCode));const c=[];r.on('data',d=>c.push(d));r.on('end',()=>res(Buffer.concat(c)));}).on('error',rej);get(url);});}
function varint(n){const b=[];while(n>127){b.push((n&127)|128);n>>>=7;}b.push(n);return Buffer.from(b);}
function field(num,bytes){return Buffer.concat([varint(num<<3|2),varint(bytes.length),bytes]);}
function metaEntry(k,v){return field(14,Buffer.concat([field(1,Buffer.from(k,'utf8')),field(2,Buffer.from(v,'utf8'))]));}
function parseLastMeta(buf){
 // find the appended tail: a position where forward-parsing yields entries to EOF
 function rdVarint(b,p){let n=0,sh=0;while(true){const t=b[p++];n|=(t&127)<<sh;if(!(t&128))break;sh+=7;}return[n,p];}
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
function phonemizerReady(outDir){return PHONEMIZER_FILES.every(f=>fs.existsSync(path.join(outDir,'piper-phonemize',f)));}
async function fetchPhonemizer(outDir){
 if(phonemizerReady(outDir)){console.log('Phonemizer already prepared in',path.join(outDir,'piper-phonemize'));return;}
 console.log('Downloading sherpa-onnx wasm bundle (~85 MB, one-time) for the piper-phonemize files...');
 const bundle=await fetchBuf(BUNDLE_URL);
 const sha=crypto.createHash('sha256').update(bundle).digest('hex');
 console.log('Bundle sha256:',sha);
 if(BUNDLE_SHA256&&sha!==BUNDLE_SHA256)throw Error('Bundle checksum mismatch: expected '+BUNDLE_SHA256+' got '+sha);
 const tmp=fs.mkdtempSync(path.join(require('os').tmpdir(),'shiba-ta-bundle-'));
 try{
  const tarPath=path.join(tmp,'bundle.tar.bz2');fs.writeFileSync(tarPath,bundle);
  await new Promise((res,rej)=>execFile('tar',['-xjf',tarPath,'-C',tmp],{maxBuffer:16*1024*1024},e=>e?rej(Error('Could not extract the bundle - a system `tar` that reads .tar.bz2 is required (built into Windows 10+, macOS, Linux): '+e.message)):res()));
  const found=fs.readdirSync(tmp,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name.startsWith('sherpa-onnx-wasm')).map(d=>path.join(tmp,d.name,'piper-phonemize')).find(p=>fs.existsSync(p));
  if(!found)throw Error('piper-phonemize folder not found inside the bundle.');
  fs.cpSync(found,path.join(outDir,'piper-phonemize'),{recursive:true});
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 if(!phonemizerReady(outDir))throw Error('Phonemizer extraction incomplete.');
 console.log('PHONEMIZER-OK',path.join(outDir,'piper-phonemize'));
}
(async()=>{
 const outDir=process.argv[2]||'ta-voice';fs.mkdirSync(outDir,{recursive:true});
 const [model,conf]=await Promise.all([fetchBuf(MODEL_URL),fetchBuf(CONF_URL)]);
 const sha=crypto.createHash('sha256').update(model).digest('hex');
 if(!MODEL_SHA256){console.log('Downloaded model sha256:',sha);console.log('Re-run with TA_MODEL_SHA256='+sha+' to pin and proceed.');process.exit(2);}
 if(sha!==MODEL_SHA256)throw Error('Model checksum mismatch: expected '+MODEL_SHA256+' got '+sha);
 const cfg=JSON.parse(conf.toString('utf8'));
 if(cfg.phoneme_type!=='espeak'||cfg.espeak?.voice!=='ta')throw Error('Unexpected voice config');
 const tokens=Object.entries(cfg.phoneme_id_map).map(([t,ids])=>t+' '+ids[0]).join('\n')+'\n';
 fs.writeFileSync(path.join(outDir,'ta-tokens.txt'),tokens);
 const injected=Buffer.concat([model,...META.map(([k,v])=>metaEntry(k,v))]);
 const back=parseLastMeta(injected);
 for(const [k,v] of META)if(!back.some(([bk,bv])=>bk===k&&bv===v))throw Error('metadata round-trip failed for '+k);
 fs.writeFileSync(path.join(outDir,'ta_IN-ValluvarNeural-medium.onnx'),injected);
 console.log('TAMIL-VOICE-SETUP-OK',outDir,'model bytes',injected.length,'tokens',Object.keys(cfg.phoneme_id_map).length,'sha256 pinned');
 await fetchPhonemizer(outDir);
})().catch(e=>{console.error('SETUP-FAIL',e.message);process.exit(1);});
