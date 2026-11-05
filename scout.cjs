// RSS scout: the proactive news offer, ported from Viktor's hardened
// scout (main.js 'scout-news' + overlay.js scoutTick). Viktor's rules are
// kept exactly:
//  - Bounded public RSS fetch only. No agent, no tools, no LLM scoring -
//    parsing and ranking are plain local code.
//  - Freshness gate: only items published in the last 36 hours are
//    offered; items with an unparseable date are skipped, never offered
//    stale.
//  - At most ONE offer is pending at a time, and it expires after 2
//    minutes unclicked.
//  - The offer's click can open ONLY that one pre-validated https URL -
//    the URL is chosen and validated here in the main process, stored
//    server-side, and re-validated at click time. Credentialed URLs,
//    non-https URLs and URLs with control characters are rejected.
//  - An offered URL is never offered again (bounded dedupe set).
// On top of Viktor's design, offers here are admitted through the
// proactive engine's gates (master toggle, quiet hours, daily cap,
// global gap) by main before anything is shown - see main's scout loop.
// The scout toggle itself defaults OFF; feeds are editable in settings.
const FRESH_MS = 36 * 3600 * 1000;
const DEFAULT_FEEDS = [
  'https://news.google.com/rss/search?q=AI%20announcement%20OR%20big%20tech%20launch&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=artificial%20intelligence%20OR%20machine%20learning&hl=en-US&gl=US&ceid=US:en',
];
// Viktor's ranking: prefer recognizable outlets (Google News titles end
// with " - Publisher"), demote hoax-bait, reward keyword/topic matches.
const OUTLETS = ['ign', 'gamesradar', 'pc gamer', 'pcgamer', 'eurogamer', 'the verge', 'techcrunch', 'polygon', 'kotaku', 'gamespot', 'engadget', 'ars technica', "tom's hardware", 'reuters', 'bloomberg', 'bbc', 'wired', 'venturebeat', 'ndtv', 'the hindu', 'openai', 'google', 'microsoft'];
function decodeEntities(s) {
  return String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
}
// Parse RSS (<item>) and Atom (<entry>) XML strings into
// [{title, url, when}] where when is epoch ms (0 when unparseable).
function parseFeed(xml) {
  const text = String(xml || '');
  const items = [];
  for (const m of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (body.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const date = (body.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    if (title && link) items.push({ title: decodeEntities(title).slice(0, 200), url: decodeEntities(link), when: Date.parse(date) || 0 });
  }
  for (const m of text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = m[1];
    const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    const linkTag = (body.match(/<link[^>]*rel="alternate"[^>]*>/) || body.match(/<link[^>]*>/) || [])[0] || '';
    const href = (linkTag.match(/href="([^"]+)"/) || [])[1] || '';
    const date = (body.match(/<(?:published|updated)>([\s\S]*?)<\/(?:published|updated)>/) || [])[1] || '';
    if (title && href) items.push({ title: decodeEntities(title).slice(0, 200), url: decodeEntities(href), when: Date.parse(date) || 0 });
  }
  return items;
}
// The 36-hour freshness gate. Undated items (when=0) never pass.
function freshItems(items, now = Date.now()) {
  return (items || []).filter((it) => it.when && now - it.when < FRESH_MS);
}
// The click-target validator - Viktor's open-external rules, verbatim in
// spirit: no control characters or whitespace anywhere, https only, no
// embedded credentials. Returns the normalized URL or null.
function validateOfferUrl(raw) {
  const s = String(raw || '');
  if (!s || /[\x00-\x1f\x7f\s]/.test(s)) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  return u.toString();
}
function scoreItem(item, keywords) {
  const t = item.title.toLowerCase();
  const pub = t.includes(' - ') ? t.slice(t.lastIndexOf(' - ') + 3) : '';
  let s = 0;
  for (const k of keywords || []) if (k && t.includes(k)) s += 2;
  if (/openai|gemini|claude|anthropic|launch|release|trailer|announce|ai\b/.test(t)) s += 1;
  if (OUTLETS.some((n) => pub.includes(n))) s += 3;
  if (/\b(fake|hoax|scam)\b/.test(t)) s -= 3;
  return s;
}
function keywordsFrom(text) {
  return String(text || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
}

class Scout {
  constructor({ feeds = DEFAULT_FEEDS, fetchFn, cooldownMs = 50 * 60000, offerTtlMs = 2 * 60000 } = {}) {
    this.feeds = Array.isArray(feeds) && feeds.length ? feeds.slice(0, 10) : DEFAULT_FEEDS.slice();
    this.fetchFn = fetchFn || (async (url) => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw Error('feed HTTP ' + r.status); return r.text(); });
    this.cooldownMs = cooldownMs; this.offerTtlMs = offerTtlMs;
    this.offered = new Set(); this.lastPollAt = 0; this.pending = null;
  }
  setFeeds(feeds) { if (Array.isArray(feeds) && feeds.length) this.feeds = feeds.slice(0, 10).map(String); }
  // The pending, still-valid offer (or null). This is the only URL a
  // bubble click may ever open; main re-validates it at click time.
  takePending(now = Date.now()) {
    if (this.pending && now < this.pending.expiresAt) return this.pending;
    this.pending = null; return null;
  }
  clearPending() { this.pending = null; }
  // One bounded poll. Returns a fresh offer {text, url, host, title} or
  // null (cooldown, an offer already pending, or nothing fresh/valid).
  async poll(now = Date.now(), topicsText = '') {
    if (this.takePending(now)) return null;
    if (this.lastPollAt && now - this.lastPollAt < this.cooldownMs) return null;
    this.lastPollAt = now;
    let items = [];
    for (const f of this.feeds) {
      try { items = items.concat(parseFeed(await this.fetchFn(f))); } catch {}
    }
    const keywords = keywordsFrom(topicsText);
    const candidates = freshItems(items, now)
      .map((it) => ({ it, url: validateOfferUrl(it.url) }))
      .filter((x) => x.url && !this.offered.has(x.url))
      .map((x) => ({ ...x, s: scoreItem(x.it, keywords) }))
      .sort((a, b) => b.s - a.s || b.it.when - a.it.when);
    if (!candidates.length) return null;
    const top = candidates[0];
    this.offered.add(top.url);
    if (this.offered.size > 200) this.offered = new Set([...this.offered].slice(-200));
    const title = top.it.title.length > 110 ? top.it.title.slice(0, 107) + '…' : top.it.title;
    this.pending = { title, url: top.url, host: new URL(top.url).hostname, expiresAt: now + this.offerTtlMs };
    return { ...this.pending, text: title + " - click me and I'll open it." };
  }
}

module.exports = { Scout, parseFeed, freshItems, validateOfferUrl, scoreItem, decodeEntities, DEFAULT_FEEDS, FRESH_MS };
