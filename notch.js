// Notch window renderer (V2): Dexter-style layout — peek tab, cat-centre
// header with status pill + utility icons, 6x2 tile deck, edit mode with a
// searchable picker, chat view with a provider chip, and cat drag-out.
// Machine state lives in window.Notch (notch.cjs); main owns settings, app
// icons, stats and every real action — this file only renders and dispatches.
'use strict';
const api = window.petAPI;
const N = window.Notch;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LETTER_COLORS = ['#5B6CFF', '#d94f2b', '#2e9e63', '#8a5fd0', '#c9931b', '#2f7fb8', '#b84d7a', '#4d7c8a'];
const letterColor = (name) => { let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 997; return LETTER_COLORS[h % LETTER_COLORS.length]; };

const machine = new N.NotchMachine({});
let deck = N.saneDeck(undefined); // replaced by the pushed state (scan default or saved deck)
let mascotName = 'Daru';
let pillState = { text: 'IDLE', tone: 'idle' };
let statusLine = 'Idle';
let dnd = false;
let muted = false;
let musicPlaying = false;
let timer = { running: false, paused: false, endsAt: 0, remainingMs: 0, durationMs: 25 * 60000 };
let musicNow = { title: '', playing: false };
let presetMin = 25;
let stats = { cpuPct: null, ramPct: null };
let batteryPct = null;
// Edit mode data: fetched once per edit session, reused across renders.
let appsCache = null;      // [names]
let routinesCache = null;  // [names]
let pkCategory = 'Stats';
let pkQuery = '';
let pkList = [];           // candidates currently shown (index-based clicks)
const iconCache = new Map(); // app name -> data URL | null (null = no icon, letter fallback)
const iconWanted = new Set();

