// Dexter-layout notch (V2): pure logic for the top-of-screen notch window.
//
// This module holds everything about the notch that does not need
// Electron: the tile model for the 12-slot deck (app tiles, action
// tiles, live info tiles), the picker candidates for Edit mode, the
// collapsed-peek / expanded state machine with its deck|chat views and
// editing flag, the header status pill, and the stats formatting.
// main.cjs owns the actual BrowserWindows and feeds this module plain
// data; notch.js (the window's renderer) loads the same file as a
// classic script and drives a NotchMachine locally, mirroring how
// pet-behavior / roam / anim-events are shared with the pet renderer.
// Settings shape (persisted by main in settings.json):
//   notch      - master switch, default ON
//   notchMode  - 'always' | 'hover' | 'off'
//   notchDeck  - array of tile descriptors (see saneTile), max 12
//   notchStats - floating stats pill switch, default ON
//   notchDnd   - do-not-disturb: proactive pet comments are suppressed
(function (root) {
  'use strict';

  const MODES = ['always', 'hover', 'off'];

  function clean(s, max) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max); }

  // --- tile model --------------------------------------------------------------
  // A deck tile is one of:
  //   { kind:'app',    name }                 - launches an installed app
  //   { kind:'action', id, name? }            - a built-in action; 'name'
  //                                             is only for 'run-routine'
  //   { kind:'info',   id }                   - a live value (cpu/ram/battery)
  const TILE_ACTIONS = {
    mic: { label: 'Mic', icon: '🎤' },
    timer: { label: 'Timer', icon: '⏱' },
    note: { label: 'Note', icon: '📝' },
    music: { label: 'Music', icon: '🎵' },
    'music-next': { label: 'Next track', icon: '⏭' },
    playlists: { label: 'Playlists', icon: '🎶' },
    dnd: { label: 'Do not disturb', icon: '🔕' },
    routines: { label: 'Routine list', icon: '📋' },
    'run-routine': { label: 'Run a routine', icon: '▶️' },
    chat: { label: 'Chat', icon: '💬' },
    vision: { label: 'Vision', icon: '👁' },
    'discord-post': { label: 'Discord post', icon: '👾' },
  };
  const TILE_INFO = {
    cpu: { label: 'CPU', icon: 'CPU' },
    ram: { label: 'RAM', icon: 'RAM' },
    battery: { label: 'Battery', icon: '🔋' },
  };
  const MAX_TILES = 12;
  const DEFAULT_DECK = [
    { kind: 'action', id: 'mic' },
    { kind: 'action', id: 'timer' },
    { kind: 'action', id: 'note' },
    { kind: 'action', id: 'music' },
    { kind: 'action', id: 'chat' },
  ];

  // Validate + normalize one raw tile. V1 decks stored bare action-id
  // strings; those migrate here ('discord' meant "post to discord",
  // which is the V2 'discord-post' action). Returns null when invalid.
  function saneTile(raw) {
    if (typeof raw === 'string') {
      const id = raw === 'discord' ? 'discord-post' : raw;
      return TILE_ACTIONS[id] ? { kind: 'action', id } : null;
    }
    if (!raw || typeof raw !== 'object') return null;
    if (raw.kind === 'app') {
      const name = clean(raw.name, 60);
      return name ? { kind: 'app', name } : null;
    }
    if (raw.kind === 'action') {
      if (!TILE_ACTIONS[raw.id]) return null;
      if (raw.id === 'run-routine') {
        const name = clean(raw.name, 40);
        return name ? { kind: 'action', id: 'run-routine', name } : null;
      }
      return { kind: 'action', id: raw.id };
    }
    if (raw.kind === 'info') {
      return TILE_INFO[raw.id] ? { kind: 'info', id: raw.id } : null;
    }
    return null;
  }
  function tileKey(t) {
    const tile = saneTile(t);
    if (!tile) return '';
    if (tile.kind === 'app') return 'app:' + tile.name.toLowerCase();
    if (tile.kind === 'info') return 'info:' + tile.id;
    return 'action:' + tile.id + (tile.id === 'run-routine' ? ':' + tile.name.toLowerCase() : '');
  }
  function tileLabel(t) {
    const tile = saneTile(t);
    if (!tile) return '';
    if (tile.kind === 'app') return tile.name;
    if (tile.kind === 'info') return TILE_INFO[tile.id].label;
    if (tile.id === 'run-routine') return 'Run: ' + tile.name;
    return TILE_ACTIONS[tile.id].label;
  }
  function tileIcon(t) {
    const tile = saneTile(t);
    if (!tile || tile.kind === 'app') return '';
    return tile.kind === 'info' ? TILE_INFO[tile.id].icon : TILE_ACTIONS[tile.id].icon;
  }

  // --- deck model ----------------------------------------------------------------
  function saneDeck(raw) {
    if (!Array.isArray(raw)) return DEFAULT_DECK.map((t) => ({ ...t }));
    const out = [];
    const seen = new Set();
    for (const rawTile of raw) {
      const tile = saneTile(rawTile);
      if (!tile) continue;
      const key = tileKey(tile);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tile);
      if (out.length >= MAX_TILES) break;
    }
    return out;
  }
  // Each edit returns a NEW deck, or null when the edit is not valid
  // (invalid tile, duplicate, deck full, item absent, index out of range).
  function deckAdd(deck, tile) {
    const d = saneDeck(deck);
    const t = saneTile(tile);
    if (!t || d.length >= MAX_TILES) return null;
    if (d.some((x) => tileKey(x) === tileKey(t))) return null;
    return [...d, t];
  }
  function deckRemove(deck, tile) {
    const d = saneDeck(deck);
    const key = tileKey(tile);
    if (!key || !d.some((x) => tileKey(x) === key)) return null;
    return d.filter((x) => tileKey(x) !== key);
  }
  function deckRemoveAt(deck, index) {
    const d = saneDeck(deck);
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= d.length) return null;
    return d.filter((_, j) => j !== i);
  }

  // First-run deck when the user has never saved one: up to three app
  // tiles (Discord, Chrome, Steam when installed, else the first apps
  // the scan found) followed by Do Not Disturb, Routine list and Music -
  // the shape of the reference deck, built only from what exists here.
  function defaultDeckForApps(appNames) {
    const names = [];
    for (const raw of Array.isArray(appNames) ? appNames : []) {
      const n = clean(raw, 60);
      if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
    }
    const chosen = [];
    for (const re of [/discord/i, /chrome/i, /steam/i]) {
      const hit = names.find((n) => re.test(n));
      if (hit && !chosen.includes(hit)) chosen.push(hit);
    }
    for (const n of names) {
      if (chosen.length >= 3) break;
      if (!chosen.includes(n)) chosen.push(n);
    }
    return [
      ...chosen.map((name) => ({ kind: 'app', name })),
      { kind: 'action', id: 'dnd' },
      { kind: 'action', id: 'routines' },
      { kind: 'action', id: 'music' },
    ];
  }

  // --- edit-mode picker ------------------------------------------------------------
  const PICKER_CATEGORIES = ['Stats', 'Rex', 'Music', 'Socials', 'Desktop'];
  // Every tile the picker can offer, grouped by category. Candidates
  // already in the deck are flagged inDeck (the deck refuses duplicates,
  // so the UI can show them as added instead of hiding them).
  function pickerCandidates({ apps = [], routines = [], deck = [] } = {}) {
    const inDeck = new Set(saneDeck(deck).map(tileKey));
    const mark = (t) => ({ ...t, inDeck: inDeck.has(tileKey(t)) });
    const appNames = [];
    for (const raw of Array.isArray(apps) ? apps : []) {
      const n = clean(raw, 60);
      if (n && !appNames.some((x) => x.toLowerCase() === n.toLowerCase())) appNames.push(n);
    }
    const routineTiles = (Array.isArray(routines) ? routines : [])
      .map((name) => saneTile({ kind: 'action', id: 'run-routine', name }))
      .filter(Boolean);
    const discordApp = appNames.find((n) => /discord/i.test(n));
    return {
      Stats: [
        mark({ kind: 'info', id: 'cpu' }),
        mark({ kind: 'info', id: 'ram' }),
        mark({ kind: 'info', id: 'battery' }),
      ],
      Rex: [
        mark({ kind: 'action', id: 'mic' }),
        mark({ kind: 'action', id: 'timer' }),
        mark({ kind: 'action', id: 'note' }),
        mark({ kind: 'action', id: 'chat' }),
        mark({ kind: 'action', id: 'vision' }),
        mark({ kind: 'action', id: 'dnd' }),
        mark({ kind: 'action', id: 'routines' }),
        ...routineTiles.map(mark),
      ],
      Music: [
        mark({ kind: 'action', id: 'music' }),
        mark({ kind: 'action', id: 'music-next' }),
        mark({ kind: 'action', id: 'playlists' }),
      ],
      Socials: [
        mark({ kind: 'action', id: 'discord-post' }),
        ...(discordApp ? [mark({ kind: 'app', name: discordApp })] : []),
      ],
      Desktop: appNames.map((name) => mark({ kind: 'app', name })),
    };
  }
  function filterTiles(tiles, query) {
    const q = clean(query, 60).toLowerCase();
    if (!q) return Array.isArray(tiles) ? tiles.slice() : [];
    return (Array.isArray(tiles) ? tiles : []).filter((t) => tileLabel(t).toLowerCase().includes(q));
  }

  // --- settings shape ---------------------------------------------------------------
  function saneNotchSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: r.notch !== false,
      mode: MODES.includes(r.notchMode) ? r.notchMode : 'always',
      // null (not a fallback deck) when the user has never saved a deck:
      // main then substitutes the first-run default built from the app
      // scan. A saved deck - even an empty one - is honoured as saved.
      deck: Array.isArray(r.notchDeck) ? saneDeck(r.notchDeck) : null,
      stats: r.notchStats !== false,
      dnd: !!r.notchDnd,
    };
  }

  // --- state machine ------------------------------------------------------------------
  // Visible state is a base (from mode) plus an expansion layer:
  //   mode 'off' / disabled -> hidden
  //   mode 'hover'          -> sliver until the cursor reaches the top
  //                            edge (pointerTop), then the peek tab
  //   mode 'always'         -> peek tab (collapsed)
  //   expansion 'hover'     -> the panel, shown while the pointer is over it
  //   expansion 'open'      -> the panel, pinned (click / edit mode)
  // view ('deck' | 'chat') and editing are orthogonal flags that only
  // matter while the panel is up. petOut is orthogonal too: the cat has
  // been dragged out onto the desktop; it changes the face/status,
  // never the state itself.
  class NotchMachine {
    constructor({ enabled = true, mode = 'always' } = {}) {
      this.enabled = !!enabled;
      this.mode = MODES.includes(mode) ? mode : 'always';
      this.expanded = 'none'; // 'none' | 'hover' | 'open'
      this.awake = false;     // hover mode: cursor has reached the top edge
      this.petOut = false;
      this.view = 'deck';     // 'deck' | 'chat'
      this.editing = false;
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
      if (!this.enabled) { this.expanded = 'none'; this.awake = false; this.editing = false; }
      return this.state;
    }
    setMode(mode) {
      if (MODES.includes(mode)) this.mode = mode;
      if (this.mode === 'off') { this.expanded = 'none'; this.awake = false; this.editing = false; }
      if (this.mode !== 'hover') this.awake = false;
      return this.state;
    }
    setPetOut(out) { this.petOut = !!out; return this.state; }
    setView(view) {
      if (view !== 'deck' && view !== 'chat') return this.state;
      this.view = view;
      if (this.expanded === 'none' && this.base === 'collapsed') this.expanded = 'open';
      if (this.base === 'sliver') { this.awake = true; this.expanded = 'open'; }
      return this.state;
    }
    setEditing(on) {
      this.editing = !!on;
      if (this.editing) {
        if (this.base === 'sliver') this.awake = true;
        if (this.base !== 'hidden') this.expanded = 'open';
        this.view = 'deck';
      }
      return this.state;
    }
    // Cursor reached the top-center edge (hover mode): sliver wakes to
    // the peek tab. No-op in other modes.
    pointerTop() {
      if (this.base === 'sliver') this.awake = true;
      return this.state;
    }
    // Cursor left the whole notch area: collapse the expansion and any
    // edit session; in hover mode the tab also goes back to sleep.
    pointerAway() {
      this.expanded = 'none';
      this.editing = false;
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
      if (this.expanded === 'open') { this.expanded = 'none'; this.editing = false; return this.state; }
      if (this.base === 'sliver') this.awake = true;
      if (this.base !== 'hidden') this.expanded = 'open';
      return this.state;
    }
    closePanel() {
      if (this.expanded === 'open' || this.expanded === 'hover') this.expanded = 'none';
      this.editing = false;
      return this.state;
    }
  }

  // --- status --------------------------------------------------------------------------
  // Signals main can actually know (voice-session phases are forwarded by
  // the panel; the rest lives in main already). Priority for the status
  // LINE: the cat being out beats everything, then a live voice phase,
  // then hold-to-talk, then the focus timer, then music, then wake-word
  // readiness.
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
  // The peek tab's dot: green whenever any live listening/voice signal
  // is on, grey otherwise.
  function statusDot(s) {
    const sig = s && typeof s === 'object' ? s : {};
    return (PHASE_LINES[String(sig.phase || '')] || sig.holdActive || sig.voiceActive || sig.wakeListening) ? 'on' : 'off';
  }
  // The expanded header's status pill: a short label + tone, mapped
  // honestly from the same signals. There is deliberately no OFFLINE
  // state: this app has no live brain-health signal to back it, so the
  // pill never claims one.
  function statusPill(s) {
    const sig = s && typeof s === 'object' ? s : {};
    if (sig.dnd) return { text: 'DND', tone: 'dnd' };
    const phase = String(sig.phase || '');
    if (phase === 'listening' || phase === 'transcribing' || phase === 'starting' || sig.holdActive || sig.voiceActive) {
      return { text: 'LISTENING', tone: 'on' };
    }
    if (phase === 'thinking') return { text: 'THINKING', tone: 'busy' };
    if (phase === 'speaking' || phase === 'synthesizing') return { text: 'TALKING', tone: 'busy' };
    if (sig.wakeListening) return { text: 'STANDBY', tone: 'standby' };
    return { text: 'IDLE', tone: 'idle' };
  }

  // --- stats / glance formatting ---------------------------------------------------------
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
  function percent(part, total) {
    const p = Number(part), t = Number(total);
    if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((100 * p) / t)));
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
  // The floating stats pill's one-liner: whichever of CPU / RAM /
  // battery are known, in that order; unknown values are omitted,
  // never faked.
  function statsLine(s) {
    const sig = s && typeof s === 'object' ? s : {};
    const parts = [];
    if (Number.isFinite(sig.cpuPct)) parts.push('CPU ' + Math.max(0, Math.min(100, Math.round(sig.cpuPct))) + '%');
    if (Number.isFinite(sig.ramPct)) parts.push('RAM ' + Math.max(0, Math.min(100, Math.round(sig.ramPct))) + '%');
    if (Number.isFinite(sig.batteryPct)) parts.push('🔋 ' + Math.max(0, Math.min(100, Math.round(sig.batteryPct))) + '%');
    return parts.join(' · ');
  }

  const api = {
    MODES, TILE_ACTIONS, TILE_INFO, MAX_TILES, DEFAULT_DECK,
    clean, saneTile, tileKey, tileLabel, tileIcon,
    saneDeck, deckAdd, deckRemove, deckRemoveAt, defaultDeckForApps,
    PICKER_CATEGORIES, pickerCandidates, filterTiles,
    saneNotchSettings, NotchMachine,
    PHASE_LINES, statusLine, statusDot, statusPill,
    formatCountdown, cpuPercent, percent, formatBytes, formatGlance, statsLine,
  };
  if (typeof module === 'object') module.exports = api;
  else root.Notch = api;
})(globalThis);
