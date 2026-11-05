// Animation event wiring (last-mile item 3): one pure map from pet events
// to the animation pack's GIF assets + the closest sprite animation the
// app's own atlas (manifest.json) can already play. The pet renderer draws
// sprites from the atlas; the GIF is shown as an overlay at the same wiring
// points (see renderer.js pet-gif handling), and LASTMILE.md documents how
// the sprite pipeline can substitute or drop the GIF layer entirely.
//
// Every event resolves through forEvent(); unknown events return null so
// callers can fire-and-forget. GIF files live at the repo root next to the
// first pack's three (portal_travel.gif, vanish.gif, cursor_chase.gif).
(function (root) {
  const fs = typeof require === 'function' ? (() => { try { return require('node:fs'); } catch { return null; } })() : null;
  const path = typeof require === 'function' ? (() => { try { return require('node:path'); } catch { return null; } })() : null;

  // event -> {gif, sprite, ms}  (ms = how long the GIF overlay stays up)
  const EVENTS = {
    'celebrate':        { gif: 'celebrate_jump.gif', sprite: 'leap',    ms: 2600 }, // focus timer completed
    'wake-trigger':     { gif: 'summon.gif',         sprite: 'portal',  ms: 2200 }, // "Hey Shiba" heard
    'listening-start':  { gif: 'charging.gif',       sprite: 'scan',    ms: 1800 }, // voice call starts listening
    'power-run':        { gif: 'hacking.gif',        sprite: 'gesture', ms: 2400 }, // power-mode command running
    'timer-ignored':    { gif: 'rage_mode.gif',      sprite: 'rage',    ms: 2400 }, // break nudge ignored repeatedly
    'roam-fly':         { gif: 'fly.gif',            sprite: 'leap',    ms: 2600 }, // roam: long move
    'roam-fast':        { gif: 'web_swing.gif',      sprite: 'swing',   ms: 2200 }, // roam: fast move
    'perch-climb':      { gif: 'climb.gif',          sprite: 'climb',   ms: 2000 }, // climbing onto a title bar
    'drag-drop':        { gif: 'fall_getup.gif',     sprite: 'getup',   ms: 1800 }, // dropped after a drag
    'proactive-comment':{ gif: 'gesture_point.gif',  sprite: 'gesture', ms: 2200 }, // pet speaks up / points
    'scene-change':     { gif: 'gesture_point.gif',  sprite: 'gesture', ms: 2200 }, // vision noticed something new
    'chat-reaction':    { gif: 'emote_pack.gif',     sprite: 'emote',   ms: 2000 }, // chat reply while pet is out
    'tap-combo':        { gif: 'throw_attack.gif',   sprite: 'swing',   ms: 1800 }, // 3 quick taps = playful throw
    'long-idle':        { gif: 'sleep.gif',          sprite: 'sleep',   ms: 3000 }, // untouched for a long while
    'idle':             { gif: 'idle_breathe.gif',   sprite: 'idle',    ms: 3000 }, // default breathing
    'portal':           { gif: 'portal_travel.gif',  sprite: 'portal',  ms: 1800 }, // roam portal transition
    'vanish':           { gif: 'vanish.gif',         sprite: 'portal',  ms: 1500 }, // roam vanish half
    'cursor-chase':     { gif: 'cursor_chase.gif',   sprite: 'cursor',  ms: 2600 }, // cursor play
  };

  function forEvent(name) {
    const e = EVENTS[name];
    return e ? { event: name, gif: e.gif, sprite: e.sprite, ms: e.ms } : null;
  }
  function eventNames() { return Object.keys(EVENTS); }

  // True when the GIF asset exists on disk next to this module (main/tests).
  function assetExists(name, dir) {
    const e = EVENTS[name];
    if (!e || !fs || !path) return false;
    try { return fs.existsSync(path.join(dir || __dirname, e.gif)); } catch { return false; }
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
