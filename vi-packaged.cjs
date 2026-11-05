// Packaged-build parity + full voice chain on Windows CI:
// mic fixture -> VAD -> Whisper ASR (native) -> REAL local Ollama brain -> Kokoro WASM TTS
// -> chunked playback-to-end, second turn without restart, barge-in interruption, stop-off.
// Requires: PACKAGED_EXE (dist/win-unpacked exe), SHIBA_MODELS (voice models), Ollama on 127.0.0.1:11434.
// Turn detection is transcript-based (#voice-transcript flips You: -> Pet: per turn) because
// streaming TTS plays one playback per sentence chunk; playback identity cannot mark turns.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const exe=process.env.PACKAGED_EXE;if(!exe)throw Error('PACKAGED_EXE not set');
 const app=await electron.launch({executablePath:exe,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(process.cwd(),'mic-fixture-gapped.wav')],env:{...process.env,VOICE_TIMING:path.join(process.cwd(),'voice-timing.log')}});
 const proc=app.process();if(proc.stdout)proc.stdout.on('data',d=>process.stdout.write('[main-out] '+d));if(proc.stderr)proc.stderr.on('data',d=>process.stdout.write('[main-err] '+d));
 try{
  await app.firstWindow();await sleep(2000);
  const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
  if(!p){console.error('NO PANEL WINDOW',(await app.windows()).map(w=>w.url()));process.exit(1);}
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  p.on('console',m=>console.log('BROWSER',m.text()));
  await p.evaluate(()=>window.petAPI.call('save-settings',{ollamaModel:'qwen3:0.6b'}));
  await p.locator('.handle').dispatchEvent('mouseenter');await p.locator('.tools').click();
  await p.locator('[data-drawer="voice-call"]').click();await p.locator('#voice-start').click();
  async function state(){return p.evaluate(()=>({phase:window.shibaVoice?.session?.phase,err:window.shibaVoice?.lastError||null,samples:window.shibaVoice?.lastAudioSamples||0,tx:document.querySelector('#voice-transcript')?.textContent||'',pb:window.shibaVoice?.lastPlayback?{started:window.shibaVoice.lastPlayback.started,ended:window.shibaVoice.lastPlayback.ended,ms:Math.round(1000*window.shibaVoice.lastPlayback.samples/(window.shibaVoice.lastAudioSampleRate||16000))}:null})).catch(e=>({evalErr:e.message}));}
  async function waitFor(label,fn,timeoutMs){
   const t0=Date.now();
   while(Date.now()-t0<timeoutMs){
    const st=await state();
    if(st.err)throw Error('voice error during '+label+': '+st.err+' state='+JSON.stringify(st));
    if(fn(st))return st;
    await sleep(8000);console.log('STATE',label,Math.round((Date.now()-t0)/1000)+'s',JSON.stringify(st));
   }
   throw Error('TIMEOUT during '+label+' state='+JSON.stringify(await state()));
  }
  // turn N helpers: new utterance -> 'You:' flip, reply -> 'Pet:' flip, complete -> back to listening with playback ended and real samples
  const sawYou=st=>st.tx&&st.tx.startsWith('You:');
  const sawPet=st=>st.tx&&st.tx.startsWith('Pet:');
  const turnDone=st=>st.phase==='listening'&&st.pb&&st.pb.ended===true&&st.samples>1000;
  // TURN 1
  await waitFor('turn1-pet',sawPet,300000);
  const t1=await waitFor('turn1-done',turnDone,180000);
  console.log('TURN1 PASS samples',t1.samples,'reply:',t1.tx.slice(0,120));
  // TURN 2 (continuous conversation, no restart)
  await waitFor('turn2-you',sawYou,300000);
  await waitFor('turn2-pet',sawPet,180000);
  const t2=await waitFor('turn2-done',turnDone,180000);
  console.log('TURN2 PASS continuous, no restart. samples',t2.samples);
  await p.screenshot({path:'/tmp/shiba-packaged-voice.png'});
  // TURN 3: barge-in during speaking cuts the current chunk early and returns to listening
  await waitFor('turn3-you',sawYou,300000);
  await waitFor('turn3-pet',sawPet,180000);
  await waitFor('turn3-speaking',st=>st.phase==='speaking'&&st.pb&&!st.pb.ended,120000);
  await sleep(800);
  const pb3=await p.evaluate(()=>({started:window.shibaVoice.lastPlayback.started,ms:Math.round(1000*window.shibaVoice.lastPlayback.samples/window.shibaVoice.lastAudioSampleRate)}));
  await p.evaluate(()=>window.shibaVoice.session.speechStart());
  await waitFor('barge-cut',st=>st.phase==='listening'&&st.pb&&st.pb.ended===true,30000);
  const playedMs=Date.now()-pb3.started;
  assert.ok(playedMs<pb3.ms*0.6,'barge-in must cut playback early: played '+playedMs+'ms of '+pb3.ms+'ms');
  console.log('BARGE-IN PASS playedMs='+playedMs+' of '+pb3.ms);
  await p.locator('#voice-stop').click();
  await waitFor('stop-off',st=>st.phase==='off',30000);
  assert.equal(await p.evaluate(()=>window.shibaVoice.session.active),false);
  console.log('PACKAGED FULL-CHAIN PASS: launch, turn1, continuous turn2, barge-in, stop-off. Real Ollama brain, real voice models, packaged binary, chunked TTS playback.');
 }finally{await app.close();}process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
