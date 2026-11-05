// Free-roam controller: pure movement policy for the desktop pet, in the
// same UMD shape as pet-behavior.cjs (loadable by the renderer as a script,
// require()-able by main/tests). The Electron main process owns the actual
// window (only main can setPosition), so main drives this controller on a
// timer and applies the returned {move, animation} steps.
//
// Behaviour: idle at the bottom of the work area -> portal vanish -> portal
// appear at a new spot -> walk along the bottom to the target -> idle.
// Dragging, docking (window hidden) or any pause input resets to idle, so
// roam never fights the user. Positions are always clamped to the work
// area by the caller (core.cjs petPosition).
(function (root) {
  const PET_W = 120, PET_H = 130;
  class RoamController {
    constructor(random = Math.random) {
      this.random = random;
      this.state = 'idle';           // idle | vanish | appear | walk
      this.stageEnds = 0;
      this.nextMoveAt = 0;
      this.targetX = null;
      this.lastNow = 0;
    }
    schedule(now) { this.nextMoveAt = now + 10000 + this.random() * 15000; }
    reset(now) { this.state = 'idle'; this.targetX = null; this.schedule(now); }
    // input: {now, x, y, area:{x,y,width,height}, paused}
    // returns {move:{x,y}|null, animation:string|null}
    step(input) {
      const { now, x, area, paused } = input;
      const dt = this.lastNow ? Math.min(200, now - this.lastNow) : 0;
      this.lastNow = now;
      const groundY = area.y + area.height - PET_H;
      if (paused) { if (this.state !== 'idle') this.reset(now); return { move: null, animation: null }; }
      if (!this.nextMoveAt) this.schedule(now);
      switch (this.state) {
        case 'idle': {
          if (now < this.nextMoveAt) return { move: null, animation: null };
          const lo = area.x, hi = area.x + area.width - PET_W;
          let tx = lo + this.random() * Math.max(0, hi - lo);
          if (Math.abs(tx - x) < 90) tx = tx > x ? Math.min(hi, tx + 160) : Math.max(lo, tx - 160);
          this.targetX = Math.round(tx);
          this.state = 'vanish'; this.stageEnds = now + 900;
          return { move: null, animation: 'portal' };
        }
        case 'vanish': {
          if (now < this.stageEnds) return { move: null, animation: null };
          // Appear part-way: teleport to a spawn point, then walk the rest.
          const dir = this.targetX >= x ? 1 : -1;
          const spawn = Math.max(area.x, Math.min(area.x + area.width - PET_W, this.targetX - dir * 220));
          this.state = 'walk'; this.stageEnds = 0;
          return { move: { x: Math.round(spawn), y: groundY }, animation: 'portal' };
        }
        case 'walk': {
          const dx = this.targetX - x;
          if (Math.abs(dx) <= 3) { this.state = 'idle'; this.schedule(now); return { move: { x: this.targetX, y: groundY }, animation: 'idle' }; }
          const stepPx = Math.max(1, Math.round(70 * dt / 1000));
          const nx = x + Math.sign(dx) * Math.min(Math.abs(dx), stepPx);
          return { move: { x: nx, y: groundY }, animation: 'walk' };
        }
        default: this.reset(now); return { move: null, animation: null };
      }
    }
  }
  if (typeof module === 'object') module.exports = { RoamController };
  else root.RoamController = RoamController;
})(globalThis);
