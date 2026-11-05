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
// Fixed script: foreground window title + owning process name, JSON out.
function buildForegroundScript() {
  return "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();" +
    "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;using System.Text;public class FG{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport(\"user32.dll\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);}' -ErrorAction SilentlyContinue;" +
    "$h=[FG]::GetForegroundWindow();$sb=New-Object System.Text.StringBuilder 512;[void][FG]::GetWindowText($h,$sb,512);$pid2=0;[void][FG]::GetWindowThreadProcessId($h,[ref]$pid2);$p=Get-Process -Id $pid2 -ErrorAction SilentlyContinue;" +
    "[pscustomobject]@{title=$sb.ToString();process=if($p){$p.ProcessName}else{''}} | ConvertTo-Json -Compress";
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
          resolve({ app: row.process.slice(0, 120), title: row.title.slice(0, 300) });
        } catch { resolve(null); }
      });
  });
}

// --- monitor ---------------------------------------------------------------
class ContextMonitor {
  constructor({ intervalMs = 5000, source = null, now = () => Date.now() } = {}) {
    this.intervalMs = intervalMs; this.source = source; this.now = now;
    this.current = null; // {app,title,activity,since}
    this.changes = [];   // timestamps of recent changes (for app-hopping)
    this.scene = null;   // last vision description {text, at} - memory only
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
      this.current = { app: fg.app, title: fg.title, activity, since: at };
      this.changes.push(at);
      this.changes = this.changes.filter((t) => at - t < 10 * 60000);
      for (const fn of this.listeners) { try { fn(this.snapshot(at), prev); } catch { /* listener errors stay local */ } }
    }
    return this.snapshot(at);
  }
  snapshot(at = this.now()) {
    if (!this.current) return null;
    return {
      app: this.current.app, title: this.current.title, activity: this.current.activity,
      since: this.current.since, dwellMs: Math.max(0, at - this.current.since),
      recentChanges: this.changes.filter((t) => at - t < 10 * 60000).length,
      scene: this.scene && at - this.scene.at < 5 * 60000 ? this.scene.text : null,
    };
  }
  setScene(text, at = this.now()) { if (text) this.scene = { text: String(text).slice(0, 300), at }; }
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

module.exports = { classifyActivity, buildForegroundScript, getForeground, ContextMonitor, describeScene };
