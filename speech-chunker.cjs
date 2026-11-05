// Speech chunker: split a chat reply into speakable sentences so the voice
// path can synthesize sentence 1 immediately and queue the rest (item 4 of
// the last-mile pack). Pure and UMD-shaped like pet-behavior.cjs: the
// renderer loads it as a script, main/tests require() it.
//
// Splitting rules, chosen for Tanglish/English pet replies:
//   - sentence enders: . ! ? … and the Tamil danda-like full stop usage in
//     Latin text; a run of enders ("Wow!!", "Really...?") stays together.
//   - abbreviations and decimals do not split ("Mr. Ravi", "3.5 seconds",
//     "e.g. this") - a '.' only ends a sentence when followed by space +
//     capital/digit/quote OR end of text, and the token before it is not a
//     known abbreviation or a single letter.
//   - newlines always break.
//   - very long sentences are hard-split at commas/semicolons past
//     maxChars so the first audio chunk is never huge; a single word longer
//     than maxChars is split mid-word only as a last resort.
//   - chunks are trimmed, empties dropped; trailing text without an ender
//     is still a chunk.
(function (root) {
  const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'no', 'approx']);
  function isEnder(ch) { return ch === '.' || ch === '!' || ch === '?' || ch === '…'; }
  function wordBefore(text, i) {
    let j = i - 1, w = '';
    while (j >= 0 && /[A-Za-z.]/.test(text[j])) { w = text[j] + w; j--; }
    return w.toLowerCase();
  }
  function splitSentences(text, { maxChars = 180 } = {}) {
    const src = String(text ?? '').replace(/\r\n?/g, '\n');
    const raw = [];
    let cur = '';
    const push = () => { const t = cur.trim(); if (t) raw.push(t); cur = ''; };
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\n') { cur += ' '; if (cur.trim()) push(); continue; }
      cur += ch;
      if (!isEnder(ch)) continue;
      // absorb a run of enders + closing quotes/brackets into this sentence
      let j = i + 1;
      while (j < src.length && (isEnder(src[j]) || src[j] === '"' || src[j] === "'" || src[j] === ')' || src[j] === '”')) { cur += src[j]; j++; }
      const next = j < src.length ? src[j] : '';
      const after = j + 1 < src.length ? src[j + 1] : '';
      if (ch === '.') {
        const before = wordBefore(src, i);
        if (ABBREV.has(before) || /^[a-z]\.$/.test(before) || /^\d$/.test(src[i - 1] || '') && /\d/.test(next)) { i = j - 1; continue; }
        if (/\d/.test(src[i - 1] || '') && /\d/.test(next)) { i = j - 1; continue; } // decimal point
      }
      // split only at a real boundary: end of text, or whitespace then a
      // capital/digit/opening quote (lowercase continuation = same sentence,
      // common in Tanglish: "seri bro. polama" stays one breath if short).
      if (j >= src.length || (/\s/.test(next) && /[A-Z0-9"“'(]/.test(after || ' ')) || (/\s/.test(next) && ch !== '.')) { push(); }
      i = j - 1;
    }
    push();
    // hard-split overlong sentences at soft punctuation, then mid-word.
    const out = [];
    for (const s of raw) {
      let rest = s;
      while (rest.length > maxChars) {
        let cut = -1;
        for (let k = Math.min(maxChars, rest.length - 1); k > maxChars * 0.4; k--) {
          if (rest[k] === ',' || rest[k] === ';' || rest[k] === ':') { cut = k + 1; break; }
          if (rest[k] === ' ' && cut < 0) cut = k;
        }
        if (cut <= 0) cut = maxChars;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) out.push(rest);
    }
    return out.filter(Boolean);
  }
  // First chunk + the rest, for callers that want time-to-first-sentence.
  function firstAndRest(text, opts) {
    const parts = splitSentences(text, opts);
    return { first: parts.length ? parts[0] : null, rest: parts.slice(1), all: parts };
  }
  const api = { splitSentences, firstAndRest };
  if (typeof module === 'object') module.exports = api;
  else root.SpeechChunker = api;
})(globalThis);
