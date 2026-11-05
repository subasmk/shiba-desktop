const { test } = require('node:test'), a = require('node:assert/strict');
const { RoamController } = require('./roam.cjs');
const area = { x: 0, y: 0, width: 1280, height: 800 };
const groundY = 800 - 130;
function drive(ctl, from, to, x0 = 100) {
  const out = [];
  let x = x0;
  for (let now = from; now <= to; now += 50) {
    const r = ctl.step({ now, x, y: groundY, area, paused: false });
    if (r.move) x = r.move.x;
    out.push(r);
  }
  return { out, x };
}
test('roam stays idle until its scheduled move, then portals out', () => {
  const ctl = new RoamController(() => 0); // deterministic: 10s wait, target at left edge
  const early = ctl.step({ now: 1000, x: 100, y: groundY, area, paused: false });
  a.deepEqual(early, { move: null, animation: null });
  const start = ctl.step({ now: 11001, x: 100, y: groundY, area, paused: false });
  a.equal(start.animation, 'portal');
  a.equal(ctl.state, 'vanish');
});
test('after vanish the pet reappears on the ground and walks to its target', () => {
  const ctl = new RoamController(() => 0.9); // wait 23500ms, target near right side
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false });
  ctl.step({ now: 23501, x: 100, y: groundY, area, paused: false }); // vanish starts
  const appear = ctl.step({ now: 24402, x: 100, y: groundY, area, paused: false });
  a.equal(appear.animation, 'portal');
  a.equal(appear.move.y, groundY);
  a.ok(appear.move.x >= area.x && appear.move.x <= area.x + area.width - 120);
  const { x } = drive(ctl, 24452, 40000, appear.move.x);
  a.equal(ctl.state, 'idle'); // arrived and settled
  a.equal(x, ctl.targetX); // walked exactly to the chosen target
  a.ok(x >= area.x && x <= area.x + area.width - 120);
});
test('pause (drag/dock) resets roam and never moves the pet', () => {
  const ctl = new RoamController(() => 0.5); // wait 17500ms
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false });
  ctl.step({ now: 17501, x: 100, y: groundY, area, paused: false });
  a.equal(ctl.state, 'vanish');
  const r = ctl.step({ now: 17600, x: 100, y: groundY, area, paused: true });
  a.deepEqual(r, { move: null, animation: null });
  a.equal(ctl.state, 'idle');
});

const { perchPosition, rectMoved } = require('./roam.cjs');
const rect = { left: 200, top: 100, right: 1000, bottom: 700 };
test('perch geometry: sits on the title bar, clamped to the work area', () => {
  const p = perchPosition({ ...rect, top: 200 }, area);
  a.equal(p.y, 200 - 130 + 16); // window bottom overlaps the bar top
  a.equal(perchPosition(rect, area).y, area.y); // bar near the top edge: clamped into the work area
  a.ok(p.x >= rect.left && p.x + 120 <= rect.right);
  const off = perchPosition({ left: -500, top: 30, right: -100, bottom: 400 }, area);
  a.ok(off.x >= area.x && off.y >= area.y);
  a.equal(perchPosition(null, area), null);
  a.equal(rectMoved(rect, { ...rect, left: 203 }), false);
  a.equal(rectMoved(rect, { ...rect, left: 260 }), true);
});
test('perch: climbs on, sits, leaves when the window moves', () => {
  const seq = [0, 0.1]; let i = 0;
  const ctl = new RoamController(() => seq[Math.min(i++, seq.length - 1)], { perchChance: 0.5 });
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false }); // schedule at 10000
  const go = ctl.step({ now: 10001, x: 100, y: groundY, area, paused: false, perch: true, fgRect: rect, fgKey: 'chrome|t' });
  a.equal(ctl.state, 'perch-go'); a.equal(go.animation, 'climb');
  a.deepEqual(go.move, perchPosition(rect, area));
  const sit = ctl.step({ now: 10700, x: go.move.x, y: go.move.y, area, paused: false, perch: true, fgRect: rect, fgKey: 'chrome|t' });
  a.equal(ctl.state, 'perched'); a.equal(sit.animation, 'sit');
  const moved = { ...rect, left: 400 };
  const leave = ctl.step({ now: 10800, x: go.move.x, y: go.move.y, area, paused: false, perch: true, fgRect: moved, fgKey: 'chrome|t' });
  a.equal(leave.animation, 'portal'); a.equal(ctl.state, 'vanish'); // heading back to the ground
});
test('perch: never triggers without a rect or with the toggle off', () => {
  const ctl = new RoamController(() => 0);
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false });
  const r = ctl.step({ now: 10001, x: 100, y: groundY, area, paused: false, perch: false, fgRect: rect, fgKey: 'chrome|t' });
  a.equal(ctl.state, 'vanish'); a.equal(r.animation, 'portal'); // ordinary ground move instead
});
test('cursor chase: runs at the cursor for a few seconds, then settles', () => {
  const seq = [0, 0.1]; let i = 0; // schedule roll, then the chase roll (no perch offered)
  const ctl = new RoamController(() => seq[Math.min(i++, seq.length - 1)], { chaseChance: 0.35 });
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false });
  const start = ctl.step({ now: 10001, x: 100, y: groundY, area, paused: false, cursorPlay: true, cursor: { x: 600, y: 700 } });
  a.equal(ctl.state, 'chase'); a.equal(start.animation, 'cursor');
  let x = 100, last;
  for (let now = 10051; now <= 14000; now += 50) { last = ctl.step({ now, x, y: groundY, area, paused: false, cursorPlay: true, cursor: { x: 600, y: 700 } }); if (last.move) x = last.move.x; }
  a.ok(x > 400); // ran most of the way toward the cursor (target 600-60=540)
  const end = ctl.step({ now: 14100, x, y: groundY, area, paused: false, cursorPlay: true, cursor: { x: 600, y: 700 } });
  a.equal(ctl.state, 'idle'); a.equal(end.animation, 'idle'); // chase window expired
});
test('walk animation kind: long moves leap, medium swing, short walk', () => {
  const ctl = new RoamController(() => 0);
  a.equal(ctl.moveKind(900), 'leap'); a.equal(ctl.moveKind(400), 'swing'); a.equal(ctl.moveKind(120), 'walk');
});
