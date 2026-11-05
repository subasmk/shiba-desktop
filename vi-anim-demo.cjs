// Animation-smoothness capture (local/xvfb or CI): records the pet window at
// real capture rate while driving pose transitions and a real roam move.
// Frames + real timestamps -> CI/local ffmpeg encodes at the measured rate.
const {_electron:electron}=require('playwright');
const fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.rmSync('anim-frames',{recursive:true,force:true});fs.mkdirSync('anim-frames',{recursive:true});
 const t0=Date.now();console.log('SCRIPT-T0',t0);
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env}});
 await app.firstWindow();
 let pet,panel;
 for(let i=0;i<20;i++){const ws=app.windows();pet=ws.find(w=>w.url().includes('mode=pet'));panel=ws.find(w=>w.url().includes('mode=panel'));if(pet&&panel)break;await sleep(500);}
 if(!pet||!panel){console.error('MISSING WINDOWS',app.windows().map(w=>w.url()));process.exit(1);}
 pet.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await sleep(1500);
 // show the pet on the desktop (same IPC the launcher drag uses)
 await panel.evaluate(()=>window.petAPI.send('extract'));
 await sleep(800);
 await panel.evaluate(()=>window.petAPI.send('drag-end')); // extract leaves drag=true; release so roam can run
 // roaming on so a real autonomous move happens during capture
 await panel.evaluate(()=>window.petAPI.call('save-settings',{roaming:true,perch:false,cursorPlay:false}));
 let n=0,rec=true;const stamps=[];
 (async()=>{while(rec){const t=Date.now();try{await pet.screenshot({path:'anim-frames/'+String(n).padStart(5,'0')+'.png'});stamps.push(t);}catch{}n++;}})();
 const anim=()=>pet.evaluate(()=>document.querySelector('.pet-image').dataset.animation).catch(()=> '?');
 const pos=()=>app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(x=>x.webContents.getURL().includes('mode=pet'));return w?w.getPosition():null;}).catch(()=>null);
 const act=async a=>{await pet.evaluate(nm=>window.petAPI.send('action',nm),a);};
 console.log('SEG idle');await sleep(4000);
 console.log('SEG wave');await act('wave');await sleep(2500);
 console.log('SEG scan');await act('scan');await sleep(3000);
 console.log('SEG swing');await act('swing');await sleep(2500);
 console.log('SEG landing chain');await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(x=>x.webContents.getURL().includes('mode=pet'));w.webContents.send('pet-state','landing');});await sleep(2500);
 console.log('anim now:',await anim());
 console.log('SEG roam wait (autonomous move)');const p0=await pos();let moved=false;const track=[];
 for(let i=0;i<240;i++){
  const p=await pos();const a=await anim();
  if(p)track.push([Date.now(),p[0],a]);
  if(p&&p0&&Math.abs(p[0]-p0[0])>8)moved=true;
  if(moved&&track.length>20&&a==='idle'&&track.slice(-10).every(t=>t[2]==='idle'))break;
  await sleep(50);
 }
 const walkPts=track.filter(t=>t[2]==='walk'||t[2]==='swing'||t[2]==='leap');
 console.log('roam moved:',moved,'walk-start-offset-s',walkPts.length?((walkPts[0][0]-t0)/1000).toFixed(1):'n/a');
 if(walkPts.length>3){
  const deltas=[];for(let i=1;i<walkPts.length;i++){const dx=walkPts[i][1]-walkPts[i-1][1];deltas.push(dx);}
  console.log('MOVE-SAMPLES',walkPts.length,'deltas(px per ~100ms sample):',JSON.stringify(deltas.slice(0,40)));
  fs.writeFileSync('anim-move-trace.json',JSON.stringify(track));
 }
 rec=false;await sleep(400);
 const dur=(stamps[stamps.length-1]-stamps[0])/1000;
 console.log('CAPTURE frames',stamps.length,'seconds',dur.toFixed(1),'avg fps',(stamps.length/dur).toFixed(1));
 fs.writeFileSync('anim-capture.json',JSON.stringify({frames:stamps.length,seconds:dur,fps:stamps.length/dur}));
 await Promise.race([app.close(),sleep(8000).then(()=>{try{app.process().kill();}catch{}})]);
 process.exit(0);
})().catch(e=>{console.error('ANIM-DEMO-FAIL',e.message);process.exit(1);});
