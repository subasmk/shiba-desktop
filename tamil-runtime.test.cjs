// Real-download, real-synthesis Tamil voice runtime test. NOT in `npm test` /
// `npm run test:ci` (it downloads ~150 MB of pinned assets, like
// voice-backend.test.cjs downloads Whisper/Kokoro). CI runs it on Windows via
// windows-voice.yml with SHIBA_MODELS set to a writable lab folder.
const {test}=require('node:test'),a=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {prepareTamilVoice,tamilVoiceReady}=require('./tamil-setup.cjs');
const {VoiceBackend}=require('./voice-backend.cjs');

test('Tamil voice: pinned download prepares and synthesizes non-silent Tamil speech',async()=>{
 const lab=process.env.SHIBA_MODELS||'/tmp/shiba-voice-lab';
 const dir=path.join(lab,'tamil-voice');
 const r=await prepareTamilVoice(dir,{});
 a.equal(r.ok,true);
 a.ok(tamilVoiceReady(dir),'prepared folder must contain model, tokens and phonemizer');
 const b=new VoiceBackend(lab);
 try{
  const audio=await b.call('synthesize-ta',{text:'Seri bro, timer start pannu.',modelDir:dir});
  a.ok(audio&&Array.isArray(audio.samples),'worker returned no samples');
  a.ok(audio.samples.length>5000,'too few samples for a sentence: '+audio.samples.length);
  a.equal(audio.sampleRate,22050);
  let peak=0,sum=0;for(const v of audio.samples){const x=Math.abs(v);if(x>peak)peak=x;sum+=x*x;}
  const rms=Math.sqrt(sum/audio.samples.length);
  a.ok(peak>0.05&&rms>0.005,'Tamil audio is effectively silent (peak '+peak+', rms '+rms+')');
 }finally{b.cancel();}
});
