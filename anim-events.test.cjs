const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const AE = require('./anim-events.cjs');

test('every required event resolves to a GIF and a sprite', () => {
  for (const name of ['celebrate', 'wake-trigger', 'listening-start', 'power-run', 'timer-ignored', 'roam-fly', 'perch-climb', 'roam-fast', 'tap-combo', 'drag-drop', 'proactive-comment', 'chat-reaction', 'long-idle', 'idle', 'portal', 'vanish', 'cursor-chase', 'scene-change'])
    a.ok(AE.forEvent(name), 'missing event ' + name);
  a.equal(AE.forEvent('nope'), null);
});
test('every event GIF asset exists at the repo root', () => {
  for (const name of AE.eventNames()) {
    const e = AE.forEvent(name);
    a.ok(fs.existsSync(path.join(__dirname, e.gif)), e.gif + ' missing');
  }
  a.equal(AE.allAssetsExist(__dirname), true);
  a.equal(AE.allAssetsExist(path.join(__dirname, 'no-such-dir')), false);
});
test('every mapped sprite exists in the app atlas manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  for (const name of AE.eventNames()) {
    const s = AE.forEvent(name).sprite;
    a.ok(Array.isArray(manifest[s]), 'sprite ' + s + ' not in manifest (event ' + name + ')');
  }
});
test('tap combo trigger: 3 taps inside the window, not spread out', () => {
  a.equal(AE.isTapCombo([1000, 1500, 2000], 2100), true);
  a.equal(AE.isTapCombo([1000, 1500, 9000], 9100), false);
  a.equal(AE.isTapCombo([1000, 1500], 1600), false);
  a.equal(AE.isTapCombo(null, 1600), false);
});
test('roam move kind from distance', () => {
  a.equal(AE.roamMoveKind(900), 'roam-fly');
  a.equal(AE.roamMoveKind(400), 'roam-fast');
  a.equal(AE.roamMoveKind(100), null);
  a.equal(AE.roamMoveKind(-900), 'roam-fly');
});
test('long idle trigger', () => {
  a.equal(AE.isLongIdle(0, 10 * 60000), false);
  a.equal(AE.isLongIdle(1000, 1000 + 5 * 60000), true);
  a.equal(AE.isLongIdle(1000, 1000 + 60000), false);
});
test('old-pack GIF overlay layer stays retired: sprites carry every event', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8');
  a.ok(!main.includes("send('pet-gif'"), 'main still sends pet-gif overlays');
  a.ok(!renderer.includes('showGif'), 'renderer still shows pack GIF overlays');
  a.ok(!renderer.includes('pet-gif'), 'renderer still has the pet-gif element/channel');
  a.ok(!preload.includes("'pet-gif'"), 'preload still exposes the pet-gif channel');
});

// Behavior equivalence after the GIF overlay retirement: every event must
// keep a sprite whose visible art carries the event's intended meaning in
// the new style (verified by eye against the atlas, then pinned here so a
// later remap cannot silently drain an event's effect).
test('each event sprite matches its intended visible behavior', () => {
  const intended = {
    'celebrate': 'leap',        // focus done: joy jump (8-frame leap arc)
    'wake-trigger': 'portal',   // summon: golden portal ring appear
    'listening-start': 'scan',  // listening: dog at laptop scanning the hologram
    'power-run': 'scan',        // command running: same laptop-working art, not a bare point
    'timer-ignored': 'rage',    // flames + anger vein
    'roam-fly': 'leap',         // long travel: big bounding arc
    'roam-fast': 'run',         // fast travel: fast walk cycle, never the katana attack
    'perch-climb': 'climb',
    'drag-drop': 'getup',       // drop lifecycle: landing -> getup -> idle chain
    'proactive-comment': 'gesture',
    'scene-change': 'gesture',
    'chat-reaction': 'emote',
    'tap-combo': 'swing',       // playful hit: katana swing with slash arcs
    'long-idle': 'sleep',
    'idle': 'idle',
    'portal': 'portal',
    'vanish': 'portal',
    'cursor-chase': 'cursor',
  };
  for (const [name, sprite] of Object.entries(intended))
    a.equal(AE.forEvent(name).sprite, sprite, 'event ' + name + ' lost its intended sprite');
  // Travel must never play the attack animation.
  a.notEqual(AE.forEvent('roam-fast').sprite, 'swing', 'fast roam shows the katana attack while merely moving');
  a.notEqual(AE.forEvent('roam-fly').sprite, 'swing', 'long roam shows the katana attack while merely moving');
});
test('run animation exists and is a faster walk cycle', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  a.ok(Array.isArray(manifest.run) && manifest.run.length >= 3, 'run missing from manifest');
  const runMs = manifest.run.reduce((t, f) => t + f.ms, 0);
  const walkMs = manifest.walk.reduce((t, f) => t + f.ms, 0);
  a.ok(runMs < walkMs, 'run must play faster than walk to read as hurrying');
});
