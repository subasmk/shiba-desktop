const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEX_FALLBACK, resolveSprite, DEX_EVENTS, REX_EVENTS, resolveEvent } = require('./mascot-anims.cjs');
const manifest = require('./manifest.json');
const hasReal = (n) => Object.prototype.hasOwnProperty.call(manifest, n);

// The stage-1 Dex sheet's actual coverage (manifest.json, 2026-11-16).
const DEX_SPRITES = new Set([
  'dex-idle', 'dex-walk', 'dex-run', 'dex-sit', 'dex-talk', 'dex-listening',
  'dex-sleep', 'dex-rage', 'dex-scan', 'dex-gesture', 'dex-emote', 'dex-wave',
  'dex-leap', 'dex-fall', 'dex-landing', 'dex-drag', 'dex-click', 'dex-coffee',
  'dex-side-listen',
]);
const hasDex = (n) => DEX_SPRITES.has(n);

test('dex: direct sprites resolve to themselves', () => {
  for (const n of ['idle', 'walk', 'run', 'sit', 'sleep', 'rage', 'scan', 'emote', 'leap', 'fall', 'landing', 'drag', 'gesture', 'talk', 'listening', 'coffee']) {
    assert.equal(resolveSprite(n, 'dex', hasDex), 'dex-' + n, n);
  }
});

test('dex: tap reactions are distinct per hit region, all existing art (hit variety fix)', () => {
  assert.equal(resolveSprite('touch-head', 'dex', hasDex), 'dex-click');
  assert.equal(resolveSprite('touch-body', 'dex', hasDex), 'dex-emote');
  assert.equal(resolveSprite('touch-paws', 'dex', hasDex), 'dex-gesture');
});

test('dex: tap-combo swing lands on dex-rage', () => {
  assert.equal(resolveSprite('swing', 'dex', hasDex), 'dex-rage');
});

test('dex: bow and wave land on dex-gesture (dex-wave is portal art)', () => {
  assert.equal(resolveSprite('bow', 'dex', hasDex), 'dex-gesture');
  // dex-wave EXISTS in the sheet but is the retired portal/vanish art,
  // so the fallback must win over the direct sprite.
  assert.ok(hasDex('dex-wave'));
  assert.equal(resolveSprite('wave', 'dex', hasDex), 'dex-gesture');
});

test('dex: getup is an explicit stand (landing/fall art already ends upright)', () => {
  assert.equal(resolveSprite('getup', 'dex', hasDex), 'dex-idle');
});

test('dex: unknown states still fall back to dex-idle', () => {
  assert.equal(resolveSprite('climb', 'dex', hasDex), 'dex-idle');
  assert.equal(resolveSprite('portal', 'dex', hasDex), 'dex-idle');
});

test('dex: direct dex-* requests pass through, missing ones idle', () => {
  assert.equal(resolveSprite('dex-scan', 'dex', hasDex), 'dex-scan');
  assert.equal(resolveSprite('dex-nope', 'dex', hasDex), 'dex-idle');
});

test('dex: a fallback whose target is missing degrades to dex-idle', () => {
  const has = (n) => n === 'dex-idle';
  assert.equal(resolveSprite('touch-head', 'dex', has), 'dex-idle');
  assert.equal(resolveSprite('wave', 'dex', has), 'dex-idle');
});

test('rex: resolution is the identity for every state', () => {
  const has = () => true;
  for (const n of ['idle', 'touch-head', 'swing', 'bow', 'wave', 'getup', 'anything']) {
    assert.equal(resolveSprite(n, 'rex', has), n, n);
  }
});

test('fallback table only points at sprites the dex sheet really has', () => {
  for (const [from, to] of Object.entries(DEX_FALLBACK)) {
    assert.ok(DEX_SPRITES.has(to), from + ' -> ' + to);
  }
});

// --- Semantic event wiring (Dexter-style) --------------------------------
// Verified against the REAL manifest.json: every event, for both
// mascots, must resolve to a sprite that actually exists (or null,
// where the mascot deliberately has no equivalent - Rex coffee).

test('events: every dex event resolves to a sprite in the real manifest', () => {
  for (const event of Object.keys(DEX_EVENTS)) {
    const sprite = resolveEvent(event, 'dex', hasReal);
    assert.ok(sprite && hasReal(sprite), event + ' -> ' + sprite);
    assert.equal(sprite, DEX_EVENTS[event], event);
  }
});

test('events: every rex event resolves to a sprite in the real manifest', () => {
  for (const event of Object.keys(REX_EVENTS)) {
    const sprite = resolveEvent(event, 'rex', hasReal);
    assert.ok(sprite && hasReal(sprite), event + ' -> ' + sprite);
    assert.equal(sprite, REX_EVENTS[event], event);
  }
});

test('events: the full semantic vocabulary is wired for dex', () => {
  for (const event of ['ambient-coffee', 'ambient-scan', 'ambient-emote', 'ambient-gesture', 'ambient-sit',
    'thinking', 'thinking-long', 'thinking-question',
    'react-success', 'react-error', 'react-sad', 'react-confused', 'react-idea']) {
    assert.ok(DEX_EVENTS[event], 'missing dex event ' + event);
  }
});

