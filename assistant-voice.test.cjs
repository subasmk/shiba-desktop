const test = require('node:test');
const assert = require('node:assert/strict');
const { VOICES, DEFAULTS, MAX_SID, voiceKey, sanitizePref, resolveVoice } = require('./assistant-voice.cjs');

test('catalog: curated voices are unique and inside the model speaker range', () => {
  const sids = VOICES.map((v) => v.sid);
  assert.equal(new Set(sids).size, sids.length);
  for (const v of VOICES) {
    assert.ok(Number.isInteger(v.sid) && v.sid >= 0 && v.sid <= MAX_SID, 'sid in range: ' + v.sid);
    assert.ok(typeof v.label === 'string' && v.label.length > 0);
  }
});

test('defaults: Rex and Dex sound different out of the box', () => {
  assert.notEqual(DEFAULTS.rex.sid, DEFAULTS.dex.sid);
  const rex = resolveVoice({}, 'rex');
  const dex = resolveVoice({}, 'dex');
  assert.deepEqual(rex, DEFAULTS.rex);
  assert.deepEqual(dex, DEFAULTS.dex);
  assert.notEqual(rex.sid, dex.sid);
});

test('resolveVoice: a saved per-assistant pick wins', () => {
  const s = { voiceByMascot: { rex: { sid: 11, speed: 0.9 }, dex: { sid: 21, speed: 1.2 } } };
  assert.deepEqual(resolveVoice(s, 'rex'), { sid: 11, speed: 0.9 });
  assert.deepEqual(resolveVoice(s, 'dex'), { sid: 21, speed: 1.2 });
});

test('resolveVoice: one assistant can be overridden without touching the other', () => {
  const s = { voiceByMascot: { dex: { sid: 18, speed: 1.3 } } };
  assert.deepEqual(resolveVoice(s, 'dex'), { sid: 18, speed: 1.3 });
  assert.deepEqual(resolveVoice(s, 'rex'), DEFAULTS.rex);
});

test('sanitize: impossible sid or speed falls back / clamps', () => {
  assert.deepEqual(sanitizePref({ sid: 999, speed: 1.0 }, DEFAULTS.rex), { sid: DEFAULTS.rex.sid, speed: 1.0 });
  assert.deepEqual(sanitizePref({ sid: -1 }, DEFAULTS.dex), DEFAULTS.dex);
  assert.deepEqual(sanitizePref({ sid: 3.5 }, DEFAULTS.dex), DEFAULTS.dex);
  assert.equal(sanitizePref({ sid: 0, speed: 99 }, DEFAULTS.rex).speed, 1.5);
  assert.equal(sanitizePref({ sid: 0, speed: 0.01 }, DEFAULTS.rex).speed, 0.6);
  assert.deepEqual(sanitizePref(null, DEFAULTS.rex), DEFAULTS.rex);
  assert.deepEqual(sanitizePref('junk', DEFAULTS.rex), DEFAULTS.rex);
});

test('voiceKey: anything that is not Rex is Dex (mirrors activeMascot)', () => {
  assert.equal(voiceKey('rex'), 'rex');
  assert.equal(voiceKey('dex'), 'dex');
  assert.equal(voiceKey(undefined), 'dex');
  assert.equal(voiceKey('dexter'), 'dex');
});

test('resolveVoice: garbage settings never throw and give defaults', () => {
  assert.deepEqual(resolveVoice(null, 'rex'), DEFAULTS.rex);
  assert.deepEqual(resolveVoice({ voiceByMascot: 'junk' }, 'dex'), DEFAULTS.dex);
  assert.deepEqual(resolveVoice({ voiceByMascot: { rex: 42 } }, 'rex'), DEFAULTS.rex);
});
