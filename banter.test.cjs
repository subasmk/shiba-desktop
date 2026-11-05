const { test } = require('node:test'), a = require('node:assert/strict');
const { buildBanterPrompt, groundingCheck, generateBanter } = require('./banter.cjs');
const snap = { app: 'Visual Studio Code', activity: 'coding', dwellMs: 50 * 60000, hour: 14, counts: { 'chat-turn': 3 } };
test('grounding filter passes lines that stay inside the snapshot', () => {
  a.equal(groundingCheck('50 mins code-la, bro. Konjam break edu.', snap), true);
  a.equal(groundingCheck('Bro, konjam rest edu.', snap), true);
});
test('grounding filter rejects invented apps, activities and numbers', () => {
  a.equal(groundingCheck('Discord-la game aaditu iruka, bro.', snap), false); // app + activity invented
  a.equal(groundingCheck('YouTube paathu 2 hours aachu.', snap), false);
  a.equal(groundingCheck('You opened 9 apps today, bro.', snap), false); // number invented
  a.equal(groundingCheck('Spotify-la paatu kettu relax pannu.', snap), false);
  a.equal(groundingCheck('', snap), false);
  a.equal(groundingCheck('x'.repeat(200), snap), false);
});
test('prompt carries only the snapshot facts', () => {
  const msgs = buildBanterPrompt(snap, 'cheeky');
  a.match(msgs[0].content, /ONLY the facts given/);
  a.match(msgs[1].content, /Visual Studio Code/);
  a.match(msgs[1].content, /50 minutes/);
});
test('generateBanter: brain line used only when grounded, else template fallback', async () => {
  const clean = async () => '50 mins code-la bro, break time.';
  a.deepEqual(await generateBanter({ snapshot: snap, brainFn: clean, templateLine: 'TEMPLATE' }), { line: '50 mins code-la bro, break time.', source: 'brain' });
  const hallucinating = async () => 'Discord-la suthura bro, game podu.';
  a.deepEqual(await generateBanter({ snapshot: snap, brainFn: hallucinating, templateLine: 'TEMPLATE' }), { line: 'TEMPLATE', source: 'template' });
  const broken = async () => { throw Error('ollama down'); };
  a.deepEqual(await generateBanter({ snapshot: snap, brainFn: broken, templateLine: 'TEMPLATE' }), { line: 'TEMPLATE', source: 'template' });
  const slow = () => new Promise((r) => setTimeout(() => r('50 mins code-la bro.'), 5000));
  a.deepEqual(await generateBanter({ snapshot: snap, brainFn: slow, templateLine: 'TEMPLATE', timeoutMs: 50 }), { line: 'TEMPLATE', source: 'template' });
});
