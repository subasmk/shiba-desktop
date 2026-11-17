// Annoyance: the poke mood system (Dexter-style, Nov 16 2026). Every tap
// reaction and tap-combo swing on the pet is a "hit"; hits fill a leaky
// bucket, the level drains while the user behaves, and at the annoyed /
// furious thresholds the pet's tap reactions turn to rage and the LOCAL
// brain gets a mood note in its system prompt (see moodNote - the note
// is local-mode only, mirroring the local-only gating of pet memory:
// cloud and Groq prompts never see it). The bucket is session state in
// the main process only - it is never written to settings, disk or pet
// memory, and an apologetic chat message resets it (isCalmDown).
//
// UMD like pet-behavior.cjs: main require()s it for the bucket + prompt
// note, the pet renderer loads it as a script for the bubble lines.
(function (root) {
  const ANNOYED_LINES = [
    'Podhum bro, kovam varudhu 😤',
    'Ei, podhum! Kaiya vechu summa iru 😾',
    'Last warning bro… adichae kochikuven 😤',
  ];
  const FURIOUS_LINES = [
    'AVLO DHAAN! Full kovam mode 😤🔥',
    'Bro!! Limit cross pannita. Kovam max la irukken 😾🔥',
  ];
  function lineFor(mood, random = Math.random) {
    const pool = mood === 'furious' ? FURIOUS_LINES : ANNOYED_LINES;
    return pool[Math.floor(random() * pool.length) % pool.length];
  }
  // Small calm-down matcher for chat text: an apology or a "stop / let
  // go" in English or Tanglish resets the mood.
  const CALM_DOWN = /\b(calm down|sorry|vidu|podhum)\b/i;
  function isCalmDown(text) {
    return typeof text === 'string' && CALM_DOWN.test(text);
  }
  function moodOf(level, { annoyedAt = 5, furiousAt = 10 } = {}) {
    if (level >= furiousAt) return 'furious';
    if (level >= annoyedAt) return 'annoyed';
    return 'calm';
  }
  // The system-prompt mood note. Returns '' unless the level is at least
  // annoyed AND the caller confirms the local brain - cloud/Groq prompts
  // must receive no annoyance note at all.
  function moodNote(level, { local = false, annoyedAt = 5, furiousAt = 10 } = {}) {
    if (!local) return '';
    const mood = moodOf(level, { annoyedAt, furiousAt });
    if (mood === 'calm') return '';
    if (mood === 'furious') {
      return 'Mood note: you are FURIOUS at the user - they kept poking and tapping you and would not stop. Keep this reply openly annoyed and very short, in character, until you calm down.';
    }
    return 'Mood note: you are still annoyed at the user - they have been poking and tapping you a lot. Keep this reply a little annoyed and short, in character, until you calm down.';
  }

  // Leaky bucket: hit() adds 1; the level drains by 1 per drainMs of no
  // hits (applied lazily from the anchor time of the current fill, so
  // the math is a pure function of the hit history + clock).
  class Annoyance {
    constructor({ drainMs = 25000, annoyedAt = 5, furiousAt = 10 } = {}) {
      this.drainMs = drainMs; this.annoyedAt = annoyedAt; this.furiousAt = furiousAt;
      this.count = 0; this.anchor = 0;
    }
    _decay(now) {
      if (this.count <= 0) { this.anchor = now; return; }
      const steps = Math.floor((now - this.anchor) / this.drainMs);
      if (steps > 0) {
        this.count = Math.max(0, this.count - steps);
        this.anchor = this.count > 0 ? this.anchor + steps * this.drainMs : now;
      }
    }
    hit(now = Date.now()) {
      this._decay(now);
      if (this.count === 0) this.anchor = now;
      this.count++;
      return this.mood(now);
    }
    level(now = Date.now()) { this._decay(now); return this.count; }
    mood(now = Date.now()) {
      return moodOf(this.level(now), { annoyedAt: this.annoyedAt, furiousAt: this.furiousAt });
    }
    reset() { this.count = 0; this.anchor = 0; }
  }

  const api = { Annoyance, ANNOYED_LINES, FURIOUS_LINES, lineFor, isCalmDown, moodOf, moodNote };
  if (typeof module === 'object') module.exports = api;
  else root.Annoyance = api;
})(globalThis);
