// Fish Audio cloud voice (S2.1) for spoken replies - an opt-in engine
// next to the local Kokoro voice, the system voice and the Chatterbox
// sidecar. The user makes his own Fish Audio account, clones one voice
// per assistant on fish.audio (about 10-30 seconds of clean audio each)
// and pastes the two voice IDs plus his API key into the dashboard. The
// key is a credential: main stores it safeStorage-encrypted
// (settings.fishSecret, same pattern as the brain keys), never returns
// it to a renderer, and this module only ever receives it as an
// argument. Nothing is bundled and no key or voice is invented here.
//
// Vex speaks with his own
// cloned voice: settings.fishVoiceByMascot = { rex: '<voice id>',
// dex: '<voice id>' }, resolved for the ACTIVE assistant at speak time.
//
// Models: 's2.1-pro-free' is the same S2.1 Pro model at no cost under
// Fish's fair-use limits (no latency guarantee) and is the default, so
// the engine works on a free account with no credit. 's2.1-pro' is the
// paid production model (per-byte credit). Replies are sent to Fish
// Audio to be spoken - that is the whole point of a cloud engine, and
// the dashboard card says so. Honest failure is a feature: no key, no
// voice ID for the active assistant, a rejected key or an empty-credit
// account all throw a plain in-app message instead of faking audio.
const { voiceKey } = require('./assistant-voice.cjs');

const API_URL = 'https://api.fish.audio/v1/tts';
const MODELS = ['s2.1-pro-free', 's2.1-pro'];
const DEFAULT_MODEL = 's2.1-pro-free';
// Fish voice model IDs are opaque tokens (hex-ish). Accept a sane token
// shape only, so a pasted URL or sentence can never become a header or
// body value by accident.
const ID_RE = /^[\w-]{4,80}$/;

function sanitizeVoiceId(v) {
  const s = String(v == null ? '' : v).trim();
  return ID_RE.test(s) ? s : '';
}

function sanitizeFishVoices(settings) {
  const all = settings && typeof settings === 'object' ? settings.fishVoiceByMascot : null;
  const src = all && typeof all === 'object' ? all : {};
  return { vex: sanitizeVoiceId(src.vex) };
}

function resolveFishVoice(settings, mascot) {
  return sanitizeFishVoices(settings)[voiceKey(mascot)];
}

function resolveFishModel(settings) {
  const m = settings && typeof settings === 'object' ? settings.fishModel : null;
  return MODELS.includes(m) ? m : DEFAULT_MODEL;
}

// One synthesis call. Returns the WAV bytes Fish sends back; the caller
// (voice-clone.cjs) decodes them to the shared {samples, sampleRate}
// shape. fetchFn is injectable for tests.
async function fishSpeak({ apiKey, text, referenceId, model, fetchFn = fetch, timeoutMs = 30000 } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw Error('Fish Audio voice is not set up: add your Fish Audio API key in the dashboard (Voice tab) first.');
  const t = String(text || '').trim();
  if (!t) throw Error('Nothing to speak.');
  const ref = sanitizeVoiceId(referenceId);
  if (!ref) throw Error('No Fish voice is set for this assistant yet: clone a voice at fish.audio and paste its voice ID in the dashboard (Voice tab).');
  const mdl = MODELS.includes(model) ? model : DEFAULT_MODEL;
  let r;
  try {
    r = await fetchFn(API_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', model: mdl },
      body: JSON.stringify({ text: t.slice(0, 2500), reference_id: ref, format: 'wav' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) { throw Error('Fish Audio could not be reached: ' + e.message); }
  if (!r || !r.ok) {
    const status = r ? r.status : 0;
    if (status === 401) throw Error('Fish Audio rejected the API key. Save it again in the dashboard (Voice tab).');
    if (status === 402) throw Error('Fish Audio says this account has no credit for that model. Pick the free s2.1-pro-free model in the dashboard (Voice tab), or add credit at fish.audio.');
    throw Error('Fish Audio refused the request (' + status + ').');
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw Error('Fish Audio returned no audio.');
  return buf;
}

module.exports = { API_URL, MODELS, DEFAULT_MODEL, sanitizeVoiceId, sanitizeFishVoices, resolveFishVoice, resolveFishModel, fishSpeak };
