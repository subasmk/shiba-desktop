// Bounded quit-path probe v2: launch from source, wait, close with a watchdog.
// On hang, introspect the MAIN process via playwright's evaluate: active handles,
// then attempt app.exit(0) and report whether even a forced exit works.
const {_electron:electron}=require('playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const variant=process.env.PROBE_VARIANT||'plain';
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:process.env.SHIBA_MODELS||'/tmp/shiba-voice-lab'}});
 const t0=Date.now();
 await app.firstWindow();await sleep(3000);
 console.log('PROBE launched',Date.now()-t0,'ms variant',variant);
 if(variant==='drawer'){
  const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
  await p.locator('.handle').dispatchEvent('mouseenter');await p.locator('.tools').click();await sleep(500);
  await p.locator('[data-drawer="brain"]').first().click();await sleep(500);
  console.log('PROBE drawers opened');
 }
 let closed=false;
 await Promise.race([app.close().then(()=>{closed=true;}).catch(()=>{}),sleep(30000)]);
 if(closed){console.log('PROBE-PASS closed in',Date.now()-t0,'ms');process.exit(0);}
 console.log('PROBE-HANG close did not complete within 30s');
 const info=await Promise.race([
  app.evaluate(()=>({handles:process._getActiveHandles().map(h=>h.constructor.name),requests:process._getActiveRequests().length})),
  sleep(15000).then(()=>null)]);
 console.log('PROBE-HANDLES',JSON.stringify(info));
 if(info){
  await Promise.race([app.evaluate(()=>{require('electron').app.exit(0);}),sleep(10000)]).catch(()=>{});
  await sleep(3000);
  const alive=app.process()&&app.process().exitCode===null;
  console.log('PROBE-FORCE-EXIT alive after app.exit(0):',alive);
 }
 process.exit(2);
})().catch(e=>{console.error('PROBE-ERROR',e.message);process.exit(1);});
