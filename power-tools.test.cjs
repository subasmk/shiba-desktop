const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { deniedCommand, defaultRoots, resolveWithinRoots, executePowerTool, parsePowerIntent, getActionLog } = require('./power-tools.cjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shiba-power-'));
const DOCS = path.join(TMP, 'Documents'); fs.mkdirSync(DOCS);
const okExec = async () => ({ ok: true, code: 0, out: 'fake output', errOut: '' });
const yes = async () => true, no = async () => false;

test('denylist blocks the destructive patterns (Viktor Core set + Shiba additions)', () => {
  for (const cmd of ['format C:', 'format d: /q', 'rm -rf /', 'rm -rf ./build', 'rm -fr /home/x', 'shutdown /s /t 0', 'shutdown -h now',
    'del /s C:\\temp', 'del /f file.txt', 'rd /s C:\\x', 'rmdir /s folder', 'reg delete HKLM\\Software\\X', 'reg add HKCU\\Software\\X /v Y /d Z',
    'Remove-Item -Recurse C:\\data', 'mkfs /dev/sda', 'dd if=/dev/zero of=/dev/sda', 'cipher /w C:', 'net user bob /add', 'erase /s C:\\x'])
    assert.ok(deniedCommand(cmd), cmd);
});
test('denylist leaves benign commands alone', () => {
  for (const cmd of ['ipconfig', 'dir', 'echo hello', 'git status', 'node --version', 'ping 127.0.0.1', 'type notes.txt', 'python script.py'])
    assert.equal(deniedCommand(cmd), false, cmd);
});
test('allowed roots: inside passes, traversal and outside are refused', () => {
  const roots = [DOCS, TMP];
  assert.equal(resolveWithinRoots(path.join(DOCS, 'a.txt'), roots), path.join(DOCS, 'a.txt'));
  assert.equal(resolveWithinRoots(path.join(DOCS, '..', '..', 'etc', 'passwd'), roots), null);
  assert.equal(resolveWithinRoots('/etc/passwd', roots), null);
  assert.equal(resolveWithinRoots('relative/path.txt', roots), null);
  assert.equal(resolveWithinRoots('', roots), null);
});
test('default roots are home + Documents, never system paths', () => {
  const r = defaultRoots('/home/tester');
  assert.deepEqual(r, [path.join('/home/tester', 'Documents'), '/home/tester']);
});
test('toggle OFF refuses every tool before anything runs', async () => {
  let ran = false;
  const ctx = { powerMode: false, roots: [TMP], confirmFn: yes, execFn: async () => { ran = true; return okExec(); } };
  for (const [tool, args] of [['run_command', { command: 'echo hi' }], ['read_file', { path: path.join(TMP, 'x') }], ['list_dir', { path: TMP }], ['write_file', { path: path.join(TMP, 'x'), content: 'y' }]]) {
    const r = await executePowerTool(tool, args, ctx);
    assert.equal(r.status, 'refused'); assert.equal(r.why, 'power-mode-off');
  }
  assert.equal(ran, false);
});
test('run_command: denied command refuses even with power on + confirmation', async () => {
  const r = await executePowerTool('run_command', { command: 'shutdown /s' }, { powerMode: true, roots: [TMP], confirmFn: yes, execFn: okExec });
  assert.equal(r.status, 'refused'); assert.equal(r.why, 'denylist');
});
test('run_command: needs confirmation; declined does not execute', async () => {
  let ran = 0;
  const execFn = async () => { ran++; return okExec(); };
  const declined = await executePowerTool('run_command', { command: 'echo hi' }, { powerMode: true, roots: [TMP], confirmFn: no, execFn });
  assert.equal(declined.status, 'declined'); assert.equal(ran, 0);
  const doneR = await executePowerTool('run_command', { command: 'echo hi' }, { powerMode: true, roots: [TMP], confirmFn: yes, execFn });
  assert.equal(doneR.status, 'done'); assert.equal(ran, 1); assert.match(doneR.output, /fake output/);
});
test('file tools round-trip inside the roots; writes outside refuse', async () => {
  const ctx = { powerMode: true, roots: [TMP], confirmFn: yes };
  const target = path.join(DOCS, 'note.txt');
  assert.equal((await executePowerTool('write_file', { path: target, content: 'vanakkam' }, ctx)).status, 'done');
  const read = await executePowerTool('read_file', { path: target }, ctx);
  assert.equal(read.status, 'done'); assert.match(read.output, /vanakkam/);
  const list = await executePowerTool('list_dir', { path: DOCS }, ctx);
  assert.equal(list.status, 'done'); assert.match(list.output, /note\.txt/);
  const escape = await executePowerTool('write_file', { path: path.join(DOCS, '..', '..', 'evil.txt'), content: 'x' }, ctx);
  assert.equal(escape.status, 'refused'); assert.equal(escape.why, 'outside-roots');
});
test('unknown tool refuses; executions are logged', async () => {
  const before = getActionLog().length;
  const r = await executePowerTool('format_disk', {}, { powerMode: true, roots: [TMP], confirmFn: yes });
  assert.equal(r.status, 'refused'); assert.equal(r.why, 'unknown-tool');
  assert.ok(getActionLog().length > before);
});
test('parsePowerIntent: explicit phrasings only', () => {
  assert.deepEqual(parsePowerIntent('run command: ipconfig'), { tool: 'run_command', args: { command: 'ipconfig' } });
  assert.deepEqual(parsePowerIntent('/run dir'), { tool: 'run_command', args: { command: 'dir' } });
  assert.equal(parsePowerIntent('read file C:\\Users\\x\\a.txt').tool, 'read_file');
  assert.equal(parsePowerIntent('list files in C:\\Users\\x').tool, 'list_dir');
  const w = parsePowerIntent('write file C:\\a.txt with hello world');
  assert.equal(w.tool, 'write_file'); assert.equal(w.args.content, 'hello world');
  for (const t of ['open notepad', 'run a routine', 'what is a run command', 'read me a story']) assert.equal(parsePowerIntent(t), null, t);
});
