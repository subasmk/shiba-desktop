const { test } = require('node:test'); const assert = require('node:assert/strict');
const { normalizeTranscript, matchWakePhrase, WakeWordDetector } = require('./wakeword.cjs');

test('phrase matching: bare, greeted and mis-heard forms trigger', () => {
  for (const t of ['Hey Rex', 'hey rex', 'Rex', 'OK Rex!', 'hey wrecks', 'Hey, Wrex.', 'hey there rex'])
    assert.ok(matchWakePhrase(t), t);
});
test('phrase matching: command remainder is extracted', () => {
  assert.equal(matchWakePhrase('Hey Rex, what time is it').command, 'what time is it');
  assert.equal(matchWakePhrase('hey rex open the timer').command, 'open the timer');
  assert.equal(matchWakePhrase('Hey Rex').command, null);
  assert.equal(matchWakePhrase('Hey Rex.').command, null);
});
test('phrase matching: non-wake speech does not trigger', () => {
  for (const t of ['', 'hello there', 'the shiba inu is a dog breed', 'what time is it', 'hey dog', 'my t-rex plushie', 'directed by'])
    assert.equal(matchWakePhrase(t), null, t);
});
test('normalization collapses whitespace', () => {
  assert.equal(normalizeTranscript('  hey   rex\n now '), 'hey rex now');
});

test('state machine: off ignores everything until enabled', () => {
  const d = new WakeWordDetector({ cooldownMs: 5000 });
  assert.equal(d.state, 'off');
  assert.equal(d.feed('hey rex', 1000), null);
  d.enable(); assert.equal(d.state, 'listening');
  assert.equal(d.feed('just talking', 1000), null);
  const hit = d.feed('hey rex', 2000);
  assert.equal(hit.type, 'triggered'); assert.equal(hit.command, null);
  assert.equal(d.state, 'cooldown');
});
test('state machine: cooldown blocks retrigger, then listening resumes', () => {
  const d = new WakeWordDetector({ cooldownMs: 5000 });
  d.enable();
  assert.ok(d.feed('hey rex', 0));
  assert.equal(d.feed('hey rex', 4999), null);
  const hit = d.feed('hey rex, again', 5000);
  assert.equal(hit.type, 'triggered'); assert.equal(hit.command, 'again');
});
test('state machine: disable during cooldown returns to off', () => {
  const d = new WakeWordDetector();
  d.enable(); d.feed('hey rex', 0);
  d.disable(); assert.equal(d.state, 'off');
  assert.equal(d.feed('hey rex', 999999), null);
  d.enable(); assert.equal(d.state, 'listening');
});
