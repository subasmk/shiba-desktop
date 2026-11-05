// Contextual banter: ONE short tease from the local brain, grounded in a
// signal snapshot. The brain only ever sees facts passed in the snapshot -
// and its output passes a grounding filter before it can be shown. If the
// line mentions an app/activity that is not in the snapshot, invents a
// number, runs long, or the brain fails/times out, the caller falls back
// to the existing fixed template lines (pet-history roasts / proactive
// templates). The AI still never invents the user's activity.

const APP_LEXICON = ['discord', 'chrome', 'edge', 'firefox', 'brave', 'spotify', 'youtube', 'netflix', 'valorant', 'minecraft', 'steam', 'whatsapp', 'telegram', 'vs code', 'visual studio code', 'notepad', 'calculator', 'zoom', 'teams', 'vlc', 'obs'];
const ACTIVITY_LEXICON = { game: ['game', 'gaming'], video: ['video', 'movie', 'show'], coding: ['code', 'coding', 'bug'], music: ['music', 'song', 'paatu'], browsing: ['browsing', 'reading', 'scrolling'] };

function allowedTerms(snapshot) {
  const terms = new Set();
  const app = String(snapshot.app || '').toLowerCase();
  for (const a of APP_LEXICON) if (app.includes(a)) terms.add(a);
  const act = snapshot.activity;
  if (act && ACTIVITY_LEXICON[act]) for (const w of ACTIVITY_LEXICON[act]) terms.add(w);
  return terms;
}
function allowedNumbers(snapshot) {
  const nums = new Set();
  if (Number.isFinite(snapshot.hour)) nums.add(snapshot.hour);
  if (Number.isFinite(snapshot.dwellMs)) nums.add(Math.round(snapshot.dwellMs / 60000));
  if (snapshot.counts) for (const v of Object.values(snapshot.counts)) if (Number.isSafeInteger(v)) nums.add(v);
  return nums;
}

// Returns true when the line stays inside the snapshot's facts.
function groundingCheck(line, snapshot) {
  if (typeof line !== 'string') return false;
  const text = line.trim();
  if (!text || text.length > 140) return false;
  if (/https?:|www\.|@\w/.test(text)) return false;
  const low = text.toLowerCase();
  const allowed = allowedTerms(snapshot || {});
  for (const a of APP_LEXICON) if (low.includes(a) && !allowed.has(a)) return false;
  for (const [act, words] of Object.entries(ACTIVITY_LEXICON)) {
    if (snapshot.activity === act) continue;
    for (const w of words) if (new RegExp('\\b' + w + '\\b').test(low)) return false;
  }
  const nums = allowedNumbers(snapshot || {});
  for (const m of low.matchAll(/\d+/g)) if (!nums.has(parseInt(m[0], 10))) return false;
  return true;
}

function buildBanterPrompt(snapshot, personality = 'cheeky') {
  const facts = [];
  if (snapshot.app) facts.push('Foreground app: ' + snapshot.app);
  if (snapshot.activity) facts.push('Activity: ' + snapshot.activity);
  if (Number.isFinite(snapshot.dwellMs)) facts.push('Time in this app: ' + Math.round(snapshot.dwellMs / 60000) + ' minutes');
  if (Number.isFinite(snapshot.hour)) facts.push('Hour of day: ' + snapshot.hour);
  if (snapshot.scene) facts.push('On screen: ' + snapshot.scene);
  if (snapshot.counts) for (const [k, v] of Object.entries(snapshot.counts)) if (v) facts.push('Pet action count ' + k + ': ' + v);
  if (Array.isArray(snapshot.events)) for (const e of snapshot.events.slice(0, 3)) facts.push('Recent pet event: ' + e);
  const system = 'You are a small Shiba desktop pet. Write ONE short friendly tease (max 20 words) in Tanglish (Tamil in Latin letters) or English. Use ONLY the facts given - never invent apps, activities, counts or times that are not listed. No links. Personality: ' + personality + '.';
  return [{ role: 'system', content: system }, { role: 'user', content: 'Facts:\n' + (facts.join('\n') || 'The user is just at the desktop.') + '\nWrite the tease now.' }];
}

// brainFn(messages) -> Promise<string>. Resolves to {line, source} where
// source is 'brain' (passed the grounding filter) or 'template' (fallback).
async function generateBanter({ snapshot, personality = 'cheeky', brainFn, templateLine, timeoutMs = 6000 } = {}) {
  const fallback = () => ({ line: templateLine || null, source: 'template' });
  if (typeof brainFn !== 'function' || !templateLine && !snapshot) return fallback();
  try {
    const raw = await Promise.race([
      brainFn(buildBanterPrompt(snapshot || {}, personality)),
      new Promise((_, rej) => setTimeout(() => rej(Error('banter timeout')), timeoutMs)),
    ]);
    const line = String(raw || '').trim().split('\n')[0];
    if (groundingCheck(line, snapshot || {})) return { line, source: 'brain' };
    return fallback();
  } catch { return fallback(); }
}

module.exports = { buildBanterPrompt, groundingCheck, generateBanter, allowedTerms };
