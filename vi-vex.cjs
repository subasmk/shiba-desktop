// Visual verification for Vex: state art resolves + real-cursor drag clamp.
// The drag uses xdotool (real X pointer) because move-pet follows the OS
// cursor; synthetic CDP input does not move it under Xvfb.
const {_electron:electron}=require('./node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');
const {execSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const xdo=s=>execSync('xdotool '+s);
(async()=>{const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_CAPTURE:'1',XDG_CONFIG_HOME:'/tmp/relay-vex-verification'}});try{
 await app.firstWindow();await sleep(1500);const pet=app.windows().find(w=>w.url().includes('mode=pet'));
 const panel=app.windows().find(w=>w.url().includes('mode=panel'));const errors=[];pet.on('pageerror',e=>errors.push(e.message));
 await pet.route(/^https?:/,route=>{errors.push('External request: '+route.request().url());return route.abort()});
 await panel.evaluate(()=>petAPI.call('save-settings',{mascot:'vex',roaming:false,voice:false,size:'normal'}));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet'));w.show();w.setPosition(400,300);});
 await sleep(1500);
 const send=async name=>app.evaluate(({BrowserWindow},n)=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet')).webContents.send('pet-state',n)},name);
 fs.mkdirSync('/downloads/vex-frames',{recursive:true});let frame=0;
 for(const [name,prefix,shots] of [['idle','vex-idle',30],['walk','vex-walk',16]]){
  await send(name);const hashes=new Set();let f=null;
  for(let i=0;i<shots;i++){await sleep(100);const b=await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});hashes.add(crypto.createHash('sha256').update(b).digest('hex'));if(i===3)f=await pet.locator('.pet-image').getAttribute('data-frame');}
  assert(hashes.size>2,name+' must visibly animate');
  assert(f&&f.startsWith(prefix),name+' resolved to '+f);
  console.log(name,'->',f,'distinct',hashes.size);
 }
 // sleep from standing: his idle-to-sleep clip, then the Zzz loop (tested early - the 30s idle auto-sit would otherwise seat him first)
 await send('sleep');
 {const hashes=new Set();let f=null;
  for(let i=0;i<12;i++){await sleep(100);const b=await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});hashes.add(crypto.createHash('sha256').update(b).digest('hex'));if(i===3)f=await pet.locator('.pet-image').getAttribute('data-frame');}
  assert(hashes.size>2,'sleep-down must visibly animate');
  assert(f&&f.startsWith('vex-sleepdown'),'sleep from standing enters through vex-sleepdown, got '+f);
  let looped=null;
  for(let i=0;i<40;i++){await sleep(150);const cur=await pet.locator('.pet-image').getAttribute('data-frame');if(cur&&cur.startsWith('vex-sleeploop')){looped=cur;break;}}
  assert(looped,'sleep-down chains into the vex-sleeploop Zzz loop');
  console.log('sleep from standing ->',f,'then',looped);
 }
 for(const [name,prefix,shots] of [['landing','vex-landing',30],['rage','vex-rage',30],['emote','vex-laugh',30]]){
  await send(name);const hashes=new Set();let f=null;
  for(let i=0;i<shots;i++){await sleep(100);const b=await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});hashes.add(crypto.createHash('sha256').update(b).digest('hex'));if(i===3)f=await pet.locator('.pet-image').getAttribute('data-frame');}
  assert(hashes.size>2,name+' must visibly animate');
  assert(f&&f.startsWith(prefix),name+' resolved to '+f);
  console.log(name,'->',f,'distinct',hashes.size);
 }
 // sit enters through his sit-down transition clip, then chains into the seated pose
 await send('sit');
 {const hashes=new Set();let f=null;
  for(let i=0;i<12;i++){await sleep(100);const b=await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});hashes.add(crypto.createHash('sha256').update(b).digest('hex'));if(i===3)f=await pet.locator('.pet-image').getAttribute('data-frame');}
  assert(hashes.size>2,'sit-down must visibly animate');
  assert(f&&f.startsWith('vex-sitdown'),'sit enters through vex-sitdown, got '+f);
  let chained=null;
  for(let i=0;i<40;i++){await sleep(150);const cur=await pet.locator('.pet-image').getAttribute('data-frame');if(cur&&/^vex-sit\d/.test(cur)){chained=cur;break;}}
  assert(chained,'sit-down chains into the vex-sit pose');
  console.log('sit ->',f,'then',chained);
  await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});
 }
 // 'Change sit to sleep': from the seated pose, sleep enters through his sit-to-sleep clip, then loops his Zzz sleep loop
 await send('sleep');
 {const hashes=new Set();let f=null;
  for(let i=0;i<12;i++){await sleep(100);const b=await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});hashes.add(crypto.createHash('sha256').update(b).digest('hex'));if(i===3)f=await pet.locator('.pet-image').getAttribute('data-frame');}
  assert(hashes.size>2,'sit-sleep must visibly animate');
  assert(f&&f.startsWith('vex-sitsleep'),'sleep from the seated pose enters through vex-sitsleep, got '+f);
  let looped=null;
  for(let i=0;i<40;i++){await sleep(150);const cur=await pet.locator('.pet-image').getAttribute('data-frame');if(cur&&cur.startsWith('vex-sleeploop')){looped=cur;break;}}
  assert(looped,'sit-sleep chains into the vex-sleeploop Zzz loop');
  console.log('sleep from sit ->',f,'then',looped);
  await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});
 }
 // 'fulla play agale' regression: roaming ON, the coffee one-shot must play start to finish
 await send('idle');await sleep(400);
 await panel.evaluate(()=>petAPI.call('save-settings',{roaming:true}));
 await sleep(300);
 await send('ambient-coffee');
 {const seen=[];let cut=null;
  for(let i=0;i<36;i++){await sleep(100);const f=await pet.locator('.pet-image').getAttribute('data-frame');seen.push(f);
   if(f&&f.startsWith('vex-coffee')){const n=parseInt(f.replace(/\D/g,''),10);if(n>=28)break;}
   if(f&&!f.startsWith('vex-coffee')&&seen.some(x=>x&&x.startsWith('vex-coffee'))){cut=f;break;}}
  const maxN=Math.max(0,...seen.filter(f=>f&&f.startsWith('vex-coffee')).map(f=>parseInt(f.replace(/\D/g,''),10)));
  assert(!cut,'coffee cut by '+cut+' at frame '+maxN);
  assert(maxN>=28,'coffee must reach its last frames, only reached '+maxN);
  console.log('coffee full-play: reached frame',maxN);
  await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});
 }
 await panel.evaluate(()=>petAPI.call('save-settings',{roaming:false}));
 await sleep(2500); // settle before the drag
 // Real-cursor drag toward the top-left corner: the window must stay fully
 // inside the work area and show the hanging art while dragged.
 const wb=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet')).getBounds());
 const gx=wb.x+110, gy=wb.y+150;
 xdo('mousemove '+gx+' '+gy);await sleep(200);
 xdo('mousedown 1');await sleep(150);
 let minX=1e9,minY=1e9,maxRight=-1e9,maxBottom=-1e9,dragFrames=new Set();
 const sample=async()=>{
  const b=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('mode=pet')).getBounds());
  minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);maxRight=Math.max(maxRight,b.x+b.width);maxBottom=Math.max(maxBottom,b.y+b.height);
  const f=await pet.locator('.pet-image').getAttribute('data-frame');if(f)dragFrames.add(f.split(/\d/)[0]);
 };
 // drag to corner in steps
 const steps=[[480,420],[420,360],[300,260],[180,160],[80,70],[20,18],[2,2],[2,2],[60,80],[200,200]];
 for(const [x,y] of steps){xdo('mousemove '+x+' '+y);await sleep(110);await sample();}
 console.log('mid-drag frames seen:',[...dragFrames].join(','));
 assert(dragFrames.has('vex-drag'),'drag shows his hanging art, saw '+[...dragFrames]);
 await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});
 // slow down before release so the throw does not fling him
 xdo('mousemove 210 210');await sleep(200);xdo('mousemove 212 212');await sleep(200);
 xdo('mouseup 1');
 const area=await app.evaluate(({screen})=>screen.getPrimaryDisplay().workArea);
 console.log('drag bounds minX',minX,'minY',minY,'maxRight',maxRight,'maxBottom',maxBottom,'area',JSON.stringify(area));
 assert(minX>=area.x&&minY>=area.y,'pet never left the work area (top-left)');
 assert(maxRight<=area.x+area.width&&maxBottom<=area.y+area.height,'pet never left the work area (bottom-right)');
 // release -> his landing beat
 await sleep(400);
 const lf=await pet.locator('.pet-image').getAttribute('data-frame');
 console.log('after release:',lf);
 assert(lf&&lf.startsWith('vex-landing'),'release plays vex-landing, got '+lf);
 for(let i=0;i<6;i++){await sleep(400);await pet.screenshot({path:'/downloads/vex-frames/'+String(frame++).padStart(4,'0')+'.png'});}
 console.log('errors',errors);assert.deepEqual(errors,[]);
 console.log('PASS: vex idle/walk/sit/sleep/landing animate; real drag clamps inside the work area; release plays the new landing beat.');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exit(1)});
