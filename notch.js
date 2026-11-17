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
let mascotName = 'Dex';
let pillState = { text: 'IDLE', tone: 'idle' };
let statusLine = 'Idle';
let dnd = false;
let muted = false;
let musicPlaying = false;
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
  return `<span class="tic">${esc(N.tileIcon(tile))}</span>`;
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
    } else icon = `<span class="ic">${esc(N.tileIcon(tile))}</span>`;
    return `<button class="cand${t.inDeck ? ' added' : ''}" data-cand="${i}" title="${esc(N.tileLabel(tile))}">${icon}<span>${esc(N.tileLabel(tile))}</span>${t.inDeck ? '<span class="tag">Added</span>' : ''}</button>`;
  }).join('');
}
function flash(msg) { $('#flash').textContent = msg || ''; }
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
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('on', muted);
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
    $('#chat-ask').textContent = `Ask ${mascotName} anything…`;
    $('#chat-input').placeholder = `Message ${mascotName}`;
    const head = mascotName === 'Rex' ? '2-head.png' : 'cat-head.png';
    const peek = $('#peek-cat'), cat = $('#cat');
    if (peek && !peek.src.endsWith(head)) peek.src = head;
    if (cat && !cat.src.endsWith(head)) cat.src = head;
  }
  if (d.pill && d.pill.text) pillState = { text: String(d.pill.text), tone: String(d.pill.tone || 'idle') };
  if (typeof d.statusLine === 'string') statusLine = d.statusLine;
  if (typeof d.dnd === 'boolean') dnd = d.dnd;
  if (typeof d.muted === 'boolean') muted = d.muted;
  if (typeof d.musicPlaying === 'boolean') musicPlaying = d.musicPlaying;
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
    case 'chat': machine.setView('chat'); render(); $('#chat-input').focus(); break;
    case 'vision': machine.setView('chat'); render(); prefill('where is '); break;
    case 'discord-post': machine.setView('chat'); render(); prefill('post to discord: '); break;
    case 'dnd': api.call('notch-action', { action: 'dnd' }).then((r) => { if (r && typeof r.dnd === 'boolean') { dnd = r.dnd; render(); } flash(dnd ? 'Do not disturb ON — the pet stays quiet.' : 'Do not disturb off.'); }).catch(() => flash('Could not toggle Do not disturb.')); break;
    case 'run-routine': api.call('notch-action', { action: 'run-routine', name: tile.name }).then((r) => {
      const launched = (r && r.launched) || [], problems = (r && r.problems) || [];
      flash(problems.length ? `Routine: opened ${launched.length}, ${problems.length} problem(s).` : `Routine running — opened ${launched.length} app(s).`);
    }).catch(() => flash('Could not run that routine.')); break;
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
  else if (what === 'chat') { machine.setView('chat'); render(); $('#chat-input').focus(); }
}));

// --- chat view -----------------------------------------------------------------------------
function prefill(text) {
  const input = $('#chat-input');
  input.value = text;
  input.focus();
}
function providerChanged() {
  const p = $('#provider').value;
  $('#consent-row').classList.toggle('show', p !== 'local');
  $('#consent-text').textContent = p === 'groq' ? 'Allow this message to go to Groq' : 'Allow this message to go to the free cloud provider';
}
$('#provider').addEventListener('change', providerChanged);
function sendChat() {
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
