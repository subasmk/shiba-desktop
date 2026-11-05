// Wake word: "Hey Shiba" hands-free start for the voice call.
// Ported design from Viktor's voice watcher (viktor_voice.py): there is no
// separate wake model - the app's own local Whisper transcription spots the
// phrase in short energy-gated windows, exactly like Viktor's faster-whisper
// watcher did. This module is the pure half: transcript normalization,
// phrase matching, and the detector state machine. The renderer adapter
// (voice-ui.js) owns the microphone; main owns the settings + mute hotkey.
//
// Consent rails (mandatory, not optional):
//  - The wakeWord setting defaults OFF. Nothing listens until it is on.
//  - While listening, the UI shows a visible indicator (panel dot + pet
//    window dot, driven by 'wake-state' events).
//  - A global mute hotkey (Ctrl+Shift+M, registered in main) kills the
//    listener instantly; the settings toggle is the other off switch.
//  - A trigger may only START the normal voice call. All conversation mic
//    rules of the app (Start/Stop, barge-in, generation guards) are the
//    existing VoiceSession's - the wake listener never becomes the call.
//  - After a trigger the detector cools down so the call's own opening
//    sounds (or the user greeting the pet) cannot retrigger it.
//
// Viktor's watcher anchored the phrase at the start of the transcript
// (after an optional greeting) and tolerated ASR mis-hears of the name
// (viktor|victor|vector). Same here: shiba|sheba|siba|sheeba.

const WAKE_RE = /^(?:hey|hi|ok|okay|a|hey there)?[\s,.!?]*?(shiba|sheba|siba|sheeba)\b[\s,.!?]*(.*)$/i;

function normalizeTranscript(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

// Match a transcript against the wake phrase. Returns null, or
// {command} where command is the rest of the utterance after the phrase
// ("Hey Shiba, what time is it" -> "what time is it") or null when the
// utterance was only the phrase (two-step flow: the call starts and the
// user simply keeps talking, same as Viktor).
function matchWakePhrase(text) {
  const t = normalizeTranscript(text);
  if (!t) return null;
  const m = t.match(WAKE_RE);
  if (!m) return null;
  const rest = (m[2] || '').replace(/^[\s,.!?-]+/, '').trim();
  return { command: rest || null };
}

// State machine: off -> listening -> (trigger) -> cooldown -> listening.
// feed() only acts in 'listening'. now is injectable for tests.
class WakeWordDetector {
  constructor({ cooldownMs = 5000 } = {}) {
    this.state = 'off';
    this.cooldownMs = cooldownMs;
    this.cooldownUntil = 0;
    this.lastHeard = '';
  }
  enable() { if (this.state === 'off') { this.state = 'listening'; this.cooldownUntil = 0; } return this.state; }
  disable() { this.state = 'off'; this.cooldownUntil = 0; return this.state; }
  // Returns {type:'triggered', command} or null.
  feed(text, now = Date.now()) {
    if (this.state === 'off') return null;
    if (this.state === 'cooldown') {
      if (now < this.cooldownUntil) return null;
      this.state = 'listening';
    }
    const heard = normalizeTranscript(text);
    if (heard) this.lastHeard = heard;
    const hit = matchWakePhrase(heard);
    if (!hit) return null;
    this.state = 'cooldown';
    this.cooldownUntil = now + this.cooldownMs;
    return { type: 'triggered', command: hit.command };
  }
}

const wakewordApi = { WAKE_RE, normalizeTranscript, matchWakePhrase, WakeWordDetector };
if (typeof module !== 'undefined' && module.exports) module.exports = wakewordApi;
else window.WakeWord = wakewordApi;
