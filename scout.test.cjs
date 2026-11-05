const { test } = require('node:test'); const assert = require('node:assert/strict');
const { Scout, parseFeed, freshItems, validateOfferUrl, scoreItem, FRESH_MS } = require('./scout.cjs');

const NOW = Date.parse('2026-11-05T10:00:00Z');
const fresh = new Date(NOW - 3600000).toUTCString();
const stale = new Date(NOW - 48 * 3600000).toUTCString();
const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>OpenAI announces a new model - TechCrunch</title><link>https://techcrunch.com/2026/11/05/openai-model</link><pubDate>${fresh}</pubDate></item>
<item><title>Old news nobody needs</title><link>https://example.com/old</link><pubDate>${stale}</pubDate></item>
<item><title>Undated mystery item</title><link>https://example.com/undated</link></item>
<item><title>Shady link item</title><link>https://user:pass@evil.example.com/x</link><pubDate>${fresh}</pubDate></item>
<item><title>Fish &amp; Chips &lt;News&gt;</title><link>https://example.com/fish</link><pubDate>${fresh}</pubDate></item>
</channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom story</title><link rel="alternate" href="https://example.com/atom"/><published>${new Date(NOW - 7200000).toISOString()}</published></entry>
</feed>`;

test('parseFeed: RSS items extracted with decoded entities and parsed dates', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 5);
  assert.equal(items[0].title, 'OpenAI announces a new model - TechCrunch');
  assert.equal(items[0].when, NOW - 3600000);
  assert.equal(items[2].when, 0);
  assert.equal(items[4].title, 'Fish & Chips <News>');
});
test('parseFeed: Atom entries extracted', () => {
  const items = parseFeed(ATOM);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/atom');
  assert.equal(items[0].when, NOW - 7200000);
});
test('freshness gate: only <36h dated items pass; undated never pass', () => {
  const kept = freshItems(parseFeed(RSS), NOW);
  assert.ok(kept.every((i) => NOW - i.when < FRESH_MS && i.when > 0));
  assert.ok(!kept.some((i) => i.title.includes('Old news')));
  assert.ok(!kept.some((i) => i.title.includes('Undated')));
});
test('validateOfferUrl: https passes normalized; malicious forms rejected', () => {
  assert.equal(validateOfferUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  for (const bad of ['http://example.com/x', 'https://user:pass@example.com/', 'https://user@example.com/', 'javascript:alert(1)',
    'file:///etc/passwd', 'https://example.com/a b', 'https://example.com/\u0007x', 'ftp://example.com', '', 'not a url',
    'https://example.com/%0ajavascript:alert(1)'.replace('%0a', '\n')])
    assert.equal(validateOfferUrl(bad), null, JSON.stringify(bad));
});
test('scoring: outlet + topic matches rank up, hoax-bait ranks down', () => {
  const outlet = scoreItem({ title: 'OpenAI launch - The Verge' }, []);
  const plain = scoreItem({ title: 'Some random blog post' }, []);
  const hoax = scoreItem({ title: 'SHOCKING fake OpenAI launch - The Verge' }, []);
  assert.ok(outlet > plain); assert.ok(hoax < outlet);
  assert.ok(scoreItem({ title: 'Quantum leaps ahead' }, ['quantum']) > scoreItem({ title: 'Quantum leaps ahead' }, []));
});
test('poll: returns one validated fresh offer, marks it offered, pending holds it', async () => {
  const s = new Scout({ feeds: ['https://feed.example/rss'], fetchFn: async () => RSS, cooldownMs: 1000 });
  const offer = await s.poll(NOW, 'openai');
  assert.ok(offer);
  assert.equal(offer.url, 'https://techcrunch.com/2026/11/05/openai-model');
  assert.equal(offer.host, 'techcrunch.com');
  assert.match(offer.text, /click me/);
  assert.equal(s.takePending(NOW).url, offer.url);
  // Second poll while one is pending -> nothing new.
  assert.equal(await s.poll(NOW + 10), null);
});
test('poll: credentialed item is never offered; dedupe prevents repeats', async () => {
  const s = new Scout({ feeds: ['f'], fetchFn: async () => RSS, cooldownMs: 0 });
  const first = await s.poll(NOW);
  assert.ok(first && !first.url.includes('evil.example.com'));
  s.clearPending();
  const second = await s.poll(NOW + 1000);
  assert.ok(second && second.url !== first.url && !second.url.includes('evil.example.com'));
});
test('poll: cooldown blocks refetch; expired pending clears', async () => {
  let fetches = 0;
  const s = new Scout({ feeds: ['f'], fetchFn: async () => { fetches++; return RSS; }, cooldownMs: 60000, offerTtlMs: 5000 });
  await s.poll(NOW); s.clearPending();
  assert.equal(await s.poll(NOW + 1000), null);
  assert.equal(fetches, 1);
  const s2 = new Scout({ feeds: ['f'], fetchFn: async () => RSS, cooldownMs: 0, offerTtlMs: 5000 });
  await s2.poll(NOW);
  assert.ok(s2.takePending(NOW + 4000));
  assert.equal(s2.takePending(NOW + 6000), null);
});
test('poll: a failing feed is swallowed, other feeds still work', async () => {
  const s = new Scout({ feeds: ['bad', 'good'], fetchFn: async (u) => { if (u === 'bad') throw Error('nope'); return ATOM; }, cooldownMs: 0 });
  const offer = await s.poll(NOW);
  assert.ok(offer); assert.equal(offer.url, 'https://example.com/atom');
});
