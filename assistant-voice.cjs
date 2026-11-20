// Local Kokoro voice preferences for Daru.
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

const DEFAULTS = { vex: { sid: 18, speed: 1.0 } };

// Daru is the only assistant, including when loading stale settings.
function voiceKey() { return 'vex'; }

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
