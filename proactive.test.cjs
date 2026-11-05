const { test } = require('node:test'), a = require('node:assert/strict');
const { ProactiveEngine, inQuietHours } = require('./proactive.cjs');
const at = (h, m = 0, day = 5) => new Date(2026, 0, day, h, m).getTime();
const sig = (over = {}) => ({ context: null, idleMs: 0, timer: { running: false, finishedAt: 0 }, counts: {}, ...over });
test('master toggle off stays silent', () => {
  const e = new ProactiveEngine({ enabled: false });
  a.equal(e.tick(sig({ context: { app: 'Code', activity: 'coding', dwellMs: 99 * 60000, recentChanges: 0 } }), at(14)), null);
});
test('morning greeting fires once per day', () => {
  const e = new ProactiveEngine({ enabled: true });
  const d = e.tick(sig(), at(9));
  a.equal(d.ruleId, 'morning-greeting');
  a.equal(e.tick(sig(), at(9, 30)), null); // once per day, not per tick
  const next = e.tick(sig(), at(9, 0, 6));
  a.equal(next.ruleId, 'morning-greeting');
});
test('quiet hours silence daytime rules; late-night rule is the one exception', () => {
  a.equal(inQuietHours(at(23, 30)), true);
  a.equal(inQuietHours(at(14)), false);
  const e = new ProactiveEngine({ enabled: true });
  a.equal(e.tick(sig({ context: { app: 'Code', activity: 'coding', dwellMs: 99 * 60000, recentChanges: 0 } }), at(23, 30)), null);
  const e2 = new ProactiveEngine({ enabled: true });
  const d = e2.tick(sig(), at(1));
  a.equal(d.ruleId, 'late-night');
});
test('long dwell fires once, respects cooldown and the global gap', () => {
  const e = new ProactiveEngine({ enabled: true });
  const s = sig({ context: { app: 'Code', activity: 'coding', dwellMs: 50 * 60000, recentChanges: 0 } });
  const d = e.tick(s, at(14));
  a.equal(d.ruleId, 'long-dwell');
  a.match(d.line, /50 mins/);
  a.equal(e.decide(s, at(14, 5)), null); // global gap
  a.equal(e.decide(s, at(14, 30)), null); // rule cooldown (60m)
  const again = e.tick(s, at(15, 5));
  a.equal(again.ruleId, 'long-dwell');
});
test('focus completion celebrates once per finish; ignored timer nudges later', () => {
  const e = new ProactiveEngine({ enabled: true });
  const fin = at(15, 0);
  const d = e.tick(sig({ timer: { running: false, finishedAt: fin } }), fin + 30000);
  a.equal(d.ruleId, 'focus-completed');
  a.equal(e.decide(sig({ timer: { running: false, finishedAt: fin } }), fin + 40000), null);
  const later = e.tick(sig({ timer: { running: false, finishedAt: fin } }), fin + 11 * 60000);
  a.equal(later.ruleId, 'timer-ignored');
});
test('app hopping and daily cap are enforced', () => {
  const e = new ProactiveEngine({ enabled: true, dailyCap: 2, minGapMs: 60000 });
  const hop = sig({ context: { app: 'chrome', activity: 'browsing', dwellMs: 1000, recentChanges: 8 } });
  a.equal(e.tick(hop, at(14)).ruleId, 'app-hopping');
  const dwell = sig({ context: { app: 'Code', activity: 'coding', dwellMs: 50 * 60000, recentChanges: 0 } });
  a.equal(e.tick(dwell, at(14, 2)).ruleId, 'long-dwell');
  a.equal(e.decide(dwell, at(14, 10)), null); // cap of 2 reached for the day
});
