// Bounded quit-path probe v5: decide WHERE the wedge lives.
// variant=early:  quit 600ms after firstWindow - does an early quit work?
// variant=late:   quit after 8s - same as v4 (expected hang).
// variant=watch:  never quit; ping main + each renderer for 30s - does the
//                 event loop wedge WITHOUT any quit request? (time-based wedge)
// On hang after quit, also ping each renderer page directly: if the renderer
// never answers, window close is stuck waiting on a blocked renderer.
const {_electron:electron}=require('playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const variant=process.env.PROBE_VARIANT||'watch';
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:process.env.SHIBA_MODELS||'/tmp/shiba-voice-lab'}});
 const t0=Date.now();
 await app.firstWindow();
 if(variant==='watch'){
  for(let i=0;i<6;i++){
   await sleep(5000);
   const main=await Promise.race([app.evaluate(()=>1).then(()=> 'ok'),sleep(4000).then(()=>'WEDGED')]);
   const pages=app.windows();
   const rend=[];
   for(const w of pages){rend.push(await Promise.race([w.evaluate(()=>1).then(()=>'ok'),sleep(4000).then(()=>'WEDGED')]));}
   console.log('PROBE-PING t='+((Date.now()-t0)/1000|0)+'s main='+main+' renderers='+JSON.stringify(rend));
  }
  console.log('PROBE-WATCH-DONE');
  process.exit(0);
 }
 const waitMs=variant==='early'?600:8000;
 await sleep(waitMs);
 console.log('PROBE quitting at',Date.now()-t0,'ms variant',variant);
 await app.evaluate(({app:ea})=>{ea.quit();}).catch(e=>console.log('PROBE quit evaluate failed:',e.message));
 let alive=true;
 for(let i=0;i<10;i++){await sleep(2000);const p=app.process();if(!p||p.exitCode!==null||p.killed){alive=false;break;}}
 if(!alive){console.log('PROBE-PASS quit exited, variant',variant);process.exit(0);}
 console.log('PROBE-HANG alive 20s after quit, variant',variant);
 const main=await Promise.race([app.evaluate(()=>1).then(()=> 'ok'),sleep(5000).then(()=>'WEDGED')]);
 const rend=[];
 for(const w of app.windows()){rend.push(await Promise.race([w.evaluate(()=>1).then(()=>'ok'),sleep(5000).then(()=>'WEDGED')]));}
 console.log('PROBE-POSTQUIT main='+main+' renderers='+JSON.stringify(rend));
 process.exit(2);
})().catch(e=>{console.error('PROBE-ERROR',e.message);process.exit(1);});
