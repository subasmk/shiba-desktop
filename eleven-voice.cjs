// Opt-in ElevenLabs speech. Fixed host, Free-only subscription check, no paid fallback.
const ROOT='https://api.elevenlabs.io/v1';
const MODEL='eleven_multilingual_v2';
const DEFAULT_VOICE='N2lVS1w4EtoT3dr4eOWO'; // Callum, verified through the account voice list.
const VOICE_SETTINGS={stability:0.35,similarity_boost:0.75,style:0.25,use_speaker_boost:true,speed:1.03};
function voiceId(value){return /^[A-Za-z0-9_-]{4,80}$/.test(value||'')?value:'';}
function assertFree(s,n){
 if(!s||s.tier!=='free'||s.status!=='free')throw Error('ElevenLabs requires an active Free account. Cloud speech stopped.');
 if(s.can_extend_character_limit===true||s.allowed_to_extend_character_limit===true||s.max_credit_limit_extension!==0)throw Error('ElevenLabs overages must be disabled. Cloud speech stopped.');
 if(!Number.isFinite(s.character_count)||!Number.isFinite(s.character_limit)||s.character_count<0||s.character_limit<0||s.character_count+n>s.character_limit)throw Error('ElevenLabs free quota is unavailable or exhausted.');
 return s;
}
function createElevenClient({getKey,fetchFn=fetch}={}){
 let queue=Promise.resolve(),generation=0,controller=new AbortController();
 function cancelled(){const e=Error('Voice turn cancelled.');e.code='VOICE_CANCELLED';return e;}
 function cancel(){generation++;controller.abort();controller=new AbortController();}
 async function request(route,options={}){
  const key=String(getKey?.()||'').trim();if(!key)throw Error('ElevenLabs key is not configured.');
  let r;try{r=await fetchFn(ROOT+route,{...options,redirect:'error',headers:{'xi-api-key':key,'Content-Type':'application/json',...options.headers},signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});}catch{if(options.signal?.aborted)throw cancelled();throw Error('ElevenLabs could not be reached.');}
  if(!r?.ok)throw Error('ElevenLabs request refused ('+(r?.status||0)+'). No upgrade or paid fallback attempted.');
  return r;
 }
 async function subscription(){const r=await request('/user/subscription');const s=await r.json();assertFree(s,0);return {remaining:s.character_limit-s.character_count,resetAt:s.next_character_count_reset_unix||null};}
 function speak(text,id){
  const gen=generation,signal=controller.signal;
  const check=()=>{if(gen!==generation||signal.aborted)throw cancelled();};
  const job=queue.then(async()=>{check();
   const t=String(text||'').trim();if(!t||t.length>1000)throw Error('ElevenLabs reply must be between 1 and 1000 characters.');
   const v=voiceId(id);if(!v)throw Error('Choose an ElevenLabs voice first.');
   const s=await (await request('/user/subscription',{signal})).json();check();assertFree(s,t.length);
   const r=await request('/text-to-speech/'+v+'?output_format=pcm_24000',{method:'POST',signal,body:JSON.stringify({text:t,model_id:MODEL,voice_settings:VOICE_SETTINGS})});
   const b=Buffer.from(await r.arrayBuffer());check();if(!b.length||b.length%2||b.length>24000*2*180)throw Error('ElevenLabs returned invalid audio.');
   const samples=Array.from({length:b.length/2},(_,i)=>b.readInt16LE(i*2)/32768);return {samples,sampleRate:24000};
  });queue=job.catch(()=>{});return job;
 }
 async function voices(){await subscription();const r=await request('/voices');const d=await r.json();return (d.voices||[]).filter(v=>voiceId(v.voice_id)).map(v=>({id:v.voice_id,name:String(v.name||'Voice').slice(0,100),labels:v.labels||{}}));}
 return {speak,subscription,voices,cancel};
}
module.exports={MODEL,DEFAULT_VOICE,VOICE_SETTINGS,voiceId,assertFree,createElevenClient};
