const test = require('node:test'), assert = require('node:assert/strict');
const N = require('./notch.cjs');

const A = (id) => ({ kind: 'action', id });
const APP = (name) => ({ kind: 'app', name });
const INFO = (id) => ({ kind: 'info', id });

// --- tile model ---------------------------------------------------------------
test('saneTile: V1 bare action-id strings migrate to action tiles', () => {
  assert.deepEqual(N.saneTile('mic'), A('mic'));
  assert.deepEqual(N.saneTile('chat'), A('chat'));
  assert.deepEqual(N.saneTile('vision'), A('vision'));
  assert.deepEqual(N.saneTile('discord'), A('discord-post')); // V1 'discord' meant post-to-discord
  assert.equal(N.saneTile('bogus'), null);
});
test('saneTile: app tiles need a name; names are trimmed and capped', () => {
  assert.deepEqual(N.saneTile({ kind: 'app', name: '  Steam  ' }), APP('Steam'));
  assert.equal(N.saneTile({ kind: 'app', name: '   ' }), null);
  assert.equal(N.saneTile({ kind: 'app' }), null);
  assert.equal(N.saneTile({ kind: 'app', name: 'x'.repeat(90) }).name.length, 60);
});
test('saneTile: action tiles validate the id; run-routine needs its routine name', () => {
  assert.deepEqual(N.saneTile({ kind: 'action', id: 'dnd' }), A('dnd'));
  assert.equal(N.saneTile({ kind: 'action', id: 'explode' }), null);
  assert.deepEqual(N.saneTile({ kind: 'action', id: 'run-routine', name: ' morning ' }), { kind: 'action', id: 'run-routine', name: 'morning' });
  assert.equal(N.saneTile({ kind: 'action', id: 'run-routine' }), null);
  assert.deepEqual(N.saneTile({ kind: 'action', id: 'mic', name: 'ignored' }), A('mic')); // name only for run-routine
});
test('saneTile: info tiles validate against cpu/ram/battery; junk is null', () => {
  assert.deepEqual(N.saneTile({ kind: 'info', id: 'cpu' }), INFO('cpu'));
  assert.equal(N.saneTile({ kind: 'info', id: 'gpu' }), null);
  assert.equal(N.saneTile(null), null);
  assert.equal(N.saneTile(42), null);
  assert.equal(N.saneTile({ kind: 'widget', id: 'cpu' }), null);
});
test('tileKey / tileLabel / tileIcon describe a tile for dedupe and display', () => {
  assert.equal(N.tileKey(APP('Steam')), 'app:steam');
  assert.equal(N.tileKey(APP('STEAM')), 'app:steam'); // case-insensitive dedupe
  assert.equal(N.tileKey({ kind: 'action', id: 'run-routine', name: 'Morning' }), 'action:run-routine:morning');
  assert.equal(N.tileKey(INFO('ram')), 'info:ram');
  assert.equal(N.tileKey(null), '');
  assert.equal(N.tileLabel(APP('Steam')), 'Steam');
  assert.equal(N.tileLabel({ kind: 'action', id: 'run-routine', name: 'morning' }), 'Run: morning');
  assert.equal(N.tileLabel(A('dnd')), 'Do not disturb');
  assert.equal(N.tileLabel(INFO('battery')), 'Battery');
  assert.equal(N.tileIcon(A('mic')), '🎤');
  assert.equal(N.tileIcon(APP('Steam')), ''); // app tiles render their real icon / a letter, not an emoji
});