const ACTION_PATHS={chat:'M4 5h16v11H9l-5 4z',mic:'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zm-3 6v2a6 6 0 0 0 12 0v-2M12 18v4M8 22h8',note:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',timer:'M12 7v6l4 2M9 2h6M12 2v3M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0',music:'M10 17V5l10-2v12M10 8l10-2M10 17a3 2 0 1 1-3-2 3 2 0 0 1 3 2M20 15a3 2 0 1 1-3-2 3 2 0 0 1 3 2',playlists:'M4 5h13M4 10h13M4 15h7M17 13v7M14 17l3 3 3-3',routines:'M8 5h13M8 12h13M8 19h13M2 5l1 1 2-3M2 12l1 1 2-3M2 19l1 1 2-3',setup:'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',vision:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',dnd:'M6 8a6 6 0 0 1 12 0c0 8 3 8 3 8H3s3 0 3-8M9 20h6M3 3l18 18',clipboard:'M9 4H5v18h14V4h-4M9 2h6v5H9z',apps:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M9 15v6',close:'M6 6l12 12M6 18L18 6',volume:'M3 9h4l5-4v14l-5-4H3zM16 8q6 4 0 8',muted:'M3 9h4l5-4v14l-5-4H3zM16 9l6 6M16 15l6-6',battery:'M3 7h16v12H3zM19 11h3v4h-3M6 10v6M10 10v6',edit:'M4 16L16 4l4 4L8 20H4z'};
function lineIcon(id){const alias={'run-routine':'routines','music-next':'music','discord-post':'chat','vol-up':'volume','vol-down':'volume','vol-mute':'muted','clip-clear':'clipboard'};const p=ACTION_PATHS[alias[id]||id];return p?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+p+'"/></svg>':'';}

// --- rendering -----------------------------------------------------------------
function tileInner(tile) {
  if (tile.kind === 'app') {
    const url = iconCache.get(tile.name);
    if (url) return `<span class="tic"><img src="${url}" alt=""></span>`;
    requestIcon(tile.name);
    return `<span class="tic"><span class="letter" style="background:${letterColor(tile.name)}">${esc((tile.name || '?').trim().charAt(0).toUpperCase() || '?')}</span></span>`;
  }
  if (tile.kind === 'info') {
    const v = tile.id === 'cpu' ? stats.cpuPct : tile.id === 'ram' ? stats.ramPct : batteryPct;
    return `<span class="tic"><span class="val">${v == null ? '—' : v + '%'}</span></span>`;
  }
  return `<span class="tic">${(lineIcon(tile.id)||esc(N.tileIcon(tile)))}</span>`;
}
function tileActive(tile) {
  if (tile.kind === 'action' && tile.id === 'dnd') return dnd;
  if (tile.kind === 'action' && tile.id === 'music') return musicPlaying;
  return false;
}
function renderGrid() {
  const grid = $('#grid');
  let html = deck.map((tile, i) =>
    `<button class="tile${tileActive(tile) ? ' on' : ''}" data-tile="${i}" title="${esc(N.tileLabel(tile))}">${tileInner(tile)}<span class="lb">${esc(N.tileLabel(tile))}</span><span class="minus" data-remove="${i}" title="Remove tile">−</span></button>`).join('');
  if (machine.editing) for (let i = deck.length; i < N.MAX_TILES; i++) html += '<div class="slot"></div>';
  grid.innerHTML = html;
  $('#edit-count').textContent = `${deck.length} of ${N.MAX_TILES}`;
}
function requestIcon(name) {
  if (iconCache.has(name) || iconWanted.has(name) || !name) return;
  iconWanted.add(name);
  api.call('notch-app-icon', { name }).then((url) => { iconCache.set(name, url || null); renderGrid(); if (machine.editing) renderPicker(); })
    .catch(() => { iconCache.set(name, null); });
}
function renderPicker() {
  $('#pk-tabs').innerHTML = N.PICKER_CATEGORIES.map((c) =>
    `<button class="pk-tab${c === pkCategory ? ' on' : ''}" data-tab="${esc(c)}">${esc(c === 'Rex' ? 'Relay' : c)}</button>`).join('');
  const candidates = N.pickerCandidates({ apps: appsCache || [], routines: routinesCache || [], deck });
  pkList = N.filterTiles(candidates[pkCategory] || [], pkQuery);
  if (appsCache === null && (pkCategory === 'Desktop' || pkCategory === 'Socials')) {
    $('#pk-grid').innerHTML = '<span class="pk-empty">Scanning installed apps…</span>';
    return;
  }
  if (!pkList.length) { $('#pk-grid').innerHTML = '<span class="pk-empty">Nothing here.</span>'; return; }
  $('#pk-grid').innerHTML = pkList.map((t, i) => {
    const tile = t.kind === 'app' ? { kind: 'app', name: t.name }
      : t.kind === 'info' ? { kind: 'info', id: t.id } : { kind: 'action', id: t.id, ...(t.name ? { name: t.name } : {}) };
    let icon;
    if (tile.kind === 'app') {
      const url = iconCache.get(tile.name);
      icon = url ? `<img src="${url}" alt="" style="width:20px;height:20px;border-radius:6px">` : `<span class="letter" style="background:${letterColor(tile.name)}">${esc((tile.name || '?').charAt(0).toUpperCase())}</span>`;
      if (!url) requestIcon(tile.name);
    } else icon = `<span class="ic">${(lineIcon(tile.id)||esc(N.tileIcon(tile)))}</span>`;
    return `<button class="cand${t.inDeck ? ' added' : ''}" data-cand="${i}" title="${esc(N.tileLabel(tile))}">${icon}<span>${esc(N.tileLabel(tile))}</span>${t.inDeck ? '<span class="tag">Added</span>' : ''}</button>`;
  }).join('');
}
function flash(msg) { $('#flash').textContent = msg || ''; }
// --- quick bar (pomodoro / music mini-player / volume) ---------------------------
function timerClockMs() {
  if (timer.running && !timer.paused) return Math.max(0, timer.endsAt - Date.now());
  if (timer.running && timer.paused) return Math.max(0, timer.remainingMs || 0);
  return presetMin * 60000;
}
function renderQuick() {
  $('#t-clock').textContent = N.formatCountdown(timerClockMs());
  $('#t-clock').classList.toggle('locked', timer.running);
  $('#t-clock').title = timer.running ? 'Focus timer' : 'Click to change length (15 / 25 / 50 min)';
  $('#t-toggle').textContent = timer.running ? (timer.paused ? 'Resume' : 'Pause') : 'Start';
  const mb = $('#musicbar');
  if (musicNow.title) {
    mb.classList.remove('hidden');
    $('#musicdiv').style.display = '';
    $('#m-title').textContent = musicNow.title;
    $('#m-toggle').textContent = musicNow.playing ? '⏸' : '▶';
  } else { mb.classList.add('hidden'); $('#musicdiv').style.display = 'none'; }
}
setInterval(() => { if (timer.running && !timer.paused && (machine.state === 'open' || machine.state === 'hover')) $('#t-clock').textContent = N.formatCountdown(timerClockMs()); }, 1000);
function cleanErr(err) { return String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': /, '').replace(/^Error: /, ''); }
function applyTimer(r) { if (r && r.timer) { timer = { ...timer, ...r.timer }; renderQuick(); } }
$('#t-toggle').addEventListener('click', () => {
  const action = !timer.running ? 'timer-start' : timer.paused ? 'timer-resume' : 'timer-pause';
  const data = action === 'timer-start' ? { action, minutes: presetMin } : { action };
  api.call('notch-action', data).then(applyTimer).catch((e) => flash(cleanErr(e)));
});
$('#t-reset').addEventListener('click', () => {
  api.call('notch-action', { action: 'timer-reset' }).then(applyTimer).catch((e) => flash(cleanErr(e)));
});
$('#t-clock').addEventListener('click', () => {
  if (timer.running) return; // length is locked while a timer runs
  const presets = [15, 25, 50];
  presetMin = presets[(presets.indexOf(presetMin) + 1) % presets.length];
  renderQuick();
});
function musicAction(action) {
  api.call('notch-action', { action }).then(() => {}).catch((e) => flash(cleanErr(e)));
}
$('#m-toggle').addEventListener('click', () => musicAction('music'));
$('#m-next').addEventListener('click', () => musicAction('music-next'));
$('#m-prev').addEventListener('click', () => musicAction('music-prev'));
let volTimer = null;
$('#v-slider').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  $('#v-val').textContent = v + '%';
  if (volTimer) clearTimeout(volTimer);
  volTimer = setTimeout(() => {
    api.call('notch-action', { action: 'vol-set', value: v }).then(() => {}).catch((err) => flash(cleanErr(err)));
  }, 150);
});
function render() {
  document.body.dataset.state = machine.state;
  document.body.dataset.view = machine.view;
  document.body.classList.toggle('editing', machine.editing);
  $('#cat').classList.toggle('out', machine.petOut);
  $('#peek-cat').classList.toggle('out', machine.petOut);
  $('#dock-btn').classList.toggle('hidden', !machine.petOut);
  $('#pill').dataset.tone = pillState.tone;
  $('#pill-text').textContent = pillState.text;
  $('#chat-status').textContent = statusLine;
  $('#peek').title = statusLine;
  document.querySelector('[data-util="chat"]').classList.toggle('on', machine.view === 'chat');
  document.querySelector('[data-util="deck"]').classList.toggle('on', machine.view === 'deck');
  const muteBtn = document.querySelector('[data-util="mute"]');
  muteBtn.innerHTML=lineIcon(muted?'muted':'volume');muteBtn.setAttribute('aria-label',muted?'Unmute wake word':'Mute wake word');
  muteBtn.classList.toggle('on', muted);
  renderQuick();
  renderGrid();
  if (machine.editing) renderPicker();
  api.send('notch-ui-state', { state: machine.state });
}
function applyState(d) {
  if (!d) return;
  machine.setEnabled(d.enabled);
  machine.setMode(d.mode);
  machine.setPetOut(d.petOut);
  if (Array.isArray(d.deck)) deck = N.saneDeck(d.deck);
  if (d.mascot) {
    mascotName = String(d.mascot);
    $('#chat-ask').textContent = 'What are we working on?';
    $('#chat-input').placeholder = `Message ${mascotName}`;
    const head = 'vex-head.png'; // Daru-only build
    const peek = $('#peek-cat'), cat = $('#cat');
    if (peek && !peek.src.endsWith(head)) peek.src = head;
    if (cat && !cat.src.endsWith(head)) cat.src = head;
  }
  if (d.pill && d.pill.text) pillState = { text: String(d.pill.text), tone: String(d.pill.tone || 'idle') };
  if (typeof d.statusLine === 'string') statusLine = d.statusLine;
  if (typeof d.dnd === 'boolean') dnd = d.dnd;
  if (typeof d.muted === 'boolean') muted = d.muted;
  if (typeof d.musicPlaying === 'boolean') musicPlaying = d.musicPlaying;
  if (d.timer && typeof d.timer === 'object') timer = { ...timer, ...d.timer };
  if (d.music && typeof d.music === 'object') musicNow = { title: String(d.music.title || ''), playing: !!d.music.playing };
  if (d.stats && typeof d.stats === 'object') stats = { cpuPct: d.stats.cpuPct ?? null, ramPct: d.stats.ramPct ?? null };
  $('#peek-dot').className = d.statusDot === 'on' ? 'on' : '';
  render();
}
api.on('notch-state', applyState);

