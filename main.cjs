const {app,BrowserWindow,ipcMain,shell,screen,safeStorage,session}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {localUrl,freeModel,petPosition}=require('./core.cjs');
const {readApps,launchApp,selectApps,parseLaunch,launchByName}=require('./apps.cjs');const {PetHistory,parseHistoryQuery,statusAnswer}=require('./pet-history.cjs');const routinesLib=require('./routines.cjs');let history;const {VoiceBackend}=require('./voice-backend.cjs');const setupLib=require('./setup.cjs');const voiceBackend=new VoiceBackend(process.env.SHIBA_MODELS||path.join(__dirname,'voice-models'));
let chatController;
let panel,pet,drag=false,settings={},savePath;let cloudKey='';
function save(){if(history)settings.petHistory=history.counts;fs.writeFileSync(savePath,JSON.stringify(settings,null,2),{mode:0o600});}
function win(w,h){const x=new BrowserWindow({width:w,height:h,frame:false,thickFrame:false,transparent:true,resizable:false,alwaysOnTop:true,skipTaskbar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});x.setAlwaysOnTop(true,'floating');x.webContents.setWindowOpenHandler(()=>({action:'deny'}));x.webContents.on('will-navigate',e=>e.preventDefault());return x;}
function panelSize(open){const area=screen.getPrimaryDisplay().workArea;panel.setBounds({x:Math.round(area.x+(area.width-650)/2),y:area.y,width:650,height:open?260:24});if(process.platform==='win32')panel.setShape(open?[]:[{x:0,y:0,width:650,height:24}]);panel.webContents.send('panel-state',open);}
app.whenReady().then(()=>{savePath=path.join(app.getPath('userData'),'settings.json');try{settings=JSON.parse(fs.readFileSync(savePath));}catch{};history=new PetHistory(settings.petHistory);if(settings.cloudSecret&&safeStorage.isEncryptionAvailable()){try{cloudKey=safeStorage.decryptString(Buffer.from(settings.cloudSecret,'base64'));}catch{}}
 panel=win(650,24);panel.loadFile(path.join(__dirname,'index.html'),{query:{mode:'panel'}});panel.once('ready-to-show',()=>{panelSize(false);panel.showInactive();});
 pet=win(120,130);pet.loadFile(path.join(__dirname,'index.html'),{query:{mode:'pet'}});
 session.defaultSession.setPermissionRequestHandler((webContents,permission,callback)=>{callback(webContents===panel.webContents&&permission==='media');});
 ipcMain.handle('voice-ready',()=>voiceBackend.call('ready'));
 ipcMain.handle('voice-transcribe',(_,samples)=>voiceBackend.call('transcribe',{samples}));
 ipcMain.handle('voice-synthesize',(_,text)=>voiceBackend.call('synthesize',{text}));
 ipcMain.on('voice-cancel',()=>{voiceBackend.cancel();chatController?.abort();});
 ipcMain.handle('installed-apps',()=>readApps());
 ipcMain.handle('launch-app',async(_,token)=>{const result=await launchApp(token);history.record('app-open');save();return result;});
 ipcMain.handle('clear-history',()=>{history.clear();save();return true;});
 ipcMain.handle('list-routines',()=>routinesLib.listRoutines(settings));
 ipcMain.handle('save-routine',(_,data)=>{const r=routinesLib.saveRoutine(settings,data?.name,data?.apps);save();return r;});
 ipcMain.handle('delete-routine',(_,name)=>{const ok=routinesLib.deleteRoutine(settings,name);save();return ok;});
 ipcMain.handle('run-routine',async(_,name)=>{const r=await routinesLib.runRoutine(settings,name);for(const _ of r.launched||[])history.record('app-open');save();return r;});
 ipcMain.on('pet-event',(_,event)=>{if(history.record(event)){save();const line=history.roast();if(line){pet?.webContents.send('pet-say',line);panel?.webContents.send('pet-say',line);}}});
 function setupProgress(stage,pct){try{panel?.webContents.send('setup-progress',{stage,pct:pct??null});}catch{}}
 ipcMain.handle('setup-status',async()=>{const sizes=await setupLib.downloadSizes().catch(()=>null);return {hardware:await setupLib.hardware(),ollama:await setupLib.ollamaStatus(),voice:setupLib.voiceModelsStatus(voiceBackend.models),model:settings.ollamaModel||null,sizes};});
 ipcMain.handle('setup-cancel',async()=>{setupLib.cancelRun();setupProgress('Cancelling setup');return {cancelled:true};});
 ipcMain.handle('setup-run',async()=>{
  const signal=setupLib.beginRun();
  setupProgress('Checking laptop hardware');const hw=await setupLib.hardware();
  let oll=await setupLib.ollamaStatus();
  if(!oll.running){
   if(process.platform!=='win32')throw Error('Ollama is not running. Install and start Ollama, then run setup again.');
   setupProgress('Downloading Ollama installer');const dest=await setupLib.downloadOllamaInstaller(app.getPath('downloads'),p=>setupProgress('Downloading Ollama installer',p),signal);
   setupProgress('Finish the Ollama installer window that just opened. Waiting for it to start');await shell.openPath(dest);
   oll=await setupLib.waitForOllama(10*60000,signal);if(!oll.running)throw Error('Ollama did not start yet. Open Ollama once, then run setup again.');
  }
  const want=hw.recommendedModel;
  if(!(oll.models||[]).some(m=>m===want||m.startsWith(want.split(':')[0]+':'))){
   setupProgress('Downloading local brain '+want);const pulled=await setupLib.pullWithFallback(want,(p,st)=>setupProgress('Downloading local brain',p),signal);
   settings.ollamaModel=pulled.model;save();if(pulled.fellBack)setupProgress('Laptop memory is limited, using smaller brain '+pulled.model);
  } else {settings.ollamaModel=want;save();}
  const brainOk=await setupLib.ollamaStatus();
  setupProgress('Downloading voice models');await setupLib.ensureVoiceModels(voiceBackend.models,(stage,p)=>setupProgress('Downloading '+stage+' models',p),signal);
  if(signal.aborted)throw Error('Setup cancelled. Nothing half-set-up will be used; run setup again when ready.');
  setupProgress('Setup finished');
  return {model:settings.ollamaModel,voice:setupLib.voiceModelsStatus(voiceBackend.models),ollama:brainOk};
 });
 ipcMain.handle('get-state',()=>({...settings,cloudSecret:undefined,hasCloudKey:!!cloudKey}));
 ipcMain.handle('save-settings',(_,data)=>{const allowed=['notes','personality','size','roaming','voice','ollamaModel'];for(const k of allowed)if(k in data)settings[k]=typeof data[k]==='string'?data[k].slice(0,k==='notes'?50000:200):data[k];if('n8n' in data){localUrl(data.n8n);settings.n8n=data.n8n;}save();return true;});
 ipcMain.on('panel',(_,open)=>panelSize(!!open));
 ipcMain.on('drawer-size',()=>{const b=panel.getBounds();panel.setBounds({...b,height:650});if(process.platform==='win32')panel.setShape([]);});
 ipcMain.on('extract',()=>{drag=true;const c=screen.getCursorScreenPoint();pet.setPosition(c.x-60,c.y-25);pet.showInactive();pet.webContents.send('pet-state','drag');});
 ipcMain.on('move-pet',(_,p)=>{if(!drag)return;const c=screen.getCursorScreenPoint();pet.setPosition(c.x-60,c.y-25);});
 ipcMain.on('drag-start',()=>{drag=true;pet.webContents.send('pet-state','drag');});
 ipcMain.on('drag-end',()=>{if(!drag)return;drag=false;panelSize(false);const [x,y]=pet.getPosition();const area=screen.getDisplayNearestPoint({x,y}).workArea;const pos=petPosition(x,y,area);pet.setPosition(pos.x,pos.y);pet.webContents.send('pet-state','landing');});
 ipcMain.on('dock',()=>{drag=false;pet.hide();panel.webContents.send('docked');});
 ipcMain.on('quit',()=>app.quit());
 ipcMain.on('action',(_,name)=>{if(['idle','wave','bow','sleep','scan','rage','swing','portal','leap','peek','climb','sit','emote','cursor','gesture'].includes(name))pet.webContents.send('pet-state',name);});
 ipcMain.handle('open-tool',async(_,tool)=>{if(tool==='chatgpt')return shell.openExternal('https://chatgpt.com/');if(tool==='n8n'){if(!settings.n8n)throw Error('Set your verified local n8n address first.');const u=localUrl(settings.n8n);const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(3500)});if(!r.ok)throw Error('Local n8n did not respond successfully.');return shell.openExternal(u.href);}throw Error('Unknown tool');});
 ipcMain.handle('models',async()=>{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3500)});if(!r.ok)throw Error('Ollama not ready');return (await r.json()).models?.map(x=>x.name)||[];});
 ipcMain.handle('cloud-key',(_,key)=>{if(!key){cloudKey='';delete settings.cloudSecret;save();return true;}if(!safeStorage.isEncryptionAvailable())throw Error('Secure local credential storage is unavailable. Key not saved.');cloudKey=key;settings.cloudSecret=safeStorage.encryptString(key).toString('base64');save();return true;});
 ipcMain.handle('chat',async(_,data)=>{chatController?.abort();chatController=new AbortController();const chatSignal=chatController.signal;if(typeof data.text!=='string'||data.text.length>5000)throw Error('Keep the message under 5000 characters.');const requestedApp=/routine/i.test(data.text)?null:parseLaunch(data.text);if(requestedApp){const result=await launchByName(requestedApp);if(result.status==='ambiguous')return 'Which app do you mean? '+result.choices.join(', ');if(result.status==='not-found')return 'I could not find that app in the Windows Start menu.';history.record('app-open');save();return result.name+': launch requested from Windows.';}const hq=parseHistoryQuery(data.text);if(hq){history.record('chat-turn');save();return statusAnswer(hq,history.counts);}
 const routineName=routinesLib.parseRoutine(data.text);if(routineName){const rr=await routinesLib.runRoutine(settings,routineName);if(rr.status==='not-found')return 'No routine named '+routineName+'. Create it in the Routines tool first.';for(const _ of rr.launched)history.record('app-open');history.record('chat-turn');save();const parts=[];if(rr.launched.length)parts.push('Launch requested from Windows for: '+rr.launched.join(', '));if(rr.problems.length)parts.push('Skipped: '+rr.problems.join(', '));return parts.join('. ')||'Nothing launched.';}
 const messages=[{role:'system',content:'You are a calm small Shiba desktop companion. Reply briefly in English or Tanglish using Latin letters. Be honest about limits. You cannot access files, send messages or change the computer. Installed-app launch requests are handled by a separate fixed local path, not by your reply. Never claim you opened an app or ran a command. Personality: '+(settings.personality||'cheeky')+'. You keep no memory of the user\'s past activity in this conversation: never claim the user did anything in the past, never cite counts or history. Factual teasing about pet actions comes from a separate fixed local path, not from you.'},{role:'user',content:data.text}];let r;
 if(data.mode==='cloud'){if(!data.consent)throw Error('Confirm sending this message to the cloud.');if(!cloudKey)throw Error('Add your own OpenRouter key locally first.');r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+cloudKey,'Content-Type':'application/json'},body:JSON.stringify({model:freeModel('openrouter/free'),messages,max_tokens:180,provider:{data_collection:'deny',allow_fallbacks:false}}),signal:AbortSignal.any([chatSignal,AbortSignal.timeout(45000)])});}
 else {r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:settings.ollamaModel||'qwen3:1.7b',messages,stream:false,think:false,options:{num_ctx:2048,num_predict:180}}),signal:AbortSignal.any([chatSignal,AbortSignal.timeout(90000)])});}
 if(!r.ok)throw Error('Brain request failed ('+r.status+'). No paid fallback was attempted.');const a=await r.json();history.record('chat-turn');save();return a.message?.content||a.choices?.[0]?.message?.content||'No reply returned.';});
});
app.on('before-quit',()=>voiceBackend.cancel());
app.on('window-all-closed',()=>app.quit());

