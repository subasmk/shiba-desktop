const { test } = require('node:test'); const assert = require('node:assert/strict');
const { stripTags, parseSearchResults, validFetchUrl, webSearch, webFetch, executeWebTool, parseWebIntent } = require('./web-tools.cjs');

const DDG = `<html><body>
<div class="result"><a class="result__a" href="https://example.com/one">First &amp; Best Result</a>
<a class="result__snippet" href="https://example.com/one">Snippet <b>one</b> here.</a></div>
<div class="result"><a class="result__a" href="https://example.org/two">Second Result</a>
<a class="result__snippet" href="https://example.org/two">Snippet two.</a></div>
</body></html>`;
const PAGE = `<html><head><style>.x{color:red}</style><script>var secret=1;</script></head><body><h1>Hello</h1><p>Readable &amp; calm text.</p></body></html>`;

test('parseSearchResults: title/url/snippet triples from fixture HTML', () => {
  const r = parseSearchResults(DDG);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { title: 'First & Best Result', url: 'https://example.com/one', snippet: 'Snippet one here.' });
  assert.equal(r[1].title, 'Second Result');
  assert.deepEqual(parseSearchResults('<html>nothing</html>'), []);
});
test('stripTags removes script/style and decodes entities', () => {
  const t = stripTags(PAGE);
  assert.match(t, /Hello/); assert.match(t, /Readable & calm text\./);
  assert.ok(!/secret|color/.test(t));
});
test('webSearch formats results; empty page degrades honestly', async () => {
  const ok = await webSearch('shiba inu', { fetchFn: async (url) => { assert.match(url, /html\.duckduckgo\.com\/html\/\?q=shiba%20inu/); return { ok: true, text: async () => DDG }; } });
  assert.equal(ok.status, 'done'); assert.equal(ok.results.length, 2); assert.match(ok.message, /First & Best Result/);
  const none = await webSearch('zzz', { fetchFn: async () => ({ ok: true, text: async () => '<html></html>' }) });
  assert.equal(none.status, 'done'); assert.match(none.message, /No results parsed/);
});
test('webFetch: https only, credentials refused, text capped', async () => {
  assert.equal(validFetchUrl('http://example.com'), null);
  assert.equal(validFetchUrl('https://u:p@example.com'), null);
  assert.ok(validFetchUrl('https://example.com/x'));
  const r = await webFetch('https://example.com', { fetchFn: async () => ({ ok: true, text: async () => PAGE }) });
  assert.equal(r.status, 'done'); assert.match(r.text, /Readable & calm text\./);
  const refused = await executeWebTool('web_fetch', { url: 'http://example.com' }, { onlineEnabled: true, fetchFn: async () => { throw Error('must not fetch'); } });
  assert.equal(refused.status, 'refused');
});
test('gate: with online features off, nothing is fetched', async () => {
  let fetched = false;
  const fetchFn = async () => { fetched = true; return { ok: true, text: async () => DDG }; };
  const r = await executeWebTool('web_search', { query: 'news' }, { onlineEnabled: false, fetchFn });
  assert.equal(r.status, 'refused'); assert.equal(r.why, 'online-off'); assert.equal(fetched, false);
});
test('parseWebIntent: explicit phrasings only', () => {
  assert.deepEqual(parseWebIntent('search the web for shiba inu news'), { tool: 'web_search', args: { query: 'shiba inu news' } });
  assert.equal(parseWebIntent('search: best laptops').tool, 'web_search');
  assert.equal(parseWebIntent('fetch https://example.com/a').tool, 'web_fetch');
  assert.equal(parseWebIntent('read page https://example.com/a').tool, 'web_fetch');
  for (const t of ['open chrome', 'search my notes', 'fetch my ball', 'what is the web']) assert.equal(parseWebIntent(t), null, t);
});
