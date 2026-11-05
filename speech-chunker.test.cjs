const { test } = require('node:test'), a = require('node:assert/strict');
const { splitSentences, firstAndRest } = require('./speech-chunker.cjs');

test('basic sentences split on . ! ?', () => {
  a.deepEqual(splitSentences('Vanakkam bro. Eppadi iruka? Super!'), ['Vanakkam bro.', 'Eppadi iruka?', 'Super!']);
});
test('ender runs stay with their sentence', () => {
  a.deepEqual(splitSentences('Wow!! Really...? Seri.'), ['Wow!!', 'Really...?', 'Seri.']);
});
test('decimals and abbreviations do not split', () => {
  a.deepEqual(splitSentences('Timer 3.5 seconds bro. Mr. Ravi vandhutaar.'), ['Timer 3.5 seconds bro.', 'Mr. Ravi vandhutaar.']);
  a.deepEqual(splitSentences('Use e.g. this one. Next line.'), ['Use e.g. this one.', 'Next line.']);
});
test('Tanglish lowercase continuation after a full stop stays one breath', () => {
  a.deepEqual(splitSentences('Seri bro. polama ippo.'), ['Seri bro. polama ippo.']);
  a.deepEqual(splitSentences('Timer start pannu. Adutha vela paakalaam.'), ['Timer start pannu.', 'Adutha vela paakalaam.']);
});
test('newlines break; trailing fragment kept; empties dropped', () => {
  a.deepEqual(splitSentences('Line one\nLine two no ender'), ['Line one', 'Line two no ender']);
  a.deepEqual(splitSentences('   '), []);
  a.deepEqual(splitSentences(''), []);
});
test('overlong sentence hard-splits at commas past maxChars', () => {
  const long = 'a'.repeat(50) + ', ' + 'b'.repeat(50) + ', ' + 'c'.repeat(50);
  const parts = splitSentences(long, { maxChars: 60 });
  a.ok(parts.length >= 3); a.ok(parts.every((p) => p.length <= 62));
  a.equal(parts.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '));
});
test('firstAndRest gives the first sentence for fast first audio', () => {
  const r = firstAndRest('One. Two. Three.');
  a.equal(r.first, 'One.'); a.deepEqual(r.rest, ['Two.', 'Three.']);
  a.equal(firstAndRest('').first, null);
});
