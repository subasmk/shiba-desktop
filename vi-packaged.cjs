// Packaged-build parity + full voice chain on Windows CI:
// mic fixture -> VAD -> Whisper ASR (native) -> REAL local Ollama brain -> Kokoro WASM TTS
// -> playback-to-end, second turn without restart, barge-in interruption, stop-off.
// Requires: PACKAGED_EXE (dist/win-unpacked exe), SHIBA_MODELS (voice models), Ollama on 127.0.0.1:11434.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const exe=process.env.PACKAGED_EXE;if(!exe)throw Error('PACKAGED_EXE not set');
 const app=await electron.launch({executablePath:exe,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(process.cwd(),'mic-fixture-short.wav')],env:{...process.env}});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,2000));
  const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
  if(!p){console.error('NO PANEL WINDOW',(await app.windows()).map(w=>w.url()));process.exit(1);}
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  await p.evaluate(()=>window.petAPI.call('save-settings',{ollamaModel:'qwen3:0.6b'}));
  await p.locator('.handle').dispatchEvent('mouseenter');await p.locator('.tools').click();
  await p.locator('[data-drawer="voice-call"]').click();await p.locator('#voice-start').click();
  // turn 1
  await p.waitForFunction(()=>document.querySelector('#voice-transcript').textContent.startsWith('Pet:'),null,{timeout:240000,polling:500});
  await p.waitForFunction(()=>window.shibaVoice.lastAudioSamples>0||window.shibaVoice.lastError,null,{timeout:240000,polling:500});
  const n1=await p.evaluate(()=>window.shibaVoice.lastAudioSamples||0),e1=await p.evaluate(()=>window.shibaVoice.lastError||null);
  assert.ok(n1>1000,'TTS must return real audio samples; got '+n1+' err='+e1);assert.equal(e1,null);
  await p.waitForFunction(()=>window.shibaVoice.lastPlayback&&window.shibaVoice.lastPlayback.ended===true,null,{timeout:60000,polling:500});
  console.log('TURN1 PASS samples',n1,'rate',await p.evaluate(()=>window.shibaVoice.lastAudioSampleRate));
  // turn 2 without restart (continuous conversation)
  const pb1=(await p.evaluate(()=>window.shibaVoice.lastPlayback)).started;
  await p.waitForFunction((t)=>window.shibaVoice.lastPlayback&&window.shibaVoice.lastPlayback.started>t,pb1,{timeout:240000,polling:500});
  await p.waitForFunction(()=>window.shibaVoice.lastPlayback.ended===true,null,{timeout:60000,polling:500});
  console.log('TURN2 PASS continuous, no restart');
  await p.screenshot({path:'/tmp/shiba-packaged-voice.png'});
  // turn 3: barge-in during playback cuts audio early and returns to listening
  const pb2=(await p.evaluate(()=>window.shibaVoice.lastPlayback)).started;
  await p.waitForFunction((t)=>window.shibaVoice.lastPlayback&&window.shibaVoice.lastPlayback.started>t,pb2,{timeout:240000,polling:500});
  await p.waitForFunction(()=>window.shibaVoice.lastPlayback.started&&!window.shibaVoice.lastPlayback.ended,null,{timeout:60000,polling:250});
  await new Promise(r=>setTimeout(r,800));
  const started=await p.evaluate(()=>window.shibaVoice.lastPlayback.started);
  await p.evaluate(()=>window.shibaVoice.session.speechStart());
  await p.waitForFunction(()=>window.shibaVoice.lastPlayback.ended===true,null,{timeout:15000,polling:250});
  const playedMs=Date.now()-started,fullMs=await p.evaluate(()=>Math.round(1000*window.shibaVoice.lastPlayback.samples/window.shibaVoice.lastAudioSampleRate));
  assert.equal(await p.evaluate(()=>window.shibaVoice.session.phase),'listening','barge-in must return to listening');
  assert.ok(playedMs<fullMs*0.6,'barge-in must cut playback early: played '+playedMs+'ms of '+fullMs+'ms');
  console.log('BARGE-IN PASS playedMs='+playedMs+' of '+fullMs);
  await p.locator('#voice-stop').click();
  await p.waitForFunction(()=>window.shibaVoice.session.phase==='off',null,{timeout:15000,polling:250});
  assert.equal(await p.evaluate(()=>window.shibaVoice.session.active),false);
  console.log('PACKAGED FULL-CHAIN PASS: launch, turn1, continuous turn2, barge-in, stop-off. Real Ollama brain, real voice models, packaged binary.');
 }finally{await app.close();}process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
