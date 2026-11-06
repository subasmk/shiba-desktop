// Demo-video capture from the SOURCE runtime (no packaging): launches the app
// from the repo checkout, drives a real voice conversation with the gapped
// fake-mic fixture (Whisper ASR -> real local Ollama brain -> Kokoro WASM TTS),
// shows a streaming typed chat, and - when DEMO_TANGLISH=1 - picks the Tanglish
// voice (auto in-app download) and runs one more voice turn in the Tamil voice.
// Records pet + panel frames into frames/ for the CI ffmpeg encode step.
// Requires: SHIBA_MODELS (whisper+kokoro), Ollama on 127.0.0.1:11434 with
// qwen3:0.6b, and mic-fixture-demo.wav (tools/gen-gapped-fixture.cjs).
const {_electron:electron}=require('playwright'),path=require('node:path'),fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const manifest={segments:[],startedAt:new Date().toISOString()};
function writeWav(file,chunks){
 const sr=chunks[0].sampleRate;const flat=[];for(const c of chunks)for(const s of c.samples)flat.push(s);
 const b=Buffer.alloc(44+flat.length*2);b.write('RIFF',0);b.writeUInt32LE(36+flat.length*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(flat.length*2,40);
 for(let i=0;i<flat.length;i++){const s=Math.max(-1,Math.min(1,flat[i]));b.writeInt16LE(Math.round(s*32767),44+i*2);}
 fs.writeFileSync(file,b);return flat.length;
}
async function dumpVoiceAudio(p,file){
 const chunks=await p.evaluate(()=>window.shibaVoice&&window.shibaVoice.lastAudioChunks?window.shibaVoice.lastAudioChunks:[]).catch(()=>[]);
 if(!chunks.length)return 0;
 return writeWav(file,chunks);
}
(async()=>{
 fs.mkdirSync('frames/pet',{recursive:true});fs.mkdirSync('frames/panel',{recursive:true});
 const fixture=process.env.DEMO_FIXTURE||'mic-fixture-demo.wav';
 const app=await electron.launch({args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(process.cwd(),fixture),'.'],env:{...process.env,VOICE_TIMING:path.join(process.cwd(),'voice-timing.log')}});
 const proc=app.process();if(proc.stdout)proc.stdout.on('data',d=>process.stdout.write('[main-out] '+d));if(proc.stderr)proc.stderr.on('data',d=>process.stdout.write('[main-err] '+d));
 let recording=true,n=0,recErr=null;
 console.log('DEMO launched, waiting for first window');
 const DEADLINE=Date.now()+22*60*1000;
 try{
  const fw=await Promise.race([app.firstWindow().then(w=>w),sleep(90000).then(()=>null)]);
  if(!fw){console.error('DEMO-FAIL firstWindow timeout after 90s. windows:',app.windows().map(w=>w.url()));process.exit(1);}
  console.log('DEMO first window up');await sleep(2500);
  const windows=await app.windows();
  const p=windows.find(w=>w.url().includes('mode=panel'));
  const pet=windows.find(w=>w.url().includes('mode=pet'));
  if(!p||!pet){console.error('MISSING WINDOWS',windows.map(w=>w.url()));process.exit(1);}
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  pet.on('pageerror',e=>console.log('PET PAGEERROR',e.message));
  // Frame recorder: ~4 fps on both windows; tolerant of transient capture failures.
  (async()=>{while(recording){try{await pet.screenshot({path:'frames/pet/'+String(n).padStart(4,'0')+'.png'});await p.screenshot({path:'frames/panel/'+String(n).padStart(4,'0')+'.png'});}catch(e){recErr=recErr||e.message;}n++;await sleep(250);}})();
  await p.evaluate(()=>window.petAPI.call('save-settings',{ollamaModel:'qwen3:0.6b'}));
  async function state(){return p.evaluate(()=>({phase:window.shibaVoice?.session?.phase,err:window.shibaVoice?.lastError||null,samples:window.shibaVoice?.lastAudioSamples||0,tx:document.querySelector('#voice-transcript')?.textContent||'',pb:window.shibaVoice?.lastPlayback?{started:window.shibaVoice.lastPlayback.started,ended:window.shibaVoice.lastPlayback.ended}:null})).catch(e=>({evalErr:e.message}));}
  async function waitFor(label,fn,timeoutMs){
   const t0=Date.now();
   while(Date.now()-t0<timeoutMs){
    const st=await state();
    if(st.err)throw Error('voice error during '+label+': '+st.err);
    if(fn(st))return st;
    await sleep(6000);console.log('STATE',label,Math.round((Date.now()-t0)/1000)+'s',JSON.stringify(st));
   }
   throw Error('TIMEOUT during '+label);
  }
  const sawPet=st=>st.tx&&st.tx.startsWith('Pet:');
  const turnDone=st=>st.phase==='listening'&&st.pb&&st.pb.ended===true&&st.samples>1000;
  async function openDrawer(name){
   await p.locator('.handle').dispatchEvent('mouseenter');
   if(name==='voice-call'){await p.locator('[data-drawer="tools"]').first().click();await sleep(800);}
   await p.locator('[data-drawer="'+name+'"]').first().click();await sleep(800);
  }

  // SEGMENT 1: streaming typed chat (deterministic grounded question - no model needed)
  await openDrawer('brain');
  await p.locator('#prompt').fill('how many apps did I open?');
  await p.locator('#send-chat').click();
  await p.waitForFunction(()=>!/Thinking/.test(document.querySelector('#status')?.textContent||''),{timeout:60000});
  const chatReply=await p.locator('#reply').textContent();
  console.log('SEG1 chat reply:',chatReply);
  manifest.segments.push({name:'typed-chat',reply:chatReply});

  // SEGMENT 2: real voice turn (fake mic fixture -> ASR -> Ollama -> TTS -> playback)
  await openDrawer('voice-call');
  await p.locator('#voice-start').click();
  await waitFor('turn1-pet',sawPet,240000);
  const t1=await waitFor('turn1-done',turnDone,180000);
  console.log('SEG2 voice turn done. transcript:',t1.tx.slice(0,160));
  const seg2n=await dumpVoiceAudio(p,'seg2-voice.wav');manifest.segments.push({name:'voice-turn',transcript:t1.tx.slice(0,300),samples:t1.samples,audioFile:seg2n?'seg2-voice.wav':null,audioSamples:seg2n||0,audioNote:'seg2-voice.wav is the exact audio bytes the app synthesized in this run (source audio), not a live playback recording.'});

  // SEGMENT 3 (optional): Tanglish voice - in-app auto download + Tamil-voice turn
  if(process.env.DEMO_TANGLISH==='1'&&Date.now()<DEADLINE-9*60*1000){
   await p.locator('#voice-stop').click();await sleep(1000);
   await p.locator('#voice-lang').selectOption('tanglish');
   // auto download starts; wait for ready (one-time ~150 MB on the runner)
   await p.waitForFunction(()=>/ready/i.test(document.querySelector('#status')?.textContent||''),{timeout:300000});
   console.log('SEG3 tamil voice ready in-app');
   const seg2tx=t1.tx;
   await p.locator('#voice-start').click();
   const seg3T0=Date.now();
   // Guard against matching SEG2's stale transcript/playback: the Tanglish
   // turn must produce a NEW transcript and a playback that STARTED after
   // this segment's voice-start click.
   const sawPet2=st=>st.tx&&st.tx.startsWith('Pet:')&&st.tx!==seg2tx;
   const turnDone2=st=>st.tx!==seg2tx&&st.phase==='listening'&&st.pb&&st.pb.started>=seg3T0-5000&&st.pb.ended===true&&st.samples>1000;
   await waitFor('turn2-pet',sawPet2,240000);
   const t2=await waitFor('turn2-done',turnDone2,180000);
   console.log('SEG3 tanglish turn done. transcript:',t2.tx.slice(0,160));
   const seg3n=await dumpVoiceAudio(p,'seg3-voice.wav');manifest.segments.push({name:'tanglish-voice-turn',transcript:t2.tx.slice(0,300),samples:t2.samples,audioFile:seg3n?'seg3-voice.wav':null,audioSamples:seg3n||0,audioNote:'seg3-voice.wav is the exact audio bytes the app synthesized in this run (source audio), not a live playback recording.'});
   await p.locator('#voice-stop').click();
  }else{
   if(process.env.DEMO_TANGLISH==='1')console.log('SEG3 skipped: past time budget');
   await p.locator('#voice-stop').click().catch(()=>{});
  }
  manifest.frameCount=n;manifest.recorderError=recErr;
  fs.writeFileSync('demo-manifest.json',JSON.stringify(manifest,null,2));
  console.log('DEMO-PASS frames',n,'segments',manifest.segments.map(s=>s.name).join(','));
 }finally{recording=false;fs.writeFileSync('demo-manifest.json',JSON.stringify(manifest,null,2));await Promise.race([app.close(),sleep(10000).then(()=>{try{app.process().kill();}catch{}})]);}
})().catch(e=>{console.error('DEMO-FAIL',e.message);process.exit(1);});
