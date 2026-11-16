// Sprite fit: per-frame draw transforms that give the Dex sheet one
// consistent on-screen character size. The stage-1 Dex sheet
// (3-sprites-dex.png) was drawn cell by cell, so the cat's height inside
// its 320x320 cell depends on which animation is playing (measured
// 2026-11-16: per-animation median content heights run from 144px for
// dex-wave to 278px for dex-walk, while the feet baseline is steady at
// ~21px above the cell bottom). The renderer measures every dex frame's
// alpha bounding box once the atlas loads and asks this module for the
// table of draw rectangles: ONE scale per animation (its median content
// height scaled to a shared target - the median of the per-animation
// medians), each frame drawn with its bbox bottom on a shared baseline
// and its bbox centre on the canvas centre. A single per-animation
// scale (not per-frame) keeps intra-animation motion - landing squash,
// leap stretch, sleep curl - proportional and natural. One per-frame
// guard remains: a frame whose scaled bbox would overflow the canvas
// (a leap stretch frame, the portal ring) is scaled down just enough
// to fit, uniformly, so nothing is ever clipped by the canvas edge.
// Pure math over plain data, UMD like pet-behavior.cjs / roam.cjs, so
// the renderer loads it as a script and tests can require() it.
(function (root) {
  function median(nums) {
    const a = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }
  // Bounding box of pixels whose alpha exceeds `threshold`, over a raw
  // RGBA buffer (e.g. ImageData.data). Returns {x, y, w, h} or null when
  // nothing in the buffer passes the threshold.
  function alphaBBox(data, width, height, threshold = 40) {
    if (!data || !width || !height) return null;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (data[(row + x) * 4 + 3] > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  // byAnim: { animName: [bbox|null, ...] } in cell-local coordinates.
  // Returns { targetH, baseline, table: { animName: { scale, frames } } }
  // where each frames[i] is null (draw the full cell, legacy path) or
  // { bx, by, bw, bh, dx, dy, dw, dh }: crop (bx, by, bw, bh) inside the
  // frame's own cell and blit it to (dx, dy, dw, dh) on the canvas, so
  // the bbox bottom lands on `baseline` (cell coordinates) and the bbox
  // centre lands on the canvas centre.
  function buildFitTable(byAnim, { cell = 320, canvas = 320, minScale = 0.6, maxScale = 1.8 } = {}) {
    const medians = {};
    const bottoms = [];
    for (const [name, boxes] of Object.entries(byAnim || {})) {
      const hs = [];
      for (const b of boxes || []) if (b) { hs.push(b.h); bottoms.push(b.y + b.h); }
      const m = median(hs);
      if (m) medians[name] = m;
    }
    const targetH = median(Object.values(medians));
    const baseline = median(bottoms);
    const table = {};
    if (!targetH || baseline == null) return { targetH, baseline, table };
    const cx = canvas / 2;
    for (const [name, boxes] of Object.entries(byAnim || {})) {
      const med = medians[name];
      if (!med) continue;
      const scale = clamp(targetH / med, minScale, maxScale);
      const frames = (boxes || []).map((b) => {
        if (!b) return null;
        // Fit-inside guard: never let a scaled frame overflow the
        // canvas above the baseline or past the side edges.
        const s = Math.min(scale, baseline / b.h, canvas / b.w);
        return {
          bx: b.x, by: b.y, bw: b.w, bh: b.h,
          dx: cx - (b.w / 2) * s,
          dy: baseline - b.h * s,
          dw: b.w * s, dh: b.h * s,
        };
      });
      table[name] = { scale, frames };
    }
    return { targetH, baseline, table };
  }
  const api = { median, alphaBBox, buildFitTable };
  if (typeof module === 'object') module.exports = api;
  else root.SpriteFit = api;
})(globalThis);
