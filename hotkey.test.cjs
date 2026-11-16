const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { parseAccelerator, vkForKey, buildKeyPollScript, HoldToTalkMachine, createToggleProvider, createWinKeyStateProvider, HoldToTalkController } = require('./hotkey.cjs');

test('parseAccelerator: default combo maps to Ctrl+Shift+Space VKs', () => {
  const p = parseAccelerator('CommandOrControl+Shift+Space');
  assert.equal(p.valid, true);
  assert.deepEqual(p.vks, [0x11, 0x10, 0x20]);
  assert.equal(p.key, 'Space');
});
test('parseAccelerator: letters, digits, F-keys, alt', () => {
  assert.deepEqual(parseAccelerator('Ctrl+Alt+K').vks, [0x11, 0x12, 0x4b]);
  assert.deepEqual(parseAccelerator('Shift+F5').vks, [0x10, 0x74]);
  assert.deepEqual(parseAccelerator('Ctrl+1').vks, [0x11, 0x31]);
});
test('parseAccelerator: invalid input is rejected, never guessed', () => {
  assert.equal(parseAccelerator('').valid, false);
  assert.equal(parseAccelerator('Space').valid, false); // needs a modifier
  assert.equal(parseAccelerator('Ctrl+Banana').valid, false);
  assert.equal(parseAccelerator('Banana+Shift+Space').valid, false);
  assert.equal(vkForKey('Banana'), null);
});
test('buildKeyPollScript: fixed script polls exactly the given VKs', () => {
  const s = buildKeyPollScript([0x11, 0x10, 0x20]);
  assert.match(s, /GetAsyncKeyState/);
  assert.match(s, /\$vks=@\(17,16,32\)/);
  assert.ok(!/Invoke-Expression|Start-Process|http/i.test(s));
});

test('machine: press/release transitions fire callbacks exactly once', () => {
  let starts = 0, stops = 0;
  const m = new HoldToTalkMachine({ onStart: () => starts++, onStop: () => stops++ });
  assert.equal(m.press(), true);
  assert.equal(m.active, true);
  assert.equal(m.release(), true);
  assert.equal(m.active, false);
  assert.equal(starts, 1); assert.equal(stops, 1);
});
test('machine: auto-repeat presses and stray releases are deduped', () => {
  let starts = 0, stops = 0;
  const m = new HoldToTalkMachine({ onStart: () => starts++, onStop: () => stops++ });
  m.release(); // stray release while idle: ignored
  m.press(); m.press(); m.press(); // auto-repeat storm
  assert.equal(starts, 1); assert.equal(m.pressCount, 1);
  m.release(); m.release();
  assert.equal(stops, 1);
});
test('machine: toggle flips state (fallback provider semantics)', () => {
  const m = new HoldToTalkMachine({});
  m.toggle(); assert.equal(m.active, true);
  m.toggle(); assert.equal(m.active, false);
});

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.killed = false;
  c.kill = () => { c.killed = true; };
  return c;
}
test('win provider: D/U lines from the poll child drive the machine', () => {
  let starts = 0, stops = 0;
  const m = new HoldToTalkMachine({ onStart: () => starts++, onStop: () => stops++ });
  const child = fakeChild();
  let spawnedWith = null;
  const p = createWinKeyStateProvider({ accelerator: 'CommandOrControl+Shift+Space', machine: m, platform: 'win32', spawnFn: (cmd, args) => { spawnedWith = { cmd, args }; return child; } });
  assert.equal(p.start(), true);
  assert.equal(spawnedWith.cmd, 'powershell.exe');
  assert.match(spawnedWith.args[3], /GetAsyncKeyState/);
  child.stdout.emit('data', 'D\n');
  assert.equal(m.active, true);
  child.stdout.emit('data', 'D\n'); // poller repeats are deduped by the machine
  assert.equal(starts, 1);
  child.stdout.emit('data', 'U'); // partial line: nothing until newline
  assert.equal(m.active, true);
  child.stdout.emit('data', '\n');
  assert.equal(m.active, false); assert.equal(stops, 1);
});
test('win provider: child death while held releases the machine (mic cannot stick on)', () => {
  let stops = 0;
  const m = new HoldToTalkMachine({ onStop: () => stops++ });
  const child = fakeChild();
  const p = createWinKeyStateProvider({ accelerator: 'Ctrl+Shift+Space', machine: m, platform: 'win32', spawnFn: () => child });
  p.start();
  child.stdout.emit('data', 'D\n');
  assert.equal(m.active, true);
  child.emit('exit');
  assert.equal(m.active, false); assert.equal(stops, 1);
});
test('win provider: refuses non-Windows and bad accelerators', () => {
  const m = new HoldToTalkMachine({});
  assert.equal(createWinKeyStateProvider({ accelerator: 'Ctrl+Shift+Space', machine: m, platform: 'linux', spawnFn: () => fakeChild() }).start(), false);
  assert.equal(createWinKeyStateProvider({ accelerator: 'Ctrl+Banana', machine: m, platform: 'win32', spawnFn: () => fakeChild() }).start(), false);
});
test('toggle provider: shortcutPressed toggles; stop releases', () => {
  const m = new HoldToTalkMachine({});
  const p = createToggleProvider(m);
  p.shortcutPressed(); assert.equal(m.active, true);
  p.shortcutPressed(); assert.equal(m.active, false);
  p.shortcutPressed(); p.stop(); assert.equal(m.active, false);
});
test('controller: platform picks provider kind', () => {
  const off = new HoldToTalkController({ platform: 'linux', onStart() {}, onStop() {} });
  assert.equal(off.mode, 'toggle');
  off.shortcutPressed(); assert.equal(off.active, true);
  off.stop(); assert.equal(off.active, false);
  const win = new HoldToTalkController({ platform: 'win32', spawnFn: () => fakeChild() });
  assert.equal(win.mode, 'win-poll');
});
