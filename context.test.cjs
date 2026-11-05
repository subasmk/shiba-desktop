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
