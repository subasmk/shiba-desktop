// Reproducible Tamil voice prep for the optional Tamil spike route.
// Downloads ta_IN-ValluvarNeural-medium (pinned sha256), generates tokens.txt from
// the model's own phoneme_id_map, and injects the metadata sherpa-onnx requires by
// APPENDING protobuf field-14 (metadata_props) entries to the ModelProto stream
// (protobuf concatenation merge - no onnx dependency). Output is validated by
// parsing the appended tail back, then (in the app) by a wasm load smoke.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),https=require('https');
const MODEL_URL='https://huggingface.co/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-ValluvarNeural-medium/ta_IN-ValluvarNeural-medium.onnx';
const CONF_URL='https://huggingface.co/Jeyaram-K/piper-tamil-voices/resolve/main/ta_IN-ValluvarNeural-medium/ta_IN-ValluvarNeural-medium.onnx.json';
const MODEL_SHA256=process.env.TA_MODEL_SHA256||''; // pin after first verified fetch; empty = print and require explicit pinning
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
})().catch(e=>{console.error('SETUP-FAIL',e.message);process.exit(1);});
