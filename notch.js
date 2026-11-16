// Notch window renderer: draws the collapsed pill / hover deck / open
// panel from the shared notch.cjs model, and owns pointer behaviour.
//
// Click-through: the window itself is sized for the OPEN state and main
// keeps it mouse-transparent (setIgnoreMouseEvents with forwarding).
// Forwarded mousemove events still reach this page, so the moment the
// pointer is over real notch UI ([data-hit]) we ask main to make the
// window solid; when it leaves, we hand the clicks back to the desktop.
//
// Action routing: chat / discord / vision are chat-row actions - they
// open the panel and prefill the existing chat intents ("post to
// discord: ..." and "where is ..." are parsed by the normal brain path
// in main). Everything else dispatches through main's 'notch-action'.
const api = window.petAPI;
const N = window.Notch;
const $ = (s) => document.querySelector(s);
const machine = new N.NotchMachine({});
let deck = N.DEFAULT_DECK.slice();
let ignoring = true; // matches main's initial setIgnoreMouseEvents(true)

function setIgnore(v) {
  if (v === ignoring) return;
  ignoring = v;
  api.send('notch-set-ignore', { ignore: v });
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function render() {
  const st = machine.state;
  document.body.dataset.state = st;
  $('#cat').classList.toggle('out', machine.petOut);
  $('#dock').classList.toggle('hidden', !machine.petOut);
  $('#expand').textContent = st === 'open' ? '▴' : '▾';
  renderDeck();
  if (st === 'open') renderTiles();
  api.send('notch-ui-state', { state: st });
}

function renderDeck() {
  $('#deck').innerHTML = deck.map((id) => {
    const a = N.ACTIONS[id];
    return '<button class="dbtn" data-action="' + id + '" title="' + esc(a.label) + '"><span class="ic">' + a.icon + '</span><span class="lb">' + esc(a.label) + '</span></button>';
  }).join('');
}
function renderTiles() {
  $('#tiles').innerHTML = deck.length ? deck.map((id, i) => {
    const a = N.ACTIONS[id];
    return '<span class="tile"><span class="ic">' + a.icon + '</span>' + esc(a.label)
      + '<button data-move="-1" data-id="' + id + '" title="Move left" ' + (i === 0 ? 'disabled' : '') + '>‹</button>'
      + '<button data-move="1" data-id="' + id + '" title="Move right" ' + (i === deck.length - 1 ? 'disabled' : '') + '>›</button>'
      + '<button data-remove="' + id + '" title="Remove from deck">×</button></span>';
  }).join('') : '<span class="tile">Deck is empty - add actions below.</span>';
  const avail = N.availableActions(deck);
  $('#palette').innerHTML = avail.length
    ? avail.map((id) => '<span class="tile add" data-add="' + id + '"><span class="ic">' + N.ACTIONS[id].icon + '</span>+ ' + esc(N.ACTIONS[id].label) + '</span>').join('')
    : '<span class="tile">Everything is in the deck.</span>';
}

async function saveDeck(next) {
  if (!next) return;
  try {
    const saved = await api.call('notch-set-deck', { deck: next });
    deck = N.saneDeck(saved);
  } catch (e) {
    flashReply(e.message);
  }
  render();
}
function flashReply(t) { const el = $('#chat-reply'); if (el) el.textContent = t; }

// --- state pushes from main -------------------------------------------------
function applyState(d) {
  if (!d) return;
  machine.setEnabled(d.enabled !== false);
  machine.setMode(d.mode || 'always');
  machine.setPetOut(!!d.petOut);
  if (Array.isArray(d.deck)) deck = N.saneDeck(d.deck);
  if (typeof d.statusLine === 'string') $('#status').textContent = d.statusLine;
  $('#dot').classList.toggle('on', d.statusDot === 'on');
  if (typeof d.glance === 'string') $('#glance').textContent = d.glance;
  render();
}
api.on('notch-state', applyState);

// --- pointer behaviour --------------------------------------------------------
document.addEventListener('mousemove', (e) => {
  const hit = e.target && e.target.closest ? e.target.closest('[data-hit]') : null;
  if (hit) {
    setIgnore(false);
    if (machine.state === 'sliver') { machine.pointerTop(); render(); }
  } else {
    setIgnore(true);
  }
});
document.addEventListener('mouseleave', () => { machine.pointerAway(); setIgnore(true); render(); });
const bar = $('#bar');
bar.addEventListener('mouseenter', () => { machine.hoverIn(); render(); });
bar.addEventListener('mouseleave', () => { if (!$('#panel').contains(document.activeElement)) { machine.hoverOut(); render(); } });
bar.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.closest('#cat')) return;
  machine.toggleOpen(); render();
  if (machine.state === 'open') $('#chat-input').focus();
});
$('#expand').onclick = () => { machine.toggleOpen(); render(); };
$('#close-panel').onclick = () => { machine.closePanel(); render(); };
$('#dock').onclick = () => { api.send('notch-dock'); };

