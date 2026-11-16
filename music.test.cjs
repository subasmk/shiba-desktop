const test = require('node:test'), assert = require('node:assert/strict');
const { parseYouTubeUrl, MusicQueue, createPlaylist, playlistFromTitles, sanePlaylists, titleItem } = require('./music.cjs');

test('parseYouTubeUrl: watch / youtu.be / shorts / embed forms', () => {
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { type: 'video', videoId: 'dQw4w9WgXcQ', listId: null });
  assert.deepEqual(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=42'), { type: 'video', videoId: 'dQw4w9WgXcQ', listId: null });
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), { type: 'video', videoId: 'dQw4w9WgXcQ', listId: null });
  assert.deepEqual(parseYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), { type: 'video', videoId: 'dQw4w9WgXcQ', listId: null });
  assert.equal(parseYouTubeUrl('youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
});
test('parseYouTubeUrl: playlists and watch+list combos', () => {
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'), { type: 'playlist', listId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
  const combo = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf');
  assert.equal(combo.type, 'video'); assert.equal(combo.listId, 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf');
});
test('parseYouTubeUrl: rejects non-YouTube and malformed input', () => {
  assert.equal(parseYouTubeUrl('https://vimeo.com/12345678901'), null);
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch?v=short'), null);
  assert.equal(parseYouTubeUrl('https://www.youtube.com/playlist?list='), null);
  assert.equal(parseYouTubeUrl('not a url'), null);
  assert.equal(parseYouTubeUrl(''), null);
  assert.equal(parseYouTubeUrl(null), null);
});

test('queue: add via URL, current/next/prev walk playable items', () => {
  const q = new MusicQueue();
  assert.equal(q.addUrl('https://youtu.be/dQw4w9WgXcQ'), q.items[0]);
  q.add(titleItem('Unlinked Song'));
  q.addUrl('https://www.youtube.com/watch?v=abc123XYZ09');
  assert.equal(q.current().videoId, 'dQw4w9WgXcQ');
  const n = q.next();
  assert.equal(n.videoId, 'abc123XYZ09'); // title item skipped
  assert.equal(q.next(), null); // exhausted: stays on last playable
  assert.equal(q.current().videoId, 'abc123XYZ09');
  assert.equal(q.prev().videoId, 'dQw4w9WgXcQ');
  assert.equal(q.prev(), null);
});
test('queue: bad URLs are refused, volume clamps 0-100', () => {
  const q = new MusicQueue();
  assert.equal(q.addUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(q.items.length, 0);
  assert.equal(q.setVolume(140), 100);
  assert.equal(q.setVolume(-3), 0);
  assert.equal(q.setVolume(55), 55);
  assert.equal(q.setVolume('loud'), 55);
});
test('queue: linkTitle converts a needs-link title into a playable video', () => {
  const q = new MusicQueue();
  q.add(titleItem('My Song - Some Artist'));
  assert.equal(q.firstPlayable(), null);
  assert.equal(q.linkTitle(0, 'https://vimeo.com/123'), false);
  assert.equal(q.linkTitle(0, 'https://youtu.be/dQw4w9WgXcQ'), true);
  assert.deepEqual(q.items[0], { kind: 'video', videoId: 'dQw4w9WgXcQ', title: 'My Song - Some Artist' });
  assert.equal(q.current().videoId, 'dQw4w9WgXcQ');
  assert.equal(q.linkTitle(0, 'https://youtu.be/dQw4w9WgXcQ'), false); // no longer a title item
});
test('queue: removeAt keeps index sane; snapshot round-trips', () => {
  const q = new MusicQueue();
  q.addUrl('https://youtu.be/dQw4w9WgXcQ');
  q.addUrl('https://youtu.be/abc123XYZ09');
  q.next();
  q.removeAt(0);
  assert.equal(q.items.length, 1);
  assert.equal(q.current().videoId, 'abc123XYZ09');
  const q2 = new MusicQueue(q.snapshot());
  assert.deepEqual(q2.snapshot(), q.snapshot());
  const junk = new MusicQueue({ items: [{ kind: 'video', videoId: 'bad' }, null, { kind: 'title', title: 'Ok' }], index: 9, volume: 999 });
  assert.equal(junk.items.length, 1);
  assert.equal(junk.volume, 100);
});
test('playlists: from titles are needs-link; sanePlaylists filters junk', () => {
  const p = playlistFromTitles('From screenshot', ['Song A - X', 'Song B - Y']);
  assert.equal(p.name, 'From screenshot');
  assert.ok(p.items.every((i) => i.kind === 'title' && i.needsLink === true));
  assert.throws(() => createPlaylist('  ', []));
  const clean = sanePlaylists([{ name: 'Good', items: [{ kind: 'video', videoId: 'dQw4w9WgXcQ' }] }, { name: '' }, 'junk', null]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].items[0].kind, 'video');
});
