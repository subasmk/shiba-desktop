const {_electron:electron}=require('playwright'),http=require('node:http'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{let requests=0;const server=http.createServer((req,res)=>{let b='';req.on('data',s=>b+=s);req.on('end',()=>{requests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:'Local voice regression mock brain reply.'}}));});});await new Promise(r=>server.listen(11434,'127.0.0.1',r));
 const app=await electron.launch({args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(process.cwd(),'mic-fixture-2turn.wav'),'.'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-voice-lab',VOICE_TIMING:'/tmp/vt-regression.log'}});
 try{await app.firstWindow();await new Promise(r=>setTimeout(r,800));const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.locator('.handle').dispatchEvent('mouseenter');await p.locator('.tools').click();await p.locator('[data-drawer="voice-call"]').click();await p.locator('#voice-start').click();
 const t0=Date.now();let st={};
 while(Date.now()-t0<110000){await new Promise(r=>setTimeout(r,1000));
  st=await p.evaluate(()=>({phase:window.shibaVoice?.session?.phase,err:window.shibaVoice?.lastError||null,samp:window.shibaVoice?.lastAudioSamples||0,rate:window.shibaVoice?.lastAudioSampleRate||0,tr:document.querySelector('#voice-transcript')?.textContent||'',ended:window.shibaVoice?.lastPlayback?.ended===true}));
  if(st.samp>0&&st.ended)break;if(st.err)break;}
 console.log('TURN1',JSON.stringify(st));
 assert.ok(st.tr.startsWith('Pet:'),'turn1 transcript must show Pet reply');
 assert.ok(st.samp>1000,'turn1 TTS real audio');assert.equal(st.err,null);assert.equal(st.ended,true,'turn1 playback must end');
 const started1=await p.evaluate(()=>window.shibaVoice.lastPlayback.started);
 const t1=Date.now();let st2={};
 while(Date.now()-t1<80000){await new Promise(r=>setTimeout(r,1000));
  st2=await p.evaluate(()=>({started:window.shibaVoice?.lastPlayback?.started||0,ended:window.shibaVoice?.lastPlayback?.ended===true,samp:window.shibaVoice?.lastAudioSamples||0,err:window.shibaVoice?.lastError||null}));
  if(st2.started>started1&&st2.ended)break;if(st2.err)break;}
 console.log('TURN2',JSON.stringify(st2),'requests',requests);
 assert.ok(st2.started>started1,'turn2 must produce a NEW playback');
 assert.equal(st2.ended,true,'turn2 playback must end');
 assert.ok(requests>=2,'brain must be called twice, got '+requests);
 console.log('REAL-TTS-SAMPLES turn1',st.samp,'turn2',st2.samp,'rate',st.rate);
 await p.evaluate(()=>window.shibaVoice.session.speechStart());assert.equal(await p.evaluate(()=>window.shibaVoice.session.phase),'listening');
 await p.locator('#voice-stop').click();await p.waitForFunction(()=>window.shibaVoice.session.phase==='off',null,{timeout:10000,polling:500});assert.equal(await p.evaluate(()=>window.shibaVoice.session.active),false);
 console.log('2TURN-REGRESSION PASS (mock brain): two natural voice turns, each ASR->brain->TTS->playback-ended, two brain calls, stop-off clean.');
 }finally{await app.close();server.close();}process.exit(0);})().catch(e=>{console.error(e);process.exit(1)});
