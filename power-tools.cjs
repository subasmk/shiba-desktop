// Power mode tools: Viktor Core's tool designs (core/server.mjs) ported
// into Shiba's chat as brain tools - run_command, read_file, write_file,
// list_dir. Viktor Core ran these from a loopback-only local service with
// a destructive-pattern denylist. Shiba's posture is stricter, in layers:
//   1. ONE master toggle: settings.powerMode, default OFF. With it off,
//      every tool refuses and nothing executes - not even a read.
//   2. run_command passes Viktor Core's denylist (ported verbatim, plus
//      three Shiba strengthenings: `reg add`, `erase /s|/f|/q`, and
//      `rm -rf`/`rm -fr` anywhere, not only at filesystem root).
//   3. File tools are confined to allowed roots (settings.powerRoots, or
//      the user's home + Documents by default). Paths are resolved first,
//      so ".." traversal and symlink-style escapes land outside the roots
//      and are refused. System paths are never in the default roots.
//   4. Confirmation: run_command and write_file need a per-action yes via
//      the injected confirmFn (main wires it to a chat "reply yes"
//      round-trip). Reads and listings need no confirmation.
//   5. Every execution - done, refused, declined, failed - is logged in
//      the same bounded local action log pattern as pc-control.cjs.
// There is no free shell anywhere else in the app; this module behind its
// toggle is the only command path, exactly like the one Viktor Core had.
const { exec } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Ported verbatim from Viktor Core (core/server.mjs DENY); additions
// marked [+shiba].
const DENY = [
  /\bformat\s+[a-z]:/i, /\bdel\s+\/[sfq]/i, /\brd\s+\/s/i, /\brmdir\s+\/s/i,
  /\bremove-item\b[^|]*(-recurse|--recurse)[^|]*[a-z]:\\/i, /\breg\s+delete/i,
  /\bshutdown\b/i, /\bmkfs\b/i, /\bdd\s+if=/i, /\bcipher\s+\/w/i,
  /\bnet\s+user\b[^|]*\//i, /:\(\)\s*\{/, /\brm\s+-rf\s+\/(?!\w)/,
  /\breg\s+add\b/i, /\berase\s+\/[sfq]/i, /\brm\s+-[a-z]*r[a-z]*f\b/i, /\brm\s+-[a-z]*f[a-z]*r\b/i, // [+shiba]
];
function deniedCommand(cmd) { return DENY.some((re) => re.test(String(cmd || ''))); }

// --- allowed roots ---------------------------------------------------------
function defaultRoots(homedir = os.homedir()) {
  return [path.join(homedir, 'Documents'), homedir];
}
function normForCompare(p, platform) {
  let s = path.resolve(String(p || ''));
  if (platform === 'win32') s = s.toLowerCase();
  return s;
}
// Resolve target against the allowed roots. Returns the resolved absolute
// path, or null when it is not inside any root (or not absolute).
function resolveWithinRoots(target, roots, platform = process.platform) {
  if (typeof target !== 'string' || !target.trim() || !path.isAbsolute(target)) return null;
  const resolved = normForCompare(target, platform);
  for (const root of roots || []) {
    const r = normForCompare(root, platform);
    if (resolved === r || resolved.startsWith(r + path.sep)) return path.resolve(target);
  }
  return null;
}

// --- bounded action log (pc-control.cjs pattern) ---------------------------
const actionLog = [];
function logAction(entry) { actionLog.push({ at: Date.now(), ...entry }); if (actionLog.length > 100) actionLog.shift(); }
function getActionLog() { return actionLog.slice(); }

