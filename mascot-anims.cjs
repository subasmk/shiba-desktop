// Vex sprite and semantic-event resolution. Retired mascots live in the private archive.
(function (root) {
  const VEX_WALK_STATES = new Set(['walk', 'run', 'leap']);
  // name: requested state ('idle', 'touch-head', 'vex-wave', ...).
  // has: (spriteName) => boolean. Mascot argument kept for caller compatibility.
  function resolveSprite(name, mascot, has) {
    if (typeof name !== 'string') return name;
    {
      if (name.startsWith('vex-')) return has(name) ? name : 'vex-idle';
      if (name === 'drag' && has('vex-drag')) return 'vex-drag';
      if ((name === 'landing' || name === 'fall') && has('vex-landing')) return 'vex-landing';
      if (name === 'falling' && has('vex-fall')) return 'vex-fall'; /* in-air loop after a throw release, until touchdown (his 13:55 video) */
      if (name === 'fly' && has('vex-fly')) return 'vex-fly'; /* unwired since his 15:04 word ('ANTHA FLYING ANIMATION VENDA REMOVE PANNIRU'): throws always play the fall flutter; the art stays in the atlas */
      if (name === 'drop' && has('vex-drop')) return 'vex-drop'; /* gentle release: hang, glide down, settle standing (his 14:24 GIF, 'Normal ah kita veichu drag ah release panna ithu') */
      if (name === 'screenpunch' && has('vex-punch')) return 'vex-punch'; /* fury punch at the cursor before the screen-break overlay (his 14:29 MP4) */
      if (name === 'rage' && has('vex-rage')) return 'vex-rage';
      if (name === 'swing' && has('vex-hitmany')) return 'vex-hitmany'; /* tap-combo: the multi-hit clip (rattle -> vein -> roar -> dizzy stars) composited from his own frames, Nov 20 2026 */
      if (name === 'emote' && has('vex-laugh')) return 'vex-laugh';
      if (VEX_WALK_STATES.has(name) && has('vex-walk')) return 'vex-walk';
      if (name === 'sit-down' && has('vex-sitdown')) return 'vex-sitdown';
      if ((name === 'thinking' || name === 'thinking-long' || name === 'confused') && has('vex-think')) return 'vex-think';
      if (name === 'sleep-down' && has('vex-sleepdown')) return 'vex-sleepdown';
      if (name === 'sit-sleep' && has('vex-sitsleep')) return 'vex-sitsleep';
      if (name === 'sleep-loop' && has('vex-sleeploop')) return 'vex-sleeploop';
      if (name === 'ambient-coffee' && has('vex-coffee')) return 'vex-coffee';
      if (name === 'ambient-laptop' && has('vex-laptop')) return 'vex-laptop';
      // Poke reaction (Nov 20 2026): his sliced startle clip (vex-shock)
      // measured as a near-static grin, so a poke read as nothing
      // happening ('hit animation eh work agale'). vex-hit is composited
      // from his own idle + rage-roar frames instead: recoil tilt,
      // impact star, roar at the peak, wobble back. vex-shock stays in
      // the atlas, unwired.
      if ((name === 'touch-head' || name === 'touch-body' || name === 'touch-paws') && has('vex-hit')) return 'vex-hit';
      if (name === 'touch-scare' && has('vex-scare')) return 'vex-scare'; /* his 11:27 boo GIF, right-click on Vex (his 15:06 word: 'ITHU RIGHT SIDE CICK PANA PLAY AGANUM'); left-click pokes keep vex-shock only */
      // His 'Talking gif' MP4 (Nov 20 2026): standing talk loop, mouth
      // cycling open/closed/smile - the speaking state (voice-ui sends
      // 'talk' while the assistant voice speaks; it loops, not finite).
      if (name === 'talk' && has('vex-talk')) return 'vex-talk';
      // His hello beat (Nov 20 2026: sent 12:27 closer-framed with the
      // feet cut, re-sent 12:33 full-body in standard framing - the shipped
      // art is the full-body re-export): arm rises, open-palm wave side to
      // side. Wired as wave.
      if (name === 'wave' && has('vex-wave')) return 'vex-wave';
      // His listening beat (Nov 20 2026, sent 12:41, his caption:
      // 'Listening when I speak'): hand rises to cup beside the horn
      // with a finger wiggle, head tilted in, big grin, happy eye
      // squint - ear-cupped attention while the user talks. voice-ui
      // sends 'listening' during the mic-open phase of a voice session;
      // the counterpart 'talk' plays while the assistant speaks.
      if (name === 'listening' && has('vex-listen')) return 'vex-listen';
      if (name === 'portal-in' && has('vex-portal-in')) return 'vex-portal-in';
      if (name === 'portal-out' && has('vex-portal-out')) return 'vex-portal-out';
      if ((name === 'sit' || name === 'sleep') && has('vex-sit')) return 'vex-sit';
      return 'vex-idle';
    }
    return 'vex-idle';
  }
  const VEX_EVENTS = {
    'ambient-emote': 'vex-laugh',
    'ambient-think': 'vex-think', /* chin-stroke beat, carried by the 10s idle rotation (pet-behavior.cjs VEX_ROTATION) */
    'react-success': 'vex-laugh',
    'react-confused': 'vex-think',
    'app-open': 'vex-spark', /* hand to temple, cyan spark: the assistant-launched-an-app beat (his 14:12 GIF, 'any app open panna sonna pannraku') */
  };
  // event: semantic name ('thinking', 'react-success', ...). Returns the
  // sprite to play, or null when the name is not a known event or this
  // mascot has no sprite for it (callers then fall back to state
  // resolution / a plain idle beat).
  function resolveEvent(event, mascot, has) {
    if (typeof event !== 'string') return null;
    const table = VEX_EVENTS;
    if (!table) return null;
    const sprite = table[event];
    if (!sprite) return null;
    if (typeof has === 'function' && !has(sprite)) {
      return null;
    }
    return sprite;
  }
  const api = { VEX_WALK_STATES, resolveSprite, VEX_EVENTS, resolveEvent };
  if (typeof module === 'object') module.exports = api;
  else root.MascotAnims = api;
})(globalThis);
