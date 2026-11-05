const { test } = require('node:test'), a = require('node:assert/strict');
const { runSelfTest, formatReport, CHECKS } = require('./selftest.cjs');

const good = {
  ollama: { running: true, models: ['qwen3:1.7b', 'moondream'] },
  brainModel: 'qwen3:1.7b', groqSelected: false, hasGroqKey: false,
  voice: { ready: true, missing: [] }, voiceLang: 'en', tamilModelReady: false,
  visionOn: false, visionModel: 'moondream', mic: 'ok',
  powerRoots: [{ path: 'C:/Users/x', exists: true }], powerMode: false,
  wakeWord: false, roaming: true, perch: true, cursorPlay: false,
};
const byId = (r, id) => r.checks.find((c) => c.id === id);

test('healthy laptop: everything passes', () => {
  const r = runSelfTest(good, { now: () => 0 });
  a.equal(r.ok, true); a.equal(r.summary.fail, 0);
  a.equal(byId(r, 'ollama').status, 'pass');
  a.equal(r.checks.length, CHECKS.length);
});
test('ollama down fails the service check and warns (not fails) the model checks', () => {
  const r = runSelfTest({ ...good, ollama: { running: false, models: [] } });
  a.equal(byId(r, 'ollama').status, 'fail');
  a.equal(byId(r, 'brain-model').status, 'warn');
  a.equal(r.ok, false);
});
test('missing brain model fails with a pull fix', () => {
  const r = runSelfTest({ ...good, ollama: { running: true, models: ['other:1b'] } });
  const c = byId(r, 'brain-model');
  a.equal(c.status, 'fail'); a.match(c.fix, /ollama pull qwen3:1\.7b/);
});
test('groq only matters when selected; key presence only, no live call', () => {
  a.equal(byId(runSelfTest(good), 'groq').status, 'pass');
  const r = runSelfTest({ ...good, groqSelected: true, hasGroqKey: false });
  a.equal(byId(r, 'groq').status, 'fail');
  const r2 = runSelfTest({ ...good, groqSelected: true, hasGroqKey: true });
  a.equal(byId(r2, 'groq').status, 'pass'); a.match(byId(r2, 'groq').detail, /no live Groq call/);
});
test('tamil selected without a prepared model warns with the setup fix', () => {
  const r = runSelfTest({ ...good, voiceLang: 'tanglish', tamilModelReady: false, tamilModelDir: 'D:/models/tamil-voice' });
  const c = byId(r, 'tamil-model');
  a.equal(c.status, 'warn'); a.match(c.fix, /Voice session drawer/);
  const r2 = runSelfTest({ ...good, voiceLang: 'ta', tamilModelReady: true, tamilPhonemizerReady: true });
  a.equal(byId(r2, 'tamil-model').status, 'pass');
});
test('tamil model ready but phonemizer missing warns with the re-run fix', () => {
  const r = runSelfTest({ ...good, voiceLang: 'ta', tamilModelReady: true, tamilPhonemizerReady: false, tamilModelDir: 'D:/m' });
  const c = byId(r, 'tamil-model');
  a.equal(c.status, 'warn'); a.match(c.detail, /phonemizer files are missing/);
});
test('vision on with a missing model fails; vision off passes quietly', () => {
  const r = runSelfTest({ ...good, visionOn: true, visionModel: 'qwen2.5vl:7b' });
  a.equal(byId(r, 'vision-model').status, 'fail');
  a.equal(byId(runSelfTest(good), 'vision-model').status, 'pass');
});
test('mic states map to plain outcomes', () => {
  a.equal(byId(runSelfTest({ ...good, mic: 'denied' }), 'mic').status, 'fail');
  a.equal(byId(runSelfTest({ ...good, mic: 'no-device' }), 'mic').status, 'fail');
  a.equal(byId(runSelfTest({ ...good, mic: 'unknown' }), 'mic').status, 'warn');
});
test('missing power roots warn, never fail (tools just refuse those paths)', () => {
  const r = runSelfTest({ ...good, powerRoots: [{ path: 'D:/gone', exists: false }] });
  a.equal(byId(r, 'power-roots').status, 'warn');
});
test('formatReport renders a readable summary', () => {
  const txt = formatReport(runSelfTest(good, { now: () => 0 }));
  a.match(txt, /Shiba diagnostics/); a.match(txt, /PASS/);
});
