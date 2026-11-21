// Reflex layer: instant local answers and actions that run BEFORE the
// brain in chat. The fast half of the Nūs lesson — most "assistant" asks
// (clock, volume, timer, music controls) never need a model at all, so
// they return in milliseconds instead of waiting on generation. Anything
// that does not match a rule returns null and the message flows to the
// brain exactly as before. Patterns are deliberately strict: a false
// negative costs nothing (the brain still answers), a false positive
// would hijack a real conversation, so questions ABOUT a topic ("what is
// the time complexity of quicksort") must not match. The matcher is pure
// (the clock is injected) and unit-tested; execution lives in main.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatTime(d) {
  let h = d.getHours();
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
}

function formatDate(d) {
  return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function formatRemaining(ms) {
  const s = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const parts = [];
  if (h) parts.push(h + (h === 1 ? ' hour' : ' hours'));
  if (m) parts.push(m + (m === 1 ? ' minute' : ' minutes'));
  if (r && !h) parts.push(r + (r === 1 ? ' second' : ' seconds'));
  return parts.length ? parts.join(' ') : '0 seconds';
}

// Returns a reflex hit or null:
//   { kind: 'say', text }                       — answer directly
//   { kind: 'pc', action, target?, okLine }     — a pc-control action
//   { kind: 'timer', op, minutes? }             — start/stop/pause/resume/status
//   { kind: 'music', op }                       — play/pause/next/prev
function matchReflex(text, now = new Date()) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const t = raw.toLowerCase();
  // Short factual questions are matched whole-message so a longer real
  // question about time/date can never trip them.
  const bare = t.replace(/^(hey (rex|daru)[, ]+)?/, '').replace(/[?.!\s]+$/, '');
  if (/^(what'?s|what is) the time( now)?$/.test(bare) || bare === 'time' || bare === 'time enna' || bare === 'mani enna' || bare === 'current time') {
    return { kind: 'say', text: "It's " + formatTime(now) + '.' };
  }
  if (/^(what'?s|what is) (today'?s date|the date)$/.test(bare) || /^what day is (it|today)$/.test(bare) || bare === 'date enna' || bare === 'today date') {
    return { kind: 'say', text: 'Today is ' + formatDate(now) + '.' };
  }
  if(/^(?:how much time (?:is )?left|timer status|time left on (?:the )?timer)$/.test(bare))return {kind:'timer',op:'status'};
  // Side effects accept a whole imperative only. Quoted text, negations,
  // explanations, conditional statements and questions fall through to chat.
  const cmd=bare.replace(/^please /,'').replace(/ please$/,'');
  if (/[?]/.test(raw) || /\b(?:not|never|dont|don't|do not|without|unless|if|explain|how|why|should|could|would|can)\b/.test(cmd)) return null;
  let m=cmd.match(/^(?:volume(?: set| to)?|set (?:the )?volume to) (\d{1,3})(?:\s*(?:%|percent))?$/);
  if(m){const v=Math.min(100,Math.max(0,Number(m[1])));return {kind:'pc',action:'volume-set',target:String(v),okLine:'Volume set to '+v+'%.'};}
  if(/^(?:volume up|turn (?:the )?volume up|increase (?:the )?volume|louder)$/.test(cmd))return {kind:'pc',action:'volume-up',okLine:'Volume up.'};
  if(/^(?:volume down|turn (?:the )?volume down|decrease (?:the )?volume|lower (?:the )?volume|softer)$/.test(cmd))return {kind:'pc',action:'volume-down',okLine:'Volume down.'};
  if(/^(?:(?:mute|unmute)(?: (?:the )?(?:volume|sound|audio))?|volume mute)$/.test(cmd))return {kind:'pc',action:'volume-mute',okLine:'Volume mute toggled.'};
  if(/^(?:stop|cancel|clear|kill) (?:the )?timer$/.test(cmd))return {kind:'timer',op:'stop'};
  if(/^pause (?:the )?timer$/.test(cmd))return {kind:'timer',op:'pause'};
  if(/^resume (?:the )?timer$/.test(cmd))return {kind:'timer',op:'resume'};
  m=cmd.match(/^(?:set|start) (?:a |the )?timer (?:for )?(\d{1,3})\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)?$/)
    ||cmd.match(/^(\d{1,3})\s*(minutes?|mins?|seconds?|secs?|hours?|hrs?) timer$/)
    ||cmd.match(/^focus for (\d{1,3})\s*(minutes?|mins?|hours?|hrs?)?$/);
  if(m){const n=Number(m[1]),unit=m[2]||'minutes';if(n<1)return null;if(/^sec/.test(unit))return {kind:'timer',op:'start',seconds:Math.min(10800,n)};const mins=Math.min(180,/^h/.test(unit)?n*60:n);return {kind:'timer',op:'start',minutes:mins};}
  if(/^(?:next song|next track|skip (?:this |the )?(?:song|track))$/.test(cmd))return {kind:'music',op:'next'};
  if(/^(?:previous song|previous track|prev song|prev track)$/.test(cmd))return {kind:'music',op:'prev'};
  if(/^(?:pause|stop) (?:the )?(?:music|song|track)$/.test(cmd))return {kind:'music',op:'pause'};
  if(/^(?:play|resume) (?:the )?(?:music|song)$/.test(cmd))return {kind:'music',op:'play'};
  return null;
}

module.exports = { matchReflex, formatTime, formatDate, formatRemaining };