test('events: key mappings match the art (contact-sheet verified)', () => {
  assert.equal(resolveEvent('thinking', 'dex', hasReal), 'dex-side-listen');
  assert.equal(resolveEvent('thinking-long', 'dex', hasReal), 'dex-emote'); // ponder -> lightbulb
  assert.equal(resolveEvent('thinking-question', 'dex', hasReal), 'dex-scan'); // head-scratch
  assert.equal(resolveEvent('react-idea', 'dex', hasReal), 'dex-emote'); // lightbulb frame
  assert.equal(resolveEvent('react-success', 'dex', hasReal), 'dex-gesture'); // thumbs-up
  assert.equal(resolveEvent('react-error', 'dex', hasReal), 'dex-rage');
  assert.equal(resolveEvent('ambient-coffee', 'dex', hasReal), 'dex-coffee');
  // No event may ever resolve to the retired portal art.
  for (const event of Object.keys(DEX_EVENTS)) {
    assert.notEqual(resolveEvent(event, 'dex', hasReal), 'dex-wave', event);
  }
});

test('events: rex has no coffee art - ambient-coffee is a deliberate null', () => {
  assert.equal(REX_EVENTS['ambient-coffee'], undefined);
  assert.equal(resolveEvent('ambient-coffee', 'rex', hasReal), null);
  // ...while rex thinking/reactions land on his established sprites.
  assert.equal(resolveEvent('thinking', 'rex', hasReal), 'scan');
  assert.equal(resolveEvent('react-success', 'rex', hasReal), 'gesture');
  assert.equal(resolveEvent('react-error', 'rex', hasReal), 'rage');
});

test('events: unknown names and non-events resolve to null', () => {
  assert.equal(resolveEvent('idle', 'dex', hasReal), null);
  assert.equal(resolveEvent('walk', 'dex', hasReal), null);
  assert.equal(resolveEvent('touch-head', 'dex', hasReal), null);
  assert.equal(resolveEvent('nonsense', 'dex', hasReal), null);
  assert.equal(resolveEvent('thinking', 'other', hasReal), null);
  assert.equal(resolveEvent(null, 'dex', hasReal), null);
});

test('events: a missing target sprite degrades (dex -> dex-idle, rex -> null)', () => {
  const onlyIdle = (n) => n === 'dex-idle';
  assert.equal(resolveEvent('thinking', 'dex', onlyIdle), 'dex-idle');
  assert.equal(resolveEvent('thinking', 'rex', () => false), null);
});

// --- Vex (hooded horned kid, walk-cycle video + sit art, Nov 19 2026) -----
const VEX_SPRITES = new Set(['vex-idle', 'vex-walk', 'vex-sit', 'vex-drag']);
const hasVex = (n) => VEX_SPRITES.has(n);

test('vex: movement states play the walk loop, drag shows his hanging art', () => {
  for (const n of ['walk', 'run', 'leap']) {
    assert.equal(resolveSprite(n, 'vex', hasVex), 'vex-walk', n);
  }
  assert.equal(resolveSprite('drag', 'vex', hasVex), 'vex-drag');
});

test('vex: sit and sleep show the seated pose', () => {
  assert.equal(resolveSprite('sit', 'vex', hasVex), 'vex-sit');
  assert.equal(resolveSprite('sleep', 'vex', hasVex), 'vex-sit');
});

test('vex: reactions and unknown states idle until more art arrives', () => {
  for (const n of ['idle', 'touch-head', 'touch-body', 'touch-paws', 'rage', 'swing', 'wave', 'bow', 'scan', 'emote', 'click', 'gesture', 'fall', 'landing', 'getup', 'anything']) {
    assert.equal(resolveSprite(n, 'vex', hasVex), 'vex-idle', n);
  }
});

test('vex: direct vex-* requests pass through, missing ones idle', () => {
  assert.equal(resolveSprite('vex-walk', 'vex', hasVex), 'vex-walk');
  assert.equal(resolveSprite('vex-nope', 'vex', hasVex), 'vex-idle');
});

test('vex: walk art missing degrades to vex-idle', () => {
  const has = (n) => n === 'vex-idle';
  assert.equal(resolveSprite('walk', 'vex', has), 'vex-idle');
  assert.equal(resolveSprite('sit', 'vex', has), 'vex-idle');
});

test('vex: sprites referenced by resolution exist in the real manifest', () => {
  for (const n of ['idle', 'walk', 'run', 'leap', 'drag', 'sit', 'sleep', 'rage', 'touch-head']) {
    const sprite = resolveSprite(n, 'vex', hasReal);
    assert.ok(sprite && hasReal(sprite), n + ' -> ' + sprite);
  }
});

test('vex: semantic events resolve through state fallback to real sprites', () => {
  for (const event of ['thinking', 'thinking-long', 'react-success', 'react-error', 'react-confused', 'ambient-scan']) {
    assert.equal(resolveEvent(event, 'vex', hasReal), null, event);
    const sprite = resolveSprite(event, 'vex', hasReal);
    assert.ok(sprite && hasReal(sprite), event + ' -> ' + sprite);
  }
});
