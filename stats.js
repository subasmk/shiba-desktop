// Stats pill renderer: a small floating, click-through readout at the
// right edge of the screen. CPU/RAM percentages arrive from main (shared
// sampler); the battery percentage is read here via navigator.getBattery,
// exactly like the spec asks. GPU and network are deliberately absent —
// there is no clean in-process source for them, and the pill only ever
// shows values it actually measured (notch.cjs statsLine omits unknowns).
'use strict';
const N = window.Notch;
let cpuPct = null;
let ramPct = null;
let batteryPct = null;
function draw() {
  const line = N.statsLine({ cpuPct, ramPct, batteryPct });
  document.getElementById('pill').textContent = line || '…';
}
window.petAPI.on('stats-state', (d) => {
  if (!d) return;
  cpuPct = d.cpuPct ?? null;
  ramPct = d.ramPct ?? null;
  draw();
});
if (navigator.getBattery) {
  navigator.getBattery().then((b) => {
    const upd = () => { batteryPct = Math.round(b.level * 100); draw(); };
    b.addEventListener('levelchange', upd);
    upd();
  }).catch(() => {});
}
draw();
