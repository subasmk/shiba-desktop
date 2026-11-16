// Free-roam controller: pure movement policy for the desktop pet, in the
// same UMD shape as pet-behavior.cjs (loadable by the renderer as a script,
// require()-able by main/tests). The Electron main process owns the actual
// window (only main can setPosition), so main drives this controller on a
// timer and applies the returned {move, animation} steps.
//
// Behaviour: idle at the bottom of the work area -> walk directly along the
// bottom to a new spot -> idle. Long walks fly ('leap'), medium walks run
// ('run') - see moveKind. No portal vanish/appear: portal/peek/climb/cursor
// are parked (retired old-mascot art, user decision Nov 15 2026).
//
// PERCH - the pet leaps onto the foreground window's title bar and sits
//   there ('leap' then 'sit'), leaving with 'fall' when the window closes,
//   moves, changes, the perch toggle goes off, or its perch time ends.
//   The renderer chains fall->landing->getup->idle on its own.
//   The rect comes from context.cjs (Windows GetWindowRect); on other
//   platforms the source is null and perch simply never triggers.
// Dragging, docking (window hidden) or any pause input resets to idle, so
// roam never fights the user. Positions are always clamped to the work
// area by the caller (core.cjs petPosition).
(function (root) {
  const PET_W = 120, PET_H = 130;
  // Where the pet sits on a title bar: left-ish on the bar, window bottom
  // overlapping the bar top by 16px so the sprite's feet rest on it.
  function perchPosition(rect, area, petW = PET_W, petH = PET_H) {
    if (!rect || !area) return null;
    const lo = area.x, hi = area.x + area.width - petW;
    let x = rect.left + 24;
    const maxOnBar = rect.right - petW - 8;
    if (maxOnBar >= rect.left && x > maxOnBar) x = maxOnBar;
    x = Math.max(lo, Math.min(hi, x));
    const y = Math.max(area.y, rect.top - petH + 16);
    return { x: Math.round(x), y: Math.round(y) };
  }
  function rectMoved(a, b, px = 6) {
    if (!a || !b) return true;
    return Math.abs(a.left - b.left) > px || Math.abs(a.top - b.top) > px || Math.abs(a.right - b.right) > px;
  }
  class RoamController {
    constructor(random = Math.random, { flyPx = 700, fastPx = 340, perchChance = 0.5, maxPerchMs = 45000 } = {}) {
      this.random = random;
      this.flyPx = flyPx; this.fastPx = fastPx;
      this.perchChance = perchChance;
      this.maxPerchMs = maxPerchMs;
      this.state = 'idle';           // idle | walk | perch-go | perched
      this.stageEnds = 0;
      this.nextMoveAt = 0;
      this.targetX = null;
      this.fromX = null;             // where the current move started (fly/fast choice)
      this.moveAnim = 'walk';
      this.perchKey = null; this.perchRect = null; this.perchUntil = 0;
      this.lastNow = 0;
      this.carry = 0;             // fractional pixel carry so 60 Hz ticks stay smooth
      this.moveStart = 0;         // when the current walk began (easing ramp)
    }
    schedule(now) { this.nextMoveAt = now + 10000 + this.random() * 15000; }
    reset(now) { this.state = 'idle'; this.targetX = null; this.perchKey = null; this.perchRect = null; this.carry = 0; this.schedule(now); }
    moveKind(distance) {
      const d = Math.abs(distance || 0);
      if (d >= this.flyPx) return 'leap';
      if (d >= this.fastPx) return 'run';
      return 'walk';
    }
    perchInvalid(input) {
      if (!input.perch || !input.fgRect || !input.fgKey) return true;
      if (input.fgKey !== this.perchKey) return true;
      if (rectMoved(this.perchRect, input.fgRect)) return true;
      if (input.now > this.perchUntil) return true;
      return false;
    }
    leavePerch(now, x, area, petH = PET_H) {
      // Drop off the bar: 'fall' (the renderer chains landing->getup->idle),
      // then settle back into ordinary idle scheduling at the ground.
      const groundY = area.y + area.height - petH;
      this.perchKey = null; this.perchRect = null;
      this.state = 'idle'; this.schedule(now);
      return { move: { x, y: groundY }, animation: 'fall' };
    }
    // input: {now, x, y, area:{x,y,width,height}, paused,
    //         perch?:bool, fgRect?:{left,top,right,bottom}|null, fgKey?:string|null}
    // returns {move:{x,y}|null, animation:string|null}
    step(input) {
      const { now, x, area, paused } = input;
      const petW = Number(input.petW) || PET_W, petH = Number(input.petH) || PET_H;
      const dt = this.lastNow ? Math.min(200, now - this.lastNow) : 0;
      this.lastNow = now;
      const groundY = area.y + area.height - petH;
      // User decision: the pet STAYS at the height it was dragged to - no
      // automatic fall to the bottom. Roaming walks along the placed level.
      const holdY = Number.isFinite(input.y) ? Math.min(Math.max(input.y, area.y), groundY) : groundY;
      if (paused) { if (this.state !== 'idle') this.reset(now); return { move: null, animation: null }; }
      if (!this.nextMoveAt) this.schedule(now);
      switch (this.state) {
        case 'idle': {
          if (now < this.nextMoveAt) return { move: null, animation: null };
          // Perch first when a suitable foreground window is offered.
          if (input.perch && input.fgRect && input.fgKey && this.random() < this.perchChance) {
            const pos = perchPosition(input.fgRect, area, petW, petH);
            if (pos) {
              this.perchKey = input.fgKey; this.perchRect = { ...input.fgRect };
              this.perchUntil = now + this.maxPerchMs;
              this.state = 'perch-go'; this.stageEnds = now + 600;
              return { move: pos, animation: 'leap' };
            }
          }
          const lo = area.x, hi = area.x + area.width - petW;
          let tx = lo + this.random() * Math.max(0, hi - lo);
          if (Math.abs(tx - x) < 90) tx = tx > x ? Math.min(hi, tx + 160) : Math.max(lo, tx - 160);
          this.targetX = Math.round(tx); this.fromX = x;
          this.moveAnim = this.moveKind(this.targetX - x);
          this.state = 'walk'; this.moveStart = now; this.carry = 0;
          return { move: null, animation: this.moveAnim };
        }
        case 'perch-go': {
          if (now < this.stageEnds) return { move: null, animation: null };
          if (this.perchInvalid(input)) return this.leavePerch(now, x, area, petH);
          this.state = 'perched';
          return { move: null, animation: 'sit' };
        }
        case 'perched': {
          if (this.perchInvalid(input)) return this.leavePerch(now, x, area, petH);
          const pos = perchPosition(input.fgRect, area);
          return { move: pos, animation: null };
        }
        case 'walk': {
          const dx = this.targetX - x;
          if (Math.abs(dx) <= 3) { this.state = 'idle'; this.schedule(now); return { move: { x: this.targetX, y: holdY }, animation: 'idle' }; }
          // Eased velocity: ramp up over ~300ms, ease out over the last ~100px,
          // and carry fractional pixels so 60 Hz window moves stay fluid.
          const accel = Math.min(1, (now - (this.moveStart || now)) / 300);
          const decel = Math.min(1, (Math.abs(dx) + 8) / 100);
          const f = Math.max(0.35, Math.min(accel || 0.35, decel));
          const fl = 95 * f * dt / 1000 + this.carry;
          let stepPx = Math.max(1, Math.round(fl));
          if (stepPx >= Math.abs(dx)) { stepPx = Math.abs(dx); this.carry = 0; }
          else this.carry = fl - stepPx;
          const nx = x + Math.sign(dx) * stepPx;
          return { move: { x: nx, y: holdY }, animation: this.moveAnim };
        }
        default: this.reset(now); return { move: null, animation: null };
      }
    }
  }
  const api = { RoamController, perchPosition, rectMoved, PET_W, PET_H };
  if (typeof module === 'object') module.exports = api;
  else root.RoamController = RoamController;
})(globalThis);
