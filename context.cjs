// Context awareness: what app is in front of the user, and (optionally) what
// is on screen. Strictly opt-in: the poller only runs when the user enables
// context awareness in settings; vision is a second, separate opt-in and
// screenshots are analyzed in memory and never stored.
//
// Windows foreground data comes from one fixed PowerShell script (below) -
// no free-form commands, no model-generated input, same execFile pattern as
// apps.cjs. On non-Windows platforms the source is an honest stub.
const { execFile } = require('node:child_process');

// --- pure classifier -------------------------------------------------------
const GAME_PROCS = ['valorant', 'cs2', 'csgo', 'fortnite', 'minecraft', 'javaw', 'league of legends', 'leagueclient', 'dota2', 'apexlegends', 'r5apex', 'gta5', 'rocketleague', 'overwatch', 'eldenring', 'steam'];
const CODE_PROCS = ['code', 'visual studio code', 'devenv', 'idea64', 'idea', 'webstorm', 'pycharm', 'studio64', 'sublime_text', 'notepad++', 'eclipse', 'cursor'];
const MUSIC_PROCS = ['spotify', 'foobar2000', 'wmplayer', 'vlc', 'musicbee', 'itunes'];
const VIDEO_PROCS = ['vlc', 'mpv', 'potplayer', 'wmplayer'];
const BROWSER_PROCS = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'arc'];
const VIDEO_TITLE = /youtube|netflix|prime video|hotstar|twitch|crunchyroll|▶|watching/i;
const GAME_TITLE = /valorant|minecraft|fortnite|league of legends|dota|apex legends|grand theft|rocket league/i;

function classifyActivity(app, title) {
  const a = String(app || '').toLowerCase(), t = String(title || '');
  if (CODE_PROCS.some((x) => a.includes(x))) return 'coding';
  if (MUSIC_PROCS.some((x) => a.includes(x)) && !VIDEO_TITLE.test(t)) return 'music';
  if (GAME_PROCS.some((x) => a.includes(x)) || GAME_TITLE.test(t)) return 'game';
  if (VIDEO_TITLE.test(t)) return 'video';
  if (VIDEO_PROCS.some((x) => a.includes(x))) return 'video';
  if (BROWSER_PROCS.some((x) => a.includes(x))) return 'browsing';
  if (/\.cjs|\.js|\.ts|\.py|\.java|\.cpp|\.rs|\.go\b|terminal|powershell|command prompt/i.test(t)) return 'coding';
  return 'other';
}

// --- Windows foreground source --------------------------------------------
// Fixed script: foreground window title + owning process name + window
// rect (GetWindowRect), JSON out. The rect feeds the roam perch behaviour
// (last-mile item 5); it is data only - nothing here moves any window.
function buildForegroundScript() {
  return "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();" +
    "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;using System.Text;public class FG{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport(\"user32.dll\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);[StructLayout(LayoutKind.Sequential)]public struct RECT{public int Left;public int Top;public int Right;public int Bottom;}[DllImport(\"user32.dll\")]public static extern bool GetWindowRect(IntPtr h,out RECT r);}' -ErrorAction SilentlyContinue;" +
    "$h=[FG]::GetForegroundWindow();$sb=New-Object System.Text.StringBuilder 512;[void][FG]::GetWindowText($h,$sb,512);$pid2=0;[void][FG]::GetWindowThreadProcessId($h,[ref]$pid2);$p=Get-Process -Id $pid2 -ErrorAction SilentlyContinue;" +
    "$rc=New-Object FG+RECT;$hasRect=[FG]::GetWindowRect($h,[ref]$rc);" +
    "[pscustomobject]@{title=$sb.ToString();process=if($p){$p.ProcessName}else{''};rect=if($hasRect){[pscustomobject]@{left=$rc.Left;top=$rc.Top;right=$rc.Right;bottom=$rc.Bottom}}else{$null}} | ConvertTo-Json -Compress";
}

// Fixed script: current cursor position (for roam cursor play). Data only.
function buildCursorScript() {
  return "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();" +
    "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class CP{[StructLayout(LayoutKind.Sequential)]public struct POINT{public int X;public int Y;}[DllImport(\"user32.dll\")]public static extern bool GetCursorPos(out POINT p);}' -ErrorAction SilentlyContinue;" +
    "$pt=New-Object CP+POINT;$ok=[CP]::GetCursorPos([ref]$pt);" +
    "[pscustomobject]@{x=if($ok){$pt.X}else{$null};y=if($ok){$pt.Y}else{$null}} | ConvertTo-Json -Compress";
}

// Resolve the cursor position once. Non-Windows: null (cursor play and
// perch simply stay unavailable there, honestly).
function getCursorPos(execFileFn = execFile, platform = process.platform) {
  return new Promise((resolve) => {
    if (platform !== 'win32') return resolve(null);
    execFileFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildCursorScript()],
      { windowsHide: true, timeout: 8000, maxBuffer: 64 * 1024, encoding: 'utf8' }, (e, out) => {
        if (e || !out) return resolve(null);
        try {
          const row = JSON.parse(String(out).replace(/^﻿/, '').trim());
          if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) return resolve(null);
          resolve({ x: row.x, y: row.y });
        } catch { resolve(null); }
      });
  });
}

