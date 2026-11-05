const {_electron:electron}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-voice-lab'}});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1200));
  const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  await p.locator('.handle').dispatchEvent('mouseenter');await new Promise(r=>setTimeout(r,400));await p.locator('.tile.tools').click();await new Promise(r=>setTimeout(r,600));console.log('DRAWER HTML',(await p.locator('#drawer').innerHTML()).slice(0,300));
  // chat: history question must be answered deterministically (no LLM needed)
  await p.locator('[data-drawer="brain"]').last().click();
  await p.locator('#prompt').fill('how many apps did I open?');
  await p.locator('#send-chat').click();
  const t0=Date.now();let reply='';
  while(Date.now()-t0<15000){reply=await p.locator('#reply').textContent();if(reply)break;await new Promise(r=>setTimeout(r,300));}
  console.log('HISTORY REPLY:',reply);
  assert.match(reply,/not opened any app|0/);
  assert.ok(!/five|5 apps/i.test(reply));
  // routines drawer renders
  console.log('GROUND PASS');
 }finally{await app.close();}process.exit(0);
})().catch(e=>{console.error('GROUND FAIL',e.message||e);process.exit(1)});