// --- deck model -----------------------------------------------------------------
test('saneDeck: non-array falls back to a copy of the default deck', () => {
  assert.deepEqual(N.saneDeck(undefined), N.DEFAULT_DECK);
  assert.deepEqual(N.saneDeck('mic'), N.DEFAULT_DECK);
  assert.notEqual(N.saneDeck(undefined), N.DEFAULT_DECK); // copies, never the shared array
  assert.notEqual(N.saneDeck(undefined)[0], N.DEFAULT_DECK[0]);
});
test('saneDeck: migrates, validates, dedupes by key and caps at 12', () => {
  assert.deepEqual(N.saneDeck(['music', { kind: 'app', name: 'Steam' }, 'bogus', 'music', APP('steam'), 42]),
    [A('music'), APP('Steam')]);
  assert.deepEqual(N.saneDeck([]), []); // a saved empty deck stays empty
  const many = Array.from({ length: 15 }, (_, i) => APP('App' + i));
  assert.equal(N.saneDeck(many).length, N.MAX_TILES);
});
test('deckAdd: appends a valid tile; refuses duplicates, invalid tiles, full decks', () => {
  assert.deepEqual(N.deckAdd([A('mic')], APP('Steam')), [A('mic'), APP('Steam')]);
  assert.equal(N.deckAdd([APP('Steam')], APP('steam')), null); // duplicate by key
  assert.equal(N.deckAdd([A('mic')], { kind: 'app', name: '' }), null);
  const full = Array.from({ length: 12 }, (_, i) => APP('App' + i));
  assert.equal(N.deckAdd(full, A('mic')), null);
});
test('deckRemove / deckRemoveAt: remove by tile or by slot; refuse absent ones', () => {
  assert.deepEqual(N.deckRemove([A('mic'), A('chat')], A('mic')), [A('chat')]);
  assert.deepEqual(N.deckRemove([APP('Steam')], APP('steam')), []);
  assert.equal(N.deckRemove([A('mic')], A('chat')), null);
  assert.deepEqual(N.deckRemoveAt([A('mic'), A('chat'), A('note')], 1), [A('mic'), A('note')]);
  assert.equal(N.deckRemoveAt([A('mic')], 1), null);
  assert.equal(N.deckRemoveAt([A('mic')], -1), null);
  assert.equal(N.deckRemoveAt([A('mic')], 0.5), null);
});
test('deck edits never mutate the input deck', () => {
  const d = [A('mic'), A('timer')];
  N.deckAdd(d, A('chat')); N.deckRemove(d, A('mic')); N.deckRemoveAt(d, 0);
  assert.deepEqual(d, [A('mic'), A('timer')]);
});
test('defaultDeckForApps: Discord/Chrome/Steam first when installed, then DND, routines, music', () => {
  assert.deepEqual(N.defaultDeckForApps(['Calculator', 'Steam', 'Google Chrome', 'Discord', 'Spotify']),
    [APP('Discord'), APP('Google Chrome'), APP('Steam'), A('dnd'), A('routines'), A('music')]);
});
test('defaultDeckForApps: falls back to the first scanned apps, then to actions only', () => {
  assert.deepEqual(N.defaultDeckForApps(['Alpha', 'Beta', 'Gamma', 'Delta']),
    [APP('Alpha'), APP('Beta'), APP('Gamma'), A('dnd'), A('routines'), A('music')]);
  assert.deepEqual(N.defaultDeckForApps(['Solo']), [APP('Solo'), A('dnd'), A('routines'), A('music')]);
  assert.deepEqual(N.defaultDeckForApps([]), [A('dnd'), A('routines'), A('music')]);
  assert.deepEqual(N.defaultDeckForApps(undefined), [A('dnd'), A('routines'), A('music')]);
  assert.deepEqual(N.defaultDeckForApps(['steam', 'STEAM']), [APP('steam'), A('dnd'), A('routines'), A('music')]); // deduped
});

