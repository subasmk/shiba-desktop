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
