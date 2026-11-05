// Proactive comments engine: the pet speaks up on its own - rarely, and only
// from real local signals. Consent posture matches the rest of the app:
// master toggle defaults OFF, quiet hours apply, every rule has a cooldown,
// there is a global gap and a daily cap, and at most one comment is pending
// at a time. Rules are pure functions of (signals, now, state) and the engine
// state is a plain object, so everything is testable with a fake clock.
//
// Signals shape (all optional; missing pieces simply disable their rules):
//   { context: {app,title,activity,dwellMs,recentChanges} | null,
//     idleMs: number, timer: {running, startedAt, finishedAt},
//     counts: {pet-history counts}, dayKey: 'YYYY-MM-DD' }
//
// Output lines are fixed templates built only from the passed-in facts -
// the same grounding rule as pet-history roasts. The LLM is never asked
// to invent what the user was doing; banter.cjs may rephrase within the
// same facts when wired, with these lines as its fallback.

const MIN = 60000;
function hourOf(now) { return new Date(now).getHours(); }
function inQuietHours(now, quietStart = 23, quietEnd = 7) {
  const h = hourOf(now);
  return quietStart <= quietEnd ? (h >= quietStart && h < quietEnd) : (h >= quietStart || h < quietEnd);
}
function dayKeyOf(now) { const d = new Date(now); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// Each rule: id, cooldownMs, optional onceKey(state)->string (for per-event
// "fire only once" rules; the engine stores the last key it fired for),
// test(signals, now, state) -> {line, banterOk} | null.
const RULES = [
  {
    id: 'morning-greeting', cooldownMs: 0,
    onceKey: (s, now) => 'greet:' + dayKeyOf(now),
    test(s, now) {
      const h = hourOf(now);
      if (h < 5 || h > 11) return null;
      return { line: 'Good morning, bro. Innaiku plan enna? Naan ready.', banterOk: false };
    },
  },
  {
    id: 'focus-completed', cooldownMs: 0,
    onceKey: (s) => s.timer && s.timer.finishedAt ? 'fin:' + s.timer.finishedAt : null,
    test(s, now) {
      const t = s.timer; if (!t || !t.finishedAt || t.running) return null;
      if (now - t.finishedAt > 2 * MIN) return null; // celebrate promptly or not at all
      return { line: 'Focus round mudinjidhu! Siuuu, well done bro. Oru break edu.', banterOk: false };
    },
  },
  {
    id: 'timer-ignored', cooldownMs: 30 * MIN,
    test(s, now) {
      const t = s.timer; if (!t || !t.finishedAt || t.running) return null;
      if (now - t.finishedAt < 10 * MIN) return null;
      return { line: 'Timer mudinju romba neram aachu, bro. Break-ku approm next round?', banterOk: true };
    },
  },
  {
    id: 'long-dwell', cooldownMs: 60 * MIN,
    test(s) {
      const c = s.context; if (!c || c.dwellMs < 45 * MIN) return null;
      const mins = Math.round(c.dwellMs / MIN);
      if (c.activity === 'game') return { line: mins + ' mins ore game-la, bro. Thanni kudi, kanna rest kudu.', banterOk: true };
      if (c.activity === 'coding') return { line: mins + ' mins code-la continuous ah, bro. Konjam stretch pannu.', banterOk: true };
      if (c.activity === 'video') return { line: mins + ' mins video paarthen, bro. Kannu valikkum, break edu.', banterOk: true };
      return { line: 'Romba neram ' + (c.app || 'ore app') + '-la iruka, bro. Break edukkalama?', banterOk: true };
    },
  },
  {
    id: 'late-night', cooldownMs: 90 * MIN,
    test(s, now) {
      const h = hourOf(now);
      if (!(h >= 0 && h < 4)) return null;
      if ((s.idleMs || 0) > 15 * MIN) return null; // user is away; do not talk to an empty chair
      return { line: 'Bro, mani ' + h + ' aachu. Thoonguna dhaan naalaiku brain work aagum.', banterOk: true };
    },
  },
  {
    id: 'app-hopping', cooldownMs: 45 * MIN,
    test(s) {
      const c = s.context; if (!c || (c.recentChanges || 0) < 6) return null;
      return { line: 'Apps-ku naduvula roller coaster pora, bro. Onnu pick panni settle aagu.', banterOk: true };
    },
  },
];

class ProactiveEngine {
  constructor({ enabled = false, quietStart = 23, quietEnd = 7, minGapMs = 10 * MIN, dailyCap = 6, rules = RULES } = {}) {
    this.enabled = enabled; this.quietStart = quietStart; this.quietEnd = quietEnd;
    this.minGapMs = minGapMs; this.dailyCap = dailyCap; this.rules = rules;
    this.state = { lastFired: {}, onceKeys: {}, lastAnyAt: 0, day: '', dayCount: 0 };
  }
  // Pure decision: returns {ruleId, line, banterOk} or null. Does not mutate.
  decide(signals, now = Date.now(), state = this.state) {
    if (!this.enabled || !signals) return null;
    const quiet = inQuietHours(now, this.quietStart, this.quietEnd);
    const day = dayKeyOf(now);
    const dayCount = state.day === day ? state.dayCount : 0;
    if (dayCount >= this.dailyCap) return null;
    // A finished-focus celebration is exempt from the global gap: it is a
    // direct reaction to the user's own timer, not an interruption.
    for (const rule of this.rules) {
      // Quiet hours silence everything except the late-night nudge itself
      // (that rule exists for the quiet hours; its own cooldown still
      // applies, and it stays bubble-quiet in tone by design).
      if (quiet && rule.id !== 'late-night') continue;
      if (rule.id !== 'focus-completed' && state.lastAnyAt && now - state.lastAnyAt < this.minGapMs) continue;
      const key = rule.onceKey ? rule.onceKey(signals, now) : null;
      if (key !== null && key !== undefined && state.onceKeys[rule.id] === key) continue;
      if (rule.cooldownMs && state.lastFired[rule.id] && now - state.lastFired[rule.id] < rule.cooldownMs) continue;
      const hit = rule.test(signals, now, state);
      if (hit) return { ruleId: rule.id, line: hit.line, banterOk: !!hit.banterOk, onceKey: key ?? null };
    }
    return null;
  }
  // External one-off offers (the RSS scout's news offer) go through the
  // same gates as rules - enabled, quiet hours, daily cap, global gap -
  // so enabling the scout cannot make the pet chattier than the user
  // allowed here. canAdmitExternal is the pure check; admitExternal also
  // commits, counting the offer against the cap like any comment.
  canAdmitExternal(now = Date.now(), state = this.state) {
    if (!this.enabled) return false;
    if (inQuietHours(now, this.quietStart, this.quietEnd)) return false;
    const day = dayKeyOf(now);
    const dayCount = state.day === day ? state.dayCount : 0;
    if (dayCount >= this.dailyCap) return false;
    if (state.lastAnyAt && now - state.lastAnyAt < this.minGapMs) return false;
    return true;
  }
  admitExternal(ruleId, now = Date.now()) {
    if (!this.canAdmitExternal(now)) return false;
    this.commit({ ruleId }, now);
    return true;
  }
  // Record that a decision was actually delivered (bubble shown/spoken).
  commit(decision, now = Date.now()) {
    if (!decision) return;
    const day = dayKeyOf(now);
    if (this.state.day !== day) { this.state.day = day; this.state.dayCount = 0; }
    this.state.dayCount++;
    this.state.lastAnyAt = now;
    this.state.lastFired[decision.ruleId] = now;
    if (decision.onceKey) this.state.onceKeys[decision.ruleId] = decision.onceKey;
  }
  tick(signals, now = Date.now()) {
    const d = this.decide(signals, now);
    if (d) this.commit(d, now);
    return d;
  }
}

module.exports = { ProactiveEngine, RULES, inQuietHours, dayKeyOf };
