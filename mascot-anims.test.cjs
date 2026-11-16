const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEX_FALLBACK, resolveSprite } = require('./mascot-anims.cjs');

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

test('dex: tap reactions land on dex-click, not silent dex-idle (hit animation fix)', () => {
  for (const n of ['touch-head', 'touch-body', 'touch-paws']) {
    assert.equal(resolveSprite(n, 'dex', hasDex), 'dex-click', n);
  }
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
