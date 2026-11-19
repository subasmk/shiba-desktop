const {_electron:electron}=require('./node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_CAPTURE:'1',XDG_CONFIG_HOME:'/tmp/relay-ria-verification'}});try{
 await app.firstWindow();await sleep(1500);const pet=app.windows().find(w=>w.url().includes('mode=pet'));
 const panel=app.windows().find(w=>w.url().includes('mode=panel'));const errors=[];pet.on('pageerror',e=>errors.push(e.message));
 // Block all HTTP(S) after boot. Runtime, images and wasm must stay local.
 await pet.route(/^https?:/,route=>{errors.push('External request: '+route.request().url());return route.abort()});
 await panel.evaluate(()=>petAPI.call('save-settings',{mascot:'girl',roaming:false,voice:false,size:'normal'}));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet'));w.show();w.setPosition(400,300);});
 await sleep(1800);assert.equal(await pet.locator('.pet-rive').isVisible(),true);
 const send=async name=>app.evaluate(({BrowserWindow},n)=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet')).webContents.send('pet-state',n)},name);
 fs.mkdirSync('/downloads/ria-frames',{recursive:true});let frame=0;
 for(const name of ['idle','walk','wave','cheer']){
  await send(name);const hashes=new Set();
  for(let i=0;i<20;i++){await sleep(70);const b=await pet.screenshot({path:'/downloads/ria-frames/'+String(frame++).padStart(4,'0')+'.png'});hashes.add(crypto.createHash('sha256').update(b).digest('hex'));}
  assert(hashes.size>2,name+' must visibly animate');console.log(name,'distinct screenshots',hashes.size);
  if(name==='wave'||name==='cheer'){await sleep(1000);assert.equal(await pet.locator('.pet-image').getAttribute('data-animation'),'idle');}
 }
 // Body hit, drag gate, and state switch back to both original mascots.
 await send('idle');await pet.mouse.click(110,155);await sleep(700);
 await pet.mouse.move(110,150);await pet.mouse.down();await pet.mouse.move(145,145,{steps:5});await pet.mouse.up();await sleep(500);
 for(const mascot of ['rex','dex','girl']){await panel.evaluate(m=>petAPI.call('save-settings',{mascot:m}),mascot);await sleep(900);assert.equal(await pet.locator('.pet-rive').isVisible(),mascot==='girl');}
 const state=await panel.evaluate(()=>petAPI.call('get-state'));assert.equal(state.mascot,'girl');
 await panel.evaluate(()=>petAPI.send('open-dashboard'));await sleep(800);const dash=app.windows().find(w=>w.url().includes('dashboard.html'));
 assert(dash);await dash.locator('[data-tab=pet]').click();await dash.locator('[data-mascot=rex]').click();await sleep(300);await dash.locator('[data-mascot=girl]').click();await sleep(400);assert.match(await dash.locator('#m-current').innerText(),/Ria/);await dash.locator('[data-ria-anim=cheer]').click();await sleep(250);await dash.locator('[data-mascot=girl]').scrollIntoViewIfNeeded();await dash.screenshot({path:'/downloads/ria-dashboard.png'});await dash.locator('[data-tab=voice]').click();assert.equal(await dash.locator('#v-voice-girl').inputValue(),'0');await dash.locator('#v-voice-girl').selectOption('3');await sleep(200);const settings=await panel.evaluate(()=>petAPI.call('get-state'));assert.equal(settings.voiceByMascot.girl.sid,3);assert.equal(settings.mascot,'girl');console.log('PASS: actual picker UI, Ria preview controls and independent voice picker.');console.log('errors',errors);assert.deepEqual(errors,[]);
 await pet.screenshot({path:'/downloads/ria-app-final.png'});
 console.log('PASS: offline four animations, one-shot return, tap, drag and all mascot switches.');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exit(1)});
