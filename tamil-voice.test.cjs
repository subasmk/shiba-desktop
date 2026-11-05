const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { isTamilSelected, prepareTamilText, loadPreparedModel, synthesizeTamil } = require('./tamil-voice.cjs');
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