// --- picker ------------------------------------------------------------------------
test('pickerCandidates: categories carry the right tiles, deck members flagged', () => {
  const c = N.pickerCandidates({ apps: ['Discord', 'Steam'], routines: ['morning'], deck: [A('mic'), INFO('cpu')] });
  assert.deepEqual(Object.keys(c), N.PICKER_CATEGORIES);
  assert.deepEqual(c.Stats.map((t) => t.id), ['cpu', 'ram', 'battery']);
  assert.equal(c.Stats[0].inDeck, true);  // cpu already in the deck
  assert.equal(c.Stats[1].inDeck, false);
  assert.ok(c.Rex.some((t) => t.id === 'mic' && t.inDeck === true));
  assert.ok(c.Rex.some((t) => t.id === 'run-routine' && t.name === 'morning' && t.inDeck === false));
  assert.deepEqual(c.Music.map((t) => t.id), ['music', 'music-next', 'playlists']);
  assert.deepEqual(c.Socials.map((t) => t.kind + ':' + (t.id || t.name)), ['action:discord-post', 'app:Discord']);
  assert.deepEqual(c.Desktop.map((t) => t.name), ['Discord', 'Steam']);
});
test('pickerCandidates: no Discord app scanned -> Socials is just the post action', () => {
  const c = N.pickerCandidates({ apps: ['Steam'], routines: [], deck: [] });
  assert.deepEqual(c.Socials, [{ kind: 'action', id: 'discord-post', inDeck: false }]);
  assert.deepEqual(N.pickerCandidates({}).Desktop, []);
});
test('filterTiles: case-insensitive label search; empty query keeps everything', () => {
  const tiles = [APP('Steam'), A('music'), { kind: 'action', id: 'run-routine', name: 'morning' }];
  assert.deepEqual(N.filterTiles(tiles, 'ste'), [APP('Steam')]);
  assert.deepEqual(N.filterTiles(tiles, 'MORN'), [{ kind: 'action', id: 'run-routine', name: 'morning' }]); // matches "Run: morning"
  assert.deepEqual(N.filterTiles(tiles, ''), tiles);
  assert.deepEqual(N.filterTiles(tiles, 'zzz'), []);
  assert.deepEqual(N.filterTiles(null, 'x'), []);
});

// --- settings shape ------------------------------------------------------------------
test('saneNotchSettings: master on by default, stats pill off unless enabled, mode validated, dnd off by default', () => {
  assert.deepEqual(N.saneNotchSettings({}), { enabled: true, mode: 'always', deck: null, stats: false, dnd: false });
  assert.deepEqual(N.saneNotchSettings({ notch: false, notchMode: 'hover', notchDeck: ['chat'], notchStats: false, notchDnd: true }),
    { enabled: false, mode: 'hover', deck: [A('chat')], stats: false, dnd: true });
  assert.equal(N.saneNotchSettings({ notchMode: 'sometimes' }).mode, 'always');
  assert.equal(N.saneNotchSettings(null).enabled, true);
  // a saved empty deck is honoured (deck []), a never-saved one stays null
  assert.deepEqual(N.saneNotchSettings({ notchDeck: [] }).deck, []);
  assert.equal(N.saneNotchSettings({ notchDeck: 'junk' }).deck, null);
});