// --- deck editing ------------------------------------------------------------------
function saveDeck(next) {
  if (!next) { flash('That deck change is not allowed.'); return; }
  api.call('notch-set-deck', { deck: next }).then((saved) => {
    deck = N.saneDeck(saved);
    render();
  }).catch(() => flash('Could not save the deck.'));
}
function enterEdit() {
  machine.setEditing(true);
  render();
  if (appsCache === null) {
    api.call('notch-apps').then((r) => { appsCache = (r && r.apps) || []; renderPicker(); }).catch(() => { appsCache = []; renderPicker(); });
  }
  if (routinesCache === null) {
    api.call('list-routines').then((rs) => { routinesCache = (Array.isArray(rs) ? rs : []).map((r) => r && r.name).filter(Boolean); renderPicker(); })
      .catch(() => { routinesCache = []; renderPicker(); });
  }
}
$('#edit-btn').addEventListener('click', enterEdit);
$('#done-btn').addEventListener('click', () => { machine.setEditing(false); flash(''); render(); });
$('#pk-search').addEventListener('input', (e) => { pkQuery = e.target.value; renderPicker(); });
$('#pk-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (!tab) return;
  pkCategory = tab.dataset.tab;
  renderPicker();
});
$('#pk-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cand]');
  if (!btn) return;
  const t = pkList[Number(btn.dataset.cand)];
  if (!t) return;
  if (t.inDeck) { flash('Already in the deck.'); return; }
  const tile = t.kind === 'app' ? { kind: 'app', name: t.name }
    : t.kind === 'info' ? { kind: 'info', id: t.id } : { kind: 'action', id: t.id, ...(t.name ? { name: t.name } : {}) };
  saveDeck(N.deckAdd(deck, tile));
});

