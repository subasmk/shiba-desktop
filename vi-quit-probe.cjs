// Bounded quit-path probe v6: OS-level verdict, immune to CDP teardown semantics.
// Quits via app.quit(), then polls the OS (tasklist by PID) for up to 25s.
// PROBE-PASS only when the OS says the process is gone.
const {_electron:electron}=require('playwright');
const {execSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function alivePid(pid){try{const out=execSync('tasklist /FI "PID eq '+pid+'" /NH',{stdio:['ignore','pipe','ignore']}).toString();return out.includes(String(pid));}catch{return false;}}
(async()=>{
 const variant=process.env.PROBE_VARIANT||'early';
 const app=await electron.launch({args:['--no-sandbox','.'],env:{...process.env,SHIBA_MODELS:process.env.SHIBA_MODELS||'/tmp/shiba-voice-lab'}});
 const t0=Date.now();
 await app.firstWindow();
 const waitMs=variant==='early'?600:8000;
 await sleep(waitMs);
 const pid=app.process()&&app.process().pid;
 console.log('PROBE quitting at',Date.now()-t0,'ms variant',variant,'pid',pid);
 try{await Promise.race([app.evaluate(({app:ea})=>{ea.quit();}),sleep(10000)]);console.log('PROBE quit call settled');}
 catch(e){console.log('PROBE quit call threw:',e.message);}
 let alive=true;
 for(let i=0;i<13;i++){await sleep(2000);if(!alivePid(pid)){alive=false;break;}}
 console.log(alive?'PROBE-HANG OS says pid alive 25s after quit, variant '+variant:'PROBE-PASS OS confirms exit, variant '+variant);
 process.exit(alive?2:0);
})().catch(e=>{console.error('PROBE-ERROR',e.message);process.exit(1);});