// --- state machine ---------------------------------------------------------------------
test('machine: always mode walks peek -> hover -> open -> peek', () => {
  const m = new N.NotchMachine({});
  assert.equal(m.state, 'collapsed');
  assert.equal(m.hoverIn(), 'hover');
  assert.equal(m.hoverOut(), 'collapsed');
  assert.equal(m.toggleOpen(), 'open');
  assert.equal(m.hoverOut(), 'open'); // leaving hover does not close the panel
  assert.equal(m.toggleOpen(), 'collapsed');
  assert.equal(m.toggleOpen(), 'open');
  assert.equal(m.closePanel(), 'collapsed');
  assert.equal(m.pointerAway(), 'collapsed');
});
test('machine: hover mode sleeps as a sliver until the cursor reaches the top', () => {
  const m = new N.NotchMachine({ mode: 'hover' });
  assert.equal(m.state, 'sliver');
  assert.equal(m.hoverIn(), 'sliver'); // cannot hover-expand from the sliver
  assert.equal(m.pointerTop(), 'collapsed');
  assert.equal(m.hoverIn(), 'hover');
  assert.equal(m.pointerAway(), 'sliver'); // leaving entirely puts it back to sleep
  assert.equal(m.pointerTop(), 'collapsed');
  assert.equal(m.toggleOpen(), 'open'); // opening from the peek works
  assert.equal(m.pointerAway(), 'sliver');
  assert.equal(m.toggleOpen(), 'open'); // opening straight from the sliver wakes it
});
test('machine: off mode and the master switch hide everything', () => {
  const m = new N.NotchMachine({ mode: 'off' });
  assert.equal(m.state, 'hidden');
  assert.equal(m.toggleOpen(), 'hidden');
  assert.equal(m.pointerTop(), 'hidden');
  m.setMode('always');
  assert.equal(m.state, 'collapsed');
  assert.equal(m.toggleOpen(), 'open');
  assert.equal(m.setEnabled(false), 'hidden');
  assert.equal(m.setEnabled(true), 'collapsed'); // expansion was reset while off
});
test('machine: petOut is orthogonal to the visible state', () => {
  const m = new N.NotchMachine({});
  m.setPetOut(true);
  assert.equal(m.petOut, true);
  assert.equal(m.state, 'collapsed');
  assert.equal(m.toggleOpen(), 'open');
  m.setPetOut(false);
  assert.equal(m.petOut, false);
  assert.equal(m.state, 'open');
});
test('machine: switching to hover mode mid-open keeps the panel, sliver rules apply after', () => {
  const m = new N.NotchMachine({});
  m.toggleOpen();
  m.setMode('hover');
  assert.equal(m.state, 'open');
  m.closePanel();
  assert.equal(m.state, 'sliver'); // not awake yet in hover mode
});
test('machine: view switching deck<->chat pins the panel open from the peek', () => {
  const m = new N.NotchMachine({});
  assert.equal(m.view, 'deck');
  assert.equal(m.setView('chat'), 'open');
  assert.equal(m.view, 'chat');
  assert.equal(m.setView('deck'), 'open');
  assert.equal(m.setView('bogus'), 'open'); // invalid views are ignored
  assert.equal(m.view, 'deck');
  m.closePanel();
  assert.equal(m.state, 'collapsed');
});
test('machine: edit mode pins the panel, forces the deck view, and ends on away/close', () => {
  const m = new N.NotchMachine({});
  m.setView('chat');
  assert.equal(m.setEditing(true), 'open');
  assert.equal(m.editing, true);
  assert.equal(m.view, 'deck'); // editing always happens on the deck
  assert.equal(m.hoverOut(), 'open'); // pinned while editing
  assert.equal(m.pointerAway(), 'collapsed');
  assert.equal(m.editing, false);
  m.setEditing(true);
  assert.equal(m.setEditing(false), 'open'); // Done leaves the panel pinned open
  assert.equal(m.editing, false);
  assert.equal(m.closePanel(), 'collapsed');
  const off = new N.NotchMachine({ mode: 'off' });
  assert.equal(off.setEditing(true), 'hidden'); // cannot edit a hidden notch
  assert.equal(off.editing, true); // flag is set but the hidden base still wins
});

