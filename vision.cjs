// Screen vision + pointing: "where is X" -> screenshot -> local vision
// model -> a point on screen -> a pulsing pointer overlay (main shows it).
//
// Provider seam: the app's existing vision path is a LOCAL Ollama vision
// model (context.cjs describeScene posts base64 PNGs to /api/generate).
// This module reuses exactly that seam - same endpoint, same model setting
// (settings.visionModel, default moondream) - with a pointing prompt.
// Screenshots live in memory only and are never written to disk, matching
// the context-vision posture. All parsing is pure and unit-tested; the
// network call takes an injectable fetchFn.

// --- prompts ---------------------------------------------------------------
function buildLocatePrompt(target) {
  return 'Look at this screenshot. Find: ' + String(target || '').slice(0, 120) + '. ' +
    'Reply with ONLY a JSON object {"x": <0-1000>, "y": <0-1000>} giving the CENTER of that element, ' +
    'where x and y are positions across the whole screen scaled 0 to 1000 (0,0 is top-left). ' +
    'If it is not visible, reply {"x": -1, "y": -1}. No other text.';
}
function buildTitlesPrompt() {
  return 'This screenshot shows a list of songs (a playlist or music app). ' +
    'List every song title you can read, one per line, with the artist after " - " when shown. ' +
    'Titles only - no numbering, no bullets, no commentary.';
}

// --- coordinate parsing ------------------------------------------------------
// Models answer in a few shapes: clean JSON, JSON inside prose/code fences,
// or (rarely) bare "x, y" numbers. Values are 0-1000 normalized; a model
// that answers in 0-1 fractions (non-integer values <= 1) is scaled up.
function clamp1000(n) { return Math.max(0, Math.min(1000, Math.round(n))); }
function sanePair(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0) return null; // the model's "not visible" sentinel
  if (x <= 1 && y <= 1 && (!Number.isInteger(x) || !Number.isInteger(y))) { x *= 1000; y *= 1000; }
  if (x > 1000 || y > 1000) { // out of range but positive: clamp rather than fail
    x = clamp1000(x); y = clamp1000(y);
  }
  return { x: clamp1000(x), y: clamp1000(y) };
}
function parsePoint(text) {
  const t = String(text || '');
  const jsonMatch = t.match(/\{[^{}]*\}/);
  if (jsonMatch) {
    try {
      const j = JSON.parse(jsonMatch[0]);
      const p = sanePair(Number(j.x), Number(j.y));
      if (p) return p;
      if (Number(j.x) < 0 || Number(j.y) < 0) return null;
    } catch { /* fall through to loose numbers */ }
  }
  const nums = t.match(/-?\d+(?:\.\d+)?/g);
  if (nums && nums.length >= 2) return sanePair(Number(nums[0]), Number(nums[1]));
  return null;
}
// Normalized 0-1000 point -> pixel position inside a width x height area,
// clamped so a marker is always fully on screen.
function pointToPixels(point, width, height, margin = 0) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const px = Math.round((point.x / 1000) * (w - 1));
  const py = Math.round((point.y / 1000) * (h - 1));
  return {
    px: Math.max(margin, Math.min(w - 1 - margin, px)),
    py: Math.max(margin, Math.min(h - 1 - margin, py)),
  };
}

// --- chat intent ---------------------------------------------------------------
// Only wired in main when the visionPoint setting is ON - with the feature
// off, "where is ..." stays an ordinary brain question, untouched.
function parseLocateIntent(text) {
  const t = String(text || '').trim();
  let m = t.match(/^(?:where is|where's|find|locate|point to|show me)\s+(.{2,80}?)(?:\s+on\s+(?:the|my)\s+screen)?[.!?]?$/i);
  if (m) return m[1].trim();
  m = t.match(/^(.{2,80}?)\s+enga\s+iruku[.!?]?$/i); // Tanglish: "X enga iruku" = where is X
  if (m) return m[1].trim();
  return null;
}

// --- song-title extraction (used by the music screenshot import) -------------
function parseTitleLines(text) {
  const out = [], seen = new Set();
  for (const raw of String(text || '').split('\n')) {
    let line = raw.replace(/^[\s\-*•\d.)\]]+/, '').replace(/^["']|["']$/g, '').trim();
    if (!line || line.length > 120) continue;
    if (/^titles only|no other text|songs?:?$/i.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(line);
    if (out.length >= 50) break;
  }
  return out;
}

// --- provider calls (Ollama vision seam, same as context.describeScene) ------
async function ollamaVision({ image, prompt, model = 'moondream', fetchFn = fetch, timeoutMs = 45000 } = {}) {
  if (!image || typeof image !== 'string') throw Error('No screenshot to look at.');
  const r = await fetchFn('http://127.0.0.1:11434/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, images: [image], stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw Error('Vision request failed (' + r.status + '). Is the vision model "' + model + '" installed in Ollama?');
  const a = await r.json();
  return String(a.response || '');
}
async function locateInImage({ image, target, model, fetchFn, timeoutMs } = {}) {
  const raw = await ollamaVision({ image, prompt: buildLocatePrompt(target), model, fetchFn, timeoutMs });
  const point = parsePoint(raw);
  if (!point) throw Error('The vision model could not find "' + String(target || '').slice(0, 60) + '" on this screen.');
  return { point, raw: raw.slice(0, 300) };
}
async function extractSongTitles({ image, model, fetchFn, timeoutMs } = {}) {
  const raw = await ollamaVision({ image, prompt: buildTitlesPrompt(), model, fetchFn, timeoutMs });
  const titles = parseTitleLines(raw);
  if (!titles.length) throw Error('No song titles could be read from that image.');
  return titles;
}

module.exports = { buildLocatePrompt, buildTitlesPrompt, parsePoint, pointToPixels, parseLocateIntent, parseTitleLines, ollamaVision, locateInImage, extractSongTitles };
