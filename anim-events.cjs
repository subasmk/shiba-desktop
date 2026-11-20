// Sprite-native event routing. Each state resolves to Vex art in mascot-anims.cjs.
(function (root) {
  const fs = typeof require === 'function' ? (() => { try { return require('node:fs'); } catch { return null; } })() : null;
  const path = typeof require === 'function' ? (() => { try { return require('node:path'); } catch { return null; } })() : null;

  // event -> requested state and duration
  const EVENTS = {
    'celebrate':        { sprite: 'leap',    ms: 2600 }, // focus timer completed
    'wake-trigger':     { sprite: 'wave',    ms: 2200 }, // "Hey Rex" heard (sprite was 'portal'; portal art is parked)
    'listening-start':  { sprite: 'scan',    ms: 1800 }, // voice call starts listening
    'power-run':        { sprite: 'scan',    ms: 2400 }, // power-mode command running (scan = the laptop-working sprite; gesture could not convey work)
    'timer-ignored':    { sprite: 'rage',    ms: 2400 }, // break nudge ignored repeatedly
    'roam-fly':         { sprite: 'leap',    ms: 2600 }, // roam: long move
    'roam-fast':        { sprite: 'run',   ms: 2200 }, // roam: fast move (run = fast walk cycle; swing is the katana attack, wrong meaning for travel)
    'drag-drop':        { sprite: 'getup',   ms: 1800 }, // dropped after a drag
    'proactive-comment':{ sprite: 'gesture', ms: 2200 }, // pet speaks up / points
    'scene-change':     { sprite: 'gesture', ms: 2200 }, // vision noticed something new
    'chat-reaction':    { sprite: 'emote',   ms: 2000 }, // chat reply while pet is out
    'tap-combo':        { sprite: 'swing',   ms: 1800 }, // 3 quick taps = playful throw
    'long-idle':        { sprite: 'sleep',   ms: 3000 }, // untouched for a long while
    'idle':             { sprite: 'idle',    ms: 3000 }, // default breathing
  };

  function forEvent(name) {
    const e = EVENTS[name];
    return e ? { event: name, sprite: e.sprite, ms: e.ms } : null;
  }
  function eventNames() { return Object.keys(EVENTS); }

  // True when the sole Vex atlas exists on disk (main/tests).
  function assetExists(name, dir) {
    const e = EVENTS[name];
    if (!e || !fs || !path) return false;
    try { return fs.existsSync(path.join(dir || __dirname, '6-sprites-vex.png')); } catch { return false; }
  }
  function allAssetsExist(dir) { return eventNames().every((n) => assetExists(n, dir)); }

  // --- pure trigger conditions ---------------------------------------------
  // Three taps inside windowMs = a playful tap combo (throw_attack).
  function isTapCombo(tapTimes, now, { windowMs = 1600, count = 3 } = {}) {
    if (!Array.isArray(tapTimes)) return false;
    const recent = tapTimes.filter((t) => now - t <= windowMs && t <= now);
    return recent.length >= count;
  }
  // Roam move kind from travel distance: long -> fly, medium -> web_swing.
  function roamMoveKind(distancePx, { flyPx = 700, fastPx = 340 } = {}) {
    const d = Math.abs(Number(distancePx) || 0);
    if (d >= flyPx) return 'roam-fly';
    if (d >= fastPx) return 'roam-fast';
    return null; // ordinary walk keeps the walk sprite, no event
  }
  // Long-idle: no interaction for idleMs while the pet sits in plain idle.
  function isLongIdle(lastInteractAt, now, { idleMs = 5 * 60000 } = {}) {
    return Number.isFinite(lastInteractAt) && lastInteractAt > 0 && now - lastInteractAt >= idleMs;
  }

  const api = { EVENTS, forEvent, eventNames, assetExists, allAssetsExist, isTapCombo, roamMoveKind, isLongIdle };
  if (typeof module === 'object') module.exports = api;
  else root.AnimEvents = api;
})(globalThis);
