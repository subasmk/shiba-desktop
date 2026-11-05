const {_electron:electron}=require('playwright');
(async()=>{
 const app=await electron.launch({executablePath:process.cwd()+'/dist/linux-unpacked/shiba-desktop',args:['--no-sandbox'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-voice-lab'}});
 try{await app.firstWindow();await new Promise(r=>setTimeout(r,1000));const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 const ready=await p.evaluate(()=>petAPI.call('voice-ready'));
 console.log('PACKAGED-VOICE-READY',JSON.stringify(ready));
 const a=await p.evaluate(()=>petAPI.call('voice-synthesize','Packaged voice check one two three.'));
 console.log('PACKAGED-TTS samples',a.samples.length,'rate',a.sampleRate);
 if(a.samples.length<1000)throw Error('too few samples');
 console.log('PACKAGED-VOICE-PASS');
 }finally{await app.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
