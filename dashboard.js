// Relay settings dashboard: a separate normal window for setup and settings.
// Every control maps to a real setting or IPC already used by the top panel;
// statuses are read live, nothing is simulated.
const api=window.petAPI;const $=s=>document.querySelector(s);
let state={},tab='home',setupStatus=null;
const TABS=[['home','Home'],['brain','Brain'],['voice','Voice'],['pet','Pet behavior'],['notes','Notes'],['features','Features'],['privacy','Data & privacy']];
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function status(t){const n=$('#d-status');if(n)n.textContent=t;}
async function task(fn){try{await fn();}catch(e){status(e.message);}}
async function save(data){await api.call('save-settings',data);Object.assign(state,data);}
function pill(ok,yes,no){return ok?'<span class="pill ok">'+yes+'</span>':'<span class="pill warn">'+no+'</span>';}
function tg(label,sub,control){return '<div class="tg"><span class="lab">'+esc(label)+(sub?'<small>'+esc(sub)+'</small>':'')+'</span>'+control+'</div>';}
function sw(id,on){return '<input type="checkbox" class="sw" id="'+id+'"'+(on?' checked':'')+'>';}
function swd(id){return '<input type="checkbox" class="sw" id="'+id+'" disabled>';}
// One-time global listeners (re-rendering tabs must not stack them).
let setupSink=null,tamilSink=null,musicSink=null;
api.on('setup-progress',d=>{if(setupSink)setupSink(d);});
api.on('dash-tab',k=>{if(TABS.some(t=>t[0]===k)&&tab!==k){tab=k;render();}});
api.on('music-state',d=>{if(musicSink)musicSink(d);});
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
 document.querySelector('#dash').innerHTML='<nav class="side" aria-label="Dashboard"><h1>RELAY<span>DESKTOP / DARU</span></h1><div class="nav-label">INDEX</div>'+TABS.map(([k,n],i)=>'<button data-tab="'+k+'"'+(k===tab?' class="on" aria-current="page"':'')+'><span class="nav-index">0'+(i+1)+'</span>'+n+'</button>').join('')+'<div class="sp"></div><div class="side-companion"><img src="vex-head.png" alt=""><strong>DARU</strong><span>LOCAL COMPANION</span></div><small class="side-foot">SETTINGS STAY ON DEVICE</small></nav><main class="main" id="d-main"><header class="page-top"><span>RELAY <b>/</b> '+esc(TABS.find(t=>t[0]===tab)[1])+'</span><span class="top-label">DESKTOP CONTROLS</span></header><div id="page-content"></div></main>';
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
}
function render(){shell();const m=$('#page-content');
 if(tab==='home')return renderHome(m);
 if(tab==='brain')return renderBrain(m);
 if(tab==='voice')return renderVoice(m);
 if(tab==='pet')return renderPet(m);
 if(tab==='notes')return renderNotes(m);
 if(tab==='features')return renderFeatures(m);
 if(tab==='privacy')return renderPrivacy(m);
}
function greet(){return '<section class="home-desk"><div class="desk-readout"><div class="eyebrow">01 / OVERVIEW</div><h2>DESKTOP<br>OPERATIONS<span class="title-period">.</span></h2>'+homeMetrics(setupStatus)+'<div class="desk-shortcuts"><button data-go="brain">Brain settings ↗</button><button data-go="voice">Voice settings ↗</button></div></div><button class="daru-peek" aria-label="Open Daru behavior settings" data-go="pet"><span class="daru-tag">DARU / ON DESKTOP DUTY</span><img src="dashboard-daru.png" alt="Daru"><span class="daru-callout">BEHAVIOR ↗</span></button></section>';}
function homeMetrics(s){return '<section class="home-metrics" aria-label="Laptop status"><div><small>01 LOCAL BRAIN</small><strong id="metric-brain">'+(s?(s.ollama.running?'RUNNING':'OFFLINE'):'CHECKING')+'</strong></div><div><small>02 VOICE MODELS</small><strong id="metric-voice">'+(s?(s.voice.ready?'READY':'NOT INSTALLED'):'CHECKING')+'</strong></div><div><small>03 FREE RAM</small><strong id="metric-ram">'+(s?esc(gb(s.hardware.freeRamBytes)):'CHECKING')+'</strong></div></section>';}
function updateHomeMetrics(){const s=setupStatus;if(!s)return;const values={'metric-brain':s.ollama.running?'RUNNING':'OFFLINE','metric-voice':s.voice.ready?'READY':'NOT INSTALLED','metric-ram':gb(s.hardware.freeRamBytes)};for(const [id,text] of Object.entries(values)){const el=document.getElementById(id);if(el)el.textContent=text;}}
function renderHome(m){
 const s=setupStatus;
 const brainLocal=state.ollamaModel?esc(state.ollamaModel):'not set up yet';
 m.innerHTML=greet()+'<div class="section-heading"><h3>TOOLS &amp; SETTINGS</h3><span>02 / CONFIGURE</span></div><div class="grid home-grid">' +'<div class="card"><h3><span class="tool-number">A.</span> LOCAL SETUP</h3><p class="desc" id="d-setup-sum">'+(s?esc(setupSummary(s)):'Checking this laptop...')+'</p><div class="row"><button class="act" id="d-setup-go">Run setup</button><button class="act ghost hidden" id="d-setup-cancel">Cancel</button></div><div class="bar hidden" id="d-setup-bar"><i></i></div><div class="reply hidden" id="d-setup-prog"></div></div>'
 +'<div class="card"><h3><span class="tool-number">B.</span> BRAIN</h3>'
 +tg('Local model',state.ollamaModel?brainLocal+', runs on this laptop':'picked during setup',(state.ollamaModel?'<span class="pill ok">set</span>':'<span class="pill off">not yet</span>'))
 +tg('Free cloud (OpenRouter)',state.hasCloudKey?'your key is saved on this device':'no key saved',(state.hasCloudKey?'<span class="pill ok">on</span>':'<span class="pill off">off</span>'))
 +'<div class="tg"><button class="linkish" data-go="brain">Open Brain settings</button></div></div>'
 +'<div class="card"><h3><span class="tool-number">C.</span> VOICE</h3>'
 +tg('Voice replies','reads brain replies aloud',(state.voice?'<span class="pill ok">on</span>':'<span class="pill off">off</span>'))
 +tg('Voice input','push to talk in the top panel','')
 +tg('Wake word "Hey Daru"','off until you enable it',(state.wakeWord?'<span class="pill ok">on</span>':'<span class="pill off">off</span>'))
 +'<div class="tg"><button class="linkish" data-go="voice">Open Voice settings</button></div></div>'
 +'<div class="card"><h3><span class="tool-number">D.</span> DARU</h3>'
 +tg('Roaming','',sw('h-roam',state.roaming!==false))
 +tg('Perch on windows','',sw('h-perch',state.perch!==false))
 +tg('Cursor play','paused for now - its art is being redrawn for the new mascot',swd('h-cursor'))
 +tg('Proactive comments','',sw('h-proactive',!!state.proactive))
 +'</div></div><div class="status" id="d-status" role="status"></div>';
 m.querySelector('.daru-peek').onpointermove=e=>{const r=e.currentTarget.getBoundingClientRect();e.currentTarget.classList.toggle('looking-right',e.clientX>r.left+r.width/2);};
 m.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{tab=b.dataset.go;render();});
 const bind=(id,key,invert)=>{const n=$(id);n.onchange=()=>task(async()=>{await save({[key]:n.checked});status('Saved.');});};
 bind('#h-roam','roaming');bind('#h-perch','perch');bind('#h-proactive','proactive');
 const go=$('#d-setup-go'),cancel=$('#d-setup-cancel'),bar=$('#d-setup-bar'),prog=$('#d-setup-prog');
 go.onclick=()=>task(async()=>{
  go.disabled=true;cancel.classList.remove('hidden');prog.classList.remove('hidden');bar.classList.remove('hidden');
  setupSink=d=>{prog.textContent=d.stage+(d.pct!=null?' '+d.pct+'%':'');bar.firstElementChild.style.width=(d.pct||0)+'%';};
  cancel.onclick=()=>{api.call('setup-cancel');};
  try{const r=await api.call('setup-run');prog.textContent='Setup complete. Brain: '+r.model+'. Voice models: '+(r.voice.ready?'ready':'missing')+'.';bar.firstElementChild.style.width='100%';}
  finally{setupSink=null;go.disabled=false;cancel.classList.add('hidden');await refreshSetup();const sum=$('#d-setup-sum');if(sum)sum.textContent=setupSummary(setupStatus);updateHomeMetrics();}
 });
 refreshSetup().then(()=>{const el=$('#d-setup-sum');if(el)el.textContent=setupSummary(setupStatus);updateHomeMetrics();});
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
 +'<label class="plain">Voice engine</label><div class="row"><select id="v-engine" aria-label="Voice engine"><option value="kokoro">Kokoro (local, default)</option><option value="system">System voice</option><option value="chatterbox">Chatterbox cloned voice (sidecar)</option><option value="fish">Fish Audio S2.1 cloned voices (cloud)</option></select></div>'
 +'<div id="v-cb" class="hidden"><div class="row"><input type="text" id="v-cb-command" aria-label="Chatterbox sidecar command" placeholder="Chatterbox command"></div><div class="row"><input type="text" id="v-cb-args" aria-label="Chatterbox sidecar arguments" placeholder="Chatterbox arguments"></div></div>'
 +'<label class="plain">Voice language</label><div class="row"><select id="v-lang" aria-label="Voice language"><option value="en">English (Kokoro)</option><option value="ta">Tamil (experimental)</option><option value="tanglish">Tanglish (experimental)</option></select></div><p class="desc">Tamil and Tanglish use the experimental local Tamil voice; picking either downloads its model automatically (one-time, about 150 MB, public sources, checksum-verified). If it is missing or fails, the pet falls back to English and tells you.</p></div>'
 +'<div class="card"><h3>Daru voice</h3><p class="desc">Choose Daru&apos;s local Kokoro voice. Tamil, system and Chatterbox use their own voices.</p><div class="row"><select id="v-voice-vex" aria-label="Daru voice"></select></div></div>'
 +'<div class="card"><h3>Fish Audio (cloud clones)</h3><p class="desc">Opt-in cloud voice (S2.1). Pick the Fish Audio engine above, then: make a free account at fish.audio, clone a voice for Daru (about 10-30 seconds of clean audio) and paste its voice ID here, and save your API key (fish.audio/app/api-keys) - stored encrypted on this device, never shown again. The s2.1-pro-free model costs nothing under fair use; s2.1-pro uses paid credit. Reply text is sent to Fish Audio to be spoken; nothing else leaves this laptop.</p>'
 +'<div class="row"><input type="password" id="v-fish-key" autocomplete="off" placeholder="'+(state.hasFishKey?'Key saved on this device - type to replace':'Your Fish Audio API key')+'"><button class="act" id="v-fish-save-key">Save / clear</button></div>'
 +'<label class="plain">Fish model</label><div class="row"><select id="v-fish-model" aria-label="Fish model"><option value="s2.1-pro-free">s2.1-pro-free (free, fair use)</option><option value="s2.1-pro">s2.1-pro (paid credit)</option></select></div>'
 +'<div class="row"><label class="plain">Daru - cloned voice ID</label><input id="v-fish-vex" aria-label="Daru Fish voice ID"><button class="act" id="v-fish-save-voices">Save voice ID</button></div></div>'
 +tg('Wake word "Hey Daru"','starts a voice call when you say it; the mic then listens only for that phrase, and Ctrl+Shift+M mutes it instantly',sw('v-wake',!!state.wakeWord))
 +tg('Hold-to-talk','hold the key anywhere to talk, release to stop; on Windows the release is read from the real key state, on other systems each press toggles',sw('v-hold',!!state.holdToTalk))
 +'<label class="plain">Hold-to-talk key (accelerator)</label><div class="row"><input type="text" id="v-hold-key" aria-label="Hold-to-talk key" placeholder="CommandOrControl+Shift+Space"></div>'
 +'</div><div class="status" id="d-status" role="status"></div>';
 $('#v-replies').onchange=()=>task(async()=>{await save({voice:$('#v-replies').checked});status('Saved.');});
 $('#v-engine').value=state.voiceEngine||'kokoro';$('#v-cb-command').value=state.chatterboxCommand||'';$('#v-cb-args').value=typeof state.chatterboxArgs==='string'?state.chatterboxArgs:'';
 const cbVis=()=>{$('#v-cb').classList.toggle('hidden',$('#v-engine').value!=='chatterbox');};cbVis();
 $('#v-engine').onchange=()=>task(async()=>{cbVis();await save({voiceEngine:$('#v-engine').value,chatterboxCommand:$('#v-cb-command').value,chatterboxArgs:$('#v-cb-args').value});status('Voice engine saved.');});
 $('#v-cb-command').onchange=$('#v-cb-args').onchange=()=>task(async()=>{await save({chatterboxCommand:$('#v-cb-command').value,chatterboxArgs:$('#v-cb-args').value});status('Chatterbox sidecar saved.');});
 $('#v-lang').value=state.voiceLang||'en';
 $('#v-lang').onchange=()=>task(async()=>{const lang=$('#v-lang').value;await save({voiceLang:lang});status('Voice language: '+lang);
  if(lang==='ta'||lang==='tanglish'){const st=await api.call('tamil-setup-status');if(st&&st.ready){status('Tamil voice is ready.');return;}status('Downloading the Tamil voice - one-time, about 150 MB. The pet uses English until this finishes.');tamilSink=p=>{const pct=p.total?Math.round(100*p.bytes/p.total)+'%':Math.round(p.bytes/1048576)+' MB';status('Downloading Tamil voice: '+p.step+' '+pct);};try{const r=await api.call('tamil-setup-run');if(r&&r.ok)status('Tamil voice ready.');else status('Tamil voice download is already running.');}catch(e){status('Tamil voice download failed: '+e.message+' Falling back to English for now.');}finally{tamilSink=null;}}});
 const VOICE_OPTS=[[0,'Heart - warm US female'],[3,'Bella - bright US female'],[7,'Nova - lively US female'],[21,'Emma - soft UK female'],[11,'Adam - steady US male'],[16,'Michael - calm US male'],[18,'Puck - playful US male'],[26,'George - mellow UK male']];
 const vbm=(state.voiceByMascot&&typeof state.voiceByMascot==='object')?state.voiceByMascot:{};
 const fillVoice=(id,pick,def)=>{const sel=$(id);sel.innerHTML=VOICE_OPTS.map(([sid,label])=>'<option value="'+sid+'"'+(sid===pick?' selected':'')+'>'+label+'</option>').join('');if(!VOICE_OPTS.some(([sid])=>sid===pick))sel.value=String(def);};
 fillVoice('#v-voice-vex',(vbm.vex&&Number.isInteger(vbm.vex.sid))?vbm.vex.sid:18,18);
 $('#v-voice-vex').onchange=()=>task(async()=>{const next={...vbm,vex:{...vbm.vex,sid:parseInt($('#v-voice-vex').value,10)}};await save({voiceByMascot:next});status('Daru voice saved.');});
 $('#v-fish-save-key').onclick=()=>task(async()=>{await api.call('fish-key',$('#v-fish-key').value);state=await api.call('get-state');$('#v-fish-key').value='';status(state.hasFishKey?'Fish Audio key saved securely on this device.':'Fish Audio key removed.');render();});
 $('#v-fish-model').value=state.fishModel||'s2.1-pro-free';
 $('#v-fish-model').onchange=()=>task(async()=>{await save({fishModel:$('#v-fish-model').value});status('Fish model saved.');});
 const ffv=(state.fishVoiceByMascot&&typeof state.fishVoiceByMascot==='object')?state.fishVoiceByMascot:{};
 $('#v-fish-vex').value=typeof ffv.vex==='string'?ffv.vex:'';
 $('#v-fish-save-voices').onclick=()=>task(async()=>{await save({fishVoiceByMascot:{...ffv,vex:$('#v-fish-vex').value.trim()}});status('Daru Fish voice ID saved.');});
 $('#v-wake').onchange=()=>task(async()=>{await save({wakeWord:$('#v-wake').checked});status($('#v-wake').checked?'Wake word on: say "Hey Daru" to start a call.':'Wake word off.');});
 $('#v-hold').onchange=()=>task(async()=>{await save({holdToTalk:$('#v-hold').checked});status($('#v-hold').checked?'Hold-to-talk on: hold the key to talk, release to stop.':'Hold-to-talk off.');});
 $('#v-hold-key').value=state.holdToTalkKey||'';$('#v-hold-key').onchange=()=>task(async()=>{await save({holdToTalkKey:$('#v-hold-key').value.trim()});status('Hold-to-talk key saved.');});
}
function renderPet(m){
 m.innerHTML='<h2>Pet behavior</h2><div class="sub">How your pet moves, reacts and talks. Friendly teasing uses only pet-local action counts, never your laptop activity.</div>'
 +'<div class="card"><h3>Movement</h3>'
 +tg('Roaming','the pet wanders the desktop while idle',sw('p-roam',state.roaming!==false))
 +tg('Perch on windows','while roaming, the pet may sit on the front window title bar',sw('p-perch',state.perch!==false))
 +tg('Cursor play','paused for now - its art is being redrawn for the new mascot',swd('p-cursor'))
 +'</div><div class="card"><h3>Pet size</h3><p class="desc">How big the pet appears on your desktop.</p><div class="row"><button class="act ghost" data-size="small">Small</button><button class="act ghost" data-size="normal">Normal</button><button class="act ghost" data-size="large">Large</button></div><p class="desc" id="s-current"></p></div><div class="card"><h3>Personality</h3><p class="desc">Daru is mischievous and friendly, with playful teasing that is never mean.</p>'
 +tg('Proactive comments','the pet occasionally speaks up, from local signals only, with quiet hours and daily caps',sw('p-proactive',!!state.proactive))
 +'</div>'
 +'<div class="card"><h3>Notch</h3><p class="desc">The bar at the top of your screen: Daru peeks over the top edge, hover opens a deck of up to 12 tiles - your real apps, actions like Mic / Do Not Disturb / routines, and live CPU / RAM tiles. Tiles are edited inside the notch itself: open it and tap the pencil. Here you only choose whether it shows, how it wakes, and whether the floating stats pill (CPU / RAM / battery, right edge of the screen) shows.</p>'
 +tg('Notch','top-of-screen bar with the pet, status pill and tile deck',sw('pt-notch',state.notch!==false))
 +tg('Stats pill','small floating CPU / RAM / battery readout at the right edge of the screen',sw('pt-notch-stats',state.notchStats!==false))
 +'<label class="plain">Notch mode</label><div class="row"><select id="pt-notch-mode" aria-label="Notch mode"><option value="always">Always - the peek tab stays visible</option><option value="hover">Hover - a thin sliver until the cursor reaches the top edge</option><option value="off">Off - no notch</option></select></div></div>'
 +'<div class="status" id="d-status" role="status"></div>';
 $('#s-current').textContent='Current: '+(state.size||'normal');
 const bind=(id,key)=>{const n=$(id);n.onchange=()=>task(async()=>{await save({[key]:n.checked});status('Saved.');});};
 bind('#p-roam','roaming');bind('#p-perch','perch');bind('#p-proactive','proactive');



 m.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>task(async()=>{await save({size:b.dataset.size});$('#s-current').textContent='Current: '+b.dataset.size;status('Pet size: '+b.dataset.size);}));
 $('#pt-notch').onchange=()=>task(async()=>{await save({notch:$('#pt-notch').checked});status($('#pt-notch').checked?'Notch on.':'Notch off.');});
 $('#pt-notch-stats').onchange=()=>task(async()=>{await save({notchStats:$('#pt-notch-stats').checked});status($('#pt-notch-stats').checked?'Stats pill on.':'Stats pill off.');});
 $('#pt-notch-mode').value=['always','hover','off'].includes(state.notchMode)?state.notchMode:'always';
 $('#pt-notch-mode').onchange=()=>task(async()=>{await save({notchMode:$('#pt-notch-mode').value});status('Notch mode saved.');});
}
function renderNotes(m){
 m.innerHTML='<h2>Notes</h2><div class="sub">Full notes, stored only on this laptop (notes.json in the app data folder). Separate from the panel quick note. Bodies are plain text and are shown escaped, never as HTML.</div>'
 +'<div class="row"><input type="text" id="n-search" placeholder="Search notes" aria-label="Search notes"></div>'
 +'<div class="grid"><div class="card"><h3>Your notes</h3><div id="n-list"></div></div>'
 +'<div class="card"><h3>Editor</h3><div class="row"><input type="text" id="n-title" placeholder="Title" aria-label="Note title"></div><textarea id="n-body" rows="12" style="width:100%" placeholder="Write the note here." aria-label="Note body"></textarea><div class="row"><button class="act" id="n-save">Save note</button><button class="act ghost" id="n-new">New</button><button class="act ghost" id="n-pin">Pin / unpin</button><button class="act ghost" id="n-del">Delete</button></div><p class="desc" id="n-meta"></p></div></div>'
 +'<div class="status" id="d-status" role="status"></div>';
 let notes=[],editing=null;
 const paint=()=>{const el=$('#n-list');el.innerHTML=notes.length?notes.map(n=>'<div class="tg"><span class="lab">'+(n.pinned?'&#128204; ':'')+esc(n.title||'Untitled')+'<small>'+esc(new Date(n.updatedAt).toLocaleString())+'</small></span><button class="act ghost" data-nopen="'+n.id+'">Open</button></div>').join(''):'<p class="desc">No notes yet.</p>';
  el.querySelectorAll('[data-nopen]').forEach(b=>b.onclick=()=>{const n=notes.find(x=>x.id===b.dataset.nopen);if(!n)return;editing=n.id;$('#n-title').value=n.title;$('#n-body').value=n.body;$('#n-meta').textContent=(n.pinned?'Pinned. ':'')+'Last edited '+new Date(n.updatedAt).toLocaleString();});};
 const load=async()=>{notes=await api.call('notes-list',{q:$('#n-search').value.trim()});paint();};
 $('#n-search').oninput=()=>task(load);
 $('#n-new').onclick=()=>{editing=null;$('#n-title').value='';$('#n-body').value='';$('#n-meta').textContent='';};
 $('#n-save').onclick=()=>task(async()=>{const r=await api.call('notes-save',{id:editing||undefined,title:$('#n-title').value,body:$('#n-body').value});editing=r.id;status('Note saved.');await load();});
 $('#n-del').onclick=()=>task(async()=>{if(!editing)return status('Open a note first.');await api.call('notes-delete',{id:editing});editing=null;$('#n-title').value='';$('#n-body').value='';$('#n-meta').textContent='';status('Note deleted.');await load();});
 $('#n-pin').onclick=()=>task(async()=>{if(!editing)return status('Open a note first.');const n=notes.find(x=>x.id===editing);const r=await api.call('notes-pin',{id:editing,pinned:!(n&&n.pinned)});status(r&&r.pinned?'Pinned.':'Unpinned.');await load();});
 task(load);
}
function renderFeatures(m){
 m.innerHTML='<h2>Features</h2><div class="sub">Every feature here is off unless you switch it on; toggles save instantly and nothing switches itself on.</div>'
 +'<div class="card"><h3>Awareness</h3>'
 +tg('Context awareness','notices which app is in front; needed for vision comments and perching',sw('f-context',!!state.contextAware))
 +tg('Vision comments','a local vision model describes the screen so the pet can react to what changed',sw('f-vision',!!state.contextVision))
 +tg('Vision pointing','ask "where is X" in chat and the pet marks it on screen with a pulsing pointer; same local vision model, screenshots never leave the laptop',sw('f-vpoint',!!state.visionPoint))
 +'<label class="plain">Try pointing: find on screen</label><div class="row"><input type="text" id="f-vpoint-q" placeholder="e.g. the settings icon"><button class="act ghost" id="f-vpoint-go">Point</button></div>'
 +'<label class="plain">Vision model</label><div class="row"><input type="text" id="f-vision-model" placeholder="moondream (light) - or qwen2.5vl:7b (sharper, gaming GPU)"></div>'
 +'<label class="plain">Vision check every (seconds, 30-300)</label><div class="row"><input type="number" id="f-vision-interval" min="30" max="300" step="10"></div>'
 +'</div><div class="card"><h3>Assistant features (all opt-in)</h3>'
 +tg('News scout','occasionally offers one fresh AI/tech headline; clicking the pet bubble opens just that link',sw('f-scout',!!state.scout))
 +tg('Web tools','allow "search the web for ..." and "fetch https://..." commands in chat',sw('f-web',!!state.webTools))
 +tg('Power mode','allow "run command: ..." and file tools in chat - every command needs your yes, dangerous commands are refused, files stay inside your home/Documents',sw('f-power',!!state.powerMode))
 +'</div><div class="card"><h3>Music</h3><p class="desc">Hidden YouTube player - audio only, its window never shows. Paste a video or playlist link to queue it. Songs imported from a screenshot arrive as titles; paste each song\'s link (Link button) before it can play.</p>'
 +'<div class="row"><input type="text" id="m-url" placeholder="YouTube video or playlist link" aria-label="YouTube link"><button class="act" id="m-add">Add</button></div>'
 +'<div class="row"><button class="act ghost" id="m-prev">Prev</button><button class="act" id="m-play">Play</button><button class="act ghost" id="m-pause">Pause</button><button class="act ghost" id="m-next">Next</button></div>'
 +'<label class="plain">Volume</label><div class="row"><input type="range" id="m-vol" min="0" max="100" step="1" aria-label="Volume"></div>'
 +'<div id="m-queue"></div>'
 +'<div class="row"><button class="act ghost" id="m-clear">Clear queue</button></div>'
 +'<label class="plain">Playlists</label><div class="row"><input type="text" id="m-pl-name" placeholder="Playlist name" aria-label="Playlist name"><button class="act ghost" id="m-pl-save">Save queue as playlist</button></div>'
 +'<div id="m-playlists"></div>'
 +'<label class="plain">Import playlist from a screenshot (uses the local vision model)</label><div class="row"><input type="file" id="m-shot" accept="image/*" aria-label="Playlist screenshot"></div>'
 +'</div><div class="card"><h3>Workflows</h3><p class="desc">Rules that run on their own. Trigger: at a time (07:30), when an app opens (its process name), after idle minutes, or on a hotkey (e.g. CommandOrControl+Shift+F9). Action: the pet says a line, launches an app, starts music, adds a note, or posts to Discord.</p>'
 +'<div id="w-list"></div>'
 +'<div class="row"><input type="text" id="w-name" placeholder="Rule name" aria-label="Workflow name"></div>'
 +'<div class="row"><select id="w-ttype" aria-label="Trigger type"><option value="at-time">At time</option><option value="app-launch">When app opens</option><option value="idle">After idle</option><option value="hotkey">On hotkey</option></select><input type="text" id="w-tval" placeholder="07:30 / app name / minutes / hotkey" aria-label="Trigger value"></div>'
 +'<div class="row"><select id="w-atype" aria-label="Action type"><option value="say">Pet says</option><option value="launch-app">Launch app</option><option value="start-music">Start music</option><option value="add-note">Add note</option><option value="discord-post">Post to Discord</option></select><input type="text" id="w-aval" placeholder="Text / app name / playlist" aria-label="Action value"></div>'
 +'<div class="row"><button class="act" id="w-add">Add workflow</button></div>'
 +'</div><div class="card"><h3>Discord</h3><p class="desc">Post to your Discord server through your own webhook (Discord: Server Settings - Integrations - Webhooks - New Webhook, then copy its address). The address is a secret: stored encrypted on this device, never shown again. In chat, "post to discord: your message" sends it; workflows can post too.</p>'
 +'<div class="row"><input type="password" id="dc-hook" autocomplete="off" placeholder="'+(state.hasDiscordWebhook?'Webhook saved on this device - type to replace':'Paste your Discord webhook address')+'"><button class="act" id="dc-save">Save / clear</button></div>'
 +'<p class="desc" id="dc-state">'+(state.hasDiscordWebhook?'Status: webhook configured.':'Status: webhook set pannala (not set yet) - nothing can post until you add one.')+'</p>'
 +'<div class="row"><input type="text" id="dc-text" placeholder="Test message" aria-label="Discord test message"><button class="act ghost" id="dc-post">Post test</button></div>'
 +'</div><div class="status" id="d-status" role="status"></div>';
 const bind=(id,key)=>{const n=$(id);n.onchange=()=>task(async()=>{await save({[key]:n.checked});status('Saved.');});};
 bind('#f-context','contextAware');bind('#f-vision','contextVision');bind('#f-vpoint','visionPoint');bind('#f-scout','scout');bind('#f-web','webTools');bind('#f-power','powerMode');
 $('#f-vpoint-go').onclick=()=>task(async()=>{const q=$('#f-vpoint-q').value.trim();if(!q)return status('Type what to find first.');status('Looking at the screen...');const r=await api.call('vision-locate',{target:q});status('Pointed at "'+q+'" ('+r.point.x+', '+r.point.y+' of 1000).');});
 $('#f-vision-model').value=state.visionModel||'moondream';$('#f-vision-model').onchange=()=>task(async()=>{await save({visionModel:$('#f-vision-model').value.trim()||'moondream'});status('Vision model saved.');});
 $('#f-vision-interval').value=state.visionIntervalSec||60;$('#f-vision-interval').onchange=()=>task(async()=>{await save({visionIntervalSec:Math.min(300,Math.max(30,Number($('#f-vision-interval').value)||60))});status('Vision interval saved.');});
 let musicState=null,linkIdx=-1;
 function paintMusic(){if(!musicState)return;const q=$('#m-queue');if(q){q.innerHTML=musicState.queue.length?musicState.queue.map((it,i)=>'<div class="tg"><span class="lab">'+(i===musicState.index?'&#9654; ':'')+esc(it.title)+'<small>'+esc(it.kind)+(it.needsLink?' - needs link':'')+'</small></span><span>'+(it.needsLink?'<button class="act ghost" data-mlink="'+i+'">Link</button>':'')+'<button class="act ghost" data-mdel="'+i+'">x</button></span></div>').join(''):'<p class="desc">Queue is empty.</p>';
  q.querySelectorAll('[data-mdel]').forEach(b=>b.onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'remove',index:Number(b.dataset.mdel)});paintMusic();}));
  q.querySelectorAll('[data-mlink]').forEach(b=>b.onclick=()=>{linkIdx=Number(b.dataset.mlink);status('Now paste the YouTube link for "'+musicState.queue[linkIdx].title+'" above and press Add.');$('#m-url').focus();});}
 const pl=$('#m-playlists');if(pl){pl.innerHTML=musicState.playlists.length?musicState.playlists.map(p=>'<div class="tg"><span class="lab">'+esc(p.name)+'<small>'+p.count+' songs</small></span><span><button class="act ghost" data-mplay="'+esc(p.name)+'">Play</button><button class="act ghost" data-mpdel="'+esc(p.name)+'">x</button></span></div>').join(''):'<p class="desc">No playlists yet.</p>';
  pl.querySelectorAll('[data-mplay]').forEach(b=>b.onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'play-playlist',name:b.dataset.mplay});paintMusic();status('Playing playlist: '+b.dataset.mplay);}));
  pl.querySelectorAll('[data-mpdel]').forEach(b=>b.onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'delete-playlist',name:b.dataset.mpdel});paintMusic();}));}
 const vol=$('#m-vol');if(vol)vol.value=musicState.volume;}
 musicSink=d=>{musicState=d;paintMusic();};
 $('#m-add').onclick=()=>task(async()=>{const url=$('#m-url').value.trim();if(!url)return status('Paste a YouTube link first.');if(linkIdx>=0){musicState=await api.call('music-control',{action:'link-title',index:linkIdx,url});status('Linked - that song can play now.');linkIdx=-1;}else{musicState=await api.call('music-control',{action:'add-url',url});status('Added to the queue.');}$('#m-url').value='';paintMusic();});
 $('#m-play').onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'play'});paintMusic();status('Playing.');});
 $('#m-pause').onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'pause'});paintMusic();});
 $('#m-next').onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'next'});paintMusic();});
 $('#m-prev').onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'prev'});paintMusic();});
 $('#m-clear').onclick=()=>task(async()=>{musicState=await api.call('music-control',{action:'clear'});paintMusic();status('Queue cleared.');});
 $('#m-vol').onchange=()=>task(async()=>{musicState=await api.call('music-control',{action:'volume',value:Number($('#m-vol').value)});});
 $('#m-pl-save').onclick=()=>task(async()=>{const name=$('#m-pl-name').value.trim();if(!name)return status('Give the playlist a name first.');musicState=await api.call('music-control',{action:'save-playlist',name});$('#m-pl-name').value='';paintMusic();status('Playlist saved: '+name);});
 $('#m-shot').onchange=()=>{const f=$('#m-shot').files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>task(async()=>{status('Reading song titles from the screenshot...');const r=await api.call('music-import-image',{image:String(rd.result).split(',')[1]||''});musicState=r.music;paintMusic();status('Imported '+r.titles.length+' songs into playlist "'+r.playlist+'" - paste a link for each title to make it playable.');});rd.readAsDataURL(f);};
 task(async()=>{musicState=await api.call('music-get-state');paintMusic();});
 let wfRules=[];
 const wfSummary=r=>{const t=r.trigger,a=r.action;const ts=t.type==='at-time'?('at '+t.time):t.type==='app-launch'?('when '+t.app+' opens'):t.type==='idle'?('after '+t.idleMinutes+' min idle'):('hotkey '+t.accelerator);const as=a.type==='say'?('say "'+a.text+'"'):a.type==='launch-app'?('launch '+a.app):a.type==='start-music'?('start music'+(a.playlist?' ('+a.playlist+')':'')):a.type==='add-note'?('add note "'+(a.title||'')+'"'):('post to Discord: "'+a.text+'"');return ts+' -> '+as;};
 async function paintWorkflows(){try{wfRules=await api.call('workflows-list');}catch{wfRules=[];}const el=$('#w-list');if(!el)return;el.innerHTML=wfRules.length?wfRules.map(r=>'<div class="tg"><span class="lab">'+esc(r.name)+'<small>'+esc(wfSummary(r))+'</small></span><span><input type="checkbox" class="sw" data-wen="'+r.id+'"'+(r.enabled?' checked':'')+' aria-label="Enable workflow"><button class="act ghost" data-wdel="'+r.id+'">x</button></span></div>').join(''):'<p class="desc">No workflows yet.</p>';
  el.querySelectorAll('[data-wdel]').forEach(b=>b.onclick=()=>task(async()=>{await api.call('workflows-delete',{id:b.dataset.wdel});paintWorkflows();}));
  el.querySelectorAll('[data-wen]').forEach(c=>c.onchange=()=>task(async()=>{const r=wfRules.find(x=>x.id===c.dataset.wen);if(r)await api.call('workflows-save',{rule:Object.assign({},r,{enabled:c.checked})});}));}
 $('#w-add').onclick=()=>task(async()=>{const tt=$('#w-ttype').value,tv=$('#w-tval').value.trim(),at=$('#w-atype').value,av=$('#w-aval').value.trim();
  const trigger=tt==='at-time'?{type:tt,time:tv}:tt==='app-launch'?{type:tt,app:tv}:tt==='idle'?{type:tt,idleMinutes:Number(tv)||10}:{type:tt,accelerator:tv};
  const action=at==='say'?{type:at,text:av}:at==='launch-app'?{type:at,app:av}:at==='add-note'?{type:at,title:av}:at==='discord-post'?{type:at,text:av}:{type:at,playlist:av};
  await api.call('workflows-save',{rule:{name:$('#w-name').value.trim()||'Workflow',trigger,action,enabled:true}});status('Workflow saved.');paintWorkflows();});
 task(paintWorkflows);
 $('#dc-save').onclick=()=>task(async()=>{const r=await api.call('discord-webhook',$('#dc-hook').value);state=await api.call('get-state');status(r.configured?'Discord webhook saved securely on this device.':'Discord webhook removed.');render();});
 $('#dc-post').onclick=()=>task(async()=>{const t=$('#dc-text').value.trim();if(!t)return status('Type a test message first.');await api.call('discord-post',{text:t});$('#dc-text').value='';status('Posted to Discord.');});
}
function renderPrivacy(m){
 m.innerHTML='<h2>Data &amp; privacy</h2><div class="sub">What stays here and what can leave.</div>'
 +'<div class="card"><h3>On this laptop</h3><p class="desc">Settings, pet action counts, anything you ask your mascot to remember, and your API keys stay on this device. Keys are saved with the operating system secure storage. The app never sends them anywhere except to their own provider when you use that provider.</p>'
 +'<div class="row"><button class="act ghost" id="d-clear-history">Clear pet action memory</button></div></div>'
 +'<div class="card"><h3>Leaving this laptop</h3><p class="desc">A chat message leaves only when you pick a cloud brain in the panel and tick consent for that message. Web tools fetch only the address or search you type. News scout downloads public headlines only. Everything else is local.</p></div>'
 +'<div class="card"><h3>Diagnostics</h3><p class="desc">Checks the local brain, voice models and features. The report is saved as diagnostics.json in the app data folder on this laptop.</p><div class="row"><button class="act ghost" id="d-selftest">Run diagnostics</button></div><div class="reply hidden" id="d-selftest-out"></div></div>'
 +'<div class="status" id="d-status" role="status"></div>';
 $('#d-clear-history').onclick=()=>task(async()=>{await api.call('clear-history');status('Pet action memory cleared.');});
 $('#d-selftest').onclick=()=>task(async()=>{let mic='unknown';try{const devs=await navigator.mediaDevices.enumerateDevices();mic=devs.some(d=>d.kind==='audioinput')?'ok':'no-device';}catch{mic='denied';}
  const r=await api.call('selftest-run',{mic});const out=$('#d-selftest-out');out.classList.remove('hidden');out.textContent=r.text;status('Diagnostics: '+r.report.summary.pass+' pass, '+r.report.summary.warn+' warnings, '+r.report.summary.fail+' failures.');});
}
task(async()=>{state=await api.call('get-state');render();});
