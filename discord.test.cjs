const test = require('node:test'), assert = require('node:assert/strict');
const { isWebhookUrl, buildPayload, parseDiscordIntent, postToDiscord } = require('./discord.cjs');

const GOOD = 'https://discord.com/api/webhooks/123456789012345678/abcdef-XYZ_0123.token';

test('isWebhookUrl: accepts real webhook shapes, rejects everything else', () => {
  assert.equal(isWebhookUrl(GOOD), true);
  assert.equal(isWebhookUrl('https://discordapp.com/api/webhooks/123456789/abc-def'), true);
  assert.equal(isWebhookUrl('https://canary.discord.com/api/webhooks/123456789/abc'), true);
  assert.equal(isWebhookUrl('http://discord.com/api/webhooks/123456789/abc'), false); // https only
  assert.equal(isWebhookUrl('https://evil.com/api/webhooks/123456789/abc'), false);
  assert.equal(isWebhookUrl('https://discord.com/api/webhooks/123/abc'), false); // id too short
  assert.equal(isWebhookUrl('https://discord.com/channels/123/456'), false);
  assert.equal(isWebhookUrl(''), false);
  assert.equal(isWebhookUrl(undefined), false);
});
test('buildPayload: trims, caps at 2000, refuses empty', () => {
  assert.deepEqual(buildPayload('  hello discord  '), { content: 'hello discord' });
  assert.equal(buildPayload('x'.repeat(2500)).content.length, 2000);
  assert.throws(() => buildPayload('   '), /empty/);
  assert.throws(() => buildPayload(''), /empty/);
});
test('parseDiscordIntent: explicit prefixes only', () => {
  assert.equal(parseDiscordIntent('post to discord: standup in 5'), 'standup in 5');
  assert.equal(parseDiscordIntent('Discord: hello server'), 'hello server');
  assert.equal(parseDiscordIntent('discord post: shipped it'), 'shipped it');
  assert.equal(parseDiscordIntent('tell discord I said hi'), null);
  assert.equal(parseDiscordIntent('what is discord'), null);
  assert.equal(parseDiscordIntent('post to discord:'), null);
});

function fakeFetch(result) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); if (result instanceof Error) throw result; return result; };
  fn.calls = calls;
  return fn;
}
test('postToDiscord: no webhook is an honest no-webhook result, nothing sent', async () => {
  const f = fakeFetch({ ok: true, status: 204 });
  const r = await postToDiscord({ url: '', text: 'hi', fetchFn: f });
  assert.equal(r.ok, false); assert.equal(r.reason, 'no-webhook');
  assert.match(r.message, /webhook set pannala/);
  assert.equal(f.calls.length, 0);
});
test('postToDiscord: invalid saved URL and empty text fail before any request', async () => {
  const f = fakeFetch({ ok: true, status: 204 });
  assert.equal((await postToDiscord({ url: 'https://example.com/hook', text: 'hi', fetchFn: f })).reason, 'bad-webhook');
  assert.equal((await postToDiscord({ url: GOOD, text: '  ', fetchFn: f })).reason, 'empty');
  assert.equal(f.calls.length, 0);
});
test('postToDiscord: success posts the JSON payload to the webhook', async () => {
  const f = fakeFetch({ ok: true, status: 204 });
  const r = await postToDiscord({ url: GOOD, text: 'hello from Rex', fetchFn: f });
  assert.equal(r.ok, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, GOOD);
  assert.equal(f.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { content: 'hello from Rex' });
});
test('postToDiscord: HTTP refusal and network failure are honest errors', async () => {
  const gone = await postToDiscord({ url: GOOD, text: 'hi', fetchFn: fakeFetch({ ok: false, status: 404 }) });
  assert.equal(gone.ok, false); assert.equal(gone.reason, 'http-404');
  const net = await postToDiscord({ url: GOOD, text: 'hi', fetchFn: fakeFetch(new Error('socket hang up')) });
  assert.equal(net.ok, false); assert.equal(net.reason, 'network');
  assert.match(net.message, /socket hang up/);
});
