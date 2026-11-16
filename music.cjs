// Music player core: YouTube queue logic (the hidden player window lives
// in main and is driven through the page's IFrame-API bridge).
//
// Items in the queue are one of:
//  - {kind:'video', videoId, title}     - plays directly
//  - {kind:'playlist', listId, title}   - plays via the player's playlist
//  - {kind:'title', title, needsLink:true} - a song TITLE with no link yet
//    (from a screenshot import). YouTube removed search-list playback
//    from the IFrame API, so a bare title cannot be resolved to a video
//    without an API key this app does not have. Title items are therefore
//    kept honestly as a list: they are skipped during playback until the
//    user pastes the real link (linkTitle converts them in place).
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID_RE = /^[A-Za-z0-9_-]{6,}$/;

function parseYouTubeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let u;
  try { u = new URL(raw.includes('://') ? raw : 'https://' + raw); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'music.youtube.com') return null;
  const listId = u.searchParams.get('list');
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0] || '';
    if (!VIDEO_ID_RE.test(id)) return null;
    return { type: 'video', videoId: id, listId: LIST_ID_RE.test(listId || '') ? listId : null };
  }
  if (u.pathname === '/watch') {
    const id = u.searchParams.get('v') || '';
    if (!VIDEO_ID_RE.test(id)) return null;
    return { type: 'video', videoId: id, listId: LIST_ID_RE.test(listId || '') ? listId : null };
  }
  if (u.pathname === '/playlist') {
    if (!LIST_ID_RE.test(listId || '')) return null;
    return { type: 'playlist', listId };
  }
  const seg = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
  if (seg) return { type: 'video', videoId: seg[1], listId: null };
  return null;
}

function videoItem(videoId, title) { return { kind: 'video', videoId, title: String(title || '').slice(0, 120) || ('YouTube ' + videoId) }; }
function playlistItem(listId, title) { return { kind: 'playlist', listId, title: String(title || '').slice(0, 120) || 'YouTube playlist' }; }
function titleItem(title) { return { kind: 'title', title: String(title || '').slice(0, 120), needsLink: true }; }
function itemFromUrl(parsed, title) {
  if (!parsed) return null;
  return parsed.type === 'video' ? videoItem(parsed.videoId, title) : playlistItem(parsed.listId, title);
}
function isPlayable(item) { return !!item && (item.kind === 'video' || item.kind === 'playlist'); }

function saneItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'video' && VIDEO_ID_RE.test(raw.videoId || '')) return videoItem(raw.videoId, raw.title);
  if (raw.kind === 'playlist' && LIST_ID_RE.test(raw.listId || '')) return playlistItem(raw.listId, raw.title);
  if (raw.kind === 'title' && typeof raw.title === 'string' && raw.title.trim()) return titleItem(raw.title);
  return null;
}

class MusicQueue {
  constructor(saved = {}) {
    this.items = [];
    this.index = -1;
    this.volume = 80;
    if (saved && typeof saved === 'object') {
      if (Array.isArray(saved.items)) for (const raw of saved.items) { const it = saneItem(raw); if (it) this.items.push(it); }
      if (Number.isInteger(saved.index) && saved.index >= 0 && saved.index < this.items.length) this.index = saved.index;
      if (Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(100, Math.round(saved.volume)));
    }
  }
  snapshot() { return { items: this.items.map((i) => ({ ...i })), index: this.index, volume: this.volume }; }
  add(item) { const it = saneItem(item); if (!it) return null; this.items.push(it); if (this.index < 0 && isPlayable(it)) this.index = this.items.length - 1; return it; }
  addUrl(url, title) { const it = itemFromUrl(parseYouTubeUrl(url), title); return it ? this.add(it) : null; }
  current() { return this.index >= 0 && this.index < this.items.length ? this.items[this.index] : null; }
  // Advance to the next PLAYABLE item (title items are skipped). Returns
  // the item, or null when the queue is exhausted (index stays put).
  next() {
    for (let i = this.index + 1; i < this.items.length; i++) if (isPlayable(this.items[i])) { this.index = i; return this.items[i]; }
    return null;
  }
  prev() {
    for (let i = this.index - 1; i >= 0; i--) if (isPlayable(this.items[i])) { this.index = i; return this.items[i]; }
    return null;
  }
  firstPlayable() {
    for (let i = 0; i < this.items.length; i++) if (isPlayable(this.items[i])) { this.index = i; return this.items[i]; }
    return null;
  }
  removeAt(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.items.length) return false;
    this.items.splice(i, 1);
    if (this.index >= this.items.length) this.index = this.items.length - 1;
    if (i < this.index) this.index--;
    return true;
  }
  clear() { this.items = []; this.index = -1; }
  setVolume(v) { const n = Number(v); if (Number.isFinite(n)) this.volume = Math.max(0, Math.min(100, Math.round(n))); return this.volume; }
  // Attach a pasted YouTube link to a needs-link title item, converting it
  // to a playable video item in place (title kept).
  linkTitle(index, url) {
    const it = this.items[index];
    if (!it || it.kind !== 'title') return false;
    const parsed = parseYouTubeUrl(url);
    if (!parsed || parsed.type !== 'video') return false;
    this.items[index] = { kind: 'video', videoId: parsed.videoId, title: it.title };
    if (this.index < 0) this.index = index;
    return true;
  }
}

// Named playlists: plain data, persisted by main inside settings.
function createPlaylist(name, items) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) throw Error('A playlist needs a name.');
  const list = (Array.isArray(items) ? items : []).map(saneItem).filter(Boolean).slice(0, 200);
  return { name: n, items: list };
}
function playlistFromTitles(name, titles) {
  return createPlaylist(name, (Array.isArray(titles) ? titles : []).map((t) => titleItem(t)));
}
function sanePlaylists(saved) {
  if (!Array.isArray(saved)) return [];
  const out = [];
  for (const raw of saved) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) continue;
    out.push(createPlaylist(raw.name, raw.items));
    if (out.length >= 50) break;
  }
  return out;
}

module.exports = { VIDEO_ID_RE, parseYouTubeUrl, videoItem, playlistItem, titleItem, itemFromUrl, isPlayable, saneItem, MusicQueue, createPlaylist, playlistFromTitles, sanePlaylists };
