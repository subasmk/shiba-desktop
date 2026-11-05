// Packaged-build parity + full voice chain on Windows CI:
// mic fixture -> VAD -> Whisper ASR (native) -> REAL local Ollama brain -> Kokoro WASM TTS
// -> playback-to-end, second turn without restart, barge-in interruption, stop-off.
// Requires: PACKAGED_EXE (dist/win-unpacked exe), SHIBA_MODELS (voice models), Ollama on 127.0.0.1:11434.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const exe=process.env.PACKAGED_EXE;if(!exe)throw Error('PACKAGED_EXE not set');
 const app=await electron.launch({executablePath:exe,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(process.cwd(),'mic-fixture-short.wav')],env:{...process.env,VOICE_TIMING:path.join(process.cwd(),'voice-timing.log')}});
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
  // wait for a condition with periodic state dumps, so CI logs show where the chain stalls
  async function waitState(label,fn,timeoutMs,arg){
   const t0=Date.now();
   while(Date.now()-t0<timeoutMs){
    const st=await p.evaluate(()=>({phase:window.shibaVoice?.session?.phase,err:window.shibaVoice?.lastError||null,samples:window.shibaVoice?.lastAudioSamples||0,tx:document.querySelector('#voice-transcript')?.textContent||''})).catch(e=>({evalErr:e.message}));
    if(st.err){console.log('STATE',label,JSON.stringify(st));throw Error('voice error during '+label+': '+st.err+' transcript='+st.tx);}
    if(await p.evaluate(fn,arg))return st;
    if(Date.now()-t0<timeoutMs)await sleep(8000);console.log('STATE',label,Math.round((Date.now()-t0)/1000)+'s',JSON.stringify(st));
   }
   const st=await p.evaluate(()=>({phase:window.shibaVoice?.session?.phase,err:window.shibaVoice?.lastError,samples:window.shibaVoice?.lastAudioSamples,tx:document.querySelector('#voice-transcript')?.textContent})).catch(e=>({evalErr:e.message}));
   throw Error('TIMEOUT during '+label+' after '+Math.round((Date.now()-t0)/1000)+'s state='+JSON.stringify(st));
  }
  // turn 1: transcript 'Pet:' (ASR + real brain), then real TTS samples, then playback end
  await waitState('turn1-reply',()=>document.querySelector('#voice-transcript').textContent.startsWith('Pet:'),300000);
  console.log('TURN1 reply visible');
  await waitState('turn1-tts',()=>window.shibaVoice.lastAudioSamples>0,180000);
  const n1=await p.evaluate(()=>window.shibaVoice.lastAudioSamples);
  assert.ok(n1>1000,'TTS must return real audio samples; got '+n1);
  console.log('TURN1 PASS samples',n1,'rate',await p.evaluate(()=>window.shibaVoice.lastAudioSampleRate));
  await waitState('turn1-playend',()=>window.shibaVoice.lastPlayback&&window.shibaVoice.lastPlayback.ended===true,90000);
  // turn 2 without restart
  const pb1=(await p.evaluate(()=>window.shibaVoice.lastPlayback)).started;
  await waitState('turn2-playstart',t=>window.shibaVoice.lastPlayback&&window.shibaVoice.lastPlayback.started>t,300000,pb1);
  await waitState('turn2-playend',()=>window.shibaVoice.lastPlayback.ended===true,90000);
  console.log('TURN2 PASS continuous, no restart');
  await p.screenshot({path:'/tmp/shiba-packaged-voice.png'});
  // turn 3: barge-in cuts playback early and returns to listening
  const pb2=(await p.evaluate(()=>window.shibaVoice.lastPlayback)).started;
  await waitState('turn3-playstart',t=>window.shibaVoice.lastPlayback&&window.shibaVoice.lastPlayback.started>t,300000,pb2);
  await waitState('turn3-playing',()=>window.shibaVoice.lastPlayback.started&&!window.shibaVoice.lastPlayback.ended,90000);
  await sleep(800);
  const started=await p.evaluate(()=>window.shibaVoice.lastPlayback.started);
  await p.evaluate(()=>window.shibaVoice.session.speechStart());
  await waitState('barge-cut',()=>window.shibaVoice.lastPlayback.ended===true,30000);
  const playedMs=Date.now()-started,fullMs=await p.evaluate(()=>Math.round(1000*window.shibaVoice.lastPlayback.samples/window.shibaVoice.lastAudioSampleRate));
  assert.equal(await p.evaluate(()=>window.shibaVoice.session.phase),'listening','barge-in must return to listening');
  assert.ok(playedMs<fullMs*0.6,'barge-in must cut playback early: played '+playedMs+'ms of '+fullMs+'ms');
  console.log('BARGE-IN PASS playedMs='+playedMs+' of '+fullMs);
  await p.locator('#voice-stop').click();
  await waitState('stop-off',()=>window.shibaVoice.session.phase==='off',30000);
  assert.equal(await p.evaluate(()=>window.shibaVoice.session.active),false);
  console.log('PACKAGED FULL-CHAIN PASS: launch, turn1, continuous turn2, barge-in, stop-off. Real Ollama brain, real voice models, packaged binary.');
 }finally{await app.close();}process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
