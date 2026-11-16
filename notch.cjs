// Dexter-spec notch: pure logic for the top-of-screen notch window.
//
// This module holds everything about the notch that does not need
// Electron: the deck model (which quick actions sit in the bar), the
// collapsed / hover / open state machine with its mode gating, the
// status line shown next to the cat, and the glance (CPU / RAM)
// formatting. main.cjs owns the actual BrowserWindow and feeds this
// module's functions plain data; notch.js (the window's renderer) loads
// the same file as a classic script and drives a NotchMachine locally,
// mirroring how pet-behavior / roam / anim-events are shared with the
// pet renderer. Settings shape (persisted by main in settings.json):
//   notch     - master switch, default ON
//   notchMode - 'always' | 'hover' | 'off'
//   notchDeck - array of action ids, edited in the notch itself
(function (root) {
  'use strict';

  const MODES = ['always', 'hover', 'off'];

  // Every action the deck can hold. Ids are the contract with main's
  // dispatcher; labels/icons are display only.
  const ACTIONS = {
    mic: { label: 'Mic', icon: '🎤' },
    timer: { label: 'Timer', icon: '⏱' },
    note: { label: 'Note', icon: '📝' },
    music: { label: 'Music', icon: '🎵' },
    chat: { label: 'Chat', icon: '💬' },
    discord: { label: 'Discord', icon: '👾' },
    vision: { label: 'Vision', icon: '👁' },
  };
  const ACTION_IDS = Object.keys(ACTIONS);
  const DEFAULT_DECK = ['mic', 'timer', 'note', 'music', 'chat'];
  const MAX_DECK = 7;

  function clean(s, max) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max); }

  // --- deck model ------------------------------------------------------------
  function saneDeck(raw) {
    if (!Array.isArray(raw)) return DEFAULT_DECK.slice();
    const out = [];
    for (const id of raw) {
      if (typeof id === 'string' && ACTION_IDS.includes(id) && !out.includes(id)) out.push(id);
      if (out.length >= MAX_DECK) break;
    }
    return out;
  }
  // Each edit returns a NEW deck, or null when the edit is not valid
  // (unknown action, duplicate, deck full, item absent, move off an end).
  function deckAdd(deck, id) {
    const d = saneDeck(deck);
    if (!ACTION_IDS.includes(id) || d.includes(id) || d.length >= MAX_DECK) return null;
    return [...d, id];
  }
  function deckRemove(deck, id) {
    const d = saneDeck(deck);
    if (!d.includes(id)) return null;
    return d.filter((x) => x !== id);
  }
  function deckMove(deck, id, dir) {
    const d = saneDeck(deck);
    const i = d.indexOf(id);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= d.length) return null;
    const out = d.slice();
    out[i] = d[j]; out[j] = d[i];
    return out;
  }
  function availableActions(deck) {
    const d = saneDeck(deck);
    return ACTION_IDS.filter((id) => !d.includes(id));
  }

  // --- settings shape ----------------------------------------------------------
  function saneNotchSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: r.notch !== false,
      mode: MODES.includes(r.notchMode) ? r.notchMode : 'always',
      deck: saneDeck(r.notchDeck),
    };
  }

  // --- state machine -------------------------------------------------------------
  // Visible state is a base (from mode) plus an expansion layer:
  //   mode 'off' / disabled -> hidden
  //   mode 'hover'          -> sliver until the cursor reaches the top
  //                            edge (pointerTop), then collapsed
  //   mode 'always'         -> collapsed
  //   expansion 'hover'     -> the deck (only from collapsed)
  //   expansion 'open'      -> the full panel (edit deck + chat)
  // petOut is orthogonal: the cat has been dragged out onto the desktop;
  // it changes the face/status, never the state itself.
  class NotchMachine {
    constructor({ enabled = true, mode = 'always' } = {}) {
      this.enabled = !!enabled;
      this.mode = MODES.includes(mode) ? mode : 'always';
      this.expanded = 'none'; // 'none' | 'hover' | 'open'
      this.awake = false;     // hover mode: cursor has reached the top edge
      this.petOut = false;
    }
    get base() {
      if (!this.enabled || this.mode === 'off') return 'hidden';
      if (this.mode === 'hover' && !this.awake) return 'sliver';
      return 'collapsed';
    }
    get state() {
      const b = this.base;
      if (b === 'hidden') return 'hidden';
      if (this.expanded === 'open') return 'open'; // an explicitly opened panel wins over the sliver
      if (b === 'sliver') return 'sliver';
      if (this.expanded === 'hover') return 'hover';
      return 'collapsed';
    }
    setEnabled(on) {
      this.enabled = !!on;
      if (!this.enabled) { this.expanded = 'none'; this.awake = false; }
      return this.state;
    }
    setMode(mode) {
      if (MODES.includes(mode)) this.mode = mode;
      if (this.mode === 'off') { this.expanded = 'none'; this.awake = false; }
      if (this.mode !== 'hover') this.awake = false;
      return this.state;
    }
    setPetOut(out) { this.petOut = !!out; return this.state; }
    // Cursor reached the top-center edge (hover mode): sliver wakes to
    // the collapsed pill. No-op in other modes.
    pointerTop() {
      if (this.base === 'sliver') this.awake = true;
      return this.state;
    }
    // Cursor left the whole notch area: collapse the expansion; in
    // hover mode the pill also goes back to sleep (sliver).
    pointerAway() {
      this.expanded = 'none';
      if (this.mode === 'hover') this.awake = false;
      return this.state;
    }
    hoverIn() {
      if (this.base === 'collapsed' && this.expanded === 'none') this.expanded = 'hover';
      return this.state;
    }
    hoverOut() {
      if (this.expanded === 'hover') this.expanded = 'none';
      return this.state;
    }
    toggleOpen() {
      if (this.expanded === 'open') { this.expanded = 'none'; return this.state; }
      if (this.base === 'sliver') this.awake = true;
      if (this.base !== 'hidden') this.expanded = 'open';
      return this.state;
    }
    closePanel() {
      if (this.expanded === 'open') this.expanded = 'none';
      return this.state;
    }
  }

  // --- status line ---------------------------------------------------------------
  // Signals main can actually know (voice-session phases are forwarded by
  // the panel; the rest lives in main already). Priority: the cat being
  // out beats everything, then a live voice phase, then hold-to-talk,
  // then the focus timer, then music, then wake-word readiness.
  const PHASE_LINES = {
    starting: 'Starting voice…',
    listening: 'Listening…',
    transcribing: 'Listening…',
    thinking: 'Thinking…',
    synthesizing: 'Talking…',
    speaking: 'Talking…',
  };
  function statusLine(s) {
    const sig = s && typeof s === 'object' ? s : {};
    if (sig.petOut) return 'Out on your desktop';
    const ph = PHASE_LINES[String(sig.phase || '')];
    if (ph) return ph;
    if (sig.holdActive) return 'Listening…';
    if (sig.timerRunning) {
      const left = Number(sig.timerEndsAt || 0) - Number(sig.now != null ? sig.now : Date.now());
      return '⏱ ' + formatCountdown(left) + ' left';
    }
    if (sig.musicPlaying) {
      const t = clean(sig.musicTitle, 30);
      return t ? '🎵 ' + t : '🎵 Music playing';
    }
    if (sig.wakeListening) return 'Say "Hey Rex"';
    if (sig.voiceActive) return 'Voice call on';
    return 'Idle';
  }
  // The collapsed pill's dot: green whenever any live listening/voice
  // signal is on, grey otherwise.
  function statusDot(s) {
    const sig = s && typeof s === 'object' ? s : {};
    return (PHASE_LINES[String(sig.phase || '')] || sig.holdActive || sig.voiceActive || sig.wakeListening) ? 'on' : 'off';
  }

  // --- glance (CPU / RAM) ----------------------------------------------------------
  function formatCountdown(ms) {
    const total = Math.max(0, Math.round(Number(ms) / 1000) || 0);
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  // Samples are per-core {idle, total} tick sums (os.cpus().times rolled
  // up by the caller). Returns a rounded percent, or null when the pair
  // cannot say (first sample, mismatched cores, no time passed).
  function cpuPercent(prev, next) {
    if (!Array.isArray(prev) || !Array.isArray(next) || !prev.length || prev.length !== next.length) return null;
    let idle = 0, total = 0;
    for (let i = 0; i < prev.length; i++) {
      const p = prev[i], n = next[i];
      if (!p || !n || !Number.isFinite(p.idle) || !Number.isFinite(p.total) || !Number.isFinite(n.idle) || !Number.isFinite(n.total)) return null;
      idle += n.idle - p.idle;
      total += n.total - p.total;
    }
    if (total <= 0) return null;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - idle / total))));
  }
  function trimNum(v) { return String(Math.round(v * 10) / 10).replace(/\.0$/, ''); }
  function formatBytes(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '—';
    if (v >= 1073741824) return trimNum(v / 1073741824) + ' GB';
    if (v >= 1048576) return Math.round(v / 1048576) + ' MB';
    return Math.round(v / 1024) + ' KB';
  }
  function formatGlance(g) {
    const sig = g && typeof g === 'object' ? g : {};
    const cpu = Number.isFinite(sig.cpuPct) ? 'CPU ' + Math.max(0, Math.min(100, Math.round(sig.cpuPct))) + '%' : 'CPU —';
    const used = Number(sig.ramUsed), total = Number(sig.ramTotal);
    let ram = 'RAM —';
    if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
      ram = total >= 1073741824
        ? 'RAM ' + trimNum(used / 1073741824) + '/' + trimNum(total / 1073741824) + ' GB'
        : 'RAM ' + formatBytes(used) + '/' + formatBytes(total);
    }
    return cpu + ' · ' + ram;
  }

  const api = {
    MODES, ACTIONS, ACTION_IDS, DEFAULT_DECK, MAX_DECK,
    saneDeck, deckAdd, deckRemove, deckMove, availableActions,
    saneNotchSettings, NotchMachine,
    PHASE_LINES, statusLine, statusDot,
    formatCountdown, cpuPercent, formatBytes, formatGlance,
  };
  if (typeof module === 'object') module.exports = api;
  else root.Notch = api;
})(globalThis);
