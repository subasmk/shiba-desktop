// Routines drawer UI regression: save membership, list, run attempt (platform-honest result).
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-voice-lab'}});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1200));
  const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
  p.on('pageerror',e=>console.log('PAGEERROR',e.message));
  await p.locator('.handle').dispatchEvent('mouseenter');await new Promise(r=>setTimeout(r,400));
  await p.locator('.tile.tools').click();await new Promise(r=>setTimeout(r,500));
  await p.locator('#actions [data-drawer="routines"]').click();await new Promise(r=>setTimeout(r,400));
  await p.locator('#routine-name').fill('morning');
  await p.locator('#routine-apps').fill('Notepad, Calculator');
  await p.locator('#save-routine').click();await new Promise(r=>setTimeout(r,600));
  const st1=await p.locator('#status').textContent();console.log('SAVE STATUS:',st1);
  assert.match(st1,/Routine saved: morning \(Notepad, Calculator\)/);
  const listText=await p.locator('#routine-list').textContent();console.log('LIST:',listText);
  assert.match(listText,/morning \(2 apps\)/);
  await p.locator('#routine-list button').first().click();await new Promise(r=>setTimeout(r,800));
  const st2=await p.locator('#status').textContent();console.log('RUN STATUS:',st2);
  assert.ok(st2.length>0);
  await p.screenshot({path:'/tmp/shiba-routines-drawer.png'});
  console.log('ROUTINES UI PASS');
 }finally{await app.close();}process.exit(0);
})().catch(e=>{console.error('ROUTINES UI FAIL',e.message||e);process.exit(1)});
