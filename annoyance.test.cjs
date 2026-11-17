const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Annoyance, ANNOYED_LINES, FURIOUS_LINES, lineFor, isCalmDown, moodOf, moodNote } = require('./annoyance.cjs');

test('bucket: hits accumulate and cross the annoyed threshold at 5', () => {
  const a = new Annoyance();
  assert.equal(a.hit(1000), 'calm');
  assert.equal(a.hit(1100), 'calm');
  assert.equal(a.level(1200), 2);
  a.hit(1300); a.hit(1400);
  assert.equal(a.mood(1450), 'calm');
  assert.equal(a.hit(1500), 'annoyed');
  assert.equal(a.mood(1600), 'annoyed');
});

test('bucket: furious threshold at 10 hits', () => {
  const a = new Annoyance();
  for (let i = 0; i < 9; i++) a.hit(1000 + i * 100);
  assert.equal(a.mood(2000), 'annoyed');
  assert.equal(a.hit(2100), 'furious');
  assert.equal(a.level(2200), 10);
});

test('bucket: drains one level per drainMs of no hits', () => {
  const a = new Annoyance();
  for (let i = 0; i < 4; i++) a.hit(i * 100); // level 4, anchor 0
  assert.equal(a.level(24999), 4);
  assert.equal(a.level(25000), 3);
  assert.equal(a.level(49999), 3);
  assert.equal(a.level(50000), 2);
  assert.equal(a.level(100000), 0);
  assert.equal(a.mood(100000), 'calm');
});

test('bucket: a hit after partial drain refills from the drained level', () => {
  const a = new Annoyance();
  for (let i = 0; i < 5; i++) a.hit(i * 100); // annoyed, anchor 0
  assert.equal(a.level(26000), 4); // one drained
  assert.equal(a.hit(26100), 'annoyed'); // back to 5
  assert.equal(a.level(26100), 5);
});

test('bucket: reset empties immediately', () => {
  const a = new Annoyance();
  for (let i = 0; i < 11; i++) a.hit(i * 100);
  assert.equal(a.mood(1000), 'furious');
  a.reset();
  assert.equal(a.level(1000), 0);
  assert.equal(a.mood(1000), 'calm');
});

test('bucket: custom thresholds and drain are honoured', () => {
  const a = new Annoyance({ drainMs: 1000, annoyedAt: 2, furiousAt: 4 });
  assert.equal(a.hit(0), 'calm');
  assert.equal(a.hit(10), 'annoyed');
  a.hit(20); assert.equal(a.hit(30), 'furious');
  assert.equal(a.level(2030), 2); // two 1s drains from anchor 0
});

test('moodOf: level bands', () => {
  assert.equal(moodOf(0), 'calm');
  assert.equal(moodOf(2), 'calm');
  assert.equal(moodOf(4), 'calm');
  assert.equal(moodOf(5), 'annoyed');
  assert.equal(moodOf(9), 'annoyed');
  assert.equal(moodOf(10), 'furious');
});

test('calm-down matcher: English and Tanglish apologies match, plain chat does not', () => {
  for (const t of ['sorry bro', 'Sorry!', 'calm down please', 'Calm Down', 'vidu bro', 'podhum da', 'PODHUM']) {
    assert.equal(isCalmDown(t), true, t);
  }
  for (const t of ['hello', 'open chrome', 'what is the time', 'sorrya iruka?', '']) {
    assert.equal(isCalmDown(t), false, JSON.stringify(t));
  }
  assert.equal(isCalmDown(null), false);
  assert.equal(isCalmDown(42), false);
});

test('moodNote: present only for the local brain at annoyed level or worse', () => {
  assert.match(moodNote(5, { local: true }), /annoyed/);
  assert.match(moodNote(10, { local: true }), /FURIOUS/);
  assert.equal(moodNote(2, { local: true }), '');
  assert.equal(moodNote(0, { local: true }), '');
  // Cloud / Groq prompts must receive NO annoyance note, at any level.
  assert.equal(moodNote(5, { local: false }), '');
  assert.equal(moodNote(10, { local: false }), '');
  assert.equal(moodNote(10), '');
  assert.equal(moodNote(10, {}), '');
});

test('lineFor: picks from the pool matching the mood', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(ANNOYED_LINES.includes(lineFor('annoyed', Math.random)));
    assert.ok(FURIOUS_LINES.includes(lineFor('furious', Math.random)));
  }
  assert.equal(lineFor('annoyed', () => 0), ANNOYED_LINES[0]);
  assert.equal(lineFor('furious', () => 0), FURIOUS_LINES[0]);
});
