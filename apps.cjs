// No shell expansion, arbitrary paths or model-generated command execution.
const {execFile}=require('node:child_process');
const crypto=require('node:crypto');
const {scoreElement,normalize:fpNormalize}=require('./fast-pick.cjs');
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
// The catalog is scanned once and reused: a launch used to pay a full
// PowerShell Get-StartApps scan (seconds) on EVERY call. The cache lives
// for CATALOG_TTL_MS, concurrent callers share one in-flight scan, and a
// not-found launch forces exactly one fresh scan before giving up (the
// app may have just been installed). Tokens stay valid while the cached
// scan is the latest scan, which the cache guarantees.
let catalogAt=0,catalogInflight=null;
const CATALOG_TTL_MS=5*60*1000;
function getCatalog(force=false){
 if(!force&&catalog.length&&Date.now()-catalogAt<CATALOG_TTL_MS)return Promise.resolve(catalog);
 if(catalogInflight)return catalogInflight;
 catalogInflight=scanCatalog().then(c=>{catalogAt=Date.now();catalogInflight=null;return c;},e=>{catalogInflight=null;throw e;});
 return catalogInflight;
}
function warmCatalog(){return getCatalog().catch(()=>null);}
// Shorthands people actually say, mapped to the real catalog name. An
// alias only fires when an entry with that exact name is installed.
const APP_ALIASES={'vs code':'visual studio code','vscode':'visual studio code','ms word':'microsoft word','ms excel':'microsoft excel','ms powerpoint':'microsoft powerpoint','ppt':'microsoft powerpoint','obs':'obs studio'};
// Scored matching (same scale as fast-pick): a single clear winner at 60+
// launches; a tie at the top stays ambiguous, exactly like selectApps.
function matchApps(items,query){
 const q=String(query||'').trim();if(!q||q.length>100)return{status:'not-found',choices:[]};
 const alias=APP_ALIASES[fpNormalize(q)];
 const scored=[];
 for(const it of items||[]){if(!it||typeof it.name!=='string')continue;let s=scoreElement(it.name,q);if(alias&&fpNormalize(it.name)===alias)s=100;if(s>=60)scored.push({app:it,score:s});}
 if(!scored.length)return{status:'not-found',choices:[]};
 scored.sort((x,y)=>y.score-x.score);
 const best=scored[0],ties=scored.filter(x=>x.score===best.score);
 if(ties.length>1)return{status:'ambiguous',choices:ties.slice(0,10).map(x=>x.app.name)};
 return{status:'match',app:best.app,score:best.score};
}
// Public app list for pickers: names + launch tokens only, never AppIDs.
function readApps(){return getCatalog().then(c=>c.map(({name,token})=>({name,token})));}
// Full catalog rows (name, AppID, token) for the notch: main needs the
// AppID to ask Electron for the app's real icon. Same scan, same catalog;
// tokens are per-scan, so callers must launch through the latest scan.
function readAppCatalog(){return getCatalog().then(c=>c.map(({name,id,token})=>({name,id,token})));}
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
async function launchByName(query){let m=matchApps(await getCatalog(),query);if(m.status==='not-found')m=matchApps(await getCatalog(true),query);if(m.status!=='match')return{status:m.status,choices:m.choices};return launchApp(m.app.token);}
module.exports={readApps,readAppCatalog,launchApp,selectApps,parseLaunch,launchByName,buildRunningAppsScript,parseRunningApps,readRunningApps,getCatalog,warmCatalog,matchApps};
