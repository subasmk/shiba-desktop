const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { isTamilSelected, prepareTamilText, loadPreparedModel, synthesizeTamil, replyLanguageRule } = require('./tamil-voice.cjs');
test('Latin Tanglish is transliterated before the Tamil model', () => {
  a.equal(prepareTamilText('Seri bro, timer start pannu.'), 'சரி ப்ரோ, டைமர் ஸ்டார்ட் பண்ணு.');
  a.equal(prepareTamilText(''), '');
});
test('Tamil script input passes through untouched, mixed text converts only Latin runs', () => {
  a.equal(prepareTamilText('வணக்கம்'), 'வணக்கம்');
  a.equal(prepareTamilText('hello வணக்கம்'), 'ஹெல்லொ வணக்கம்'); // same output as the Python original
});
test('selection flag and prepared-model lookup are honest', () => {
  a.equal(isTamilSelected({ voiceLang: 'ta' }), true);
  a.equal(isTamilSelected({}), false);
  a.equal(loadPreparedModel(path.join(os.tmpdir(), 'shiba-no-such-dir')), null);
  a.equal(loadPreparedModel(''), null);
});
test('synthesize refuses honestly without setup, and uses an injected engine when present', async () => {
  await a.rejects(synthesizeTamil('vanakkam', {}), /not set up/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-voice-'));
  fs.writeFileSync(path.join(dir, 'ta_IN-ValluvarNeural-medium.onnx'), 'x');
  fs.writeFileSync(path.join(dir, 'ta-tokens.txt'), 'x');
  await a.rejects(synthesizeTamil('vanakkam', { modelDir: dir }), /not wired/);
  const out = await synthesizeTamil('Seri bro', { modelDir: dir, engine: async ({ text }) => ({ samples: [0.1], sampleRate: 22050, got: text }) });
  a.equal(out.text, 'சரி ப்ரோ');
  a.equal(out.sampleRate, 22050);
});

const { resolveVoiceLang, usesTamilVoice, detectScript, prepareForLang, routeReply, createWorkerTamilEngine, VOICE_LANGS } = require('./tamil-voice.cjs');
test('voiceLang resolution: en default, ta/tanglish opt-in, junk falls back to en', () => {
  a.equal(resolveVoiceLang({}), 'en');
  a.equal(resolveVoiceLang({ voiceLang: 'en' }), 'en');
  a.equal(resolveVoiceLang({ voiceLang: 'ta' }), 'ta');
  a.equal(resolveVoiceLang({ voiceLang: 'tanglish' }), 'tanglish');
  a.equal(resolveVoiceLang({ voiceLang: 'xx' }), 'en');
  a.deepEqual(VOICE_LANGS, ['en', 'ta', 'tanglish']);
  a.equal(usesTamilVoice({ voiceLang: 'tanglish' }), true);
  a.equal(usesTamilVoice({ voiceLang: 'en' }), false);
});
test('script detection: tamil / latin / mixed / empty', () => {
  a.equal(detectScript('வணக்கம்'), 'tamil');
  a.equal(detectScript('Seri bro'), 'latin');
  a.equal(detectScript('hello வணக்கம்'), 'mixed');
  a.equal(detectScript('123 ...'), 'empty');
  a.equal(detectScript(''), 'empty');
});
test('routing: tanglish transliterates Latin input; ta passes Tamil script through; en untouched', () => {
  const r1 = routeReply('Seri bro, timer start pannu.', { voiceLang: 'tanglish' });
  a.equal(r1.useTamil, true); a.equal(r1.script, 'latin');
  a.equal(r1.prepared, 'சரி ப்ரோ, டைமர் ஸ்டார்ட் பண்ணு.');
  const r2 = routeReply('வணக்கம்', { voiceLang: 'ta' });
  a.equal(r2.useTamil, true); a.equal(r2.prepared, 'வணக்கம்');
  const r3 = routeReply('Hello there.', { voiceLang: 'en' });
  a.equal(r3.useTamil, false); a.equal(r3.prepared, 'Hello there.');
  a.equal(prepareForLang('Seri bro', 'en'), 'Seri bro');
});
test('worker engine factory delegates to the backend synthesize-ta call', async () => {
  const seen = [];
  const backend = { call: async (type, data) => { seen.push([type, data]); return { samples: [0.2], sampleRate: 22050 }; } };
  const engine = createWorkerTamilEngine(backend, '/models/tamil-voice');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-voice-'));
  fs.writeFileSync(path.join(dir, 'ta_IN-ValluvarNeural-medium.onnx'), 'x');
  fs.writeFileSync(path.join(dir, 'ta-tokens.txt'), 'x');
  const out = await synthesizeTamil('Seri bro', { modelDir: dir, engine });
  a.equal(out.sampleRate, 22050);
  a.equal(seen[0][0], 'synthesize-ta');
  a.equal(seen[0][1].text, 'சரி ப்ரோ');
  a.equal(seen[0][1].modelDir, '/models/tamil-voice');
  const bad = createWorkerTamilEngine({ call: async () => ({}) }, '/x');
  await a.rejects(bad({ text: 'x' }), /no audio/);
});

const { phonemizerReady, PHONEMIZER_FILES } = require('./tamil-voice.cjs');
test('phonemizerReady requires all four phonemizer files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-ph-'));
  a.equal(phonemizerReady(dir), false);
  fs.mkdirSync(path.join(dir, 'piper-phonemize'));
  for (const f of PHONEMIZER_FILES) fs.writeFileSync(path.join(dir, 'piper-phonemize', f), 'x');
  a.equal(phonemizerReady(dir), true);
  a.equal(phonemizerReady(''), false);
});

test('replyLanguageRule steers the reply language from the selected voice language', () => {
  a.match(replyLanguageRule({ voiceLang: 'tanglish' }), /Tanglish/);
  a.match(replyLanguageRule({ voiceLang: 'tanglish' }), /Latin letters/);
  a.match(replyLanguageRule({ voiceLang: 'ta' }), /Tamil script/);
  a.match(replyLanguageRule({ voiceLang: 'en' }), /English/);
  a.match(replyLanguageRule({}), /English/);
  a.match(replyLanguageRule(null), /English/);
});
