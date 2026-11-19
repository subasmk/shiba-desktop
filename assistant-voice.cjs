// Per-assistant voices for Relay.
//
// Rex and Dex are separate assistants, not skins of one pet: each keeps its
// own personality (petPersonality in main), its own memory store
// (petMemoryByMascot) and its own animation set. This module gives each its
// own VOICE on the Kokoro engine: a speaker id + speaking speed, stored in
// settings.voiceByMascot = { rex: {sid, speed}, dex: {sid, speed} }.
//
// The Kokoro multi-lang model (kokoro-int8-multi-lang-v1_0, see setup.cjs)
// ships 53 speakers, sid 0..52. The picker below is a small curated set of
// English voices; the sid order is the model's own speaker order. Any sid
// outside 0..52, or a speed outside 0.6..1.5, is rejected back to the
// assistant's default - a hand-edited or stale settings file can never push
// an impossible voice into the TTS worker (which also clamps to the loaded
// model's real speaker count).
//
// Defaults are character-fit and DIFFERENT on purpose: Rex the calm Shiba
// gets a calm male voice at natural speed; Dex the playful cat gets a
// livelier voice, slightly quicker. The Tamil voice is a single-speaker
// model and the system/chatterbox engines speak for themselves, so this
// choice applies to the Kokoro path only.
const MAX_SID = 52;
const MIN_SPEED = 0.6, MAX_SPEED = 1.5;

const VOICES = [
  { sid: 0, label: 'Heart - warm US female' },
  { sid: 3, label: 'Bella - bright US female' },
  { sid: 7, label: 'Nova - lively US female' },
  { sid: 21, label: 'Emma - soft UK female' },
  { sid: 11, label: 'Adam - steady US male' },
  { sid: 16, label: 'Michael - calm US male' },
  { sid: 18, label: 'Puck - playful US male' },
  { sid: 26, label: 'George - mellow UK male' },
];

const DEFAULTS = {
  rex: { sid: 16, speed: 1.0 },
  dex: { sid: 7, speed: 1.12 },
  girl: { sid: 0, speed: 1.0 },
  vex: { sid: 18, speed: 1.0 },
};

// Same bucketing as main's activeMascot(): anything that is not Rex is Dex.
function voiceKey(mascot) { return mascot === 'girl' ? 'girl' : mascot === 'rex' ? 'rex' : mascot === 'vex' ? 'vex' : 'dex'; }

function sanitizePref(pref, fallback) {
  const out = { sid: fallback.sid, speed: fallback.speed };
  if (pref && typeof pref === 'object') {
    if (Number.isInteger(pref.sid) && pref.sid >= 0 && pref.sid <= MAX_SID) out.sid = pref.sid;
    if (typeof pref.speed === 'number' && Number.isFinite(pref.speed)) out.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, pref.speed));
  }
  return out;
}

// The voice the given assistant should speak with right now.
function resolveVoice(settings, mascot) {
  const key = voiceKey(mascot);
  const all = settings && typeof settings === 'object' ? settings.voiceByMascot : null;
  return sanitizePref(all && typeof all === 'object' ? all[key] : null, DEFAULTS[key]);
}

module.exports = { VOICES, DEFAULTS, MAX_SID, MIN_SPEED, MAX_SPEED, voiceKey, sanitizePref, resolveVoice };
