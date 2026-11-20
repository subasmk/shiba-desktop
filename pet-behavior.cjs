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
 const AMBIENT_CHANCE=0.65;
 // Daru rotation (Subash, Nov 20 2026: '10 sec ku oru vati remaining
 // animation play aganum'): the generic ambient table resolves most of
 // its picks to vex-idle, so while Daru is the mascot the idle pet instead
 // cycles his own standalone beats - one every ~10s, each beat once
 // before any repeat (shuffle bag), so every animation gets seen.
 const VEX_ROTATION=['wave','emote','ambient-coffee','ambient-laptop','ambient-think'];
 class PetBehavior {
  constructor(random=Math.random){this.random=random;this.lastAction='';this.nextAt=0;this.press=null;this.lastAmbient='';this.ambientAt={};this.rotation=null;this.bag=[];}
  setRotation(events){this.rotation=Array.isArray(events)&&events.length?events.slice():null;this.bag=[];if(this.rotation)this.nextAt=0; /* first beat is due at once, not after the boot quiet window */}
  _nextRotation(){if(!this.bag.length){this.bag=this.rotation.slice();for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));const t=this.bag[i];this.bag[i]=this.bag[j];this.bag[j]=t;}if(this.bag.length>1&&this.bag[this.bag.length-1]===this.lastAction)this.bag.push(this.bag.shift());}const pick=this.bag.pop();this.lastAction=pick;return pick;}
  // Cadence (Subash, 2026-11-17: 'oru hit pannale ella animation uh play
  // aguthu' - one hit set off every animation): idle beats wait 25-45s
  // between fires, so one tap gets ONE reaction and then a calm pet.
  // The old 6.5-12s cadence made the pet perform non-stop.
  quiet(now,active){if(this.rotation){this.nextAt=now+9000+this.random()*2000;return;} /* rotation mode: EVERY quiet lands ~10s out - the renderer's clip-finish quiet must not stretch the rotation back to the calm cadence (live-test catch, Nov 20 2026) */this.nextAt=now+(active?8000+this.random()*4000:25000+this.random()*20000);} /* active (cursor moving, his 14:26 ask '10 sec oruvati play agatum'): a beat about every 10s; idle calm otherwise */
  due(now,animation,active){if(animation!=='idle'||this.press||now<this.nextAt)return null;if(this.rotation){const pick=this._nextRotation();this.quiet(now,active);return pick;} /* rotation beats land every ~10s flat, cursor or not (his ask) */const ready=AMBIENT.filter(a=>a.event!==this.lastAmbient&&(this.ambientAt[a.event]||0)<=now);if(ready.length&&this.random()<AMBIENT_CHANCE){const pick=ready[Math.floor(this.random()*ready.length)];this.lastAmbient=pick.event;this.ambientAt[pick.event]=now+pick.cooldownMs;this.quiet(now,active);return pick.event;}const candidates=actions.filter(x=>x!==this.lastAction);this.lastAction=candidates[Math.floor(this.random()*candidates.length)];this.quiet(now,active);return this.lastAction;}
  down(x,y,now){this.press={x,y,at:now,dragging:false};}
  move(x,y,now){const p=this.press;if(!p)return false;if(!p.dragging&&now-p.at>=80&&Math.hypot(x-p.x,y-p.y)>=12)p.dragging=true;return p.dragging;}
  up(cancel=false){const p=this.press;this.press=null;return p?.dragging?'drop':p&&!cancel?'tap':'none';}
 }
 PetBehavior.VEX_ROTATION=VEX_ROTATION;
 if(typeof module==='object')module.exports={PetBehavior,AMBIENT,AMBIENT_CHANCE,VEX_ROTATION};else root.PetBehavior=PetBehavior;
})(globalThis);
