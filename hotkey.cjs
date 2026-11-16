// Hold-to-talk hotkey: hold a global key combo to talk, release to stop.
//
// Electron's globalShortcut only ever reports PRESSES - it has no key-up
// event - so the release half of "hold" needs a key-state provider:
//  - Windows: one persistent powershell child runs a single fixed script
//    (below) that polls user32 GetAsyncKeyState for the combo's virtual
//    keys and prints "D" / "U" lines as the combo goes down / up. Same
//    fixed-script child-process pattern as context.cjs / apps.cjs: no
//    free-form commands, nothing model-generated, data only.
//  - Everywhere else: press-to-toggle fallback (each press flips the
//    state) - honest degradation, never a fake "hold".
// The state machine is pure and unit-tested with fake providers. It never
// touches the wake-word path: main wires its onStart/onStop to the same
// voice session Start/Stop the panel button uses, and the panel shows a
// hold-to-talk indicator while active.
const { spawn } = require('node:child_process');

const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space';

// --- accelerator parsing ---------------------------------------------------
// Electron accelerator ("CommandOrControl+Shift+Space") -> modifier set +
// main key + the Win32 virtual-key codes the poll script needs.
const MOD_VK = { control: 0x11, ctrl: 0x11, commandorcontrol: 0x11, cmdorctrl: 0x11, shift: 0x10, alt: 0x12, option: 0x12, meta: 0x5b, super: 0x5b, command: 0x5b, cmd: 0x5b };
const KEY_VK = { space: 0x20, tab: 0x09, enter: 0x0d, return: 0x0d, escape: 0x1b, esc: 0x1b, backspace: 0x08, delete: 0x2e, del: 0x2e, up: 0x26, down: 0x28, left: 0x25, right: 0x27, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, insert: 0x2d, plus: 0xbb, minus: 0xbd };
function vkForKey(key) {
  const k = String(key || '').toLowerCase().replace(/\s+/g, '');
  if (KEY_VK[k] != null) return KEY_VK[k];
  if (/^[a-z]$/.test(k)) return k.toUpperCase().charCodeAt(0); // A-Z: VK == ASCII
  if (/^[0-9]$/.test(k)) return k.charCodeAt(0);               // 0-9: VK == ASCII
  const f = k.match(/^f([1-9]|1[0-9]|2[0-4])$/);
  if (f) return 0x70 + Number(f[1]) - 1;                       // F1..F24
  return null;
}
function parseAccelerator(accel) {
  const raw = String(accel || '').trim();
  if (!raw) return { valid: false, raw, modifiers: [], key: null, vks: [] };
  const parts = raw.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { valid: false, raw, modifiers: [], key: null, vks: [] };
  const keyPart = parts[parts.length - 1];
  const modParts = parts.slice(0, -1);
  const keyVk = vkForKey(keyPart);
  if (keyVk == null) return { valid: false, raw, modifiers: modParts, key: keyPart, vks: [] };
  const vks = [];
  for (const m of modParts) {
    const vk = MOD_VK[m.toLowerCase().replace(/\s+/g, '')];
    if (vk == null) return { valid: false, raw, modifiers: modParts, key: keyPart, vks: [] };
    if (!vks.includes(vk)) vks.push(vk);
  }
  vks.push(keyVk);
  return { valid: true, raw, modifiers: modParts, key: keyPart, vks };
}

// Fixed PowerShell poll script: prints D when the whole combo goes down,
// U when any part is released. Poll interval 40 ms; output flushed per line.
function buildKeyPollScript(vks) {
  const list = (Array.isArray(vks) && vks.length ? vks : [0x11, 0x10, 0x20]).join(',');
  return "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();" +
    "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class KBD{[DllImport(\"user32.dll\")]public static extern short GetAsyncKeyState(int vk);}' -ErrorAction SilentlyContinue;" +
    "$vks=@(" + list + ");$was=$false;" +
    "while($true){$down=$true;foreach($vk in $vks){if(([KBD]::GetAsyncKeyState($vk) -band 0x8000) -eq 0){$down=$false;break;}}" +
    "if($down -ne $was){$was=$down;[Console]::Out.WriteLine($(if($down){'D'}else{'U'}));[Console]::Out.Flush();}" +
    "Start-Sleep -Milliseconds 40}";
}

