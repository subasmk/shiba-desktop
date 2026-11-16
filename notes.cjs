// Full notes: a multi-note store persisted as JSON in the app's userData
// folder (notes.json), separate from the panel's single quick note
// (settings.notes, untouched). Same persistence spirit as pet-memory -
// local file only, tolerant load (a corrupt file yields an empty store,
// never a crash), bounded sizes - but standalone so notes can grow
// without bloating settings.json. Bodies are plain text; the dashboard
// renders them escaped, never as HTML.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_NOTES = 500, MAX_TITLE = 120, MAX_BODY = 20000;

function cleanTitle(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }
function saneNote(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : null;
  if (!id) return null;
  const title = cleanTitle(raw.title);
  const body = typeof raw.body === 'string' ? raw.body.slice(0, MAX_BODY) : '';
  if (!title && !body) return null;
  return {
    id, title, body,
    pinned: !!raw.pinned,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

class NoteStore {
  constructor(filePath, { fsImpl = fs, now = () => Date.now() } = {}) {
    this.filePath = filePath;
    this.fs = fsImpl;
    this.now = now;
    this.notes = [];
    this.load();
  }
  load() {
    this.notes = [];
    try {
      const j = JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(j)) for (const raw of j) { const n = saneNote(raw, this.now()); if (n) this.notes.push(n); }
    } catch { /* missing or corrupt file: start empty, honestly */ }
    this.notes = this.notes.slice(0, MAX_NOTES);
  }
  persist() {
    try {
      this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.fs.writeFileSync(this.filePath, JSON.stringify(this.notes, null, 2), { mode: 0o600 });
    } catch { /* disk errors surface on the next explicit save path */ }
  }
  // Pinned first, then most recently edited. Returns copies.
  list() {
    return this.notes.slice()
      .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt))
      .map((n) => ({ ...n }));
  }
  search(q) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return this.list();
    return this.list().filter((n) => n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle));
  }
  get(id) { const n = this.notes.find((x) => x.id === id); return n ? { ...n } : null; }
  add({ title, body } = {}) {
    const at = this.now();
    const note = saneNote({ id: crypto.randomBytes(8).toString('hex'), title, body, pinned: false, createdAt: at, updatedAt: at }, at);
    if (!note) throw Error('A note needs a title or some text.');
    this.notes.push(note);
    if (this.notes.length > MAX_NOTES) this.notes.splice(0, this.notes.length - MAX_NOTES);
    this.persist();
    return { ...note };
  }
  update(id, { title, body, pinned } = {}) {
    const n = this.notes.find((x) => x.id === id);
    if (!n) return null;
    if (title !== undefined) n.title = cleanTitle(title);
    if (body !== undefined) n.body = String(body || '').slice(0, MAX_BODY);
    if (pinned !== undefined) n.pinned = !!pinned;
    if (!n.title && !n.body) throw Error('A note needs a title or some text.');
    n.updatedAt = this.now();
    this.persist();
    return { ...n };
  }
  setPinned(id, pinned) { return this.update(id, { pinned }); }
  remove(id) {
    const i = this.notes.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.notes.splice(i, 1);
    this.persist();
    return true;
  }
}

module.exports = { NoteStore, MAX_NOTES, MAX_TITLE, MAX_BODY };
