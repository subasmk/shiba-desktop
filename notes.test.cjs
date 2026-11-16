const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { NoteStore } = require('./notes.cjs');

function tmpStore(now) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-notes-'));
  const file = path.join(dir, 'notes.json');
  let t = 1000;
  const store = new NoteStore(file, { now: now || (() => t++) });
  return { dir, file, store };
}

test('CRUD: add, get, update, remove', () => {
  const { store } = tmpStore();
  const a = store.add({ title: 'First', body: 'hello' });
  assert.ok(a.id);
  assert.equal(store.get(a.id).title, 'First');
  const u = store.update(a.id, { body: 'hello world' });
  assert.equal(u.body, 'hello world');
  assert.ok(u.updatedAt >= a.updatedAt);
  assert.equal(store.update('missing-id', { body: 'x' }), null);
  assert.equal(store.remove(a.id), true);
  assert.equal(store.remove(a.id), false);
  assert.equal(store.list().length, 0);
});
test('empty notes are refused', () => {
  const { store } = tmpStore();
  assert.throws(() => store.add({ title: ' ', body: '' }), /title or some text/);
  const a = store.add({ title: 'T', body: '' });
  assert.throws(() => store.update(a.id, { title: '', body: '' }), /title or some text/);
});
test('search matches title and body, case-insensitive; blank returns all', () => {
  const { store } = tmpStore();
  store.add({ title: 'Shopping list', body: 'milk and eggs' });
  store.add({ title: 'Work', body: 'Email the SHOPPING report' });
  store.add({ title: 'Other', body: 'nothing' });
  assert.equal(store.search('shopping').length, 2);
  assert.equal(store.search('MILK').length, 1);
  assert.equal(store.search('zzz').length, 0);
  assert.equal(store.search('').length, 3);
});
test('pinned notes sort first, then most recently edited', () => {
  const { store } = tmpStore();
  const a = store.add({ title: 'A', body: '1' });
  const b = store.add({ title: 'B', body: '2' });
  store.add({ title: 'C', body: '3' });
  assert.equal(store.list()[0].title, 'C'); // newest first
  store.setPinned(a.id, true);
  assert.equal(store.list()[0].id, a.id);
  store.setPinned(b.id, true);
  assert.deepEqual(store.list().slice(0, 2).map((n) => n.title), ['B', 'A']); // pinned group keeps recency order
});
test('persistence: a second store on the same file sees the notes', () => {
  const { file, store } = tmpStore();
  store.add({ title: 'Kept', body: 'on disk' });
  const again = new NoteStore(file);
  assert.equal(again.list().length, 1);
  assert.equal(again.list()[0].title, 'Kept');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw[0].body, 'on disk');
});
test('corrupt or missing file loads as an empty store, never a crash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-notes-'));
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{not json');
  assert.equal(new NoteStore(bad).list().length, 0);
  assert.equal(new NoteStore(path.join(dir, 'nope.json')).list().length, 0);
  const junk = path.join(dir, 'junk.json');
  fs.writeFileSync(junk, JSON.stringify([{ id: 5 }, { id: 'ok', title: 'Real', body: 'x' }, 'nope']));
  const s = new NoteStore(junk);
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0].title, 'Real');
});
test('oversized title/body are bounded', () => {
  const { store } = tmpStore();
  const n = store.add({ title: 'x'.repeat(500), body: 'y'.repeat(30000) });
  assert.equal(n.title.length, 120);
  assert.equal(n.body.length, 20000);
});