// --- state machine ---------------------------------------------------------
// idle -> held on press, held -> idle on release. Repeated presses while
// held (OS auto-repeat reaches globalShortcut on some platforms) are
// deduped; releases while idle are ignored. Callbacks fire exactly once
// per transition.
class HoldToTalkMachine {
  constructor({ onStart, onStop } = {}) {
    this.onStart = typeof onStart === 'function' ? onStart : () => {};
    this.onStop = typeof onStop === 'function' ? onStop : () => {};
    this.active = false;
    this.pressCount = 0; // accepted presses (test/diagnostic visibility)
  }
  press() {
    if (this.active) return false; // auto-repeat / duplicate guard
    this.active = true; this.pressCount++;
    this.onStart();
    return true;
  }
  release() {
    if (!this.active) return false;
    this.active = false;
    this.onStop();
    return true;
  }
  toggle() { return this.active ? this.release() : this.press(); }
}

// --- providers ---------------------------------------------------------------
// Toggle provider (non-Windows fallback): main's globalShortcut callback
// calls shortcutPressed(), which simply toggles the machine.
function createToggleProvider(machine) {
  return {
    kind: 'toggle',
    start() { return true; },
    stop() { machine.release(); },
    shortcutPressed() { machine.toggle(); },
  };
}

// Windows key-state provider: spawns the fixed poll script once; its D/U
// lines drive the machine. spawnFn is injectable for tests. If the child
// dies while held, the machine is released so the mic can never stick on.
function createWinKeyStateProvider({ accelerator, machine, spawnFn = spawn, platform = process.platform } = {}) {
  let child = null, buf = '';
  const parsed = parseAccelerator(accelerator);
  function feed(chunk) {
    buf += String(chunk);
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line === 'D') machine.press();
      else if (line === 'U') machine.release();
    }
  }
  return {
    kind: 'win-poll',
    parsed,
    start() {
      if (platform !== 'win32' || !parsed.valid || child) return false;
      try {
        child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildKeyPollScript(parsed.vks)],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch { child = null; return false; }
      if (!child || !child.stdout) { child = null; return false; }
      child.stdout.on('data', feed);
      const dead = () => { child = null; machine.release(); };
      child.on('exit', dead); child.on('error', dead);
      return true;
    },
    stop() {
      if (child) { try { child.kill(); } catch { /* already gone */ } child = null; }
      machine.release();
    },
    // On Windows the globalShortcut press and the poller's D line race;
    // both feed press() and the machine dedupes, so wiring both is safe.
    shortcutPressed() { machine.press(); },
    get running() { return !!child; },
  };
}

// Controller: what main actually holds. Picks the provider by platform.
class HoldToTalkController {
  constructor({ accelerator = DEFAULT_ACCELERATOR, onStart, onStop, platform = process.platform, spawnFn } = {}) {
    this.accelerator = String(accelerator || DEFAULT_ACCELERATOR);
    this.platform = platform;
    this.machine = new HoldToTalkMachine({ onStart, onStop });
    this.provider = platform === 'win32'
      ? createWinKeyStateProvider({ accelerator: this.accelerator, machine: this.machine, spawnFn, platform })
      : createToggleProvider(this.machine);
  }
  get active() { return this.machine.active; }
  get mode() { return this.provider.kind; }
  start() { return this.provider.start(); }
  stop() { this.provider.stop(); }
  shortcutPressed() { this.provider.shortcutPressed(); }
}

module.exports = { DEFAULT_ACCELERATOR, vkForKey, parseAccelerator, buildKeyPollScript, HoldToTalkMachine, createToggleProvider, createWinKeyStateProvider, HoldToTalkController };
