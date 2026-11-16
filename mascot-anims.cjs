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
  // name: requested state ('idle', 'touch-head', 'dex-wave', ...).
  // mascot: 'dex' | 'rex'. has: (spriteName) => boolean.
  function resolveSprite(name, mascot, has) {
    if (mascot !== 'dex' || typeof name !== 'string') return name;
    if (name.startsWith('dex-')) return has(name) ? name : 'dex-idle';
    const fb = DEX_FALLBACK[name];
    if (fb && has(fb)) return fb;
    if (has('dex-' + name)) return 'dex-' + name;
    return 'dex-idle';
  }
  const api = { DEX_FALLBACK, resolveSprite };
  if (typeof module === 'object') module.exports = api;
  else root.MascotAnims = api;
})(globalThis);
