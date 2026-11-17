const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PetBehavior, AMBIENT } = require('./pet-behavior.cjs');

// Deterministic random: pops from a queue, then falls back to 0.
function queueRandom(values) {
  const q = [...values];
  return () => (q.length ? q.shift() : 0);
}

test('due: nothing fires before the quiet window or while not idle', () => {
  const b = new PetBehavior(() => 0);
  b.quiet(0); // nextAt = 25000 with random 0
  assert.equal(b.due(1000, 'idle'), null);
  assert.equal(b.due(7000, 'walk'), null);
  assert.equal(b.due(7000, 'sleep'), null);
});

test('due: classic variety actions still rotate without repeats', () => {
  // random 0.99 fails the ambient gate every time -> classic path.
  const b = new PetBehavior(() => 0.99);
  const seen = new Set();
  let now = 0;
  for (let i = 0; i < 12; i++) {
    now += 50000;
    const a = b.due(now, 'idle');
    assert.ok(['wave', 'bow', 'scan', 'emote'].includes(a), a);
    assert.ok(!seen.has(a) || i === 0, 'no immediate repeat: ' + a);
    seen.clear(); seen.add(a);
  }
});

test('ambient: fires from the pool and respects per-event cooldowns', () => {
  // random 0 passes the ambient gate and picks ready[0] each time.
  const b = new PetBehavior(() => 0);
  const first = b.due(0, 'idle');
  assert.equal(first, 'ambient-coffee'); // first pool entry
  // Coffee is now on its 150s cooldown: the next ambient pick (past the
  // quiet window) must be a different event, never coffee again.
  const second = b.due(30000, 'idle');
  assert.equal(second, 'ambient-sit');
  assert.notEqual(second, first);
  // After coffee's cooldown expires it becomes eligible again.
  let later = null;
  for (let t = 60000; t <= 200000 && later !== 'ambient-coffee'; t += 20000) {
    later = b.due(t, 'idle');
  }
  assert.equal(later, 'ambient-coffee');
});

test('ambient: the same event never fires twice in a row', () => {
  const b = new PetBehavior(() => 0);
  let prev = '';
  for (let t = 0; t <= 600000; t += 13000) {
    const a = b.due(t, 'idle');
    if (a && a.startsWith('ambient-')) {
      assert.notEqual(a, prev, 'back-to-back ambient repeat at ' + t);
      prev = a;
    }
  }
});

test('ambient: every pool event resolves a positive cooldown', () => {
  assert.ok(AMBIENT.length >= 4);
  for (const a of AMBIENT) {
    assert.ok(a.event.startsWith('ambient-'), a.event);
    assert.ok(a.cooldownMs >= 30000, a.event + ' cooldown too short');
  }
});

test('press lifecycle: tap vs drag vs cancel is unchanged', () => {
  const b = new PetBehavior(() => 0);
  b.down(100, 100, 0);
  assert.equal(b.up(false), 'tap');
  b.down(100, 100, 0);
  assert.equal(b.move(160, 100, 200), true); // moved far + long enough
  assert.equal(b.up(false), 'drop');
  b.down(100, 100, 0);
  assert.equal(b.up(true), 'none');
  // While pressed, no variety or ambient fires.
  b.down(100, 100, 0);
  assert.equal(b.due(999999, 'idle'), null);
  b.up(true);
});