// --- status line -------------------------------------------------------------------------
test('statusLine: voice interaction beats pet out; pet out beats the rest', () => {
  // Dexter parity (2026-11-17): a live voice phase wins even with the pet
  // out; without a phase, pet-out still leads timer/music.
  assert.equal(N.statusLine({ petOut: true, phase: 'thinking', timerRunning: true }), 'Thinking…');
  assert.equal(N.statusLine({ petOut: true, timerRunning: true, timerEndsAt: 999999 }), 'Out on your desktop');
});
test('statusLine: voice phases map to Listening / Transcribing / Thinking / Speaking; heard words show once transcribed', () => {
  assert.equal(N.statusLine({ phase: 'listening' }), 'Listening…');
  assert.equal(N.statusLine({ phase: 'listening', heard: 'partial words' }), 'Listening…'); // nothing to show yet
  assert.equal(N.statusLine({ phase: 'transcribing' }), 'Transcribing…');
  assert.equal(N.statusLine({ phase: 'transcribing', heard: 'What is your name?' }), '“What is your name?”');
  assert.equal(N.statusLine({ phase: 'thinking' }), 'Thinking…');
  assert.equal(N.statusLine({ phase: 'thinking', heard: 'What is your name?' }), '“What is your name?”');
  assert.equal(N.statusLine({ phase: 'speaking' }), 'Speaking…');
  assert.equal(N.statusLine({ phase: 'synthesizing' }), 'Speaking…');
  assert.equal(N.statusLine({ phase: 'starting' }), 'Starting voice…');
  assert.equal(N.statusLine({ phase: 'off' }), 'Idle'); // 'off' is not a live phase
});
test('statusLine: hold-to-talk, then timer, then music, then wake, then call, then idle', () => {
  assert.equal(N.statusLine({ holdActive: true, timerRunning: true, timerEndsAt: 999999 }), 'Listening…');
  const now = 1000000;
  assert.equal(N.statusLine({ timerRunning: true, timerEndsAt: now + 754000, now, musicPlaying: true, musicTitle: 'Song' }), '⏱ 12:34 left');
  assert.equal(N.statusLine({ timerPaused: true, timerRemainingMs: 754000, musicPlaying: true }), '⏸ 12:34 paused');
  assert.equal(N.statusLine({ musicPlaying: true, musicTitle: 'Lo-fi beats', wakeListening: true }), '🎵 Lo-fi beats');
  assert.equal(N.statusLine({ musicPlaying: true, musicTitle: '  ' }), '🎵 Music playing');
  assert.equal(N.statusLine({ wakeListening: true, voiceActive: true }), 'Say "Hey Daru"');
  assert.equal(N.statusLine({ voiceActive: true }), 'Voice call on');
  assert.equal(N.statusLine({}), 'Idle');
  assert.equal(N.statusLine(null), 'Idle');
});
test('statusLine: long song titles are truncated', () => {
  const line = N.statusLine({ musicPlaying: true, musicTitle: 'x'.repeat(80) });
  assert.ok(line.length <= 34);
});
test('statusDot: green for any live listening signal, grey otherwise', () => {
  assert.equal(N.statusDot({ phase: 'listening' }), 'on');
  assert.equal(N.statusDot({ holdActive: true }), 'on');
  assert.equal(N.statusDot({ voiceActive: true }), 'on');
  assert.equal(N.statusDot({ wakeListening: true }), 'on');
  assert.equal(N.statusDot({ phase: 'off' }), 'off');
  assert.equal(N.statusDot({ timerRunning: true }), 'off');
  assert.equal(N.statusDot({}), 'off');
});

// --- status pill ----------------------------------------------------------------------------
test('statusPill: DND beats everything; phases map to LISTENING / TRANSCRIBING / THINKING / SPEAKING', () => {
  assert.deepEqual(N.statusPill({ dnd: true, phase: 'listening' }), { text: 'DND', tone: 'dnd' });
  assert.deepEqual(N.statusPill({ phase: 'listening' }), { text: 'LISTENING', tone: 'on' });
  assert.deepEqual(N.statusPill({ phase: 'transcribing' }), { text: 'TRANSCRIBING', tone: 'busy' });
  assert.deepEqual(N.statusPill({ phase: 'starting' }), { text: 'LISTENING', tone: 'on' });
  assert.deepEqual(N.statusPill({ holdActive: true }), { text: 'LISTENING', tone: 'on' });
  assert.deepEqual(N.statusPill({ voiceActive: true }), { text: 'LISTENING', tone: 'on' });
  assert.deepEqual(N.statusPill({ phase: 'thinking' }), { text: 'THINKING', tone: 'busy' });
  assert.deepEqual(N.statusPill({ phase: 'speaking' }), { text: 'SPEAKING', tone: 'busy' });
  assert.deepEqual(N.statusPill({ phase: 'synthesizing' }), { text: 'SPEAKING', tone: 'busy' });
});
test('statusPill: wake armed is STANDBY, everything else IDLE; never OFFLINE', () => {
  assert.deepEqual(N.statusPill({ wakeListening: true }), { text: 'STANDBY', tone: 'standby' });
  assert.deepEqual(N.statusPill({}), { text: 'IDLE', tone: 'idle' });
  assert.deepEqual(N.statusPill({ timerRunning: true, musicPlaying: true }), { text: 'IDLE', tone: 'idle' });
  assert.deepEqual(N.statusPill(null), { text: 'IDLE', tone: 'idle' });
  for (const sig of [{}, { phase: 'off' }, { dnd: false }, null, undefined]) {
    assert.notEqual(N.statusPill(sig).text, 'OFFLINE');
  }
});

