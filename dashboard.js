// Rex settings dashboard: a separate normal window for setup and settings.
// Every control maps to a real setting or IPC already used by the top panel;
// statuses are read live, nothing is simulated.
const api=window.petAPI;const $=s=>document.querySelector(s);
let state={},tab='home',setupStatus=null;
const TABS=[['home','Home'],['brain','Brain'],['voice','Voice'],['pet','Pet behavior'],['features','Features'],['privacy','Data & privacy']];
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function status(t){const n=$('#d-status');if(n)n.textContent=t;}
async function task(fn){try{await fn();}catch(e){status(e.message);}}
async function save(data){await api.call('save-settings',data);Object.assign(state,data);}
function pill(ok,yes,no){return ok?'<span class="pill ok">'+yes+'</span>':'<span class="pill warn">'+no+'</span>';}
function tg(label,sub,control){return '<div class="tg"><span class="lab">'+esc(label)+(sub?'<small>'+esc(sub)+'</small>':'')+'</span>'+control+'</div>';}
function sw(id,on){return '<input type="checkbox" class="sw" id="'+id+'"'+(on?' checked':'')+'>';}
// One-time global listeners (re-rendering tabs must not stack them).
let setupSink=null,tamilSink=null;
api.on('setup-progress',d=>{if(setupSink)setupSink(d);});
api.on('tamil-setup-progress',d=>{if(tamilSink)tamilSink(d);});
async function refreshSetup(){try{setupStatus=await api.call('setup-status');}catch{setupStatus=null;}return setupStatus;}
function gb(b){return b==null?'unknown':(b/1073741824).toFixed(1)+' GB';}
function mb(b){return b==null?'size unknown':'~'+Math.round(b/1048576)+' MB';}
function setupSummary(s){
 if(!s)return 'Could not check this laptop yet.';
 let t='RAM '+gb(s.hardware.ramBytes)+' total, '+gb(s.hardware.freeRamBytes)+' free. Brain service: '+(s.ollama.running?'running ('+((s.ollama.models||[]).join(', ')||'no models yet')+')':'not found')+'. Voice models: '+(s.voice.ready?'ready':'missing')+'.';
 if(s.sizes){const parts=[];if(!s.voice.ready)parts.push('voice models '+mb(s.sizes.whisperBytes)+' + '+mb(s.sizes.kokoroBytes));if(!s.ollama.running&&s.sizes.ollamaInstallerBytes)parts.push('Ollama installer '+mb(s.sizes.ollamaInstallerBytes));const want=s.hardware.recommendedModel;if(s.sizes.brainBytesApprox&&s.sizes.brainBytesApprox[want]&&!(s.ollama.models||[]).some(m=>m===want))parts.push('brain model '+want+' '+mb(s.sizes.brainBytesApprox[want]));if(parts.length)t+=' To download: '+parts.join('; ')+'.';}
 return t;
}
function shell(){
 document.querySelector('#dash').innerHTML='<nav class="side"><h1><span class="dot"></span>Rex</h1>'+TABS.map(([k,n])=>'<button data-tab="'+k+'"'+(k===tab?' class="on"':'')+'>'+n+'</button>').join('')+'<div class="sp"></div><small>Settings live here.<br>The pet stays small.</small></nav><main class="main" id="d-main"></main>';
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
}
function render(){shell();const m=$('#d-main');
 if(tab==='home')return renderHome(m);
 if(tab==='brain')return renderBrain(m);
 if(tab==='voice')return renderVoice(m);
 if(tab==='pet')return renderPet(m);
 if(tab==='features')return renderFeatures(m);
 if(tab==='privacy')return renderPrivacy(m);
}
function greet(){const n=(state.userName||'').trim();return '<h2>Hi'+(n?' '+esc(n):'')+'.</h2><div class="sub">Setup, brain, voice and pet settings in one window. The pet stays on top.</div>';}
function renderHome(m){
 const s=setupStatus;
 const brainLocal=state.ollamaModel?esc(state.ollamaModel):'not set up yet';
 m.innerHTML=greet()+'<div class="grid">'
 +'<div class="card"><h3>Setup</h3><p class="desc">One click installs the local brain and voice</p><p class="desc" id="d-setup-sum">'+(s?esc(setupSummary(s)):'Checking this laptop...')+'</p><div class="row"><button class="act" id="d-setup-go">Run setup</button><button class="act ghost hidden" id="d-setup-cancel">Cancel</button></div><div class="bar hidden" id="d-setup-bar"><i></i></div><div class="reply hidden" id="d-setup-prog"></div></div>'
 +'<div class="card"><h3>Brain</h3><p class="desc">Local first, free cloud only if you switch it on</p>'
 +tg('Local model',state.ollamaModel?brainLocal+', runs on this laptop':'picked during setup',(state.ollamaModel?'<span class="pill ok">set</span>':'<span class="pill off">not yet</span>'))
 +tg('Free cloud (OpenRouter)',state.hasCloudKey?'your key is saved on this device':'no key saved',(state.hasCloudKey?'<span class="pill ok">on</span>':'<span class="pill off">off</span>'))
 +'<div class="tg"><button class="linkish" data-go="brain">Open Brain settings</button></div></div>'
 +'<div class="card"><h3>Voice</h3><p class="desc">Rex can talk and listen, mic stays off by default</p>'
 +tg('Voice replies','reads brain replies aloud',(state.voice?'<span class="pill ok">on</span>':'<span class="pill off">off</span>'))
 +tg('Voice input','push to talk in the top panel','')
 +tg('Wake word "Hey Rex"','off until you enable it',(state.wakeWord?'<span class="pill ok">on</span>':'<span class="pill off">off</span>'))
 +'<div class="tg"><button class="linkish" data-go="voice">Open Voice settings</button></div></div>'
 +'<div class="card"><h3>Pet behavior</h3><p class="desc">How Rex moves and reacts</p>'
 +tg('Roaming','',sw('h-roam',!!state.roaming))
 +tg('Perch on windows','',sw('h-perch',state.perch!==false))
 +tg('Cursor play','',sw('h-cursor',!!state.cursorPlay))
 +tg('Proactive comments','',sw('h-proactive',!!state.proactive))
 +'</div></div><div class="status" id="d-status" role="status"></div>';
 m.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{tab=b.dataset.go;render();});
 const bind=(id,key,invert)=>{const n=$(id);n.onchange=()=>task(async()=>{await save({[key]:n.checked});status('Saved.');});};
 bind('#h-roam','roaming');bind('#h-perch','perch');bind('#h-cursor','cursorPlay');bind('#h-proactive','proactive');
 const go=$('#d-setup-go'),cancel=$('#d-setup-cancel'),bar=$('#d-setup-bar'),prog=$('#d-setup-prog');
 go.onclick=()=>task(async()=>{
  go.disabled=true;cancel.classList.remove('hidden');prog.classList.remove('hidden');bar.classList.remove('hidden');
  setupSink=d=>{prog.textContent=d.stage+(d.pct!=null?' '+d.pct+'%':'');bar.firstElementChild.style.width=(d.pct||0)+'%';};
  cancel.onclick=()=>{api.call('setup-cancel');};
  try{const r=await api.call('setup-run');prog.textContent='Setup complete. Brain: '+r.model+'. Voice models: '+(r.voice.ready?'ready':'missing')+'.';bar.firstElementChild.style.width='100%';}
  finally{setupSink=null;go.disabled=false;cancel.classList.add('hidden');await refreshSetup();$('#d-setup-sum').textContent=setupSummary(setupStatus);}
 });
 if(!s)refreshSetup().then(()=>{const el=$('#d-setup-sum');if(el)el.textContent=setupSummary(setupStatus);});
}
function renderBrain(m){
 m.innerHTML='<h2>Brain</h2><div class="sub">Local Ollama by default. Cloud replies need your own key and a per-message consent tick in the panel; the key never leaves this device except to its own provider.</div>'
 +'<div class="card"><h3>Local model</h3><p class="desc">Runs on this laptop through Ollama. The model must already be installed; setup picks one for your RAM.</p><div class="row"><input type="text" id="d-model" aria-label="Local model" placeholder="qwen3:1.7b"><button class="act" id="d-save-model">Save</button></div><div class="row"><button class="act ghost" id="d-check-models">Check installed models</button></div></div>'
 +'<div class="card"><h3>Free cloud (OpenRouter)</h3><p class="desc">Opt-in. A message leaves the laptop only when you tick consent and send. Free router only, no paid fallback, availability not guaranteed. Save an empty field to remove the key.</p><div class="row"><input type="password" id="d-key" autocomplete="off" placeholder="'+(state.hasCloudKey?'Key saved on this device - type to replace':'Your OpenRouter key')+'"><button class="act" id="d-save-key">Save / clear</button></div></div>'
 +'<div class="card"><h3>Groq cloud</h3><p class="desc">Opt-in, same consent rule as the free cloud. No paid fallback.</p><div class="row"><input type="password" id="d-groq-key" autocomplete="off" placeholder="'+(state.hasGroqKey?'Key saved on this device - type to replace':'Your Groq key')+'"><button class="act" id="d-save-groq-key">Save / clear</button></div><div class="row"><input type="text" id="d-groq-model" aria-label="Groq model" placeholder="llama-3.3-70b-versatile"><button class="act ghost" id="d-save-groq-model">Save model</button></div></div>'
 +'<div class="status" id="d-status" role="status"></div>';
 $('#d-model').value=state.ollamaModel||'';$('#d-groq-model').value=state.groqModel||'';
 $('#d-save-model').onclick=()=>task(async()=>{await save({ollamaModel:$('#d-model').value.trim()});status('Local model saved. It must already be installed in Ollama.');});
 $('#d-check-models').onclick=()=>task(async()=>status('Installed local models: '+(await api.call('models')).join(', ')));
 $('#d-save-key').onclick=()=>task(async()=>{await api.call('cloud-key',$('#d-key').value);state=await api.call('get-state');$('#d-key').value='';status(state.hasCloudKey?'Key saved securely on this device.':'Key removed.');});
 $('#d-save-groq-key').onclick=()=>task(async()=>{await api.call('groq-key',$('#d-groq-key').value);const st=await api.call('get-state');state=st;$('#d-groq-key').value='';status(state.hasGroqKey?'Groq key saved securely on this device.':'Groq key removed.');});
 $('#d-save-groq-model').onclick=()=>task(async()=>{await save({groqModel:$('#d-groq-model').value.trim()});status('Groq model saved.');});
}
function renderVoice(m){
 m.innerHTML='<h2>Voice</h2><div class="sub">Speech is recognized and spoken on this laptop. The microphone is off unless you start a voice session in the top panel.</div>'
 +'<div class="card"><h3>Speaking</h3>'
 +tg('Voice replies','reads brain replies aloud',sw('v-replies',!!state.voice))
 +'<label class="plain">Voice engine</label><div class="row"><select id="v-engine" aria-label="Voice engine"><option value="kokoro">Kokoro (local, default)</option><option value="system">System voice</option><option value="chatterbox">Chatterbox cloned voice (sidecar)</option></select></div>'
 +'<div id="v-cb" class="hidden"><div class="row"><input type="text" id="v-cb-command" aria-label="Chatterbox sidecar command" placeholder="Chatterbox command"></div><div class="row"><input type="text" id="v-cb-args" aria-label="Chatterbox sidecar arguments" placeholder="Chatterbox arguments"></div></div>'
 +'<label class="plain">Voice language</label><div class="row"><select id="v-lang" aria-label="Voice language"><option value="en">English (Kokoro)</option><option value="ta">Tamil (experimental)</option><option value="tanglish">Tanglish (experimental)</option></select></div><p class="desc">Tamil and Tanglish use the experimental local Tamil voice; picking either downloads its model automatically (one-time, about 150 MB, public sources, checksum-verified). If it is missing or fails, the pet falls back to English and tells you.</p></div>'
 +'<div class="card"><h3>Listening</h3>'
 +tg('Wake word "Hey Rex"','starts a voice call when you say it; the mic then listens only for that phrase, and Ctrl+Shift+M mutes it instantly',sw('v-wake',!!state.wakeWord))
 +'</div><div class="status" id="d-status" role="status"></div>';
 $('#v-replies').onchange=()=>task(async()=>{await save({voice:$('#v-replies').checked});status('Saved.');});
 $('#v-engine').value=state.voiceEngine||'kokoro';$('#v-cb-command').value=state.chatterboxCommand||'';$('#v-cb-args').value=typeof state.chatterboxArgs==='string'?state.chatterboxArgs:'';
 const cbVis=()=>{$('#v-cb').classList.toggle('hidden',$('#v-engine').value!=='chatterbox');};cbVis();
 $('#v-engine').onchange=()=>task(async()=>{cbVis();await save({voiceEngine:$('#v-engine').value,chatterboxCommand:$('#v-cb-command').value,chatterboxArgs:$('#v-cb-args').value});status('Voice engine saved.');});
 $('#v-cb-command').onchange=$('#v-cb-args').onchange=()=>task(async()=>{await save({chatterboxCommand:$('#v-cb-command').value,chatterboxArgs:$('#v-cb-args').value});status('Chatterbox sidecar saved.');});
 $('#v-lang').value=state.voiceLang||'en';
 $('#v-lang').onchange=()=>task(async()=>{const lang=$('#v-lang').value;await save({voiceLang:lang});status('Voice language: '+lang);
  if(lang==='ta'||lang==='tanglish'){const st=await api.call('tamil-setup-status');if(st&&st.ready){status('Tamil voice is ready.');return;}status('Downloading the Tamil voice - one-time, about 150 MB. The pet uses English until this finishes.');tamilSink=p=>{const pct=p.total?Math.round(100*p.bytes/p.total)+'%':Math.round(p.bytes/1048576)+' MB';status('Downloading Tamil voice: '+p.step+' '+pct);};try{const r=await api.call('tamil-setup-run');if(r&&r.ok)status('Tamil voice ready.');else status('Tamil voice download is already running.');}catch(e){status('Tamil voice download failed: '+e.message+' Falling back to English for now.');}finally{tamilSink=null;}}});
 $('#v-wake').onchange=()=>task(async()=>{await save({wakeWord:$('#v-wake').checked});status($('#v-wake').checked?'Wake word on: say "Hey Rex" to start a call.':'Wake word off.');});
}
function renderPet(m){
 m.innerHTML='<h2>Pet behavior</h2><div class="sub">How Rex moves, reacts and talks. Friendly teasing uses only pet-local action counts, never your laptop activity.</div>'
 +'<div class="card"><h3>Movement</h3>'
 +tg('Roaming','the pet wanders the desktop while idle',sw('p-roam',!!state.roaming))
 +tg('Perch on windows','while roaming, the pet may sit on the front window title bar',sw('p-perch',state.perch!==false))
 +tg('Cursor play','while roaming, the pet may chase your cursor for a few seconds',sw('p-cursor',!!state.cursorPlay))
 +'</div><div class="card"><h3>Personality</h3><p class="desc">Reply style for chat and comments.</p><div class="row"><button class="act ghost" data-personality="calm">Calm</button><button class="act ghost" data-personality="playful">Playful</button><button class="act ghost" data-personality="cheeky">Cheeky</button></div><p class="desc" id="p-current"></p>'
 +tg('Proactive comments','the pet occasionally speaks up, from local signals only, with quiet hours and daily caps',sw('p-proactive',!!state.proactive))
 +'</div><div class="status" id="d-status" role="status"></div>';
 $('#p-current').textContent='Current: '+(state.personality||'cheeky');
 const bind=(id,key)=>{const n=$(id);n.onchange=()=>task(async()=>{await save({[key]:n.checked});status('Saved.');});};
 bind('#p-roam','roaming');bind('#p-perch','perch');bind('#p-cursor','cursorPlay');bind('#p-proactive','proactive');
 m.querySelectorAll('[data-personality]').forEach(b=>b.onclick=()=>task(async()=>{await save({personality:b.dataset.personality});$('#p-current').textContent='Current: '+b.dataset.personality;status('Personality: '+b.dataset.personality);}));
}
function renderFeatures(m){
 m.innerHTML='<h2>Features</h2><div class="sub">Every feature here is off unless you switch it on; toggles save instantly and nothing switches itself on.</div>'
 +'<div class="card"><h3>Awareness</h3>'
 +tg('Context awareness','notices which app is in front; needed for vision comments and perching',sw('f-context',!!state.contextAware))
 +tg('Vision comments','a local vision model describes the screen so the pet can react to what changed',sw('f-vision',!!state.contextVision))
 +'<label class="plain">Vision model</label><div class="row"><input type="text" id="f-vision-model" placeholder="moondream (light) - or qwen2.5vl:7b (sharper, gaming GPU)"></div>'
 +'<label class="plain">Vision check every (seconds, 30-300)</label><div class="row"><input type="number" id="f-vision-interval" min="30" max="300" step="10"></div>'
 +'</div><div class="card"><h3>Assistant features (all opt-in)</h3>'
 +tg('News scout','occasionally offers one fresh AI/tech headline; clicking the pet bubble opens just that link',sw('f-scout',!!state.scout))
 +tg('Web tools','allow "search the web for ..." and "fetch https://..." commands in chat',sw('f-web',!!state.webTools))
 +tg('Power mode','allow "run command: ..." and file tools in chat - every command needs your yes, dangerous commands are refused, files stay inside your home/Documents',sw('f-power',!!state.powerMode))
 +'</div><div class="status" id="d-status" role="status"></div>';
 const bind=(id,key)=>{const n=$(id);n.onchange=()=>task(async()=>{await save({[key]:n.checked});status('Saved.');});};
 bind('#f-context','contextAware');bind('#f-vision','contextVision');bind('#f-scout','scout');bind('#f-web','webTools');bind('#f-power','powerMode');
 $('#f-vision-model').value=state.visionModel||'moondream';$('#f-vision-model').onchange=()=>task(async()=>{await save({visionModel:$('#f-vision-model').value.trim()||'moondream'});status('Vision model saved.');});
 $('#f-vision-interval').value=state.visionIntervalSec||60;$('#f-vision-interval').onchange=()=>task(async()=>{await save({visionIntervalSec:Math.min(300,Math.max(30,Number($('#f-vision-interval').value)||60))});status('Vision interval saved.');});
}
function renderPrivacy(m){
 m.innerHTML='<h2>Data &amp; privacy</h2><div class="sub">What stays here and what can leave.</div>'
 +'<div class="card"><h3>On this laptop</h3><p class="desc">Settings, pet action counts, anything you ask Rex to remember, and your API keys stay on this device. Keys are saved with the operating system secure storage. The app never sends them anywhere except to their own provider when you use that provider.</p>'
 +'<div class="row"><button class="act ghost" id="d-clear-history">Clear pet action memory</button></div></div>'
 +'<div class="card"><h3>Leaving this laptop</h3><p class="desc">A chat message leaves only when you pick a cloud brain in the panel and tick consent for that message. Web tools fetch only the address or search you type. News scout downloads public headlines only. Everything else is local.</p></div>'
 +'<div class="card"><h3>Diagnostics</h3><p class="desc">Checks the local brain, voice models and features. The report is saved as diagnostics.json in the app data folder on this laptop.</p><div class="row"><button class="act ghost" id="d-selftest">Run diagnostics</button></div><div class="reply hidden" id="d-selftest-out"></div></div>'
 +'<div class="status" id="d-status" role="status"></div>';
 $('#d-clear-history').onclick=()=>task(async()=>{await api.call('clear-history');status('Pet action memory cleared.');});
 $('#d-selftest').onclick=()=>task(async()=>{let mic='unknown';try{const devs=await navigator.mediaDevices.enumerateDevices();mic=devs.some(d=>d.kind==='audioinput')?'ok':'no-device';}catch{mic='denied';}
  const r=await api.call('selftest-run',{mic});const out=$('#d-selftest-out');out.classList.remove('hidden');out.textContent=r.text;status('Diagnostics: '+r.report.summary.pass+' pass, '+r.report.summary.warn+' warnings, '+r.report.summary.fail+' failures.');});
}
task(async()=>{state=await api.call('get-state');render();});
