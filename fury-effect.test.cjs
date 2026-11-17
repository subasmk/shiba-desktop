const {test}=require('node:test'),a=require('node:assert/strict'),{FuryEffect}=require('./fury-effect.cjs');
function setup(){let now=0;const states=[];const c=new FuryEffect({now:()=>now,onState:s=>states.push(s)});return {c,states,advance:n=>now+=n};}
test('effect ends in one-second visual blackout then automatically returns',()=>{const x=setup();a.ok(x.c.trigger());x.c.effectDone();a.equal(x.c.phase,'blackout');x.advance(999);x.c.tick();a.equal(x.c.phase,'blackout');x.advance(1);x.c.tick();a.equal(x.c.phase,'idle');});
test('cancel during effect or blackout returns immediately and enforces cooldown',()=>{for(const blackout of [false,true]){const x=setup();x.c.trigger();if(blackout)x.c.effectDone();x.c.cancel();a.equal(x.c.phase,'idle');a.equal(x.c.trigger(),false);x.advance(60000);a.ok(x.c.trigger());}});
test('late completion after cancellation cannot restart a blackout',()=>{const x=setup();x.c.trigger();x.c.cancel();x.c.effectDone();x.advance(30000);x.c.tick();a.equal(x.c.phase,'idle');});
test('overlay image decode failure cancels full controller',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const x=setup();let init,cancels=0;
 const canvas={width:0,height:0,getContext:()=>({clearRect(){}})},nodes={canvas,'#hint':{style:{}}};
 class BrokenImage{set src(value){if(value&&this.onerror)this.onerror();}}
 const api={onInit:fn=>init=fn,onState(){},cancel(){cancels++;x.c.cancel();}};
 x.c.trigger();vm.runInNewContext(fs.readFileSync(path.join(__dirname,'fury-renderer.js'),'utf8'),{document:{querySelector:k=>nodes[k],addEventListener(){}},window:{furyAPI:api,addEventListener(){}},Image:BrokenImage,innerWidth:1280,innerHeight:800});
 init({mascot:'rex',petAt:{x:0,y:0,w:180,h:180},image:'data:image/png;base64,broken'});a.equal(cancels,1);x.c.effectDone();a.equal(x.c.phase,'idle');
});
test('effect module has no process or native-power dependency',()=>{const fs=require('node:fs'),s=fs.readFileSync(require.resolve('./fury-effect.cjs'),'utf8');a.ok(!/child_process|execFile|powershell|SetSuspendState|sleep\(/.test(s));});
