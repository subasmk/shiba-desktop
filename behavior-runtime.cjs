// Actual Electron integration: region taps, native drag, cancellation and uninterrupted autonomy.
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
(async()=>{
 const out=path.join(process.cwd(),'test-evidence');fs.mkdirSync(out,{recursive:true});
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,ELECTRON_DISABLE_SANDBOX:'1'}});
 try{
 await app.firstWindow();await new Promise(r=>setTimeout(r,650));
 const windows=await app.windows(),panel=windows.find(w=>w.url().includes('mode=panel')),pet=windows.find(w=>w.url().includes('mode=pet'));
 await panel.evaluate(()=>window.petAPI.send('extract'));await panel.evaluate(()=>window.petAPI.send('drag-end'));await pet.waitForTimeout(1100);
 const bounds=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getBounds().width===120).getBounds());
 const state=()=>pet.locator('canvas').getAttribute('data-animation');
 async function point(region){return pet.evaluate(region=>{
  const c=document.querySelector('canvas'),r=c.getBoundingClientRect(),d=c.getContext('2d').getImageData(0,0,160,160).data;
  let top=160,bottom=0;for(let y=0;y<160;y++)for(let x=0;x<160;x++)if(d[(y*160+x)*4+3]>40){top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const target=top+(bottom-top)*({head:.24,body:.66,paws:.91}[region]);
  for(let y=Math.floor(target);y<160;y++)for(let dx=0;dx<70;dx++){const x=80+(dx%2?-1:1)*Math.floor(dx/2);if(d[(y*160+x)*4+3]>200)return{x:r.x+(x+.5)*r.width/160,y:r.y+(y+.5)*r.height/160};}
 },region);}
 const results=[];
 for(const region of ['head','body','paws']){
  await panel.evaluate(()=>window.petAPI.send('action','idle'));await pet.waitForTimeout(70);const p=await point(region),before=await bounds();
  await pet.mouse.click(p.x,p.y);await pet.waitForTimeout(60);assert.equal(await state(),'touch-'+region);assert.deepEqual(await bounds(),before);
  await pet.screenshot({path:path.join(out,'touch-'+region+'.png')});results.push({region,frame:await pet.locator('canvas').getAttribute('data-frame')});
  await pet.waitForFunction(()=>document.querySelector('canvas').dataset.animation==='idle');
 }
 // A real pointer press with tiny jitter cannot move the native window.
 let p=await point('head'),before=await bounds();await pet.mouse.move(p.x,p.y);await pet.mouse.down();await pet.mouse.move(p.x+3,p.y+2,{steps:3});await pet.mouse.up();
 assert.deepEqual(await bounds(),before);assert.notEqual(await state(),'drag');await pet.waitForTimeout(1100);
 // Update OS cursor, not only Playwright's renderer events: main uses screen.getCursorScreenPoint.
 p=await point('head');before=await bounds();await pet.mouse.move(p.x,p.y);await pet.mouse.down();await pet.waitForTimeout(110);
 const target={x:Math.round(before.x+p.x+38),y:Math.round(before.y+p.y+55)};
 if(process.platform==='win32')cp.execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class ShibaCursor{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);}';[ShibaCursor]::SetCursorPos(${target.x},${target.y})`]);
 else cp.execFileSync('xdotool',['mousemove',String(target.x),String(target.y)]);
 await pet.waitForFunction(()=>document.querySelector('canvas').dataset.animation==='drag');await pet.waitForTimeout(120);assert.notDeepEqual(await bounds(),before);
 await pet.mouse.up();await pet.waitForFunction(()=>document.querySelector('canvas').dataset.animation==='idle');
 p=await point('head');await pet.mouse.move(p.x,p.y);await pet.mouse.down();await pet.waitForTimeout(100);await pet.mouse.move(p.x+22,p.y+25,{steps:4});
 await pet.waitForFunction(()=>document.querySelector('canvas').dataset.animation==='drag');await pet.locator('.pet-stage').dispatchEvent('pointercancel',{pointerId:1});await pet.mouse.up();
 await pet.waitForFunction(()=>document.querySelector('canvas').dataset.animation==='idle');
 await panel.evaluate(()=>window.petAPI.send('action','ramen'));await pet.waitForTimeout(70);p=await point('head');await pet.mouse.click(p.x,p.y);assert.ok((await state()).startsWith('touch-'));
 await pet.waitForFunction(()=>document.querySelector('canvas').dataset.animation==='idle');
 const hashes=new Set(),log=[];let last='',sample=0;const start=Date.now();
 while(Date.now()-start<56000){const s=await pet.evaluate(()=>({animation:document.querySelector('canvas').dataset.animation,pixels:document.querySelector('canvas').toDataURL()}));
  if(s.animation==='idle')hashes.add(s.pixels);if(s.animation!==last){last=s.animation;log.push({ms:Date.now()-start,animation:last});await pet.screenshot({path:path.join(out,'autonomy-'+sample+++'.png')});}await pet.waitForTimeout(100);
 }
 assert.equal(hashes.size,1);assert.ok(new Set(log.map(s=>s.animation).filter(s=>s!=='idle')).size>=2);assert.equal(await panel.locator('.launcher').isVisible(),false);
 const result={regions:results,autonomy:log,idlePixelVariants:hashes.size,nativeDragMoved:true,cancelRecovered:true,tinyJitterStationary:true};fs.writeFileSync(path.join(out,'behavior-runtime.json'),JSON.stringify(result,null,2));console.log('BEHAVIOR RUNTIME PASS',JSON.stringify(result));
 }finally{await app.close();}
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
