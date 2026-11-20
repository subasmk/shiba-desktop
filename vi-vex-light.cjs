// Light-backdrop capture for Vex: same states as vi-vex.cjs but on a white
// window background (SHIBA_CAPTURE_BG) so white remnants cannot hide.
const {_electron:electron}=require('./node_modules/playwright');
const fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_CAPTURE:'1',SHIBA_CAPTURE_BG:'#ffffff',XDG_CONFIG_HOME:'/tmp/relay-vex-light'}});try{
 await app.firstWindow();await sleep(1500);const pet=app.windows().find(w=>w.url().includes('mode=pet'));
 const panel=app.windows().find(w=>w.url().includes('mode=panel'));
 await panel.evaluate(()=>petAPI.call('save-settings',{mascot:'vex',roaming:false,voice:false,size:'normal'}));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet'));w.show();w.setPosition(400,300);});
 await sleep(1500);
 const send=async name=>app.evaluate(({BrowserWindow},n)=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet')).webContents.send('pet-state',n)},name);
 fs.mkdirSync('/downloads/vex-light',{recursive:true});let frame=0;
 const shot=async()=>pet.screenshot({path:'/downloads/vex-light/'+String(frame++).padStart(4,'0')+'.png'});
 for(const [name,shots] of [['idle',10],['walk',10],['drag',10],['landing',10],['rage',10],['emote',10],['thinking',14]]){
  await send(name);for(let i=0;i<shots;i++){await sleep(110);await shot();}
 }
 await send('sit');for(let i=0;i<14;i++){await sleep(110);await shot();} // sit-down clip
 for(let i=0;i<40;i++){await sleep(150);const f=await pet.locator('.pet-image').getAttribute('data-frame');if(f&&/^vex-sit\d/.test(f))break;}
 for(let i=0;i<4;i++){await sleep(150);await shot();} // chained seated pose
 await send('sleep');for(let i=0;i<14;i++){await sleep(110);await shot();} // sit-to-sleep clip ('Change sit to sleep')
 for(let i=0;i<40;i++){await sleep(150);const f=await pet.locator('.pet-image').getAttribute('data-frame');if(f&&f.startsWith('vex-sleeploop'))break;}
 for(let i=0;i<10;i++){await sleep(110);await shot();} // Zzz sleep loop
 const hf=await pet.locator('.pet-image').getAttribute('data-frame');
 console.log('sleep loops at',hf);
 console.log('PASS light capture', frame, 'frames');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exit(1)});
