const test = require('node:test'), assert = require('node:assert/strict');
const N = require('./notch.cjs');

// --- deck model -------------------------------------------------------------
test('saneDeck: defaults when the saved value is not an array', () => {
  assert.deepEqual(N.saneDeck(undefined), N.DEFAULT_DECK);
  assert.deepEqual(N.saneDeck('mic'), N.DEFAULT_DECK);
  assert.deepEqual(N.saneDeck(null), N.DEFAULT_DECK);
  assert.notEqual(N.saneDeck(undefined), N.DEFAULT_DECK); // a copy, never the shared array
});
test('saneDeck: keeps known ids in order, drops unknown, dedupes, caps', () => {
  assert.deepEqual(N.saneDeck(['music', 'bogus', 'mic', 'music', 42, 'chat']), ['music', 'mic', 'chat']);
  const all = ['mic', 'timer', 'note', 'music', 'chat', 'discord', 'vision', 'mic'];
  assert.equal(N.saneDeck(all).length, N.MAX_DECK);
  assert.deepEqual(N.saneDeck([]), []);
});
test('deckAdd: appends a known action; refuses duplicates, unknowns, full decks', () => {
  assert.deepEqual(N.deckAdd(['mic'], 'vision'), ['mic', 'vision']);
  assert.equal(N.deckAdd(['mic'], 'mic'), null);
  assert.equal(N.deckAdd(['mic'], 'bogus'), null);
  assert.equal(N.deckAdd(N.ACTION_IDS.slice(), 'mic'), null); // already full (and present)
  const six = ['mic', 'timer', 'note', 'music', 'chat', 'discord'];
  assert.deepEqual(N.deckAdd(six, 'vision').length, 7);
  assert.equal(N.deckAdd([...six, 'vision'], 'mic'), null); // full
});
test('deckRemove: removes a present action; refuses absent ones', () => {
  assert.deepEqual(N.deckRemove(['mic', 'chat'], 'mic'), ['chat']);
  assert.deepEqual(N.deckRemove(['mic'], 'mic'), []);
  assert.equal(N.deckRemove(['mic'], 'chat'), null);
});
test('deckMove: swaps with a neighbour; refuses moves off either end', () => {
  assert.deepEqual(N.deckMove(['mic', 'timer', 'chat'], 'timer', -1), ['timer', 'mic', 'chat']);
  assert.deepEqual(N.deckMove(['mic', 'timer', 'chat'], 'timer', 1), ['mic', 'chat', 'timer']);
  assert.equal(N.deckMove(['mic', 'timer'], 'mic', -1), null);
  assert.equal(N.deckMove(['mic', 'timer'], 'timer', 1), null);
  assert.equal(N.deckMove(['mic'], 'chat', 1), null);
});
test('availableActions: exactly the known ids not in the deck', () => {
  assert.deepEqual(N.availableActions(['mic', 'timer', 'note', 'music', 'chat']), ['discord', 'vision']);
  assert.deepEqual(N.availableActions([]), N.ACTION_IDS);
});
test('deck edits never mutate the input deck', () => {
  const d = ['mic', 'timer'];
  N.deckAdd(d, 'chat'); N.deckRemove(d, 'mic'); N.deckMove(d, 'timer', -1);
  assert.deepEqual(d, ['mic', 'timer']);
});

// --- settings shape -----------------------------------------------------------
test('saneNotchSettings: master on by default, mode validated, deck sanitized', () => {
  assert.deepEqual(N.saneNotchSettings({}), { enabled: true, mode: 'always', deck: N.DEFAULT_DECK });
  assert.deepEqual(N.saneNotchSettings({ notch: false, notchMode: 'hover', notchDeck: ['chat'] }),
    { enabled: false, mode: 'hover', deck: ['chat'] });
  assert.equal(N.saneNotchSettings({ notchMode: 'sometimes' }).mode, 'always');
  assert.equal(N.saneNotchSettings(null).enabled, true);
});

// --- state machine --------------------------------------------------------------
test('machine: always mode walks collapsed -> hover -> open -> collapsed', () => {
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
  assert.equal(m.toggleOpen(), 'open'); // opening from collapsed works
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

// --- status line ------------------------------------------------------------------
test('statusLine: pet out beats everything', () => {
  assert.equal(N.statusLine({ petOut: true, phase: 'thinking', timerRunning: true }), 'Out on your desktop');
});
test('statusLine: voice phases map to Listening / Thinking / Talking', () => {
  assert.equal(N.statusLine({ phase: 'listening' }), 'Listening…');
  assert.equal(N.statusLine({ phase: 'transcribing' }), 'Listening…');
  assert.equal(N.statusLine({ phase: 'thinking' }), 'Thinking…');
  assert.equal(N.statusLine({ phase: 'speaking' }), 'Talking…');
  assert.equal(N.statusLine({ phase: 'synthesizing' }), 'Talking…');
  assert.equal(N.statusLine({ phase: 'starting' }), 'Starting voice…');
  assert.equal(N.statusLine({ phase: 'off' }), 'Idle'); // 'off' is not a live phase
});
test('statusLine: hold-to-talk, then timer, then music, then wake, then call, then idle', () => {
  assert.equal(N.statusLine({ holdActive: true, timerRunning: true, timerEndsAt: 999999 }), 'Listening…');
  const now = 1000000;
  assert.equal(N.statusLine({ timerRunning: true, timerEndsAt: now + 754000, now, musicPlaying: true, musicTitle: 'Song' }), '⏱ 12:34 left');
  assert.equal(N.statusLine({ musicPlaying: true, musicTitle: 'Lo-fi beats', wakeListening: true }), '🎵 Lo-fi beats');
  assert.equal(N.statusLine({ musicPlaying: true, musicTitle: '  ' }), '🎵 Music playing');
  assert.equal(N.statusLine({ wakeListening: true, voiceActive: true }), 'Say "Hey Rex"');
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

// --- glance formatting ---------------------------------------------------------------
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
