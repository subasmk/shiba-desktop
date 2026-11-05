const { test } = require('node:test'), a = require('node:assert/strict');
const { transliterate, convertWord, hasTamilScript } = require('./transliterate.cjs');
// Expected outputs are the verified results of the original Python helper.
test('Tanglish sentence transliterates exactly as the verified Python helper', () => {
  a.equal(transliterate('Seri bro, timer start pannu.'), 'சரி ப்ரோ, டைமர் ஸ்டார்ட் பண்ணு.');
  a.equal(transliterate('vanakkam nanba'), 'வணக்கம் நண்பா');
  a.equal(transliterate('epdi iruka?'), 'எப்படி இருக்க?');
});
test('dictionary and rule-only words match the Python outputs', () => {
  a.equal(transliterate('kaasu'), 'காசு');
  a.equal(transliterate('mazhai'), 'மழை');
  a.equal(transliterate('paadam'), 'பாடம்');
  a.equal(transliterate('sapadu'), 'சபடு'); // documented approximation (real: சாப்பாடு)
});
test('Tamil script passes through untouched', () => {
  a.equal(transliterate('வணக்கம்'), 'வணக்கம்');
  a.equal(hasTamilScript('வணக்கம்'), true);
  a.equal(hasTamilScript('vanakkam'), false);
  a.equal(convertWord('mazhai'), 'மழை');
});
