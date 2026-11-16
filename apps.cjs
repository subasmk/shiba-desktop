// No shell expansion, arbitrary paths or model-generated command execution.
const {execFile}=require('node:child_process');
const crypto=require('node:crypto');
let catalog=[];
function normalize(s){return String(s).normalize('NFKC').trim().toLocaleLowerCase();}
function selectApps(items,query){const q=normalize(query);if(!q||q.length>100)return [];const exact=items.filter(x=>normalize(x.name)===q);return exact.length?exact:items.filter(x=>normalize(x.name).includes(q));}
function scanCatalog(){return new Promise((resolve,reject)=>{
 if(process.platform!=='win32')return reject(Error('Installed-app launching requires Windows.'));
 execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();@(Get-StartApps | Select-Object Name,AppID) | ConvertTo-Json -Compress"],{windowsHide:true,timeout:12000,maxBuffer:1024*1024,encoding:'utf8'},(e,out)=>{
 if(e)return reject(Error('Could not read Windows Start menu. No app was started.'));
 try{const rows=JSON.parse(out.replace(/^﻿/,''));catalog=(Array.isArray(rows)?rows:[rows]).filter(r=>typeof r.Name==='string'&&typeof r.AppID==='string'&&r.AppID.length<1024&&!/[\x00-\x1f]/.test(r.AppID)).slice(0,2000).map(r=>({name:r.Name.slice(0,200),id:r.AppID,token:crypto.randomBytes(16).toString('hex')}));resolve(catalog);}catch{reject(Error('Windows app list was unreadable. No app was started.'));}
 });
});}
// Public app list for pickers: names + launch tokens only, never AppIDs.
function readApps(){return scanCatalog().then(c=>c.map(({name,token})=>({name,token})));}
// Full catalog rows (name, AppID, token) for the notch: main needs the
// AppID to ask Electron for the app's real icon. Same scan, same catalog;
// tokens are per-scan, so callers must launch through the latest scan.
function readAppCatalog(){return scanCatalog().then(c=>c.map(({name,id,token})=>({name,id,token})));}
function launchApp(token){return new Promise((resolve,reject)=>{
 const app=catalog.find(a=>a.token===token);if(!app)return reject(Error('Choose an app from the current installed list.'));
 // Explorer resolves the exact catalog identity, never a free-form executable or arguments.
 execFile('explorer.exe',['shell:AppsFolder\\'+app.id],{windowsHide:true,timeout:10000,shell:false},e=>{
 if(e)return reject(Error('Windows did not accept the launch request.'));
 resolve({name:app.name,status:'launch-requested'}); // Do not claim window existence without verification.
 });
});}
function parseLaunch(text){const t=String(text).trim();let m=t.match(/^(?:open|launch|start)\s+(.{1,100}?)(?:\s+app)?[.!?]?$/i);if(!m)m=t.match(/^(.{1,100}?)\s+(?:app\s+)?open\s+(?:pannu|panra|pannunga)[.!?]?$/i);return m?m[1].trim():null;}
// Running process names (for workflow app-launch triggers). One fixed
// PowerShell script, same execFile pattern as readApps; names only, no
// paths or arguments. execFileFn/platform injectable for tests; rejects
// off Windows so callers can distinguish "unknown" from "none running".
function buildRunningAppsScript(){return "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();@(Get-Process | Group-Object ProcessName | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress";}
function parseRunningApps(out){try{const rows=JSON.parse(String(out).replace(/^﻿/,'').trim());const list=Array.isArray(rows)?rows:[rows];return [...new Set(list.filter(x=>typeof x==='string'&&x).map(x=>x.slice(0,120)))];}catch{return null;}}
function readRunningApps(execFileFn=execFile,platform=process.platform){return new Promise((resolve,reject)=>{
 if(platform!=='win32')return reject(Error('Running-app detection requires Windows.'));
 execFileFn('powershell.exe',['-NoProfile','-NonInteractive','-Command',buildRunningAppsScript()],{windowsHide:true,timeout:12000,maxBuffer:1024*1024,encoding:'utf8'},(e,out)=>{
 if(e)return reject(Error('Could not read the running app list.'));
 const names=parseRunningApps(out);if(!names)return reject(Error('Running app list was unreadable.'));
 resolve(names);
 });
});}
async function launchByName(query){const apps=await readApps(),matches=selectApps(apps,query);if(matches.length!==1)return{status:matches.length?'ambiguous':'not-found',choices:matches.slice(0,10).map(a=>a.name)};return launchApp(matches[0].token);}
module.exports={readApps,readAppCatalog,launchApp,selectApps,parseLaunch,launchByName,buildRunningAppsScript,parseRunningApps,readRunningApps};
