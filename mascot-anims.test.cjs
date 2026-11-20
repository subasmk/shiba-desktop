const { test }=require('node:test');
const assert=require('node:assert/strict');
const {resolveSprite,resolveEvent,VEX_EVENTS}=require('./mascot-anims.cjs');
const manifest=require('./manifest.json');
const hasReal=n=>!!manifest[n];
const VEX_SPRITES = new Set(['vex-idle', 'vex-walk', 'vex-sit', 'vex-sitdown', 'vex-sleepdown', 'vex-sitsleep', 'vex-sleeploop', 'vex-think', 'vex-coffee', 'vex-drag', 'vex-landing', 'vex-rage', 'vex-laugh', 'vex-shock', 'vex-hit', 'vex-hitmany']);
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

test('vex: sit-down and sleep-down transitions map to their own clips', () => {
  assert.equal(resolveSprite('sit-down', 'vex', hasVex), 'vex-sitdown');
  assert.equal(resolveSprite('sleep-down', 'vex', hasVex), 'vex-sleepdown');
  assert.equal(resolveSprite('sit-sleep', 'vex', hasVex), 'vex-sitsleep');
  assert.equal(resolveSprite('sleep-loop', 'vex', hasVex), 'vex-sleeploop');
  assert.equal(resolveSprite('ambient-coffee', 'vex', hasVex), 'vex-coffee');
});

test('vex: a poke plays the composited hit reaction (recoil, star, roar)', () => {
  for (const n of ['touch-head', 'touch-body', 'touch-paws']) {
    assert.equal(resolveSprite(n, 'vex', hasVex), 'vex-hit', n);
  }
});

test('vex: chin-stroke with question marks is his thinking / confused beat', () => {
  assert.equal(resolveSprite('thinking', 'vex', hasVex), 'vex-think');
  assert.equal(resolveSprite('thinking-long', 'vex', hasVex), 'vex-think');
});

test('vex: landing and fall play his drop-and-dazed beat', () => {
  assert.equal(resolveSprite('landing', 'vex', hasVex), 'vex-landing');
  assert.equal(resolveSprite('fall', 'vex', hasVex), 'vex-landing');
  // The clip already ends upright, so the chained getup is a quiet idle.
  assert.equal(resolveSprite('getup', 'vex', hasVex), 'vex-idle');
});

test('vex: rage is his anger beat; the tap-combo swing plays the multi-hit clip', () => {
  assert.equal(resolveSprite('rage', 'vex', hasVex), 'vex-rage');
  assert.equal(resolveSprite('swing', 'vex', hasVex), 'vex-hitmany');
});

test('vex: his belly laugh carries emote and the success beat', () => {
  assert.equal(resolveSprite('emote', 'vex', hasVex), 'vex-laugh');
  assert.equal(resolveEvent('ambient-emote', 'vex', hasVex), 'vex-laugh');
  assert.equal(resolveEvent('react-success', 'vex', hasVex), 'vex-laugh');
});

test('vex: reactions and unknown states idle until more art arrives', () => {
  for (const n of ['idle', 'wave', 'bow', 'scan', 'click', 'gesture', 'getup', 'anything']) {
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
  for (const n of ['idle', 'walk', 'run', 'leap', 'drag', 'sit', 'sleep', 'landing', 'fall', 'rage', 'swing', 'emote', 'touch-head']) {
    const sprite = resolveSprite(n, 'vex', hasReal);
    assert.ok(sprite && hasReal(sprite), n + ' -> ' + sprite);
  }
});

test('vex: semantic events resolve through state fallback to real sprites', () => {
  for (const event of ['thinking', 'thinking-long', 'react-error', 'ambient-scan']) { /* react-confused now maps straight to his vex-think clip */
    assert.equal(resolveEvent(event, 'vex', hasReal), null, event);
    const sprite = resolveSprite(event, 'vex', hasReal);
    assert.ok(sprite && hasReal(sprite), event + ' -> ' + sprite);
  }
});

test('vex: ambient-think resolves to vex-think (10s idle rotation)', () => {
  assert.equal(resolveEvent('ambient-think', 'vex', hasReal), 'vex-think');
});
