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
(async()=>{
 fs.mkdirSync('frames/pet',{recursive:true});fs.mkdirSync('frames/panel',{recursive:true});
 const fixture=process.env.DEMO_FIXTURE||'mic-fixture-demo.wav';
 const app=await electron.launch({args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(process.cwd(),fixture),'.'],env:{...process.env,VOICE_TIMING:path.join(process.cwd(),'voice-timing.log')}});
 const proc=app.process();if(proc.stdout)proc.stdout.on('data',d=>process.stdout.write('[main-out] '+d));if(proc.stderr)proc.stderr.on('data',d=>process.stdout.write('[main-err] '+d));
 let recording=true,n=0,recErr=null;
 try{
  await app.firstWindow();await sleep(2500);
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
  async function openDrawer(name){await p.locator('.handle').dispatchEvent('mouseenter');await p.locator('[data-drawer="'+name+'"]').first().click();await sleep(800);}

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
  await waitFor('turn1-pet',sawPet,300000);
  const t1=await waitFor('turn1-done',turnDone,240000);
  console.log('SEG2 voice turn done. transcript:',t1.tx.slice(0,160));
  manifest.segments.push({name:'voice-turn',transcript:t1.tx.slice(0,300),samples:t1.samples});

  // SEGMENT 3 (optional): Tanglish voice - in-app auto download + Tamil-voice turn
  if(process.env.DEMO_TANGLISH==='1'){
   await p.locator('#voice-stop').click();await sleep(1000);
   await p.locator('#voice-lang').selectOption('tanglish');
   // auto download starts; wait for ready (one-time ~150 MB on the runner)
   await p.waitForFunction(()=>/ready/i.test(document.querySelector('#status')?.textContent||''),{timeout:420000});
   console.log('SEG3 tamil voice ready in-app');
   await p.locator('#voice-start').click();
   await waitFor('turn2-pet',sawPet,300000);
   const t2=await waitFor('turn2-done',turnDone,240000);
   console.log('SEG3 tanglish turn done. transcript:',t2.tx.slice(0,160));
   manifest.segments.push({name:'tanglish-voice-turn',transcript:t2.tx.slice(0,300),samples:t2.samples});
   await p.locator('#voice-stop').click();
  }else{
   await p.locator('#voice-stop').click();
  }
  manifest.frameCount=n;manifest.recorderError=recErr;
  fs.writeFileSync('demo-manifest.json',JSON.stringify(manifest,null,2));
  console.log('DEMO-PASS frames',n,'segments',manifest.segments.map(s=>s.name).join(','));
 }finally{recording=false;await app.close();}
})().catch(e=>{console.error('DEMO-FAIL',e.message);process.exit(1);});
