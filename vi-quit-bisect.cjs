// Quit-wedge bisect probe: early quit (700ms) + OS-level liveness verdict.
// Also reports whether before-quit fired (via evaluate-injected hook).
const {_electron:electron}=require('playwright');
const {execSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function alivePid(pid){try{const out=execSync('tasklist /FI "PID eq '+pid+'" /NH',{stdio:['ignore','pipe','ignore']}).toString();return out.includes(String(pid));}catch{return false;}}
(async()=>{
 const cfg=['SHIBA_NO_LOOPS','SHIBA_NO_SCOUT','SHIBA_NO_WAKE','SHIBA_NO_VOICEENGINE','SHIBA_NO_SETSHAPE'].filter(k=>process.env[k]);
 console.log('BISECT config:',cfg.length?cfg.join(','):'control');
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:process.env.SHIBA_MODELS||'/tmp/shiba-voice-lab'}});
 await app.firstWindow();
 await app.evaluate(({app:ea})=>{(globalThis.__q=[]);ea.on('before-quit',()=>globalThis.__q.push('before-quit'));ea.on('will-quit',()=>globalThis.__q.push('will-quit'));ea.on('window-all-closed',()=>globalThis.__q.push('window-all-closed'));}).catch(e=>console.log('hook inject failed:',e.message));
 await sleep(700);
 const pid=app.process()&&app.process().pid;
 console.log('BISECT quitting, pid',pid);
 try{await Promise.race([app.evaluate(({app:ea})=>{ea.quit();}),sleep(10000)]);console.log('BISECT quit call settled');}
 catch(e){console.log('BISECT quit call threw:',e.message);}
 await sleep(4000);
 const evts=await Promise.race([app.evaluate(()=>globalThis.__q).catch(()=>'ERR'),sleep(5000).then(()=>'WEDGED')]);
 console.log('BISECT quit events:',JSON.stringify(evts));
 let alive=true;
 for(let i=0;i<11;i++){await sleep(2000);if(!alivePid(pid)){alive=false;break;}}
 console.log(alive?'BISECT-HANG pid alive 25s after quit':'BISECT-PASS OS confirms exit');
 process.exit(alive?2:0);
})().catch(e=>{console.error('BISECT-ERROR',e.message);process.exit(1);});
