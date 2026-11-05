const { test } = require('node:test'), a = require('node:assert/strict');
const { buildCommand, buildCombo, execute, validTarget } = require('./pc-control.cjs');
test('allowlisted media and volume actions build exactly one command', () => {
  for (const [action, key] of [['media-play-pause', '0xB3'], ['media-next', '0xB0'], ['volume-up', '0xAF'], ['volume-down', '0xAE'], ['volume-mute', '0xAD']]) {
    const c = buildCommand(action);
    a.equal(c.file, 'powershell.exe');
    a.ok(c.args.at(-1).includes(key), action);
    a.equal(c.confirmFirst, false);
  }
});
test('window actions validate targets and close is confirm-first', () => {
  const c = buildCommand('activate', 'Discord');
  a.ok(c.args.at(-1).includes("'Discord'"));
  a.equal(buildCommand('close', 'Discord').confirmFirst, true);
  a.equal(buildCommand('arrange-left', 'Code').confirmFirst, false);
  a.equal(validTarget('Visual Studio Code'), true);
  a.equal(validTarget('Bad;Name'), false);
  a.equal(validTarget(''), false);
  a.equal(buildCommand('minimize', 'x";evil'), null);
});
test('anything outside the allowlist is refused, never built', () => {
  for (const bad of ['run', 'shell', 'delete', 'format', 'shutdown', '', 'ACTIVATE; rm -rf']) a.equal(buildCommand(bad, 'Discord'), null);
  a.equal(buildCommand('activate'), null); // missing target
});
test('combos are allowlist-checked step by step', () => {
  const combo = buildCombo([{ do: 'open', app: 'Discord' }, { do: 'arrange-left', target: 'Discord' }, { do: 'volume-up' }]);
  a.equal(combo.length, 3);
  a.equal(combo[0].kind, 'open');
  a.equal(buildCombo([{ do: 'open', app: 'Discord' }, { do: 'wipe-disk' }]), null);
  a.equal(buildCombo([]), null);
});
test('execute: refusal, windows-only, confirm gate, and success with a fake runner', async () => {
  let calls = 0;
  const fake = (file, args, opts, cb) => { calls++; cb(null); };
  a.equal((await execute('nonsense', null, { execFileFn: fake, platform: 'win32' })).status, 'refused');
  a.equal((await execute('volume-up', null, { execFileFn: fake, platform: 'linux' })).status, 'windows-only');
  a.equal(calls, 0);
  a.equal((await execute('close', 'Discord', { execFileFn: fake, platform: 'win32' })).status, 'confirm-required');
  a.equal(calls, 0); // nothing ran without confirmation
  a.equal((await execute('close', 'Discord', { execFileFn: fake, platform: 'win32', confirmed: true })).status, 'done');
  a.equal((await execute('volume-up', null, { execFileFn: fake, platform: 'win32' })).status, 'done');
  a.equal(calls, 2);
});
