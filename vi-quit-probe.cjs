// Bounded quit-path probe: launch from source, wait, close with a watchdog.
// Exits 0 with timings if the app quits; exits 2 with diagnostics if close hangs.
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
 await Promise.race([app.close().then(()=>{closed=true;}),sleep(30000)]);
 if(!closed){console.log('PROBE-HANG close did not complete within 30s; child pid',app.process().pid);process.exit(2);}
 console.log('PROBE-PASS closed in',Date.now()-t0,'ms');
 process.exit(0);
})().catch(e=>{console.error('PROBE-ERROR',e.message);process.exit(1);});
