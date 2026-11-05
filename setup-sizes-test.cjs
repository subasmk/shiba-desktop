const {_electron:electron}=require('playwright');
(async()=>{
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:'/tmp/shiba-empty-models'}});
 try{await app.firstWindow();await new Promise(r=>setTimeout(r,800));const p=(await app.windows()).find(w=>w.url().includes('mode=panel'));
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.locator('.handle').dispatchEvent('mouseenter');
 await p.locator('.tile.tools').click();
 await p.locator('#drawer [data-drawer="setup"]').click();
 await p.waitForFunction(()=>document.querySelector('#setup-status').textContent.includes('RAM'),null,{timeout:20000});
 await p.waitForFunction(()=>document.querySelector('#setup-sizes').textContent.includes('To download'),null,{timeout:20000});
 console.log('SETUP-SIZES',await p.locator('#setup-sizes').textContent());
 console.log('CANCEL-VISIBLE-BEFORE-RUN',await p.locator('#setup-cancel').isVisible());
 await p.screenshot({path:'/downloads/shiba-setup-sizes.png'});
 console.log('SIZES-UI-PASS');
 }finally{await app.close();}
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
