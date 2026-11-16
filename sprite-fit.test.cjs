const { test } = require('node:test');
const assert = require('node:assert/strict');
const { median, alphaBBox, buildFitTable } = require('./sprite-fit.cjs');

test('median: odd, even, empty and junk inputs', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median(null), null);
  assert.equal(median([5, NaN, 1]), 3);
});

test('alphaBBox: finds the opaque region of a synthetic buffer', () => {
  const w = 6, h = 5;
  const data = new Uint8ClampedArray(w * h * 4);
  // opaque block at x 2..3, y 1..2
  for (const y of [1, 2]) for (const x of [2, 3]) data[(y * w + x) * 4 + 3] = 255;
  assert.deepEqual(alphaBBox(data, w, h, 40), { x: 2, y: 1, w: 2, h: 2 });
});

test('alphaBBox: threshold is exclusive and empty buffers give null', () => {
  const w = 3, h = 3;
  const data = new Uint8ClampedArray(w * h * 4);
  data[(1 * w + 1) * 4 + 3] = 40; // exactly at threshold -> not counted
  assert.equal(alphaBBox(data, w, h, 40), null);
  data[(1 * w + 1) * 4 + 3] = 41;
  assert.deepEqual(alphaBBox(data, w, h, 40), { x: 1, y: 1, w: 1, h: 1 });
  assert.equal(alphaBBox(null, w, h), null);
  assert.equal(alphaBBox(data, 0, 0), null);
});

test('buildFitTable: one scale per animation, shared target and baseline', () => {
  // anim a: median height 200; anim b: median height 100.
  const byAnim = {
    a: [{ x: 10, y: 50, w: 100, h: 200 }, { x: 12, y: 48, w: 100, h: 204 }],
    b: [{ x: 30, y: 150, w: 80, h: 100 }, { x: 30, y: 152, w: 80, h: 96 }],
  };
  const { targetH, baseline, table } = buildFitTable(byAnim, { cell: 320, canvas: 320 });
  // target = median of medians (202, 98) = 150; baseline = median of bottoms (250, 252, 250, 248) = 250.
  assert.equal(targetH, 150);
  assert.equal(baseline, 250);
  assert.ok(Math.abs(table.a.scale - 150 / 202) < 1e-9);
  assert.ok(Math.abs(table.b.scale - 150 / 98) < 1e-9);
  // every drawn frame bottoms out exactly on the baseline and centres horizontally
  for (const [name, boxes] of Object.entries(byAnim)) {
    table[name].frames.forEach((f, i) => {
      assert.ok(Math.abs(f.dy + f.dh - baseline) < 1e-9, name + ' frame ' + i + ' bottom');
      assert.ok(Math.abs(f.dx + f.dw / 2 - 160) < 1e-9, name + ' frame ' + i + ' centre');
      assert.equal(f.bx, boxes[i].x);
      assert.equal(f.bw, boxes[i].w);
    });
  }
  // drawn median height of each animation equals the shared target
  assert.ok(Math.abs(202 * table.a.scale - 150) < 1e-9);
  assert.ok(Math.abs(98 * table.b.scale - 150) < 1e-9);
});

test('buildFitTable: intra-animation proportions survive (squash stays squash)', () => {
  // landing-like: heights 100 and 160 around median 130 keep their ratio.
  const byAnim = { land: [{ x: 0, y: 100, w: 50, h: 100 }, { x: 0, y: 40, w: 50, h: 160 }, { x: 0, y: 70, w: 50, h: 130 }] };
  const { table } = buildFitTable(byAnim, {});
  const [f0, f1] = table.land.frames;
  assert.ok(Math.abs((f1.dh / f0.dh) - 1.6) < 1e-9);
});

test('buildFitTable: scale clamps and empty frames stay on the legacy path', () => {
  const byAnim = {
    big: [{ x: 0, y: 0, w: 10, h: 300 }],
    tiny: [{ x: 0, y: 0, w: 10, h: 30 }, null],
  };
  const { table } = buildFitTable(byAnim, {});
  // target = median(300, 30) = 165 -> tiny scale 5.5 clamps to 1.8, big scale 0.55 clamps to 0.6
  assert.equal(table.tiny.scale, 1.8);
  assert.equal(table.big.scale, 0.6);
  assert.equal(table.tiny.frames[1], null);
});

test('buildFitTable: an overflowing frame is shrunk to fit, never clipped', () => {
  // One tall stretch frame (h 280) among crouched frames (median 140):
  // the animation scale (~target/140) would push it past the canvas top.
  const boxes = [
    { x: 10, y: 180, w: 100, h: 120 },
    { x: 10, y: 160, w: 100, h: 140 },
    { x: 10, y: 19, w: 100, h: 280 },
  ];
  // A second, taller animation pulls the shared target (194) above
  // leap's own median (140), so leap's scale is ~1.39 without the guard.
  const stand = [{ x: 10, y: 51, w: 100, h: 248 }];
  const { baseline, table } = buildFitTable({ leap: boxes, stand }, {});
  const f = table.leap.frames[2];
  assert.ok(f.dy >= 0, 'top stays inside the canvas');
  assert.ok(Math.abs(f.dy + f.dh - baseline) < 1e-9, 'still bottom-aligned');
  assert.ok(Math.abs(f.dw / f.dh - 100 / 280) < 1e-9, 'shrink is uniform, no distortion');
  // and the ordinary frames are untouched by the guard
  assert.ok(table.leap.frames[1].dh > 140, 'median frame scaled up toward target');
});

test('buildFitTable: no measurable frames -> empty table', () => {
  const { targetH, table } = buildFitTable({ x: [null, null] }, {});
  assert.equal(targetH, null);
  assert.deepEqual(table, {});
});
