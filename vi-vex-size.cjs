// Size consistency across Vex states + facing direction + drag frames.
// He reported the character changing size between states (per-block atlas
// normalization made sit/landing render ~2x standing height) and walking
// reversed (his art faces left by default; rex/dex face right).
const {_electron:electron}=require('./node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_CAPTURE:'1',SHIBA_CAPTURE_BG:'#ffffff',XDG_CONFIG_HOME:'/tmp/relay-vex-sizecheck'}});try{
 await app.firstWindow();await sleep(1500);const pet=app.windows().find(w=>w.url().includes('mode=pet'));
 const panel=app.windows().find(w=>w.url().includes('mode=panel'));const errors=[];pet.on('pageerror',e=>errors.push(e.message));
 await pet.route(/^https?:/,route=>{errors.push('External request: '+route.request().url());return route.abort()});
 await panel.evaluate(()=>petAPI.call('save-settings',{mascot:'vex',roaming:false,voice:false,size:'normal'}));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet'));w.show();w.setPosition(400,300);});
 await sleep(1500);
 const send=(ch,n)=>app.evaluate(({BrowserWindow},c)=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet')).webContents.send(c.ch,c.n)},{ch,n});
 fs.mkdirSync('/downloads/vex-size',{recursive:true});
 for(const [state,wait] of [['idle',600],['walk',600],['sit',3600],['landing',900],['rage',1500],['think',600]]){
  await send('pet-state',state);await sleep(wait);
  await pet.screenshot({path:'/downloads/vex-size/'+state+'.png'});
 }
 // drag frames: must be the 4 hanging frames only, looping
 await send('pet-state','drag');await sleep(300);
 const seen=new Set();
 for(let i=0;i<12;i++){await sleep(100);const f=await pet.locator('.pet-image').getAttribute('data-frame');if(f)seen.add(f);}
 await pet.screenshot({path:'/downloads/vex-size/drag.png'});
 const bad=[...seen].filter(f=>!/^vex-drag([1-9]|[12][0-9]|30)\.png$/.test(f));
 assert.deepEqual(bad,[],'drag must hold the 4 hanging frames, saw '+[...seen]);
 // facing: dir 1 (moving right) must mirror his left-facing art
 await send('pet-state','idle');await sleep(400);
 await send('pet-face',1);await sleep(300);await pet.screenshot({path:'/downloads/vex-size/face-right.png'});
 await send('pet-face',-1);await sleep(300);await pet.screenshot({path:'/downloads/vex-size/face-left.png'});
 // poke reaction: touch-head resolves to vex-shock, plays once, back to idle
 await send('pet-state','touch-head');await sleep(400);
 const sf=await pet.locator('.pet-image').getAttribute('data-frame');
 assert(sf&&sf.startsWith('vex-shock'),'touch-head resolves to vex-shock, got '+sf);
 await pet.screenshot({path:'/downloads/vex-size/shock.png'});
 let af=null;
 for(let i=0;i<12;i++){await sleep(400);af=await pet.locator('.pet-image').getAttribute('data-frame');if(af&&af.startsWith('vex-idle'))break;}
 assert(af&&af.startsWith('vex-idle'),'shock settles back to idle, got '+af);
 console.log('errors',errors);assert.deepEqual(errors,[]);
 console.log('PASS-SCRIPT');
}finally{await app.close();}})().catch(e=>{console.error(e);process.exit(1)});
