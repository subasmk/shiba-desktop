const {fork}=require('node:child_process'),path=require('node:path');
class VoiceBackend{
 constructor(models){this.models=models;this.pending=new Map();this.serial=0;}
 ensure(){if(this.child)return;const child=this.child=fork(path.join(__dirname,'voice-worker.cjs').replace(/app\.asar(?!\.unpacked)/,'app.asar.unpacked'),[],{execArgv:['--expose-gc'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1',SHIBA_MODELS:this.models},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});child.stderr.on('data',()=>{});child.on('message',m=>{const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);});child.on('exit',()=>{if(this.child!==child)return;this.child=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Local voice stopped.'));}this.pending.clear();});}
 call(type,data={}){this.ensure();return new Promise((resolve,reject)=>{const id=++this.serial;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Local voice timed out.'));},45000);this.pending.set(id,{resolve,reject,timer});this.child.send({id,type,...data});});}
 cancel(){if(this.child){const old=this.child;this.child=null;old.kill();}for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Voice turn cancelled.'));}this.pending.clear();}
}
module.exports={VoiceBackend};
