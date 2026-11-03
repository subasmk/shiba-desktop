const {app,BrowserWindow,ipcMain,shell,screen,safeStorage}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {localUrl,freeModel,petPosition}=require('./core.cjs');
let panel,pet,drag=false,settings={},savePath;let cloudKey='';
function save(){fs.writeFileSync(savePath,JSON.stringify(settings,null,2),{mode:0o600});}
function win(w,h){const x=new BrowserWindow({width:w,height:h,frame:false,transparent:true,resizable:false,alwaysOnTop:true,skipTaskbar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});x.setAlwaysOnTop(true,'floating');x.webContents.setWindowOpenHandler(()=>({action:'deny'}));x.webContents.on('will-navigate',e=>e.preventDefault());return x;}
function panelSize(open){const area=screen.getPrimaryDisplay().workArea;panel.setBounds({x:Math.round(area.x+(area.width-650)/2),y:area.y,width:650,height:open?260:24});panel.webContents.send('panel-state',open);}
app.whenReady().then(()=>{savePath=path.join(app.getPath('userData'),'settings.json');try{settings=JSON.parse(fs.readFileSync(savePath));}catch{};if(settings.cloudSecret&&safeStorage.isEncryptionAvailable()){try{cloudKey=safeStorage.decryptString(Buffer.from(settings.cloudSecret,'base64'));}catch{}}
 panel=win(650,24);panel.loadFile(path.join(__dirname,'index.html'),{query:{mode:'panel'}});panel.once('ready-to-show',()=>{panelSize(false);panel.showInactive();});
 pet=win(120,130);pet.loadFile(path.join(__dirname,'index.html'),{query:{mode:'pet'}});
 ipcMain.handle('get-state',()=>({...settings,cloudSecret:undefined,hasCloudKey:!!cloudKey}));
 ipcMain.handle('save-settings',(_,data)=>{const allowed=['notes','personality','size','roaming','voice','ollamaModel'];for(const k of allowed)if(k in data)settings[k]=typeof data[k]==='string'?data[k].slice(0,k==='notes'?50000:200):data[k];if('n8n' in data){localUrl(data.n8n);settings.n8n=data.n8n;}save();return true;});
 ipcMain.on('panel',(_,open)=>panelSize(!!open));
 ipcMain.on('drawer-size',()=>{const b=panel.getBounds();panel.setBounds({...b,height:650});});
 ipcMain.on('extract',()=>{drag=true;const c=screen.getCursorScreenPoint();pet.setPosition(c.x-60,c.y-25);pet.showInactive();pet.webContents.send('pet-state','drag');});
 ipcMain.on('move-pet',(_,p)=>{if(!drag)return;const c=screen.getCursorScreenPoint();pet.setPosition(c.x-60,c.y-25);});
 ipcMain.on('drag-start',()=>{drag=true;pet.webContents.send('pet-state','drag');});
 ipcMain.on('drag-end',()=>{if(!drag)return;drag=false;panelSize(false);const [x,y]=pet.getPosition();const area=screen.getDisplayNearestPoint({x,y}).workArea;const pos=petPosition(x,y,area);pet.setPosition(pos.x,pos.y);pet.webContents.send('pet-state','landing');});
 ipcMain.on('dock',()=>{drag=false;pet.hide();panel.webContents.send('docked');});
 ipcMain.on('quit',()=>app.quit());
 ipcMain.on('action',(_,name)=>{if(['idle','wave','bow','sleep','ramen','rage'].includes(name))pet.webContents.send('pet-state',name);});
 ipcMain.handle('open-tool',async(_,tool)=>{if(tool==='chatgpt')return shell.openExternal('https://chatgpt.com/');if(tool==='n8n'){if(!settings.n8n)throw Error('Set your verified local n8n address first.');const u=localUrl(settings.n8n);const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(3500)});if(!r.ok)throw Error('Local n8n did not respond successfully.');return shell.openExternal(u.href);}throw Error('Unknown tool');});
 ipcMain.handle('models',async()=>{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3500)});if(!r.ok)throw Error('Ollama not ready');return (await r.json()).models?.map(x=>x.name)||[];});
 ipcMain.handle('cloud-key',(_,key)=>{if(!key){cloudKey='';delete settings.cloudSecret;save();return true;}if(!safeStorage.isEncryptionAvailable())throw Error('Secure local credential storage is unavailable. Key not saved.');cloudKey=key;settings.cloudSecret=safeStorage.encryptString(key).toString('base64');save();return true;});
 ipcMain.handle('chat',async(_,data)=>{if(typeof data.text!=='string'||data.text.length>5000)throw Error('Keep the message under 5000 characters.');const messages=[{role:'system',content:'You are a calm small Shiba desktop companion. Reply briefly in English or Tanglish using Latin letters. Be honest about limits. You cannot run tools, access files, send messages or change the computer. Never claim you did. Personality: '+(settings.personality||'calm')},{role:'user',content:data.text}];let r;
 if(data.mode==='cloud'){if(!data.consent)throw Error('Confirm sending this message to the cloud.');if(!cloudKey)throw Error('Add your own OpenRouter key locally first.');r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+cloudKey,'Content-Type':'application/json'},body:JSON.stringify({model:freeModel('openrouter/free'),messages,max_tokens:180,provider:{data_collection:'deny',allow_fallbacks:false}}),signal:AbortSignal.timeout(45000)});}
 else {r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:settings.ollamaModel||'qwen3:1.7b',messages,stream:false,think:false,options:{num_ctx:2048,num_predict:180}}),signal:AbortSignal.timeout(90000)});}
 if(!r.ok)throw Error('Brain request failed ('+r.status+'). No paid fallback was attempted.');const a=await r.json();return a.message?.content||a.choices?.[0]?.message?.content||'No reply returned.';});
});
app.on('window-all-closed',()=>app.quit());
