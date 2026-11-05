// Real-Ollama full-chain voice regression (evaluate-poll variant of vi-realbrain.cjs;
// waitForFunction in-page polling stalls under current xvfb). Real qwen3:0.6b on 127.0.0.1:11434.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
async function poll(p,fn,timeout,label){const t0=Date.now();while(Date.now()-t0<timeout){try{if(await p.evaluate(fn))return true;}catch(e){}await new Promise(r=>setTimeout(r,400));}throw Error('poll timeout: '+label);}
(async()=>{
 const app=await electron.launch({args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(process.cwd(),'mic-fixture-1turn80s.wav'),'.'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-voice-lab',VOICE_SWAP:'1',VOICE_TIMING:'/tmp/vtiming-rb2.log'}});
 try{await app.firstWindow();await new Promise(r=>setTimeout(r,800));const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
 await p.evaluate(()=>petAPI.call('save-settings',{ollamaModel:'qwen3:0.6b'}));
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.locator('.handle').dispatchEvent('mouseenter');await p.locator('.tools').click();await p.locator('[data-drawer="voice-call"]').click();await p.locator('#voice-start').click();
 await poll(p,()=>document.querySelector('#voice-transcript').textContent.startsWith('Pet:'),100000,'transcript');
 await poll(p,()=>window.shibaVoice.lastAudioSamples>0||window.shibaVoice.lastError,100000,'tts');
 const lastN=await p.evaluate(()=>window.shibaVoice.lastAudioSamples||0);
 const lastErr=await p.evaluate(()=>window.shibaVoice.lastError||null);
 assert.ok(lastN>1000,'TTS must return real audio samples; got '+lastN+' err='+lastErr);assert.equal(lastErr,null);
 console.log('REAL-TTS-SAMPLES',lastN,'rate',await p.evaluate(()=>window.shibaVoice.lastAudioSampleRate));
 await poll(p,()=>window.shibaVoice.lastPlayback&&window.shibaVoice.lastPlayback.ended===true,60000,'playback');
 const pb=await p.evaluate(()=>window.shibaVoice.lastPlayback);assert.ok(pb.ended,'playback must run to onended');
 console.log('PLAYBACK-ENDED samples',pb.samples);
 const tr=await p.locator('#voice-transcript').textContent();console.log('TRANSCRIPT',tr.slice(0,200));
 assert.ok(!tr.includes('Local voice regression mock brain reply'),'reply must come from real Ollama, not mock');assert.ok(tr.length>10);
 try{await p.screenshot({path:'/tmp/shiba-voice-realbrain2.png',timeout:60000});}catch(e){console.log('screenshot skipped:',e.message);}
 await p.evaluate(()=>window.shibaVoice.session.speechStart());assert.equal(await p.evaluate(()=>window.shibaVoice.session.phase),'listening');
 await p.locator('#voice-stop').click();await poll(p,()=>window.shibaVoice.session.phase==='off',15000,'stop');
 assert.equal(await p.evaluate(()=>window.shibaVoice.session.active),false);
 console.log('REALBRAIN PASS: fixture mic + VAD + local ASR + REAL Ollama qwen3:0.6b + local TTS + playback + barge-cancel + stop-off.');
 }finally{await app.close();}process.exit(0);
})().catch(e=>{console.error('REALBRAIN FAIL',e.message||e);process.exit(1)});
