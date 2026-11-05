// Bounded quit-path probe v3: launch from source, instrument the main process
// BEFORE quitting (CDP dies once playwright close() starts, so v2 could never
// introspect). Quit via app.quit() over evaluate, watch which lifecycle events
// fire, dump active handles if it stalls, then test forced app.exit(0).
const {_electron:electron}=require('playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:process.env.SHIBA_MODELS||'/tmp/shiba-voice-lab'}});
 const t0=Date.now();
 await app.firstWindow();await sleep(3000);
 console.log('PROBE launched',Date.now()-t0,'ms');
 await app.evaluate(()=>{
  const {app:ea,BrowserWindow}=require('electron');
  globalThis.__dbg=[];
  const mark=s=>{globalThis.__dbg.push(s+':'+Date.now());console.log('DBG',s);};
  ea.on('before-quit',()=>mark('before-quit'));
  ea.on('will-quit',()=>mark('will-quit'));
  ea.on('window-all-closed',()=>mark('window-all-closed'));
  ea.on('quit',()=>mark('quit'));
  BrowserWindow.getAllWindows().forEach(w=>{w.on('close',()=>mark('win-close-'+w.id));w.on('closed',()=>mark('win-closed-'+w.id));});
  globalThis.__winCount=BrowserWindow.getAllWindows().length;
 });
 console.log('PROBE instrumented, windows:',await app.evaluate(()=>globalThis.__winCount));
 await app.evaluate(()=>{require('electron').app.quit();});
 console.log('PROBE app.quit() called');
 let alive=true;
 for(let i=0;i<15;i++){await sleep(2000);const p=app.process();if(!p||p.exitCode!==null||p.killed){alive=false;break;}}
 if(!alive){console.log('PROBE-PASS quit exited in',Date.now()-t0,'ms');process.exit(0);}
 console.log('PROBE-HANG process still alive 30s after app.quit()');
 const info=await Promise.race([app.evaluate(()=>({
  dbg:globalThis.__dbg,
  windows:require('electron').BrowserWindow.getAllWindows().map(w=>({id:w.id,destroyed:w.isDestroyed(),visible:w.isVisible(),url:w.webContents.getURL()})),
  handles:process._getActiveHandles().map(h=>h.constructor.name),
  requests:process._getActiveRequests().length
 })),sleep(15000).then(()=>null)]);
 console.log('PROBE-HANDLES',JSON.stringify(info));
 if(info){
  await Promise.race([app.evaluate(()=>{require('electron').app.exit(0);}),sleep(10000)]).catch(()=>{});
  await sleep(3000);
  const p=app.process();
  console.log('PROBE-FORCE-EXIT alive after app.exit(0):',!!(p&&p.exitCode===null&&!p.killed));
 }
 process.exit(2);
})().catch(e=>{console.error('PROBE-ERROR',e.message);process.exit(1);});
