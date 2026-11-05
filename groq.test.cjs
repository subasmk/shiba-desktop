const { test } = require('node:test'); const assert = require('node:assert/strict');
const { GROQ_BASE, GROQ_DEFAULT_MODEL, buildGroqRequest, parseGroqReply, groqChat } = require('./groq.cjs');

test('request shaping: Groq endpoint, bearer key, default model', () => {
  const { url, init } = buildGroqRequest({ apiKey: 'gsk_test', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(url, GROQ_BASE + '/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer gsk_test');
  const body = JSON.parse(init.body);
  assert.equal(body.model, GROQ_DEFAULT_MODEL);
  assert.equal(body.model, 'llama-3.3-70b-versatile');
  assert.equal(body.max_tokens, 180);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});
test('request shaping: model override is honored (hot switch)', () => {
  const { init } = buildGroqRequest({ apiKey: 'k', model: 'llama-3.1-8b-instant', messages: [] });
  assert.equal(JSON.parse(init.body).model, 'llama-3.1-8b-instant');
});
test('reply parsing: OpenAI choices shape, graceful empty', () => {
  assert.equal(parseGroqReply({ choices: [{ message: { content: 'Vanakkam!' } }] }), 'Vanakkam!');
  assert.equal(parseGroqReply({}), 'No reply returned.');
  assert.equal(parseGroqReply(null), 'No reply returned.');
});
test('groqChat: fake fetch round-trip; missing key and HTTP errors are honest', async () => {
  let seenUrl = null;
  const fetchFn = async (url) => { seenUrl = url; return { ok: true, json: async () => ({ choices: [{ message: { content: 'reply!' } }] }) }; };
  assert.equal(await groqChat({ apiKey: 'gsk_x', messages: [], fetchFn }), 'reply!');
  assert.equal(seenUrl, 'https://api.groq.com/openai/v1/chat/completions');
  await assert.rejects(() => groqChat({ messages: [], fetchFn }), /Groq key/);
  await assert.rejects(() => groqChat({ apiKey: 'k', messages: [], fetchFn: async () => ({ ok: false, status: 401 }) }), /401/);
});