// --- stats formatting ---------------------------------------------------------------------------
test('formatCountdown: mm:ss, clamped at zero', () => {
  assert.equal(N.formatCountdown(754000), '12:34');
  assert.equal(N.formatCountdown(0), '00:00');
  assert.equal(N.formatCountdown(-5000), '00:00');
  assert.equal(N.formatCountdown(9000), '00:09');
});
test('cpuPercent: busy fraction across cores; null when the pair cannot say', () => {
  const prev = [{ idle: 100, total: 200 }, { idle: 50, total: 100 }];
  const next = [{ idle: 150, total: 300 }, { idle: 50, total: 200 }];
  // idle +50 of +200 total -> 75% busy
  assert.equal(N.cpuPercent(prev, next), 75);
  assert.equal(N.cpuPercent(prev, prev), null); // no time passed
  assert.equal(N.cpuPercent(null, next), null);
  assert.equal(N.cpuPercent(prev, [{ idle: 1, total: 2 }]), null); // core count changed
  assert.equal(N.cpuPercent([{ idle: 'x', total: 2 }], next), null);
  assert.equal(N.cpuPercent([{ idle: 0, total: 100 }], [{ idle: 100, total: 200 }]), 0);
  assert.equal(N.cpuPercent([{ idle: 0, total: 100 }], [{ idle: 0, total: 200 }]), 100);
});
test('percent: rounded share of a total; null when the pair cannot say', () => {
  assert.equal(N.percent(1, 4), 25);
  assert.equal(N.percent(3.1, 16), 19);
  assert.equal(N.percent(0, 16), 0);
  assert.equal(N.percent(20, 16), 100); // clamped
  assert.equal(N.percent(1, 0), null);
  assert.equal(N.percent(NaN, 16), null);
  assert.equal(N.percent(1, NaN), null);
});
test('formatBytes: GB with one trimmed decimal, MB/KB below', () => {
  assert.equal(N.formatBytes(16 * 1073741824), '16 GB');
  assert.equal(N.formatBytes(3.14 * 1073741824), '3.1 GB');
  assert.equal(N.formatBytes(512 * 1048576), '512 MB');
  assert.equal(N.formatBytes(2048), '2 KB');
  assert.equal(N.formatBytes(-1), '—');
  assert.equal(N.formatBytes(NaN), '—');
});
test('formatGlance: Dexter-style one-liner; em dash when a value is unknown', () => {
  assert.equal(N.formatGlance({ cpuPct: 12, ramUsed: 3.1 * 1073741824, ramTotal: 16 * 1073741824 }), 'CPU 12% · RAM 3.1/16 GB');
  assert.equal(N.formatGlance({ cpuPct: null, ramUsed: 3.1 * 1073741824, ramTotal: 16 * 1073741824 }), 'CPU — · RAM 3.1/16 GB');
  assert.equal(N.formatGlance({}), 'CPU — · RAM —');
  assert.equal(N.formatGlance({ cpuPct: 250, ramUsed: 256 * 1048576, ramTotal: 512 * 1048576 }), 'CPU 100% · RAM 256 MB/512 MB');
});
test('statsLine: known values in CPU/RAM/battery order; unknowns omitted, never faked', () => {
  assert.equal(N.statsLine({ cpuPct: 28, ramPct: 65, batteryPct: 82 }), 'CPU 28% · RAM 65% · 🔋 82%');
  assert.equal(N.statsLine({ cpuPct: 28, ramPct: 65 }), 'CPU 28% · RAM 65%');
  assert.equal(N.statsLine({ batteryPct: 82 }), '🔋 82%');
  assert.equal(N.statsLine({ cpuPct: null, ramPct: null, batteryPct: null }), '');
  assert.equal(N.statsLine({}), '');
  assert.equal(N.statsLine({ cpuPct: 250 }), 'CPU 100%'); // clamped
});
