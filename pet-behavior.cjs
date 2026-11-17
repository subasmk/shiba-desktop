// Pure behavior policy, also loaded by the isolated renderer as a normal script.
(function(root){
 const actions=['wave','bow','scan','emote']; // peek parked (retired old-mascot art, user decision Nov 15 2026)
 // Ambient variety (Dexter-style wiring, Nov 16 2026): on top of the
 // light variety actions above, the idle pet occasionally performs a
 // longer ambient beat. Ambient picks are SEMANTIC event names - the
 // renderer resolves them per mascot through mascot-anims.cjs
 // (ambient-coffee -> dex-coffee; Rex has no coffee art and simply gets
 // a quiet idle beat for that slot). Each event has its own cooldown so
 // the signature beats stay rare, and the same event never fires twice
 // in a row. Ambient rides the same due() gate as the light actions, so
 // it can never crowd out or reset the long-idle sleep check (which is
 // driven by lastInteract in the renderer, untouched here).
 const AMBIENT=[
  {event:'ambient-coffee',cooldownMs:150000},
  {event:'ambient-sit',cooldownMs:90000},
  {event:'ambient-emote',cooldownMs:75000},
  {event:'ambient-scan',cooldownMs:75000},
  {event:'ambient-gesture',cooldownMs:60000},
  // Second dex sheet (user-supplied pack, Nov 17 2026): more distinct
  // beats so idle life stops looking like a short robotic loop. Rex has
  // no equivalents - resolveEvent returns null and he gets a quiet beat.
  {event:'ambient-glasses',cooldownMs:150000},
  {event:'ambient-laptop',cooldownMs:120000},
  {event:'ambient-phone',cooldownMs:120000},
  {event:'ambient-reading',cooldownMs:120000},
  {event:'ambient-waiting',cooldownMs:100000},
 ];
 const AMBIENT_CHANCE=0.45;
 class PetBehavior {
  constructor(random=Math.random){this.random=random;this.lastAction='';this.nextAt=0;this.press=null;this.lastAmbient='';this.ambientAt={};}
  // Cadence (Subash, 2026-11-17: 'oru hit pannale ella animation uh play
  // aguthu' - one hit set off every animation): idle beats wait 25-45s
  // between fires, so one tap gets ONE reaction and then a calm pet.
  // The old 6.5-12s cadence made the pet perform non-stop.
  quiet(now){this.nextAt=now+25000+this.random()*20000;}
  due(now,animation){if(animation!=='idle'||this.press||now<this.nextAt)return null;const ready=AMBIENT.filter(a=>a.event!==this.lastAmbient&&(this.ambientAt[a.event]||0)<=now);if(ready.length&&this.random()<AMBIENT_CHANCE){const pick=ready[Math.floor(this.random()*ready.length)];this.lastAmbient=pick.event;this.ambientAt[pick.event]=now+pick.cooldownMs;this.quiet(now);return pick.event;}const candidates=actions.filter(x=>x!==this.lastAction);this.lastAction=candidates[Math.floor(this.random()*candidates.length)];this.quiet(now);return this.lastAction;}
  down(x,y,now){this.press={x,y,at:now,dragging:false};}
  move(x,y,now){const p=this.press;if(!p)return false;if(!p.dragging&&now-p.at>=80&&Math.hypot(x-p.x,y-p.y)>=12)p.dragging=true;return p.dragging;}
  up(cancel=false){const p=this.press;this.press=null;return p?.dragging?'drop':p&&!cancel?'tap':'none';}
 }
 if(typeof module==='object')module.exports={PetBehavior,AMBIENT,AMBIENT_CHANCE};else root.PetBehavior=PetBehavior;
})(globalThis);
