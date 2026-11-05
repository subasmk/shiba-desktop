// Named routines: user-defined groups of installed apps, launch-only.
// Routine membership and names come only from explicit user setup, never from the LLM.
const {readApps,selectApps,launchApp}=require('./apps.cjs');
const NAME_RE=/^[a-z0-9][a-z0-9 -]{0,39}$/i;
function listRoutines(settings){const r=settings.routines;return r&&typeof r==='object'?Object.entries(r).filter(([n,a])=>NAME_RE.test(n)&&Array.isArray(a)).map(([name,apps])=>({name,apps:apps.filter(x=>typeof x==='string').slice(0,20)})):[];
}
function saveRoutine(settings,name,appNames){
 const n=String(name||'').trim().toLowerCase();
 if(!NAME_RE.test(n))throw Error('Routine name must be 1-40 letters/numbers/spaces/hyphens.');
 const apps=(Array.isArray(appNames)?appNames:[]).map(x=>String(x).trim()).filter(Boolean).slice(0,20);
 if(!apps.length)throw Error('A routine needs at least one app name.');
 if(!settings.routines||typeof settings.routines!=='object')settings.routines={};
 settings.routines[n]=[...new Set(apps)];
 return {name:n,apps:settings.routines[n]};
}
function deleteRoutine(settings,name){const n=String(name||'').trim().toLowerCase();if(settings.routines&&settings.routines[n]){delete settings.routines[n];return true;}return false;}
// Launch-only: resolve each stored name against the CURRENT installed catalog, exact single match required.
async function runRoutine(settings,name){
 const n=String(name||'').trim().toLowerCase();
 const r=listRoutines(settings).find(x=>x.name===n);
 if(!r)return {status:'not-found',name:n};
 let catalog;try{catalog=await readApps();}catch(e){return {status:'done',name:n,launched:[],problems:[e.message]};}
 const launched=[],problems=[];
 for(const appName of r.apps){
  const matches=selectApps(catalog,appName);
  if(matches.length!==1){problems.push(appName+(matches.length?' (ambiguous)':' (not installed)'));continue;}
  try{const res=await launchApp(matches[0].token);launched.push(res.name);}catch(e){problems.push(appName+' ('+e.message+')');}
 }
 return {status:'done',name:n,launched,problems};
}
// Chat command: "start morning routine" / "morning routine start pannu". Returns routine name or null.
function parseRoutine(text){
 const t=String(text).trim();
 let m=t.match(/^(?:start|run|launch|open)\s+(?:my\s+)?(.{1,40}?)\s+routine[.!?]?$/i);
 if(!m)m=t.match(/^(.{1,40}?)\s+routine\s+(?:start|run|open)\s*(?:pannu|panra|pannunga)[.!?]?$/i);
 return m?m[1].trim().toLowerCase():null;
}
module.exports={listRoutines,saveRoutine,deleteRoutine,runRoutine,parseRoutine};
