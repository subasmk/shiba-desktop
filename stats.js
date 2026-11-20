'use strict';
let cpuPct=null,ramPct=null,batteryPct=null;
function draw(){const root=document.getElementById('pill');root.replaceChildren();for(const [name,value] of [['CPU',cpuPct],['RAM',ramPct],['BATTERY',batteryPct]]){const cell=document.createElement('span'),label=document.createElement('small'),val=document.createElement('b');label.textContent=name;val.textContent=value==null?'--':Math.round(value)+'%';cell.append(label,val);root.append(cell);}root.setAttribute('aria-label','System stats: '+[['CPU',cpuPct],['RAM',ramPct],['Battery',batteryPct]].map(([k,v])=>k+' '+(v==null?'unavailable':Math.round(v)+' percent')).join(', '));}
window.petAPI.on('stats-state',d=>{if(!d)return;cpuPct=Number.isFinite(d.cpuPct)?d.cpuPct:null;ramPct=Number.isFinite(d.ramPct)?d.ramPct:null;draw();});
if(navigator.getBattery)navigator.getBattery().then(b=>{const update=()=>{batteryPct=Number.isFinite(b.level)?b.level*100:null;draw();};b.addEventListener('levelchange',update);update();}).catch(()=>{});
draw();
