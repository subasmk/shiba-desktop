// Tamil voice branch (last-mile item 1: wired into the main voice loop).
//
// The spike proved local Tamil speech with ta_IN-ValluvarNeural-medium
// (Piper) via piper-phonemize + sherpa wasm, using files prepared by
// tools/tamil-voice-setup.cjs. That route is now a real branch of the
// shipped voice path:
//
//   settings.voiceLang = 'en'       -> Kokoro, exactly as before (default)
//   settings.voiceLang = 'ta'       -> Tamil voice; Tamil-script input
//                                      passes through, Latin runs are
//                                      transliterated (mixed text)
//   settings.voiceLang = 'tanglish' -> Tamil voice; Latin-script Tanglish
//                                      input is transliterated first
//
// main.cjs injects the worker-backed engine (createWorkerTamilEngine over
// VoiceBackend's 'synthesize-ta' call, served by voice-worker.cjs from the
// same vendored sherpa WASM runtime as Kokoro). createVoiceEngine in
// voice-clone.cjs routes to it only on the default (kokoro) engine path;
// an explicit system/chatterbox engine choice always wins. If the Tamil
// model or engine is unavailable, the caller falls back to Kokoro and
// surfaces a notice - never silent, never fake audio.
//
// Text rule (verified in the voice lab): the Tamil model phonemizes Tamil
// script. Latin-script Tanglish must be transliterated first or espeak
// reads it as English. Tamil-script input passes through untouched.
const fs = require('node:fs');
const path = require('node:path');
const { transliterate, hasTamilScript } = require('./transliterate.cjs');

function isTamilSelected(settings) { return !!settings && settings.voiceLang === 'ta'; }

const VOICE_LANGS = ['en', 'ta', 'tanglish'];
// 'en' is the default and covers unset/unknown values (pre-pack behaviour).
function resolveVoiceLang(settings) {
  const v = settings && settings.voiceLang;
  return VOICE_LANGS.includes(v) ? v : 'en';
}
function usesTamilVoice(settings) { const l = resolveVoiceLang(settings); return l === 'ta' || l === 'tanglish'; }

// One system-prompt sentence steering the reply language to the selected
// voice language, so a Tanglish/Tamil voice actually gets Tanglish/Tamil
// text to speak instead of English read by the Tamil voice.
function replyLanguageRule(settings) {
  const l = resolveVoiceLang(settings);
  if (l === 'tanglish') return 'Reply briefly in natural Tanglish - a casual Tamil and English mix written in Latin letters, the way a Chennai friend texts (for example "Dei, five apps open iruku, seekiram mudi!").';
  if (l === 'ta') return 'Reply briefly in Tamil, written in Tamil script.';
  return 'Reply briefly in English.';
}

// Script detection for one reply text: 'tamil' (Tamil script only),
// 'latin' (Latin letters only), 'mixed' (both), 'empty' (neither).
function detectScript(text) {
  const t = String(text ?? '');
  const ta = hasTamilScript(t), la = /[A-Za-z]/.test(t);
  if (ta && la) return 'mixed';
  if (ta) return 'tamil';
  if (la) return 'latin';
  return 'empty';
}

// Prepare a reply for the selected language. 'en' passes text through for
// the Kokoro path; 'ta'/'tanglish' produce the Tamil-script text the model
// must see (transliteration lives in prepareTamilText).
function prepareForLang(text, lang) {
  if (lang === 'ta' || lang === 'tanglish') return prepareTamilText(text);
  return String(text ?? '');
}

// Full routing decision for one reply, as data the caller can log/test.
function routeReply(text, settings) {
  const lang = resolveVoiceLang(settings);
  return {
    lang,
    script: detectScript(text),
    useTamil: lang === 'ta' || lang === 'tanglish',
    prepared: prepareForLang(text, lang),
  };
}

// The production engine seam: synthesize through the shipped voice worker
// (VoiceBackend 'synthesize-ta'), which loads the prepared model dir with
// the vendored sherpa WASM runtime. backend is anything with
// call(type, data) -> Promise<{samples, sampleRate}> (VoiceBackend).
function createWorkerTamilEngine(backend, modelDir) {
  if (!backend || typeof backend.call !== 'function') throw Error('Tamil engine needs the voice backend.');
  return async function workerTamilEngine({ text }) {
    const audio = await backend.call('synthesize-ta', { text, modelDir });
    if (!audio || !audio.samples || !audio.sampleRate) throw Error('Tamil voice worker returned no audio.');
    return audio;
  };
}

// Prepare any chat/voice text for the Tamil model.
function prepareTamilText(text) {
  const t = String(text ?? '');
  if (!t.trim()) return '';
  if (hasTamilScript(t)) {
    // Mixed text: transliterate only the Latin runs, keep Tamil runs as-is.
    return t.replace(/[A-Za-z]+/g, (w) => transliterate(w));
  }
  return transliterate(t);
}

// Locate a model dir prepared by tools/tamil-voice-setup.cjs.
// Returns null (never throws) when the spike was not prepared.
function loadPreparedModel(dir) {
  if (!dir || typeof dir !== 'string') return null;
  const model = path.join(dir, 'ta_IN-ValluvarNeural-medium.onnx');
  const tokens = path.join(dir, 'ta-tokens.txt');
  try {
    if (fs.existsSync(model) && fs.existsSync(tokens)) return { model, tokens, sampleRate: 22050 };
  } catch { /* fall through to null */ }
  return null;
}

const PHONEMIZER_FILES = ['piper-phonemize-wasm-main.js', 'piper-phonemize-wasm-main.wasm', 'piper-phonemize-wasm-main.data', 'piper-phonemize.js'];
// True when the setup script also fetched the piper-phonemize WASM into
// <dir>/piper-phonemize (the worker cannot phonemize Tamil without it).
function phonemizerReady(dir) {
  if (!dir || typeof dir !== 'string') return false;
  try { return PHONEMIZER_FILES.every((f) => fs.existsSync(path.join(dir, 'piper-phonemize', f))); } catch { return false; }
}

// Synthesize Tamil speech. `engine` is the engine seam:
//   engine({model, tokens, text}) -> Promise<{samples, sampleRate}>
// main.cjs injects createWorkerTamilEngine (the shipped voice worker).
// Without an injected engine this rejects honestly - never fake audio.
async function synthesizeTamil(text, { modelDir, engine } = {}) {
  const prepared = prepareTamilText(text);
  if (!prepared) throw Error('Nothing to say in Tamil.');
  const found = loadPreparedModel(modelDir);
  if (!found) throw Error('Tamil voice is not set up. Run: node tools/tamil-voice-setup.cjs <dir> first (experimental spike).');
  if (typeof engine !== 'function') throw Error('Tamil engine is not wired into this call path (no engine was injected). Text was prepared as Tamil script; see LASTMILE.md.');
  const audio = await engine({ ...found, text: prepared });
  if (!audio || !audio.samples || !audio.sampleRate) throw Error('Tamil spike engine returned no audio.');
  return { ...audio, text: prepared };
}

module.exports = { isTamilSelected, prepareTamilText, loadPreparedModel, synthesizeTamil, VOICE_LANGS, resolveVoiceLang, usesTamilVoice, detectScript, prepareForLang, routeReply, createWorkerTamilEngine, PHONEMIZER_FILES, phonemizerReady, replyLanguageRule };