// Cat drag-out: a press that travels becomes a drag; release over the
// desktop asks main to summon the pet window at the drop point (the
// same landing the panel's drag-head produces). A plain click toggles
// the panel instead.
const cat = $('#cat');
let dragStart = null, dragMoved = false;
cat.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragStart = { x: e.screenX, y: e.screenY };
  dragMoved = false;
  cat.setPointerCapture(e.pointerId);
});
cat.addEventListener('pointermove', (e) => {
  if (!dragStart) return;
  if (Math.hypot(e.screenX - dragStart.x, e.screenY - dragStart.y) > 30) dragMoved = true;
});
cat.addEventListener('pointerup', (e) => {
  const wasDrag = dragMoved;
  dragStart = null; dragMoved = false;
  if (wasDrag) { api.send('notch-drag-out', { x: e.screenX, y: e.screenY }); return; }
  machine.toggleOpen(); render();
});

// --- deck actions ---------------------------------------------------------------
$('#deck').addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  runAction(b.dataset.action);
});
function focusChat(prefill) {
  if (machine.state !== 'open') machine.toggleOpen();
  render();
  const input = $('#chat-input');
  if (prefill && !input.value) input.value = prefill;
  input.focus();
}
async function runAction(id) {
  if (id === 'chat') { focusChat(''); return; }
  if (id === 'discord') { focusChat('post to discord: '); return; }
  if (id === 'vision') { focusChat('where is '); return; }
  try {
    await api.call('notch-action', { action: id });
  } catch (err) {
    if (machine.state !== 'open') machine.toggleOpen();
    render();
    flashReply(err.message);
  }
}

// --- edit deck ---------------------------------------------------------------------
$('#tiles').addEventListener('click', (e) => {
  const mv = e.target.closest('[data-move]');
  if (mv) { saveDeck(N.deckMove(deck, mv.dataset.id, Number(mv.dataset.move))); return; }
  const rm = e.target.closest('[data-remove]');
  if (rm) { saveDeck(N.deckRemove(deck, rm.dataset.remove)); }
});
$('#palette').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) saveDeck(N.deckAdd(deck, add.dataset.add));
});

// --- chat row -------------------------------------------------------------------------
async function sendChat() {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  const btn = $('#chat-send');
  btn.disabled = true;
  flashReply('Thinking…');
  try {
    const r = await api.call('notch-chat', { text });
    input.value = '';
    flashReply(r && r.reply ? r.reply : 'Sent.');
  } catch (err) {
    flashReply(err.message);
  } finally {
    btn.disabled = false;
    input.focus();
  }
}
$('#chat-send').onclick = sendChat;
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
  if (e.key === 'Escape') { machine.closePanel(); render(); }
});

// --- boot --------------------------------------------------------------------------------
api.call('notch-get-state').then(applyState).catch(() => render());
render();
