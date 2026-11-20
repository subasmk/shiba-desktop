// Mascot sprite resolution: which atlas animation actually plays for a
// requested pet state, per mascot. Pure function over a `has(sprite)`
// predicate, UMD like pet-behavior.cjs, so the renderer loads it as a
// script and tests can require() it.
//
// Rex (the Shiba) has a sprite for every state, so resolution is the
// identity. The stage-1 Dex sheet covers fewer states: it has no
// dex-touch-head / dex-touch-body / dex-touch-paws, no dex-swing and no
// dex-bow, and its dex-wave row is the retired portal/vanish art (the
// cat sinks into a purple ring) rather than a wave. Without a fallback
// table those requests silently resolve to dex-idle and the pet shows
// NO reaction - most visibly, taps did nothing at all. DEX_FALLBACK
// maps each such state to the closest EXISTING dex animation:
//   touch-head -> dex-click   the startled paws-up shrug reads as a head
//                           bonk. touch-body -> dex-emote (paw-to-mouth
//                           flinch), touch-paws -> dex-gesture (paw swat) -
//                           distinct reactions per hit region (user
//                           decision, Nov 16 2026), all existing atlas art
//   swing    -> dex-rage    tap-combo over-reaction (red face, steam)
//   bow      -> dex-gesture a friendly paw gesture, the polite move
//   wave     -> dex-gesture its first half IS a paw wave (dex-wave is
//                           portal art, so the fallback wins over the
//                           direct sprite - see resolveSprite order)
//   getup    -> dex-idle    dex-landing and dex-fall both already end
//                           upright, so getup is an explicit stand
//                           rather than a second recovery animation
(function (root) {
  const DEX_FALLBACK = {
    'touch-head': 'dex-click',
    'touch-body': 'dex-emote',
    'touch-paws': 'dex-gesture',
    'swing': 'dex-rage',
    'bow': 'dex-gesture',
    'wave': 'dex-gesture',
    'getup': 'dex-idle',
  };
  // Poke variety (user report Nov 17 2026: same reaction every tap reads
  // 'robotic'). Each tap region rotates through distinct existing dex
  // reactions instead of replaying one clip. Every entry is a concrete
  // atlas sprite; the renderer cycles per region.
  const DEX_TOUCH_ROTATION = {
    'touch-head': ['dex-click', 'dex-scan'],
    'touch-body': ['dex-emote', 'dex-gesture'],
    'touch-paws': ['dex-gesture', 'dex-sad-ears'],
  };
  // Fourth mascot (Nov 19 2026): Vex, the hooded horned kid from his
  // walk-cycle video. He sends the animations one by one; so far there is
  // walk (45 frames from the video), a seated pose (from his sit artwork),
  // a hanging-by-the-cloak pose for drags (Nov 20) and a drop beat (Nov 20):
  // he falls cloak-spread, lands and sits dazed with circling stars, then
  // recovers upright, so it carries both landing (the state after a drag
  // release) and fall; the chained getup then just returns to idle since
  // the clip already ends standing. His 9:00 GIF is an anger beat (calm,
  // puffed cheeks, anger mark and steam, back to calm), so it plays rage
  // and the tap-combo swing like dex-rage does for Dex. His 9:06 GIF is
  // a belly laugh, wired as emote plus the ambient-emote and react-success
  // events. His 9:10 GIF (stands swaying, blinks, half-lidded, slumps
  // asleep, jerks back awake) is his chosen IDLE - he named it himself
  // ('illa ithu tha idle', 9:14), dozy tail and all, so vex-idle is this
  // standing beat and the seated pose no longer doubles as idle. Sleep
  // shows the seated pose again until he sends real sleep art. He
  // replaced the original sit GIF minutes later ('Remove old siting
  // gif', then 'This is New sitting gif' with the 9:17 MP4), so the
  // seated art is now that calm seated sway from the video. Movement states
  // play the walk loop, drag shows the hanging art, sit and sleep show
  // the seated pose, and every other state idles until more art arrives.
  const VEX_WALK_STATES = new Set(['walk', 'run', 'leap']);
  // name: requested state ('idle', 'touch-head', 'dex-wave', ...).
  // mascot: 'dex' | 'rex' | 'vex'. has: (spriteName) => boolean.
  function resolveSprite(name, mascot, has) {
    if (typeof name !== 'string') return name;
    if (mascot === 'vex') {
      if (name.startsWith('vex-')) return has(name) ? name : 'vex-idle';
      if (name === 'drag' && has('vex-drag')) return 'vex-drag';
      if ((name === 'landing' || name === 'fall') && has('vex-landing')) return 'vex-landing';
      if ((name === 'rage' || name === 'swing') && has('vex-rage')) return 'vex-rage';
      if (name === 'emote' && has('vex-laugh')) return 'vex-laugh';
      if (VEX_WALK_STATES.has(name) && has('vex-walk')) return 'vex-walk';
      if (name === 'sit-down' && has('vex-sitdown')) return 'vex-sitdown';
      if ((name === 'thinking' || name === 'thinking-long' || name === 'confused') && has('vex-think')) return 'vex-think';
      if (name === 'sleep-down' && has('vex-sleepdown')) return 'vex-sleepdown';
      if (name === 'sit-sleep' && has('vex-sitsleep')) return 'vex-sitsleep';
      if (name === 'sleep-loop' && has('vex-sleeploop')) return 'vex-sleeploop';
      if (name === 'ambient-coffee' && has('vex-coffee')) return 'vex-coffee';
      if ((name === 'sit' || name === 'sleep') && has('vex-sit')) return 'vex-sit';
      return 'vex-idle';
    }
    if (mascot !== 'dex') return name;
    if (name.startsWith('dex-')) return has(name) ? name : 'dex-idle';
    const fb = DEX_FALLBACK[name];
    if (fb && has(fb)) return fb;
    if (has('dex-' + name)) return 'dex-' + name;
    return 'dex-idle';
  }

  // Semantic event wiring (Dexter-style, Nov 16 2026): callers ask for a
  // MEANING - an ambient beat, a thinking pose, a one-shot reaction - and
  // this table picks the sprite. Mappings were chosen from contact
  // sheets of the actual dex art, not from the file names:
  //   dex-emote      is a chin-stroke ponder that ends in a lightbulb,
  //                  so it carries thinking-long and react-idea
  //   dex-scan       is a worried head-scratch, so it carries
  //                  thinking-question, react-confused and react-sad
  //                  (the sheet has no sad-ears equivalent)
  //   dex-side-listen is the ear-cupped side profile already used for
  //                  voice-call transcribing; text-chat thinking reuses
  //                  it (voice phases own the pet during calls, and
  //                  chat-thinking is suppressed then, so no clash)
  //   dex-gesture    ends in a thumbs-up: react-success + ambient beat
  //   dex-coffee     is a full coffee-making ritual: signature ambient
  //   dex-rage       red face + steam: react-error (and the annoyance
  //                  system in annoyance.cjs, via the plain 'rage' state)
  // Rex entries exist only where Rex already has an equivalent sprite
  // ('scan' is Rex's established brain-work sprite - power-run and
  // listening-start already use it). There is deliberately NO Rex
  // 'ambient-coffee': Rex has no coffee art, so resolveEvent returns
  // null and the ambient slot is a quiet idle beat for him.
  const DEX_EVENTS = {
    'ambient-coffee': 'dex-coffee',
    'ambient-scan': 'dex-scan',
    'ambient-emote': 'dex-emote',
    'ambient-gesture': 'dex-gesture',
    'ambient-sit': 'dex-sit',
    'ambient-glasses': 'dex-glasses',
    'ambient-laptop': 'dex-laptop',
    'ambient-phone': 'dex-phone',
    'ambient-reading': 'dex-reading',
    'ambient-waiting': 'dex-waiting',
    'thinking': 'dex-side-listen',
    'thinking-long': 'dex-emote',
    'thinking-question': 'dex-scan',
    'react-success': 'dex-gesture',
    'react-error': 'dex-rage',
    'react-sad': 'dex-sad-ears',
    'react-confused': 'dex-scan',
    'react-idea': 'dex-emote',
  };
  const REX_EVENTS = {
    'ambient-scan': 'scan',
    'ambient-emote': 'emote',
    'ambient-gesture': 'gesture',
    'ambient-sit': 'sit',
    'thinking': 'scan',
    'thinking-long': 'scan',
    'thinking-question': 'scan',
    'react-success': 'gesture',
    'react-error': 'rage',
    'react-sad': 'emote',
    'react-confused': 'scan',
    'react-idea': 'emote',
  };
  // Vex (Nov 20 2026): his belly laugh (calm, grin, then shaking with
  // laugh marks and tears, settling back) is his one expressive beat so
  // far, so it carries the ambient emote slot and the success reaction.
  const VEX_EVENTS = {
    'ambient-emote': 'vex-laugh',
    'react-success': 'vex-laugh',
    'react-confused': 'vex-think',
  };
  // event: semantic name ('thinking', 'react-success', ...). Returns the
  // sprite to play, or null when the name is not a known event or this
  // mascot has no sprite for it (callers then fall back to state
  // resolution / a plain idle beat).
  function resolveEvent(event, mascot, has) {
    if (typeof event !== 'string') return null;
    const table = mascot === 'dex' ? DEX_EVENTS : mascot === 'rex' ? REX_EVENTS : mascot === 'vex' ? VEX_EVENTS : null;
    if (!table) return null;
    const sprite = table[event];
    if (!sprite) return null;
    if (typeof has === 'function' && !has(sprite)) {
      return mascot === 'dex' && has('dex-idle') ? 'dex-idle' : null;
    }
    return sprite;
  }
  const api = { DEX_FALLBACK, DEX_TOUCH_ROTATION, VEX_WALK_STATES, resolveSprite, DEX_EVENTS, REX_EVENTS, VEX_EVENTS, resolveEvent };
  if (typeof module === 'object') module.exports = api;
  else root.MascotAnims = api;
})(globalThis);
