const fs=require('node:fs');const path=require('node:path');
// First-launch diagnostics: milestones and errors for one launch, written to
// userData/startup.log. The previous launch is rotated to startup-prev.log.
// Never throws: logging must never break the app it observes.
function createStartupLog(dir){
  const file=path.join(dir,'startup.log');
  try{fs.mkdirSync(dir,{recursive:true});}catch{}
  try{if(fs.existsSync(file))fs.renameSync(file,path.join(dir,'startup-prev.log'));}catch{}
  const t0=Date.now();
  function log(event,details){
    let extra='';
    if(details!==undefined){try{extra=' '+JSON.stringify(details);}catch{extra=' "unserializable"';}}
    const line=new Date().toISOString()+' +'+(Date.now()-t0)+'ms '+event+extra+'\n';
    try{fs.appendFileSync(file,line);}catch{}
    try{console.log('[startup]',event,extra.trim());}catch{}
  }
  return {log,path:file};
}
module.exports={createStartupLog};
