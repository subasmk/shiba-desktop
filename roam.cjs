// Free-roam controller: pure movement policy for the desktop pet, in the
// same UMD shape as pet-behavior.cjs (loadable by the renderer as a script,
// require()-able by main/tests). The Electron main process owns the actual
// window (only main can setPosition), so main drives this controller on a
// timer and applies the returned {move, animation} steps.
//
// Behaviour: idle at the bottom of the work area -> portal vanish -> portal
// appear at a new spot -> walk along the bottom to the target -> idle.
// Long walks fly ('leap'), medium walks web-swing ('swing') - see
// anim-events.cjs roamMoveKind for the shared thresholds.
//
// Last-mile item 5 adds two behaviours, both fed by the context poller:
//   PERCH - the pet climbs onto the foreground window's title bar and
//     sits there ('climb' then 'sit'), leaving when the window closes,
//     moves, changes, the perch toggle goes off, or its perch time ends.
//     The rect comes from context.cjs (Windows GetWindowRect); on other
//     platforms the source is null and perch simply never triggers.
//   CURSOR PLAY - occasionally the pet chases the cursor for a few
//     seconds ('cursor' animation), then settles back to idle/roam.
//     Cursor position comes from context.cjs getCursorPos (Windows
//     GetCursorPos); null elsewhere, so chase never triggers there.
// Dragging, docking (window hidden) or any pause input resets to idle, so
// roam never fights the user. Positions are always clamped to the work
// area by the caller (core.cjs petPosition).
(function (root) {
  const PET_W = 120, PET_H = 130;
  // Where the pet sits on a title bar: left-ish on the bar, window bottom
  // overlapping the bar top by 16px so the sprite's feet rest on it.
  function perchPosition(rect, area) {
    if (!rect || !area) return null;
    const lo = area.x, hi = area.x + area.width - PET_W;
    let x = rect.left + 24;
    const maxOnBar = rect.right - PET_W - 8;
    if (maxOnBar >= rect.left && x > maxOnBar) x = maxOnBar;
    x = Math.max(lo, Math.min(hi, x));
    const y = Math.max(area.y, rect.top - PET_H + 16);
    return { x: Math.round(x), y: Math.round(y) };
  }
  function rectMoved(a, b, px = 6) {
    if (!a || !b) return true;
    return Math.abs(a.left - b.left) > px || Math.abs(a.top - b.top) > px || Math.abs(a.right - b.right) > px;
  }
  class RoamController {
    constructor(random = Math.random, { flyPx = 700, fastPx = 340, perchChance = 0.5, chaseChance = 0.35, maxPerchMs = 45000, chaseMs = 4000 } = {}) {
      this.random = random;
      this.flyPx = flyPx; this.fastPx = fastPx;
      this.perchChance = perchChance; this.chaseChance = chaseChance;
      this.maxPerchMs = maxPerchMs; this.chaseMs = chaseMs;
      this.state = 'idle';           // idle | vanish | walk | perch-go | perched | chase
      this.stageEnds = 0;
      this.nextMoveAt = 0;
      this.targetX = null;
      this.fromX = null;             // where the current move started (fly/fast choice)
      this.moveAnim = 'walk';
      this.perchKey = null; this.perchRect = null; this.perchUntil = 0;
      this.chaseEnds = 0;
      this.lastNow = 0;
      this.carry = 0;             // fractional pixel carry so 60 Hz ticks stay smooth
      this.moveStart = 0;         // when the current walk began (easing ramp)
    }
    schedule(now) { this.nextMoveAt = now + 10000 + this.random() * 15000; }
    reset(now) { this.state = 'idle'; this.targetX = null; this.perchKey = null; this.perchRect = null; this.carry = 0; this.schedule(now); }
    moveKind(distance) {
      const d = Math.abs(distance || 0);
      if (d >= this.flyPx) return 'leap';
      if (d >= this.fastPx) return 'swing';
      return 'walk';
    }
    perchInvalid(input) {
      if (!input.perch || !input.fgRect || !input.fgKey) return true;
      if (input.fgKey !== this.perchKey) return true;
      if (rectMoved(this.perchRect, input.fgRect)) return true;
      if (input.now > this.perchUntil) return true;
      return false;
    }
    leavePerch(now, x, area) {
      // Portal off the bar, then walk a short hop on the ground.
      const lo = area.x, hi = area.x + area.width - PET_W;
      let tx = x + (this.random() < 0.5 ? -160 : 160);
      tx = Math.max(lo, Math.min(hi, tx));
      this.targetX = Math.round(tx); this.fromX = x;
      this.perchKey = null; this.perchRect = null;
      this.state = 'vanish'; this.stageEnds = now + 900;
      return { move: null, animation: 'portal' };
    }
    // input: {now, x, y, area:{x,y,width,height}, paused,
    //         perch?:bool, fgRect?:{left,top,right,bottom}|null, fgKey?:string|null,
    //         cursorPlay?:bool, cursor?:{x,y}|null}
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
          // Perch first when a suitable foreground window is offered.
          if (input.perch && input.fgRect && input.fgKey && this.random() < this.perchChance) {
            const pos = perchPosition(input.fgRect, area);
            if (pos) {
              this.perchKey = input.fgKey; this.perchRect = { ...input.fgRect };
              this.perchUntil = now + this.maxPerchMs;
              this.state = 'perch-go'; this.stageEnds = now + 600;
              return { move: pos, animation: 'climb' };
            }
          }
          // Cursor play: chase the pointer briefly instead of a walk.
          if (input.cursorPlay && input.cursor && this.random() < this.chaseChance) {
            this.state = 'chase'; this.chaseEnds = now + this.chaseMs;
            return { move: null, animation: 'cursor' };
          }
          const lo = area.x, hi = area.x + area.width - PET_W;
          let tx = lo + this.random() * Math.max(0, hi - lo);
          if (Math.abs(tx - x) < 90) tx = tx > x ? Math.min(hi, tx + 160) : Math.max(lo, tx - 160);
          this.targetX = Math.round(tx); this.fromX = x;
          this.state = 'vanish'; this.stageEnds = now + 900;
          return { move: null, animation: 'portal' };
        }
        case 'perch-go': {
          if (now < this.stageEnds) return { move: null, animation: null };
          if (this.perchInvalid(input)) return this.leavePerch(now, x, area);
          this.state = 'perched';
          return { move: null, animation: 'sit' };
        }
        case 'perched': {
          if (this.perchInvalid(input)) return this.leavePerch(now, x, area);
          const pos = perchPosition(input.fgRect, area);
          return { move: pos, animation: null };
        }
        case 'chase': {
          const c = input.cursor;
          if (!c || now > this.chaseEnds) { this.state = 'idle'; this.schedule(now); return { move: { x, y: groundY }, animation: 'idle' }; }
          const target = Math.max(area.x, Math.min(area.x + area.width - PET_W, Math.round(c.x - PET_W / 2)));
          const dx = target - x;
          if (Math.abs(dx) <= 6) return { move: null, animation: 'cursor' };
          const flc = 185 * dt / 1000 + this.carry;
          let stepPx = Math.max(1, Math.round(flc));
          if (stepPx >= Math.abs(dx)) { stepPx = Math.abs(dx); this.carry = 0; }
          else this.carry = flc - stepPx;
          const nx = x + Math.sign(dx) * stepPx;
          return { move: { x: nx, y: groundY }, animation: 'cursor' };
        }
        case 'vanish': {
          if (now < this.stageEnds) return { move: null, animation: null };
          // Appear part-way: teleport to a spawn point, then walk the rest.
          const dir = this.targetX >= x ? 1 : -1;
          const spawn = Math.max(area.x, Math.min(area.x + area.width - PET_W, this.targetX - dir * 220));
          this.moveAnim = this.moveKind((this.targetX ?? x) - (this.fromX ?? x));
          this.state = 'walk'; this.stageEnds = 0; this.moveStart = now; this.walkFrom = Math.round(Math.max(area.x, Math.min(area.x + area.width - PET_W, this.targetX - dir * 220))); this.carry = 0;
          return { move: { x: Math.round(spawn), y: groundY }, animation: 'portal' };
        }
        case 'walk': {
          const dx = this.targetX - x;
          if (Math.abs(dx) <= 3) { this.state = 'idle'; this.schedule(now); return { move: { x: this.targetX, y: groundY }, animation: 'idle' }; }
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
          return { move: { x: nx, y: groundY }, animation: this.moveAnim };
        }
        default: this.reset(now); return { move: null, animation: null };
      }
    }
  }
  const api = { RoamController, perchPosition, rectMoved, PET_W, PET_H };
  if (typeof module === 'object') module.exports = api;
  else root.RoamController = RoamController;
})(globalThis);
