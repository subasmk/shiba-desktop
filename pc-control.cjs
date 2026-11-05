// Deeper PC control: a FIXED allowlist of pre-built actions. Every command
// string comes from a template in this file - there is no free-form shell,
// no string concatenation of model output into commands, and no way to run
// anything that is not listed here. Window targets are app names matched
// against running processes (same spirit as apps.cjs catalog matching):
// names are validated to a safe charset and passed as PowerShell -like
// literals, never interpolated raw.
//
// Confirm-first: closing a window can destroy unsaved work, so `close`
// builds with confirmFirst:true and execute() refuses to run it unless the
// caller passes {confirmed:true} (the app's confirmation pattern).
const { execFile } = require('node:child_process');

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .&'()+-]{0,79}$/;
function psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function validTarget(name) { return typeof name === 'string' && NAME_RE.test(name.trim()); }

const WS = "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\"user32.dll\")]public static extern bool ShowWindow(IntPtr h,int n);[DllImport(\"user32.dll\")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport(\"user32.dll\")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}' -ErrorAction SilentlyContinue;";
function findProc(name) { return "$p=Get-Process -Name " + psQuote(name.trim().replace(/\.exe$/i, '')) + " -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1;if(!$p){throw 'app window not found'};"; }

// Builder: (action, target) -> {file, args, confirmFirst} | null (refused).
// Returning null is the refusal path - anything not allowlisted is refused.
function buildCommand(action, target) {
  const ps = (body) => ({ file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();" + WS + body], confirmFirst: false });
  switch (action) {
    case 'media-play-pause': return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', WS + '[W]::keybd_event(0xB3,0,0,[UIntPtr]::Zero);'], confirmFirst: false };
    case 'media-next': return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', WS + '[W]::keybd_event(0xB0,0,0,[UIntPtr]::Zero);'], confirmFirst: false };
    case 'media-prev': return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', WS + '[W]::keybd_event(0xB1,0,0,[UIntPtr]::Zero);'], confirmFirst: false };
    case 'volume-up': return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', WS + '[W]::keybd_event(0xAF,0,0,[UIntPtr]::Zero);'], confirmFirst: false };
    case 'volume-down': return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', WS + '[W]::keybd_event(0xAE,0,0,[UIntPtr]::Zero);'], confirmFirst: false };
    case 'volume-mute': return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', WS + '[W]::keybd_event(0xAD,0,0,[UIntPtr]::Zero);'], confirmFirst: false };
    case 'activate': case 'minimize': case 'close': case 'arrange-left': case 'arrange-right': case 'arrange-max': {
      if (!validTarget(target)) return null;
      const find = findProc(target);
      if (action === 'activate') return ps(find + '[void][W]::ShowWindow($p.MainWindowHandle,9);[void][W]::SetForegroundWindow($p.MainWindowHandle);');
      if (action === 'minimize') return ps(find + '[void][W]::ShowWindow($p.MainWindowHandle,6);');
      if (action === 'close') { const c = ps(find + '$p.CloseMainWindow() | Out-Null;'); c.confirmFirst = true; return c; }
      // Arrange: snap via keyboard shortcuts after activating (Win+Arrow).
      const key = action === 'arrange-left' ? '0x25' : action === 'arrange-right' ? '0x27' : '0x26';
      return ps(find + '[void][W]::ShowWindow($p.MainWindowHandle,9);[void][W]::SetForegroundWindow($p.MainWindowHandle);Start-Sleep -Milliseconds 150;[W]::keybd_event(0x5B,0,0,[UIntPtr]::Zero);[W]::keybd_event(' + key + ',0,0,[UIntPtr]::Zero);[W]::keybd_event(' + key + ',0,2,[UIntPtr]::Zero);[W]::keybd_event(0x5B,0,2,[UIntPtr]::Zero);');
    }
    default: return null;
  }
}

const ACTIONS = ['activate', 'minimize', 'close', 'arrange-left', 'arrange-right', 'arrange-max', 'media-play-pause', 'media-next', 'media-prev', 'volume-up', 'volume-down', 'volume-mute'];
const NEEDS_TARGET = new Set(['activate', 'minimize', 'close', 'arrange-left', 'arrange-right', 'arrange-max']);

// A combo is a list of caller-supplied steps, each itself allowlist-checked:
//   {do:'open', app} is NOT executed here (launching stays with apps.cjs);
//   {do:<window/media action>, target} steps build via buildCommand.
// buildCombo returns the command list or refuses the whole combo.
function buildCombo(steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > 10) return null;
  const out = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') return null;
    if (step.do === 'open') { if (!validTarget(step.app)) return null; out.push({ kind: 'open', app: step.app.trim() }); continue; }
    const cmd = buildCommand(step.do, step.target);
    if (!cmd) return null;
    out.push({ kind: 'command', action: step.do, target: step.target || null, ...cmd });
  }
  return out;
}

// Bounded local action log (what ran, when, ok/failed) - the app's
// "record only what the pet itself did" pattern; nothing else is stored.
const actionLog = [];
function logAction(entry) { actionLog.push({ at: Date.now(), ...entry }); if (actionLog.length > 100) actionLog.shift(); }
function getActionLog() { return actionLog.slice(); }

// Execute one allowlisted action. execFileFn injectable for tests.
function execute(action, target, { confirmed = false, execFileFn = execFile, platform = process.platform } = {}) {
  return new Promise((resolve) => {
    const cmd = buildCommand(action, target);
    if (!cmd) { logAction({ action, target: target || null, ok: false, why: 'refused' }); return resolve({ status: 'refused', action }); }
    if (platform !== 'win32') { logAction({ action, target: target || null, ok: false, why: 'windows-only' }); return resolve({ status: 'windows-only', action }); }
    if (cmd.confirmFirst && !confirmed) { logAction({ action, target: target || null, ok: false, why: 'confirm-required' }); return resolve({ status: 'confirm-required', action, target }); }
    execFileFn(cmd.file, cmd.args, { windowsHide: true, timeout: 10000, shell: false }, (e) => {
      if (e) { logAction({ action, target: target || null, ok: false, why: 'failed' }); return resolve({ status: 'failed', action, error: 'Windows did not accept the action.' }); }
      logAction({ action, target: target || null, ok: true });
      resolve({ status: 'done', action, target: target || null });
    });
  });
}

module.exports = { buildCommand, buildCombo, execute, ACTIONS, NEEDS_TARGET, validTarget, getActionLog };
