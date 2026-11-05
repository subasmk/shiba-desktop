const { test } = require('node:test'), a = require('node:assert/strict');
const { classifyActivity, buildForegroundScript, getForeground, ContextMonitor, describeScene } = require('./context.cjs');
test('classifier maps apps and titles to activities', () => {
  a.equal(classifyActivity('Code', 'main.cjs - Visual Studio Code'), 'coding');
  a.equal(classifyActivity('WindowsTerminal', 'node server.js'), 'coding');
  a.equal(classifyActivity('chrome', 'Valorant Champions - YouTube'), 'game');
  a.equal(classifyActivity('chrome', 'Some video - YouTube'), 'video');
  a.equal(classifyActivity('Spotify', 'Spotify Premium'), 'music');
  a.equal(classifyActivity('firefox', 'News site'), 'browsing');
  a.equal(classifyActivity('explorer', 'Documents'), 'other');
  a.equal(classifyActivity('', ''), 'other');
});
test('foreground source is a fixed script and a stub off Windows', async () => {
  a.match(buildForegroundScript(), /GetForegroundWindow/);
  a.equal(await getForeground(undefined, 'linux'), null);
  const fake = (file, args, opts, cb) => cb(null, JSON.stringify({ title: 'Doc - Word', process: 'WINWORD' }));
  a.deepEqual(await getForeground(fake, 'win32'), { app: 'WINWORD', title: 'Doc - Word' });
  const broken = (file, args, opts, cb) => cb(Error('nope'));
  a.equal(await getForeground(broken, 'win32'), null);
});
test('monitor tracks dwell and emits changes only on real changes', async () => {
  let now = 1000000;
  let fg = { app: 'Code', title: 'a.js' };
  const mon = new ContextMonitor({ source: async () => fg, now: () => now });
  const seen = [];
  mon.onChange((snap) => seen.push(snap.app + ':' + snap.activity));
  await mon.poll();
  now += 30000; await mon.poll();
  a.equal(seen.length, 1);
  a.equal(mon.snapshot(now).dwellMs, 30000);
  fg = { app: 'chrome', title: 'Clip - YouTube' };
  await mon.poll();
  a.deepEqual(seen, ['Code:coding', 'chrome:video']);
  a.equal(mon.snapshot(now).recentChanges, 2);
});
test('vision describe uses the local endpoint and refuses empty work', async () => {
  await a.rejects(describeScene({ image: '' }), /No screenshot/);
  let seenBody = null;
  const fakeFetch = async (url, opts) => { seenBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ response: 'User is editing code in VS Code.\nExtra line' }) }; };
  const line = await describeScene({ image: 'AAAA', model: 'moondream', fetchFn: fakeFetch });
  a.equal(line, 'User is editing code in VS Code.');
  a.equal(seenBody.model, 'moondream');
  a.deepEqual(seenBody.images, ['AAAA']);
});

const { buildCursorScript, getCursorPos, saneRect, normalizeScene } = require('./context.cjs');
test('foreground script now reads the window rect; cursor script reads GetCursorPos', () => {
  const s = buildForegroundScript();
  a.match(s, /GetWindowRect/); a.match(s, /rect/);
  a.match(buildCursorScript(), /GetCursorPos/);
});
test('saneRect accepts real windows, rejects degenerate/minimized ones', () => {
  a.deepEqual(saneRect({ left: 10, top: 20, right: 810, bottom: 620 }), { left: 10, top: 20, right: 810, bottom: 620 });
  a.equal(saneRect({ left: 0, top: 0, right: 10, bottom: 10 }), null);
  a.equal(saneRect(null), null);
  a.equal(saneRect({ left: 'x', top: 0, right: 900, bottom: 600 }), null);
});
test('getCursorPos is an honest null off Windows', async () => {
  a.equal(await getCursorPos(() => { throw Error('must not be called'); }, 'linux'), null);
});
test('monitor tracks rect freshness and scene-change time without scene repeats', async () => {
  let now = 1000000;
  const m = new ContextMonitor({ now: () => now, source: async () => ({ app: 'chrome', title: 'Trailer - YouTube', rect: { left: 0, top: 0, right: 900, bottom: 700 } }) });
  const s1 = await m.poll();
  a.deepEqual(s1.rect, { left: 0, top: 0, right: 900, bottom: 700 });
  m.setScene('User is watching a game trailer on YouTube', now);
  a.equal(m.snapshot(now).sceneChangedAt, now);
  now += 30000;
  m.setScene('user watching a game trailer on youtube!', now); // rephrase: NOT a change
  a.equal(m.snapshot(now).sceneChangedAt, 1000000);
  now += 30000;
  m.setScene('User is editing a spreadsheet', now); // real change
  a.equal(m.snapshot(now).sceneChangedAt, now);
  a.equal(normalizeScene('  Hello,   WORLD! '), 'hello world');
});
test('foreground poll carries the rect through and updates it on moves', async () => {
  let rect = { left: 0, top: 0, right: 900, bottom: 700 };
  const m = new ContextMonitor({ now: () => 5000, source: async () => ({ app: 'Code', title: 'x.cjs', rect }) });
  await m.poll();
  rect = { left: 300, top: 0, right: 1200, bottom: 700 };
  const s = await m.poll();
  a.equal(s.rect.left, 300); // moved, same window: rect fresh, no fake app change
  a.equal(s.dwellMs, 0); // since unchanged (same app+title, clock frozen at 5000)
});