// --- tile actions ---------------------------------------------------------------------
function runTile(tile) {
  if (!tile) return;
  if (tile.kind === 'info') return; // info tiles are displays, not buttons
  if (tile.kind === 'app') {
    api.call('notch-action', { action: 'app', name: tile.name }).then((r) => {
      flash(r && r.launched ? `Opening ${tile.name}…` : (r && r.error) || `Could not open ${tile.name}.`);
    }).catch(() => flash(`Could not open ${tile.name}.`));
    return;
  }
  switch (tile.id) {
    case 'chat': machine.setView('chat'); render(); $('#chat-input').focus();refreshLocalModels(); break;
    case 'vision': machine.setView('chat'); render(); prefill('where is '); break;
    case 'discord-post': machine.setView('chat'); render(); prefill('post to discord: '); break;
    case 'dnd': api.call('notch-action', { action: 'dnd' }).then((r) => { if (r && typeof r.dnd === 'boolean') { dnd = r.dnd; render(); } flash(dnd ? 'Do not disturb ON — the pet stays quiet.' : 'Do not disturb off.'); }).catch(() => flash('Could not toggle Do not disturb.')); break;
    case 'run-routine': api.call('notch-action', { action: 'run-routine', name: tile.name }).then((r) => {
      const launched = (r && r.launched) || [], problems = (r && r.problems) || [];
      flash(problems.length ? `Routine: opened ${launched.length}, ${problems.length} problem(s).` : `Routine running — opened ${launched.length} app(s).`);
    }).catch(() => flash('Could not run that routine.')); break;
    case 'clipboard': api.call('notch-action', { action: 'clipboard' }).then((r) => { const t = String((r && r.text) || '').replace(/\s+/g, ' ').trim(); flash(t ? '📋 ' + (t.length > 110 ? t.slice(0, 110) + '…' : t) : 'Clipboard is empty.'); }).catch((e) => flash(cleanErr(e))); break;
    case 'clip-clear': api.call('notch-action', { action: 'clip-clear' }).then(() => flash('Clipboard cleared.')).catch((e) => flash(cleanErr(e))); break;
    case 'vol-up': case 'vol-down': case 'vol-mute': api.call('notch-action', { action: tile.id }).then(() => {}).catch((e) => flash(cleanErr(e))); break;
    default: // mic, timer, note, music, music-next, playlists, routines
      api.call('notch-action', { action: tile.id }).then((r) => { if (r && r.error) flash(String(r.error)); }).catch(() => {});
  }
}
$('#grid').addEventListener('click', (e) => {
  const minus = e.target.closest('[data-remove]');
  if (minus && machine.editing) { e.stopPropagation(); saveDeck(N.deckRemoveAt(deck, Number(minus.dataset.remove))); return; }
  if (machine.editing) return; // tiles do not run while editing
  const btn = e.target.closest('[data-tile]');
  if (btn) runTile(deck[Number(btn.dataset.tile)]);
});

