// Tamil voice seam (experimental spike route, not the default Kokoro voice).
//
// The spike proved local Tamil speech with ta_IN-ValluvarNeural-medium
// (Piper) via piper-phonemize + sherpa wasm, using files prepared by
// tools/tamil-voice-setup.cjs. That engine is NOT part of the shipped
// voice-worker (which serves Whisper STT + Kokoro TTS), so this module is
// the documented plug-in point:
//
//   WHERE IT PLUGS IN: a future branch in the voice-synthesize path -
//   when settings.voiceLang === 'ta', run prepareTamilText(text) here,
//   then hand the Tamil-script result to a sherpa wasm TTS session loaded
//   with the prepared model dir (see loadPreparedModel). Until that branch
//   exists, synthesizeTamil() requires an injected engine and otherwise
//   fails honestly, in the app's honest-error style.
//
// Text rule (verified in the voice lab): the Tamil model phonemizes Tamil
// script. Latin-script Tanglish must be transliterated first or espeak
// reads it as English. Tamil-script input passes through untouched.
const fs = require('node:fs');
const path = require('node:path');
const { transliterate, hasTamilScript } = require('./transliterate.cjs');

function isTamilSelected(settings) { return !!settings && settings.voiceLang === 'ta'; }

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

// Synthesize Tamil speech. `engine` is the spike engine seam:
//   engine({model, tokens, text}) -> Promise<{samples, sampleRate}>
// No engine is bundled yet, so without one this rejects with the exact
// setup step the user still has to run - never silent, never fake audio.
async function synthesizeTamil(text, { modelDir, engine } = {}) {
  const prepared = prepareTamilText(text);
  if (!prepared) throw Error('Nothing to say in Tamil.');
  const found = loadPreparedModel(modelDir);
  if (!found) throw Error('Tamil voice is not set up. Run: node tools/tamil-voice-setup.cjs <dir> first (experimental spike).');
  if (typeof engine !== 'function') throw Error('Tamil spike engine is not wired into the voice worker yet. Text was prepared as Tamil script; see DEXTER-UPGRADE.md for the plug-in point.');
  const audio = await engine({ ...found, text: prepared });
  if (!audio || !audio.samples || !audio.sampleRate) throw Error('Tamil spike engine returned no audio.');
  return { ...audio, text: prepared };
}

module.exports = { isTamilSelected, prepareTamilText, loadPreparedModel, synthesizeTamil };
