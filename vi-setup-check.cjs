// Verifies the packaged app's download routes on real Windows: the Brain
// setup download-size probe must reach all three official URLs through the
// app's own fetch stack (Electron net.fetch), not the CI's curl.
const {_electron:electron}=require('playwright');
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
 }finally{await app.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
