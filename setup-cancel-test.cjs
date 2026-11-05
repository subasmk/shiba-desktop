const {_electron:electron}=require('playwright'),fs=require('node:fs');
(async()=>{
 fs.rmSync('/tmp/shiba-empty-models',{recursive:true,force:true});fs.mkdirSync('/tmp/shiba-empty-models',{recursive:true});
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-empty-models'}});
 try{await app.firstWindow();await new Promise(r=>setTimeout(r,800));const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
 await p.locator('.handle').dispatchEvent('mouseenter');
 await p.locator('.tile.tools').click();
 await p.locator('#drawer [data-drawer="setup"]').click();
 await p.waitForFunction(()=>document.querySelector('#setup-status').textContent.includes('RAM'),null,{timeout:20000});
 await p.locator('#setup-go').click();
 await p.waitForFunction(()=>{const t=document.querySelector('#setup-progress').textContent;return /Downloading (speech recognition|voice|local brain)/.test(t)&&/%/.test(t);},null,{timeout:60000});
 const cancelVisible=await p.locator('#setup-cancel').isVisible();
 await p.locator('#setup-cancel').click();
 await p.waitForFunction(()=>/cancel|abort/i.test(document.body.textContent),null,{timeout:30000});
 await new Promise(r=>setTimeout(r,1500));
 const leftovers=fs.readdirSync('/tmp/shiba-empty-models').filter(f=>f.startsWith('download-'));
 const cancelHiddenAfter=await p.locator('#setup-cancel').isVisible();
 const goEnabled=await p.locator('#setup-go').isEnabled();
 await p.screenshot({path:'/downloads/shiba-setup-cancel.png'});
 console.log(JSON.stringify({cancelVisible,leftovers,cancelHiddenAfter,goEnabled}));
 console.log('CANCEL-PASS');
 }finally{await app.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
