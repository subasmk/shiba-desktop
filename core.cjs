const { URL }=require('node:url');
function safeWeb(value){const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Use a normal web address.');return u.href;}
function localUrl(value){const u=new URL(safeWeb(value));if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('Only a local laptop address is allowed.');return u;}
function freeModel(value){if(value!=='openrouter/free'&&!/^[a-zA-Z0-9_./-]+:free$/.test(value))throw Error('Only free cloud models are allowed.');return value;}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function petPosition(x,y,area){return {x:Math.round(clamp(x,area.x,area.x+area.width-120)),y:Math.round(clamp(y,area.y,area.y+area.height-130))};}
module.exports={safeWeb,localUrl,freeModel,clamp,petPosition};