function saneRect(r) {
  if (!r || !Number.isFinite(r.left) || !Number.isFinite(r.top) || !Number.isFinite(r.right) || !Number.isFinite(r.bottom)) return null;
  if (r.right - r.left < 80 || r.bottom - r.top < 40) return null; // minimized / degenerate
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

// Resolve the foreground window once. execFileFn is injectable for tests.
// Non-Windows: resolves to null (feature simply stays silent there).
function getForeground(execFileFn = execFile, platform = process.platform) {
  return new Promise((resolve) => {
    if (platform !== 'win32') return resolve(null);
    execFileFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildForegroundScript()],
      { windowsHide: true, timeout: 8000, maxBuffer: 256 * 1024, encoding: 'utf8' }, (e, out) => {
        if (e || !out) return resolve(null);
        try {
          const row = JSON.parse(String(out).replace(/^﻿/, '').trim());
          if (typeof row.title !== 'string' || typeof row.process !== 'string') return resolve(null);
          const out2 = { app: row.process.slice(0, 120), title: row.title.slice(0, 300) };
          const rect = saneRect(row.rect);
          if (rect) out2.rect = rect; // only present when a real rect was read
          resolve(out2);
        } catch { resolve(null); }
      });
  });
}

// Normalize a scene line for change detection: wording wobble from the
// vision model ("user is watching a game trailer" vs "user watching a
// game trailer!") must not count as a new scene. Change = the word SETS
// differ substantially (Jaccard similarity below SCENE_CHANGE_THRESHOLD),
// not exact-string inequality.
const SCENE_CHANGE_THRESHOLD = 0.6;
function normalizeScene(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\u0B80-\u0BFF]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function sceneSimilarity(a, b) {
  const wa = new Set(normalizeScene(a).split(' ').filter(Boolean));
  const wb = new Set(normalizeScene(b).split(' ').filter(Boolean));
  if (!wa.size && !wb.size) return 1;
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}
function sceneChanged(prevText, nextText) {
  if (!prevText) return !!nextText;
  return sceneSimilarity(prevText, nextText) < SCENE_CHANGE_THRESHOLD;
}

// --- monitor ---------------------------------------------------------------
class ContextMonitor {
  constructor({ intervalMs = 5000, source = null, now = () => Date.now() } = {}) {
    this.intervalMs = intervalMs; this.source = source; this.now = now;
    this.current = null; // {app,title,activity,since,rect}
    this.changes = [];   // timestamps of recent changes (for app-hopping)
    this.scene = null;   // last vision description {text, at, norm} - memory only
    this.sceneChangedAt = null;
    this.timer = null; this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  // One poll step; separated from the timer so tests can drive it directly.
  async poll() {
    const fg = this.source ? await this.source() : await getForeground();
    if (!fg) return null;
    const at = this.now();
    const activity = classifyActivity(fg.app, fg.title);
    if (!this.current || this.current.app !== fg.app || this.current.title !== fg.title) {
      const prev = this.current;
      this.current = { app: fg.app, title: fg.title, activity, since: at, rect: saneRect(fg.rect) };
      this.changes.push(at);
      this.changes = this.changes.filter((t) => at - t < 10 * 60000);
      for (const fn of this.listeners) { try { fn(this.snapshot(at), prev); } catch { /* listener errors stay local */ } }
    } else if (fg.rect) {
      // Same window, possibly moved/resized: keep the rect fresh for the
      // perch behaviour without counting it as an app change.
      this.current.rect = saneRect(fg.rect);
    }
    return this.snapshot(at);
  }
  snapshot(at = this.now()) {
    if (!this.current) return null;
    const sceneFresh = this.scene && at - this.scene.at < 5 * 60000;
    return {
      app: this.current.app, title: this.current.title, activity: this.current.activity,
      since: this.current.since, dwellMs: Math.max(0, at - this.current.since),
      recentChanges: this.changes.filter((t) => at - t < 10 * 60000).length,
      rect: this.current.rect || null,
      scene: sceneFresh ? this.scene.text : null,
      // When the scene TEXT last changed (vision rephrasings of the same
      // scene do not count - see setScene). Drives the proactive
      // scene-change rule: comment on a change once, never on repeats.
      sceneChangedAt: sceneFresh ? this.sceneChangedAt : null,
    };
  }
  setScene(text, at = this.now()) {
    if (!text) return;
    const clean = String(text).slice(0, 300);
    if (!this.scene || sceneChanged(this.scene.text, clean)) this.sceneChangedAt = at;
    this.scene = { text: clean, at };
  }
  start() { if (this.timer) return; this.timer = setInterval(() => { this.poll().catch(() => {}); }, this.intervalMs); if (this.timer.unref) this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

// --- optional vision pass ----------------------------------------------------
// One screenshot (base64 PNG, in memory only) -> local Ollama vision model ->
// one-line scene description. Never writes the screenshot anywhere.
async function describeScene({ image, model = 'moondream', fetchFn = fetch, timeoutMs = 30000 } = {}) {
  if (!image || typeof image !== 'string') throw Error('No screenshot to describe.');
  const r = await fetchFn('http://127.0.0.1:11434/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: 'Describe what the user is doing on this screen in one short sentence. Name the app or activity, nothing else.', images: [image], stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw Error('Vision request failed (' + r.status + ').');
  const a = await r.json();
  const line = String(a.response || '').trim().split('\n')[0].slice(0, 300);
  if (!line) throw Error('Vision model returned nothing.');
  return line;
}

module.exports = { classifyActivity, buildForegroundScript, buildCursorScript, getForeground, getCursorPos, saneRect, normalizeScene, sceneSimilarity, sceneChanged, SCENE_CHANGE_THRESHOLD, ContextMonitor, describeScene };
