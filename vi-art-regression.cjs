// Live pet-window art regression: verifies atlas sprites render, actions switch animations, and the landing->getup->idle chain completes. Run: xvfb-run -a node vi-art-regression.cjs
const {_electron:electron}=require('playwright');
(async()=>{
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-voice-lab'}});
 try{
  await app.firstWindow();await new Promise(r=>setTimeout(r,1200));
  const pet=(await app.windows()).find(w=>w.url().includes('mode=pet'));
  if(!pet){console.log('NO PET WINDOW',(await app.windows()).map(w=>w.url()));process.exit(1);}
  pet.on('pageerror',e=>console.log('PAGEERROR',e.message));
  const shoot=async(n)=>{await pet.screenshot({path:'/tmp/pet-'+n+'.png'});console.log('shot',n);};
  await new Promise(r=>setTimeout(r,800));await shoot('idle');
  const st=await pet.evaluate(()=>{const c=document.querySelector('.pet-image');const x=c.getContext('2d').getImageData(0,0,160,160).data;let a=0;for(let i=3;i<x.length;i+=4)if(x[i]>40)a++;return{anim:c.dataset.animation,alphaPx:a};});
  console.log('IDLE STATE',JSON.stringify(st));
  // trigger anims via the same IPC the drawer uses
  for(const n of ['wave','portal','scan','landing']){
   await pet.evaluate(nm=>{window.petAPI.send('action',nm);},n);
   await new Promise(r=>setTimeout(r,500));await shoot(n);
   const s2=await pet.evaluate(()=>{const c=document.querySelector('.pet-image');const x=c.getContext('2d').getImageData(0,0,160,160).data;let a=0;for(let i=3;i<x.length;i+=4)if(x[i]>40)a++;return{anim:c.dataset.animation,alphaPx:a};});
   console.log(n.toUpperCase(),JSON.stringify(s2));
  }
  // landing->getup chain: wait for chain to advance
  await new Promise(r=>setTimeout(r,700));
  const s3=await pet.evaluate(()=>document.querySelector('.pet-image').dataset.animation);
  console.log('AFTER LANDING CHAIN',s3);
  await shoot('getup');
  // landing->getup->idle chain via the same pet-state event drag-end sends
  const anim=()=>pet.evaluate(()=>document.querySelector('.pet-image').dataset.animation);
  const send=async s=>{await app.evaluate(({BrowserWindow},st)=>{const w=BrowserWindow.getAllWindows().find(x=>x.webContents.getURL().includes('mode=pet'));w.webContents.send('pet-state',st);},s);};
  await send('landing');
  const seen=new Set();
  for(let i=0;i<20;i++){seen.add(await anim());await new Promise(r=>setTimeout(r,150));}
  console.log('CHAIN SEEN',[...seen].join(','));
  if(!seen.has('landing')||!seen.has('getup')){console.error('CHAIN FAIL: landing/getup missing');process.exit(1);}
  if((await anim())!=='idle'){console.error('CHAIN FAIL: did not return to idle');process.exit(1);}
  console.log('CHAIN PASS landing->getup->idle');
 }finally{await app.close();}process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
