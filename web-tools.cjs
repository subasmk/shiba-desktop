// Web tools: Viktor Core's web_search + web_fetch (core/server.mjs),
// ported as Shiba brain tools. Viktor fetched anything the model asked
// for; Shiba keeps its online-consent posture instead:
//  - Both tools run ONLY when the user has enabled online features for
//    them (settings.webTools, default OFF - the same deliberate opt-in
//    pattern as the OpenRouter cloud mode, whose per-message consent
//    checkbox remains the gate for cloud chat itself). With the toggle
//    off, the tools refuse and no request leaves the laptop.
//  - web_fetch is https-only and refuses credentialed URLs.
//  - Results are size-capped plain text (Viktor's stripTags + caps).
// Parsing is pure and fixture-tested; the network is injected.

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
// DuckDuckGo html results, Viktor's parser: [{title, url, snippet}].
function parseSearchResults(html, limit = 6) {
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) && out.length < limit)
    out.push({ title: stripTags(m[2]), url: m[1], snippet: stripTags(m[3]) });
  return out;
}
function formatResults(results) {
  return results.map((r) => r.title + '\n' + r.url + '\n' + r.snippet).join('\n\n');
}
function validFetchUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  return u;
}
async function webSearch(query, { fetchFn } = {}) {
  const q = String(query || '').trim();
  if (!q) return { status: 'refused', why: 'empty-query', message: 'Empty search - nothing was looked up.' };
  const f = fetchFn || fetch;
  const res = await f('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw Error('search HTTP ' + res.status);
  const results = parseSearchResults(await res.text());
  if (!results.length) return { status: 'done', results: [], message: 'No results parsed. Try fetching a likely site directly instead.' };
  return { status: 'done', results, message: formatResults(results).slice(0, 3000) };
}
async function webFetch(rawUrl, { fetchFn } = {}) {
  const u = validFetchUrl(rawUrl);
  if (!u) return { status: 'refused', why: 'bad-url', message: 'Refused: web fetch needs a normal https address without credentials.' };
  const f = fetchFn || fetch;
  const res = await f(u.toString(), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw Error('fetch HTTP ' + res.status);
  const text = stripTags(await res.text()).slice(0, 6000);
  return { status: 'done', text, message: text.slice(0, 3000) || '(page had no readable text)' };
}
// Gate + dispatch. ctx.onlineEnabled is the settings.webTools toggle.
async function executeWebTool(name, args = {}, ctx = {}) {
  if (!ctx.onlineEnabled) return { status: 'refused', why: 'online-off', message: 'Web tools are off. Turn on Web tools in the Brain drawer if you want me to look things up online.' };
  try {
    if (name === 'web_search') return await webSearch(args.query, ctx);
    if (name === 'web_fetch') return await webFetch(args.url, ctx);
    return { status: 'refused', why: 'unknown-tool', message: 'Unknown web tool: ' + name + '.' };
  } catch (e) { return { status: 'failed', why: 'error', message: 'Web tool error (' + name + '): ' + (e && e.message ? e.message : String(e)) }; }
}
// Deterministic chat dispatch (apps.cjs parseLaunch style).
function parseWebIntent(text) {
  const t = String(text || '').trim();
  // "search X" alone is deliberately NOT a web intent (it would hijack
  // in-app searches like "search my notes"); the web must be named, or
  // the explicit "search:" form used.
  let m = t.match(/^search the web(?:\s+for)?\s*[:\-]?\s+(.{2,300})$/i)
    || t.match(/^web search\s*[:\-]?\s+(.{2,300})$/i)
    || t.match(/^search\s*[:\-]\s+(.{2,300})$/i);
  if (m) return { tool: 'web_search', args: { query: m[1].trim() } };
  m = t.match(/^(?:fetch|read page)\s*[:\-]?\s+(https?:\/\/\S{4,1000})$/i);
  if (m) return { tool: 'web_fetch', args: { url: m[1].trim() } };
  return null;
}

module.exports = { stripTags, parseSearchResults, formatResults, validFetchUrl, webSearch, webFetch, executeWebTool, parseWebIntent };
