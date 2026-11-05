// Offline Latin (Tanglish) -> Tamil script transliteration helper.
// Faithful JS port of the verified Python helper (tts-voice-lab/transliterate.py):
// a small dictionary for very common Tanglish words, plus a greedy longest-match
// syllable converter for everything else.
//
// Why this exists: the Piper Tamil voice phonemizes with espeak-ng voice "ta".
// Fed raw Latin text, espeak falls back to English-style phonemes, so
// "Seri bro" is read as English, not Tamil. Transliterate first.
//
// LIMITS (honest): Tanglish spelling is not standardized. This helper cannot
// know whether "n" means ந/ன/ண, whether "t" means ட/த, or where a speaker
// would write long vs short vowels, unless the word is in the dictionary.
// Output is a best-effort approximation for TTS, not a publishing-grade
// transliteration.

// --- dictionary: common Tanglish words with one correct Tamil spelling ---
const WORD_DICT = {
  seri: 'சரி', sari: 'சரி', bro: 'ப்ரோ', timer: 'டைமர்',
  start: 'ஸ்டார்ட்', stop: 'ஸ்டாப்', pannu: 'பண்ணு',
  panna: 'பண்ண', vanakkam: 'வணக்கம்', nanba: 'நண்பா',
  nanban: 'நண்பன்', epdi: 'எப்படி', eppadi: 'எப்படி',
  iruka: 'இருக்க', irukka: 'இருக்க', enna: 'என்ன',
  konjam: 'கொஞ்சம்', nalla: 'நல்ல', sollu: 'சொல்லு',
  illa: 'இல்ல', aama: 'ஆமா', aamaa: 'ஆமா', romba: 'ரொம்ப',
  ipo: 'இப்போ', ippo: 'இப்போ', amma: 'அம்மா', appa: 'அப்பா',
  mudiyum: 'முடியும்', super: 'சூப்பர்', ok: 'ஓகே',
  time: 'டைம்', phone: 'ஃபோன்', kaasu: 'காசு',
};
// --- independent vowels (word start / after another vowel) ---
const VOWEL_IND = {
  aa: 'ஆ', ii: 'ஈ', ee: 'ஈ', uu: 'ஊ', ai: 'ஐ', au: 'ஔ',
  oo: 'ஓ', a: 'அ', i: 'இ', u: 'உ', e: 'எ', o: 'ஒ',
};
// --- dependent vowel signs (attach to previous consonant); 'a' is inherent ---
const VOWEL_SIGN = {
  aa: 'ா', ii: 'ீ', ee: 'ீ', uu: 'ூ', ai: 'ை', au: 'ௌ',
  oo: 'ோ', a: '', i: 'ி', u: 'ு', e: 'ெ', o: 'ொ',
};
// --- consonants (base letter; pulli added by the syllable logic) ---
const CONS = {
  ksh: 'க்ஷ', zh: 'ழ', ch: 'ச', sh: 'ஷ', ng: 'ங',
  gn: 'ஞ', th: 'த', dh: 'த', nd: 'ண்ட',
  k: 'க', g: 'க', j: 'ஜ', t: 'ட', d: 'ட', N: 'ண',
  n: 'ன', p: 'ப', b: 'ப', m: 'ம', y: 'ய', r: 'ர',
  R: 'ற', l: 'ல', L: 'ள', v: 'வ', w: 'வ', s: 'ச',
  h: 'ஹ', f: 'ஃப', z: 'ஜ', x: 'க்ஸ',
};
const PULLI = '்';
const TOKENS = [...new Set([...Object.keys(VOWEL_IND), ...Object.keys(CONS)])].sort((a, b) => b.length - a.length);
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

function matchToken(word, i) {
  for (const tok of TOKENS) if (word.startsWith(tok, i)) return tok;
  return null;
}

// Rule-based conversion of one Latin word (case-sensitive, like the Python
// convert_word: transliterate() lowercases first, direct callers may use
// N/R/L for ண/ற/ள).
function convertWord(word) {
  let out = '', i = 0, pending = null; // pending: consonant base awaiting its vowel
  while (i < word.length) {
    const tok = matchToken(word, i);
    if (tok === null) { // unknown char: pass through
      if (pending !== null) { out += pending + PULLI; pending = null; }
      out += word[i]; i += 1; continue;
    }
    if (has(CONS, tok)) {
      if (pending !== null) out += pending + PULLI;
      pending = CONS[tok];
      i += tok.length;
    } else { // vowel
      if (pending !== null) { out += pending + VOWEL_SIGN[tok]; pending = null; }
      else out += VOWEL_IND[tok];
      i += tok.length;
    }
  }
  if (pending !== null) out += pending + PULLI;
  return out;
}

function transliterate(text) {
  return String(text).replace(/[A-Za-z]+/g, (w) => {
    const low = w.toLowerCase();
    return has(WORD_DICT, low) ? WORD_DICT[low] : convertWord(low);
  });
}

// True when the text already contains Tamil script (U+0B80-U+0BFF).
function hasTamilScript(text) { return /[\u0B80-\u0BFF]/.test(String(text)); }

module.exports = { transliterate, convertWord, hasTamilScript, WORD_DICT };
