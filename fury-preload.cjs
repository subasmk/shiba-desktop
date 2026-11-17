const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('furyAPI',{cancel:()=>ipcRenderer.send('fury-cancel'),onInit:fn=>ipcRenderer.on('fury-init',(_,x)=>fn(x)),onState:fn=>ipcRenderer.on('fury-state',(_,x)=>fn(x))});
