// Visual check + video walkthrough of the settings dashboard.
const {_electron:electron}=require('playwright');
const fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SETTINGS=process.env.HOME+'/.config/shiba-desktop/settings.json';
(async()=>{
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,DISPLAY:':99',SHIBA_MODELS:'/tmp/shiba-voice-lab'}});
 try{
  let panel=null;
  for(let i=0;i<40&&!panel;i++){panel=(await app.windows()).find(w=>w.url().includes('mode=panel'));if(!panel)await sleep(250);}
  if(!panel)throw Error('no panel window');
  await sleep(800);
  await panel.evaluate(()=>document.querySelector('#dash').click());
  let dash=null;
  for(let i=0;i<40&&!dash;i++){dash=(await app.windows()).find(w=>w.url().includes('dashboard.html'));if(!dash)await sleep(250);}
  if(!dash)throw Error('dashboard window did not open');
  await dash.waitForSelector('.side');await sleep(2200); // live setup-status load
  await dash.screenshot({path:'/tmp/dash-home.png'});
  const rd=()=>{try{return JSON.parse(fs.readFileSync(SETTINGS));}catch{return {};}};
  const before=rd();
  // exercise each tab slowly so the screen recording shows it
  for(const t of ['brain','voice','pet','features','privacy']){
   await dash.click('[data-tab="'+t+'"]');await sleep(1400);
   await dash.screenshot({path:'/tmp/dash-'+t+'.png'});
  }
  // persistence proof: flip roaming twice, check the settings file each time
  await dash.click('[data-tab="home"]');await sleep(1000);
  const orig=!!before.roaming;
  await dash.click('#h-roam');await sleep(700);
  const mid=rd();
  if(!!mid.roaming===orig)throw Error('roaming toggle did not persist');
  await dash.click('#h-roam');await sleep(700);
  const after=rd();
  if(!!after.roaming!==orig)throw Error('roaming toggle-back did not persist');
  await dash.screenshot({path:'/tmp/dash-home2.png'});
  console.log('DASH-PASS roaming persisted off/on, orig='+orig);
 }finally{await app.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
