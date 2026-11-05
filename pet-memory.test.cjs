const { test } = require('node:test'), a = require('node:assert/strict');
const { PetMemory, summarizeSession } = require('./pet-memory.cjs');
test('capture: explicit command and stated-fact patterns only', () => {
  const m = new PetMemory();
  const r1 = m.capture('remember this: my exam is on Friday');
  a.equal(r1.stored, true); a.equal(r1.via, 'command');
  const r2 = m.capture('My project demo is next Monday');
  a.equal(r2.stored, true); a.equal(r2.via, 'pattern');
  a.match(m.facts.at(-1).text, /project demo is next Monday/);
  const r3 = m.capture('I like filter coffee in the morning');
  a.equal(r3.stored, true);
  a.equal(m.facts.at(-1).kind, 'preference');
  a.equal(m.capture('hello there, how are you').stored, false);
  a.equal(m.capture('open Chrome please').stored, false);
});
test('secrets are refused at capture, at load, and in summaries', async () => {
  const m = new PetMemory();
  a.equal(m.capture('remember this: my password is hunter2').stored, false);
  a.equal(m.capture('my api key is abc123').stored, false);
  const loaded = new PetMemory({ facts: [{ text: 'my password is hunter2', kind: 'fact', at: 1 }, { text: 'User likes tea', kind: 'preference', at: 2 }] });
  a.equal(loaded.facts.length, 1);
  const ok = await summarizeSession(loaded, [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }], async () => 'the otp is 4411', '2026-01-05');
  a.equal(ok, false);
});
test('recall block is delimited, contains only stored items, clear wipes all', async () => {
  const m = new PetMemory();
  a.equal(m.recallBlock(), '');
  m.capture('remember this: my exam is on Friday');
  m.capture('I prefer tea over coffee');
  const ok = await summarizeSession(m, [{ role: 'user', text: 'I studied graphs today' }, { role: 'assistant', text: 'Nice work' }], async () => 'User revised graph algorithms and plans to rest.', '2026-01-05');
  a.equal(ok, true);
  const block = m.recallBlock();
  a.match(block, /\[PET MEMORY/);
  a.match(block, /\[\/PET MEMORY\]/);
  a.match(block, /exam is on Friday/);
  a.match(block, /revised graph algorithms/);
  const snap = m.snapshot();
  a.equal(new PetMemory(snap).facts.length, 2); // persistence round-trip
  m.clear();
  a.equal(m.hasFacts(), false);
  a.equal(m.recallBlock(), '');
  a.deepEqual(m.snapshot(), { facts: [], summaries: [] });
});
test('duplicates are not stored twice', () => {
  const m = new PetMemory();
  a.equal(m.addFact('User likes tea').stored, true);
  a.equal(m.addFact('user likes tea').stored, false);
});
