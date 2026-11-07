// Verifies the packaged app's download routes on real Windows: the Brain
// setup download-size probe must reach all three official URLs through the
// app's own fetch stack (Electron net.fetch), not the CI's curl.
// Also opens the settings dashboard window in the packaged build and checks
// it renders and reads live state (the 0.2.2 feature this build ships).
const {_electron:electron}=require('playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const app=await electron.launch({executablePath:process.env.PACKAGED_EXE,args:['--no-sandbox'],env:{...process.env,SHIBA_CAPTURE:'1'}});
 try{
  await app.firstWindow();
  const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
  if(!p)throw Error('no panel window');
  const s=await p.evaluate(()=>petAPI.call('setup-download-check'));
  console.log('SETUP-CHECK',JSON.stringify(s));
  if(!s||!s.whisperBytes||!s.kokoroBytes)throw Error('voice model URLs unreachable from app fetch stack');
  if(!s.ollamaInstallerBytes)throw Error('Ollama installer URL unreachable from app fetch stack');
  console.log('SETUP-DOWNLOAD-CHECK-PASS');
  // Dashboard smoke: the panel button must open the dashboard window, which
  // must render its nav and read live state through the shared preload.
  await p.evaluate(()=>document.querySelector('#dash').click());
  let d=null;
  for(let i=0;i<40&&!d;i++){d=(await app.windows()).find(w=>w.url().includes('dashboard.html'));if(!d)await sleep(250);}
  if(!d)throw Error('dashboard window did not open from panel button');
  await d.waitForSelector('.side h1',{timeout:15000});
  await d.waitForSelector('#d-setup-sum',{timeout:15000});
  const st=await d.evaluate(()=>petAPI.call('get-state'));
  if(!st||typeof st!=='object'||!('userName' in st))throw Error('dashboard get-state missing userName');
  const sum=await d.evaluate(()=>document.querySelector('#d-setup-sum').textContent);
  if(!sum||sum.length<10)throw Error('dashboard setup summary empty');
  console.log('DASH-WINDOW-PASS summary:',sum.slice(0,140));
 }finally{await app.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