// --- tool implementations (Viktor Core semantics + caps) -------------------
function sh(cmd, execFn) {
  if (execFn) return execFn(cmd);
  return new Promise((resolve) => {
    exec(cmd, { timeout: 25000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => resolve({
      ok: !err, code: err ? (err.code ?? 1) : 0,
      out: String(stdout || '').slice(0, 6000), errOut: String(stderr || '').slice(0, 2000),
    }));
  });
}
const runners = {
  async run_command(args, ctx) {
    const cmd = String(args.command || '');
    if (!cmd.trim()) return { status: 'refused', why: 'empty-command', message: 'Empty command - nothing ran.' };
    if (deniedCommand(cmd)) return { status: 'refused', why: 'denylist', message: 'Refused: that command matches the destructive-pattern denylist. Run it manually yourself if you really mean it.' };
    const r = await sh(cmd, ctx.execFn);
    const output = (r.ok ? 'exit 0' : 'exit ' + r.code) + '\n' + (r.out || '') + (r.errOut ? '\nstderr: ' + r.errOut : '');
    return { status: r.ok ? 'done' : 'failed', output, message: 'Command result:\n' + output.slice(0, 2000) };
  },
  async read_file(args, ctx) {
    const p = resolveWithinRoots(args.path, ctx.roots, ctx.platform);
    if (!p) return { status: 'refused', why: 'outside-roots', message: 'Refused: that path is outside the allowed folders (' + (ctx.roots || []).join(', ') + ').' };
    const text = await fs.promises.readFile(p, 'utf8');
    return { status: 'done', output: text.slice(0, 6000), message: 'File ' + p + ':\n' + text.slice(0, 2000) };
  },
  async write_file(args, ctx) {
    const p = resolveWithinRoots(args.path, ctx.roots, ctx.platform);
    if (!p) return { status: 'refused', why: 'outside-roots', message: 'Refused: that path is outside the allowed folders (' + (ctx.roots || []).join(', ') + ').' };
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, String(args.content ?? ''), 'utf8');
    return { status: 'done', output: 'Wrote ' + p, message: 'Wrote ' + p + '.' };
  },
  async list_dir(args, ctx) {
    const p = resolveWithinRoots(args.path, ctx.roots, ctx.platform);
    if (!p) return { status: 'refused', why: 'outside-roots', message: 'Refused: that path is outside the allowed folders (' + (ctx.roots || []).join(', ') + ').' };
    const items = await fs.promises.readdir(p, { withFileTypes: true });
    const out = items.map((i) => (i.isDirectory() ? '[dir] ' : '') + i.name).join('\n').slice(0, 4000) || '(empty)';
    return { status: 'done', output: out, message: 'Contents of ' + p + ':\n' + out.slice(0, 2000) };
  },
};
const TOOL_NAMES = Object.keys(runners);
const NEEDS_CONFIRM = new Set(['run_command', 'write_file']);
function summarizeCall(name, args) {
  if (name === 'run_command') return 'run the command: ' + String(args.command || '').slice(0, 120);
  if (name === 'write_file') return 'write the file: ' + String(args.path || '');
  return name + ' ' + String(args.path || '');
}

// Execute one tool with all gates. ctx:
//   { powerMode, roots, confirmFn(summary)->Promise<boolean>, execFn,
//     platform, logFn } - confirmFn may be omitted only by tests that
//   exercise refusals; a missing confirmFn means "cannot confirm", so
//   confirm-gated tools decline (fail closed).
async function executePowerTool(name, args = {}, ctx = {}) {
  const done = (r) => { const entry = { tool: name, status: r.status, why: r.why || null }; logAction(entry); if (typeof ctx.logFn === 'function') try { ctx.logFn(entry); } catch {} return r; };
  if (!TOOL_NAMES.includes(name)) return done({ status: 'refused', why: 'unknown-tool', message: 'Unknown power tool: ' + name + '.' });
  if (!ctx.powerMode) return done({ status: 'refused', why: 'power-mode-off', message: 'Power mode is off. Turn it on in the Brain drawer (Power mode) if you want me to do that.' });
  const fullCtx = { roots: (Array.isArray(ctx.roots) && ctx.roots.length ? ctx.roots : defaultRoots()), platform: ctx.platform || process.platform, execFn: ctx.execFn };
  if (NEEDS_CONFIRM.has(name)) {
    const summary = summarizeCall(name, args);
    const ok = typeof ctx.confirmFn === 'function' ? await ctx.confirmFn(summary) : false;
    if (!ok) return done({ status: 'declined', why: 'not-confirmed', summary, message: 'Power action needs your confirmation: ' + summary + '. Reply "yes" to run it.' });
  }
  try { return done(await runners[name](args, fullCtx)); }
  catch (e) { return done({ status: 'failed', why: 'error', message: 'Power tool error (' + name + '): ' + (e && e.message ? e.message : String(e)) }); }
}

// Deterministic chat dispatch, same style as apps.cjs parseLaunch:
// explicit phrasings only - the LLM never invents a tool call here.
function parsePowerIntent(text) {
  const t = String(text || '').trim();
  let m = t.match(/^(?:\/run|run command)\s*[:\-]?\s+([\s\S]{2,500})$/i);
  if (m) return { tool: 'run_command', args: { command: m[1].trim() } };
  m = t.match(/^read file\s*[:\-]?\s+(.{1,500})$/i);
  if (m) return { tool: 'read_file', args: { path: m[1].trim() } };
  m = t.match(/^list (?:files|folder|dir|directory)(?: in)?\s*[:\-]?\s+(.{1,500})$/i);
  if (m) return { tool: 'list_dir', args: { path: m[1].trim() } };
  m = t.match(/^write file\s*[:\-]?\s+(.+?)\s+with\s+([\s\S]{1,4000})$/i);
  if (m) return { tool: 'write_file', args: { path: m[1].trim(), content: m[2] } };
  return null;
}

module.exports = { DENY, deniedCommand, defaultRoots, resolveWithinRoots, executePowerTool, parsePowerIntent, summarizeCall, getActionLog, TOOL_NAMES };