// --- header utility icons ---------------------------------------------------------------
document.querySelectorAll('[data-util]').forEach((btn) => btn.addEventListener('click', () => {
  const what = btn.dataset.util;
  if (what === 'mute') {
    api.call('notch-action', { action: 'mute' }).then((r) => { if (r && typeof r.muted === 'boolean') { muted = r.muted; render(); } flash(muted ? 'Wake word muted.' : 'Wake word live.'); })
      .catch(() => flash('Could not toggle mute.'));
  } else if (what === 'hide') {
    flash('');
    machine.pointerAway();
    api.send('notch-set-ignore', { ignore: true });
    render();
  } else if (what === 'dash') { api.send('open-dashboard'); }
  else if (what === 'deck') { machine.setView('deck'); render(); }
  else if (what === 'chat') { machine.setView('chat'); render(); $('#chat-input').focus();refreshLocalModels(); }
}));

// --- chat view -----------------------------------------------------------------------------
function prefill(text) {
  const input = $('#chat-input');
  input.value = text;
  input.focus();
}
let modelRefreshId=0,modelSavePending=null;
async function refreshLocalModels(){const id=++modelRefreshId;const out=$('#model-status'),select=$('#local-model');$('#refresh-models').disabled=true;out.textContent='Checking your local Ollama models...';select.disabled=true;try{const [names,st]=await Promise.all([api.call('models'),api.call('get-state')]);if(id!==modelRefreshId)return;select.replaceChildren();const current=st.ollamaModel||'';if(!current){const blank=document.createElement('option');blank.value='';blank.textContent='Choose a local model';select.append(blank);}const options=[...new Set([current,...names].filter(Boolean))];for(const name of options){const op=document.createElement('option');op.value=name;op.textContent=name+(names.includes(name)?'':' (not installed)');select.append(op);}if(!options.length){const op=document.createElement('option');op.value='';op.textContent='No installed models';select.append(op);}select.value=current||'';out.textContent=names.length?'Choose a model to save it for local chat.':'Ollama returned no installed models.';}catch(e){out.textContent=cleanErr(e);}finally{if(id===modelRefreshId){$('#refresh-models').disabled=false;select.disabled=false;}}}
$('#local-model').addEventListener('change',()=>{const model=$('#local-model').value;if(!model)return;$('#chat-send').disabled=true;modelSavePending=api.call('save-settings',{ollamaModel:model}).then(()=>{$('#model-status').textContent='Local model saved: '+model;}).catch(e=>{$('#model-status').textContent=cleanErr(e);throw e;}).finally(()=>{modelSavePending=null;$('#chat-send').disabled=false;});modelSavePending.catch(()=>{});});
$('#refresh-models').addEventListener('click',refreshLocalModels);
for(const [sel,id] of [['#edit-btn','edit'],['[data-util=dash]','settings'],['[data-util=hide]','close'],['[data-util=deck]','apps'],['[data-util=chat]','chat']])$(sel).innerHTML=lineIcon(id);
function providerChanged() {
  const p = $('#provider').value;$('#local-model-row').classList.toggle('hidden',p!=='local');$('#model-status').classList.toggle('hidden',p!=='local');if(p==='local')refreshLocalModels();
  $('#consent-row').classList.toggle('show', p !== 'local');
  $('#consent-text').textContent = p === 'groq' ? 'Allow this message to go to Groq' : 'Allow this message to go to the free cloud provider';
}
$('#provider').addEventListener('change', providerChanged);
function sendChat() {
  if($('#chat-send').disabled||modelSavePending)return;
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  const mode = $('#provider').value;
  const consent = mode !== 'local' && $('#chat-consent').checked;
  if (mode !== 'local' && !consent) {
    $('#chat-reply').textContent = `Tick the box to let this message go to ${mode === 'groq' ? 'Groq' : 'the cloud provider'}.`;
    return;
  }
  const btn = $('#chat-send');
  btn.disabled = true;
  $('#chat-reply').textContent = 'Thinking…';
  api.call('notch-chat', { text, mode, consent }).then((r) => {
    const reply = r && r.reply != null ? r.reply : r;
    $('#chat-reply').textContent = reply ? String(reply) : '(no reply)';
    input.value = '';
  }).catch((err) => {
    $('#chat-reply').textContent = 'Chat failed: ' + String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': /, '');
  }).finally(() => { btn.disabled = false; $('#chat-consent').checked = false; }); // consent is per message
}
$('#chat-send').addEventListener('click', sendChat);
$('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (machine.view === 'chat') { machine.setView('deck'); render(); return; }
  machine.closePanel();
  api.send('notch-set-ignore', { ignore: true });
  render();
});

