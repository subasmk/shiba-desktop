const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { WorkflowStore, WorkflowEngine, saneRule } = require('./workflows.cjs');
const { parseRunningApps, buildRunningAppsScript } = require('./apps.cjs');

const at = (h, m, day = 15) => new Date(2026, 0, day, h, m, 0).getTime();
function recorder() { const calls = []; return { calls, dispatch: async (action, rule) => { calls.push({ action, name: rule.name }); } }; }

test('saneRule: validates trigger/action pairs, rejects incomplete rules', () => {
  assert.ok(saneRule({ name: 'X', trigger: { type: 'at-time', time: '7:30' }, action: { type: 'say', text: 'hi' } }));
  assert.equal(saneRule({ trigger: { type: 'at-time', time: '25:00' }, action: { type: 'say', text: 'hi' } }), null);
  assert.equal(saneRule({ trigger: { type: 'idle', idleMinutes: 5 }, action: { type: 'say', text: '' } }), null);
  assert.equal(saneRule({ trigger: { type: 'hotkey', accelerator: 'Ctrl+Banana' }, action: { type: 'say', text: 'hi' } }), null);
  assert.ok(saneRule({ trigger: { type: 'hotkey', accelerator: 'Ctrl+Shift+F9' }, action: { type: 'discord-post', text: 'yo' } }));
  assert.equal(saneRule({ trigger: { type: 'app-launch', app: ' ' }, action: { type: 'say', text: 'hi' } }), null);
  assert.equal(saneRule({ trigger: { type: 'whenever' }, action: { type: 'say', text: 'hi' } }), null);
});
test('store: CRUD + persistence + corrupt tolerance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-wf-'));
  const file = path.join(dir, 'workflows.json');
  const s = new WorkflowStore(file);
  const r = s.add({ name: 'Morning', trigger: { type: 'at-time', time: '07:30' }, action: { type: 'say', text: 'Good morning' } });
  assert.ok(r.id);
  assert.throws(() => s.add({ name: 'Bad', trigger: { type: 'at-time', time: '99:99' }, action: { type: 'say', text: 'x' } }), /incomplete/);
  const u = s.update(r.id, { name: 'Morning', enabled: false, trigger: { type: 'at-time', time: '08:00' }, action: { type: 'say', text: 'GM' } });
  assert.equal(u.enabled, false); assert.equal(u.trigger.time, '08:00');
  const again = new WorkflowStore(file);
  assert.equal(again.list().length, 1);
  assert.equal(again.remove(r.id), true);
  assert.equal(new WorkflowStore(file).list().length, 0);
  fs.writeFileSync(file, 'nope');
  assert.equal(new WorkflowStore(file).list().length, 0);
});

test('engine at-time: fires once when the clock matches, not again that day, again next day', async () => {
  let now = at(7, 29);
  const { calls, dispatch } = recorder();
  const e = new WorkflowEngine({ dispatch, now: () => now });
  const rule = { id: 'r1', name: 'Alarm', enabled: true, trigger: { type: 'at-time', time: '07:30' }, action: { type: 'say', text: 'hi' } };
  assert.equal((await e.tick([rule], {})).length, 0);
  now = at(7, 30);
  assert.equal((await e.tick([rule], {})).length, 1);
  assert.equal((await e.tick([rule], {})).length, 0); // same minute, second tick
  now = at(7, 30, 16);
  assert.equal((await e.tick([rule], {})).length, 1); // next day
  assert.equal(calls.length, 2);
});
test('engine app-launch: first poll is baseline, appearance fires, reappearance refires', async () => {
  const { calls, dispatch } = recorder();
  const e = new WorkflowEngine({ dispatch, now: () => at(9, 0) });
  const rule = { id: 'r2', name: 'Game', enabled: true, trigger: { type: 'app-launch', app: 'VALORANT' }, action: { type: 'say', text: 'gl' } };
  await e.tick([rule], { runningApps: ['chrome', 'valorant'] }); // already running at baseline: no fire
  assert.equal(calls.length, 0);
  await e.tick([rule], { runningApps: ['chrome'] });
  await e.tick([rule], { runningApps: ['chrome', 'VALORANT'] }); // appeared: fire (case-insensitive)
  assert.equal(calls.length, 1);
  await e.tick([rule], { runningApps: ['chrome', 'valorant'] }); // still running: no refire
  assert.equal(calls.length, 1);
  await e.tick([rule], { runningApps: null }); // unknown poll: no state damage
  await e.tick([rule], { runningApps: ['chrome'] });
  await e.tick([rule], { runningApps: ['valorant'] }); // relaunched: refire
  assert.equal(calls.length, 2);
});
test('engine idle: needs an active sighting first, fires once per idle episode', async () => {
  const { calls, dispatch } = recorder();
  const e = new WorkflowEngine({ dispatch, now: () => at(9, 0) });
  const rule = { id: 'r3', name: 'Break', enabled: true, trigger: { type: 'idle', idleMinutes: 10 }, action: { type: 'say', text: 'break?' } };
  await e.tick([rule], { idleMs: 30 * 60000 }); // already idle at engine start: no fire (never saw active)
  assert.equal(calls.length, 0);
  await e.tick([rule], { idleMs: 5000 }); // active: arms
  await e.tick([rule], { idleMs: 11 * 60000 }); // crossed: fire
  assert.equal(calls.length, 1);
  await e.tick([rule], { idleMs: 20 * 60000 }); // still idle: no refire
  assert.equal(calls.length, 1);
  await e.tick([rule], { idleMs: 1000 }); // active again: re-arm
  await e.tick([rule], { idleMs: 12 * 60000 });
  assert.equal(calls.length, 2);
});
test('engine hotkey: matches accelerator, dedupes auto-repeat, skips disabled', async () => {
  let now = at(9, 0);
  const { calls, dispatch } = recorder();
  const e = new WorkflowEngine({ dispatch, now: () => now });
  const rule = { id: 'r4', name: 'HK', enabled: true, trigger: { type: 'hotkey', accelerator: 'Ctrl+Shift+F9' }, action: { type: 'say', text: 'hk' } };
  const off = { ...rule, id: 'r5', enabled: false };
  await e.hotkey([rule, off], 'ctrl+shift+f9');
  assert.equal(calls.length, 1);
  await e.hotkey([rule], 'Ctrl+Shift+F9'); // auto-repeat within 800ms
  assert.equal(calls.length, 1);
  now += 1000;
  await e.hotkey([rule], 'Ctrl+Shift+F9');
  assert.equal(calls.length, 2);
  await e.hotkey([rule], 'Ctrl+Shift+F10'); // different combo: nothing
  assert.equal(calls.length, 2);
});
test('engine: dispatch failures are captured per rule, never thrown', async () => {
  const e = new WorkflowEngine({ dispatch: async () => { throw Error('boom'); }, now: () => at(7, 30) });
  const rule = { id: 'r6', name: 'Fragile', enabled: true, trigger: { type: 'at-time', time: '07:30' }, action: { type: 'say', text: 'x' } };
  const fired = await e.tick([rule], {});
  assert.equal(fired.length, 1);
  assert.equal(fired[0].ok, false);
  assert.match(fired[0].error, /boom/);
});
test('parseRunningApps: JSON array, single value, junk', () => {
  assert.deepEqual(parseRunningApps('["chrome","Code","chrome"]'), ['chrome', 'Code']);
  assert.deepEqual(parseRunningApps('"solo"'), ['solo']);
  assert.equal(parseRunningApps('not json'), null);
  assert.match(buildRunningAppsScript(), /Get-Process/);
});
