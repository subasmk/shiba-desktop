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
test('roam stays idle until its scheduled move, then walks directly (no portal)', () => {
  const ctl = new RoamController(() => 0); // deterministic: 10s wait, target at left edge
  const early = ctl.step({ now: 1000, x: 100, y: groundY, area, paused: false });
  a.deepEqual(early, { move: null, animation: null });
  const start = ctl.step({ now: 11001, x: 100, y: groundY, area, paused: false });
  a.equal(start.animation, 'walk'); // short hop to a nearby target
  a.equal(ctl.state, 'walk');
});
test('the pet walks to its exact target and settles', () => {
  const ctl = new RoamController(() => 0.9); // wait 23500ms, target near right side
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false });
  const start = ctl.step({ now: 23501, x: 100, y: groundY, area, paused: false });
  a.equal(ctl.state, 'walk');
  a.ok(['walk', 'run', 'leap'].includes(start.animation));
  const { x } = drive(ctl, 23551, 40000, 100);
  a.equal(ctl.state, 'idle'); // arrived and settled
  a.equal(x, ctl.targetX); // walked exactly to the chosen target
  a.ok(x >= area.x && x <= area.x + area.width - 120);
});
test('pause (drag/dock) resets roam and never moves the pet', () => {
  const ctl = new RoamController(() => 0.5); // wait 17500ms
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false });
  ctl.step({ now: 17501, x: 100, y: groundY, area, paused: false });
  a.equal(ctl.state, 'walk');
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
test('perch: leaps on, sits, falls off when the window moves', () => {
  const seq = [0, 0.1]; let i = 0;
  const ctl = new RoamController(() => seq[Math.min(i++, seq.length - 1)], { perchChance: 0.5 });
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false }); // schedule at 10000
  const go = ctl.step({ now: 10001, x: 100, y: groundY, area, paused: false, perch: true, fgRect: rect, fgKey: 'chrome|t' });
  a.equal(ctl.state, 'perch-go'); a.equal(go.animation, 'leap');
  a.deepEqual(go.move, perchPosition(rect, area));
  const sit = ctl.step({ now: 10700, x: go.move.x, y: go.move.y, area, paused: false, perch: true, fgRect: rect, fgKey: 'chrome|t' });
  a.equal(ctl.state, 'perched'); a.equal(sit.animation, 'sit');
  const moved = { ...rect, left: 400 };
  const leave = ctl.step({ now: 10800, x: go.move.x, y: go.move.y, area, paused: false, perch: true, fgRect: moved, fgKey: 'chrome|t' });
  a.equal(leave.animation, 'fall'); a.equal(ctl.state, 'idle'); // renderer chains fall->landing->getup->idle
  a.equal(leave.move.y, groundY); // back on the ground
});
test('perch: never triggers without a rect or with the toggle off', () => {
  const ctl = new RoamController(() => 0);
  ctl.step({ now: 0, x: 100, y: groundY, area, paused: false });
  const r = ctl.step({ now: 10001, x: 100, y: groundY, area, paused: false, perch: false, fgRect: rect, fgKey: 'chrome|t' });
  a.equal(ctl.state, 'walk'); a.ok(['walk', 'run', 'leap'].includes(r.animation)); // ordinary ground move instead
});
test('walk animation kind: long moves leap, medium run, short walk', () => {
  const ctl = new RoamController(() => 0);
  a.equal(ctl.moveKind(900), 'leap'); a.equal(ctl.moveKind(400), 'run'); a.equal(ctl.moveKind(120), 'walk');
});

test('placement: pet placed mid-air stays there (user decision: no automatic fall to the bottom)', () => {
  const c = new RoamController(() => 0.99);
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  const step = c.step({ now: 1000, x: 400, y: 200, area, paused: false });
  a.equal(step.move, null);
  a.equal(step.animation, null);
});

test('placement: roaming walks along the placed height instead of sinking to the floor', () => {
  const c = new RoamController(() => 0.9);
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  c.step({ now: 0, x: 100, y: 200, area, paused: false });
  const start = c.step({ now: 23501, x: 100, y: 200, area, paused: false });
  a.equal(c.state, 'walk');
  const step = c.step({ now: 23551, x: 104, y: 200, area, paused: false });
  a.equal(step.move.y, 200);
});

test('placement: custom pet height still clamps placement inside the work area (petH)', () => {
  const c = new RoamController(() => 0.9);
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  c.step({ now: 0, x: 100, y: 900, area, petW: 280, petH: 304, paused: false });
  c.step({ now: 23501, x: 100, y: 900, area, petW: 280, petH: 304, paused: false });
  const step = c.step({ now: 23551, x: 104, y: 900, area, petW: 280, petH: 304, paused: false });
  a.equal(step.move.y, 800 - 304); // below the floor clamps up to it
});

test('grounding: pet already on the floor stays put until the next scheduled move', () => {
  const c = new RoamController(() => 0.99);
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  const step = c.step({ now: 1000, x: 400, y: 800 - 130, area, paused: false });
  a.equal(step.move, null);
  a.equal(step.animation, null);
});