// --- pointer behaviour: peek raise, hover, click-through --------------------------------
$('#peek').addEventListener('mouseenter', () => { machine.hoverIn(); render(); });
$('#peek').addEventListener('click', () => { if (Date.now() < suppressClickUntil) return; machine.toggleOpen(); render(); if (machine.state !== 'open') api.send('notch-set-ignore', { ignore: true }); });
$('#panel').addEventListener('mouseenter', () => { machine.hoverIn(); render(); });
$('#panel').addEventListener('mouseleave', () => {
  if (drag) return; // mid drag-out: never collapse under the pointer
  if ($('#panel').contains(document.activeElement)) return; // typing in chat: stay
  machine.hoverOut();
  render();
});
document.addEventListener('mousemove', (e) => {
  if (drag) return; // mid drag-out: keep the window interactive for capture
  const hit = !!(e.target && e.target.closest && e.target.closest('[data-hit]'));
  api.send('notch-set-ignore', { ignore: !hit });
});
document.addEventListener('mouseleave', () => {
  if (drag) return; // mid drag-out: leaving the window is the whole point
  machine.pointerAway();
  api.send('notch-set-ignore', { ignore: true });
  render();
});
$('#dock-btn').addEventListener('click', () => api.send('notch-dock'));

// --- cat drag-out: tilt while dragging, summon on a real drop ------------------------------
// Wired on BOTH cat faces: the panel cat (#cat) and the peek cat (#peek-cat).
// The peek is the notch's resting state, so a drag that starts there must
// work too - previously only the open panel's cat had handlers and a drag
// from the collapsed notch silently did nothing. While a drag is active the
// hover/click-through handlers below must not collapse the panel, re-render,
// or re-enable mouse-ignore: any of those can drop the pointer capture and
// the pointerup (and with it the drag-out) is lost.
let drag = null;
let suppressClickUntil = 0;
function finishDrag(e) {
  if (!drag) return;
  const was = drag;
  drag = null;
  if (was.el) was.el.style.transform = '';
  if (was.moved && e) {
    suppressClickUntil = Date.now() + 350;
    api.send('notch-drag-out', { x: e.screenX, y: e.screenY });
  } else if (was.moved && !e && was.started) {
    // Capture was lost mid-drag: tell main to stop following and land the pet.
    api.send('notch-drag-cancel');
  }
}
function wireDragOut(el) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.screenX, y: e.screenY, moved: false, el };
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || drag.el !== el) return;
    const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 30) drag.moved = true;
    if (drag.moved) {
      // The dragged feel from the reference photos: the cat leans into the drag.
      const tilt = Math.max(-16, Math.min(16, dx / 6));
      el.style.transform = `rotate(${tilt}deg) scale(1.06)`;
      // Dexter-style: the pet comes OUT as soon as the drag is real and
      // follows the cursor while held - it does not teleport on release.
      if (!drag.started) {
        drag.started = true;
        drag.lastX = e.screenX; drag.lastY = e.screenY;
        api.send('notch-drag-start', { x: e.screenX, y: e.screenY });
      } else if (Math.abs(e.screenX - drag.lastX) + Math.abs(e.screenY - drag.lastY) >= 3) {
        drag.lastX = e.screenX; drag.lastY = e.screenY;
        api.send('notch-drag-move', { x: e.screenX, y: e.screenY });
      }
    }
  });
  el.addEventListener('pointerup', finishDrag);
  el.addEventListener('pointercancel', () => finishDrag(null));
}
wireDragOut($('#cat'));
wireDragOut($('#peek-cat'));
// Backstop: if the element handler is ever lost mid-drag (capture dropped by
// a re-render), a window-level pointerup still completes the drop.
window.addEventListener('pointerup', (e) => { if (drag) finishDrag(e); });

// Battery for the stats pill + battery info tile (renderer-side, per spec).
if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    const upd = () => { batteryPct = Math.round(b.level * 100); if (machine.state === 'open' || machine.state === 'hover') renderGrid(); };
    b.addEventListener('levelchange', upd);
    upd();
  }).catch(() => {});
}

// Boot.
render();
api.call('notch-get-state').then(applyState).catch(() => {});

refreshLocalModels();
