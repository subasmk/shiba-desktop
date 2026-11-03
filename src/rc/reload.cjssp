const {contextBridge,ipcRenderer}=require('electron');
const send=new Set(['panel','extract','move-pet','drag-start','drag-end','dock','quit','action','drawer-size']);const invoke=new Set(['get-state','save-settings','open-tool','models','cloud-key','chat']);
contextBridge.exposeInMainWorld('petAPI',{send:(name,data)=>{if(send.has(name))ipcRenderer.send(name,data);},call:(name,data)=>invoke.has(name)?ipcRenderer.invoke(name,data):Promise.reject(Error('Not allowed')),on:(name,fn)=>{if(['panel-state','pet-state','docked'].includes(name))ipcRenderer.on(name,(_,data)=>fn(data));}});
