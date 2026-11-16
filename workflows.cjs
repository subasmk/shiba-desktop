// Trigger-based workflows: user-written rules {trigger, action} that run
// on their own. This extends routines (which are manual, launch-only app
// groups) with a small engine:
//
//   triggers: at-time    - clock reaches HH:MM (once per day per rule)
//             app-launch - a named process appears in the running list
//             idle       - system idle crosses N minutes (engine must see
//                          the user active first, and re-arms on activity)
//             hotkey     - a global accelerator is pressed (main registers
//                          it; engine.hotkey() is the entry point)
//   actions:  say, launch-app, start-music, add-note, discord-post
//
// The engine is deliberately dumb about the world: main feeds it signals
// ({idleMs, runningApps}) on a tick and injects the dispatch function, so
// every trigger rule is unit-testable with a fake clock and fake pollers.
// Rules persist like the notes store: a JSON file in userData with a
// tolerant load. Nothing here runs a shell or invents commands - actions
// dispatch to the app's existing fixed paths in main.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseAccelerator } = require('./hotkey.cjs');

const TRIGGER_TYPES = ['at-time', 'app-launch', 'idle', 'hotkey'];
const ACTION_TYPES = ['say', 'launch-app', 'start-music', 'add-note', 'discord-post'];
const MAX_RULES = 100;

function clean(s, max) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max); }

function saneTrigger(raw) {
  if (!raw || typeof raw !== 'object' || !TRIGGER_TYPES.includes(raw.type)) return null;
  if (raw.type === 'at-time') {
    const m = String(raw.time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return { type: 'at-time', time: String(Number(m[1])).padStart(2, '0') + ':' + m[2] };
  }
  if (raw.type === 'app-launch') {
    const app = clean(raw.app, 120);
    return app ? { type: 'app-launch', app } : null;
  }
  if (raw.type === 'idle') {
    const mins = Number(raw.idleMinutes);
    return { type: 'idle', idleMinutes: Number.isFinite(mins) ? Math.max(1, Math.min(240, Math.round(mins))) : 10 };
  }
  // hotkey
  const accel = clean(raw.accelerator, 80);
  if (!accel || !parseAccelerator(accel).valid) return null;
  return { type: 'hotkey', accelerator: accel };
}
function saneAction(raw) {
  if (!raw || typeof raw !== 'object' || !ACTION_TYPES.includes(raw.type)) return null;
  if (raw.type === 'say') { const text = clean(raw.text, 300); return text ? { type: 'say', text } : null; }
  if (raw.type === 'launch-app') { const app = clean(raw.app, 120); return app ? { type: 'launch-app', app } : null; }
  if (raw.type === 'start-music') return { type: 'start-music', playlist: clean(raw.playlist, 60) };
  if (raw.type === 'add-note') {
    const title = clean(raw.title, 120), body = String(raw.body || '').slice(0, 2000);
    return title || body ? { type: 'add-note', title, body } : null;
  }
  const text = clean(raw.text, 1800); // discord-post
  return text ? { type: 'discord-post', text } : null;
}
function saneRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const trigger = saneTrigger(raw.trigger), action = saneAction(raw.action);
  if (!trigger || !action) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : crypto.randomBytes(8).toString('hex'),
    name: clean(raw.name, 60) || 'Workflow',
    enabled: raw.enabled !== false,
    trigger, action,
  };
}

class WorkflowStore {
  constructor(filePath, { fsImpl = fs } = {}) {
    this.filePath = filePath;
    this.fs = fsImpl;
    this.rules = [];
    this.load();
  }
  load() {
    this.rules = [];
    try {
      const j = JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(j)) for (const raw of j) { const r = saneRule(raw); if (r) this.rules.push(r); }
    } catch { /* missing or corrupt: empty store */ }
    this.rules = this.rules.slice(0, MAX_RULES);
  }
  persist() {
    try {
      this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.fs.writeFileSync(this.filePath, JSON.stringify(this.rules, null, 2), { mode: 0o600 });
    } catch { /* surfaced via explicit calls elsewhere */ }
  }
  list() { return this.rules.map((r) => ({ ...r, trigger: { ...r.trigger }, action: { ...r.action } })); }
  add(raw) {
    const r = saneRule(raw);
    if (!r) throw Error('That workflow is incomplete - check the trigger and action values.');
    this.rules.push(r);
    this.persist();
    return { ...r };
  }
  update(id, raw) {
    const i = this.rules.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const r = saneRule({ ...raw, id });
    if (!r) throw Error('That workflow is incomplete - check the trigger and action values.');
    this.rules[i] = r;
    this.persist();
    return { ...r };
  }
  remove(id) {
    const i = this.rules.findIndex((r) => r.id === id);
    if (i < 0) return false;
    this.rules.splice(i, 1);
    this.persist();
    return true;
  }
}

function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function hhmm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

class WorkflowEngine {
  constructor({ dispatch, now = () => Date.now() } = {}) {
    this.dispatch = typeof dispatch === 'function' ? dispatch : async () => {};
    this.now = now;
    this.firedDay = new Map();   // at-time: ruleId -> dayKey last fired
    this.idleArmed = new Set();  // idle: ruleIds ready to fire
    this.seenActive = false;     // idle: user observed active at least once
    this.prevApps = null;        // app-launch: Set of lowercase names, null = no baseline yet
    this.lastHotkeyAt = new Map(); // hotkey: ruleId -> ms (auto-repeat guard)
  }
  async fire(rule, out) {
    try { await this.dispatch(rule.action, rule); out.push({ ruleId: rule.id, name: rule.name, ok: true }); }
    catch (e) { out.push({ ruleId: rule.id, name: rule.name, ok: false, error: String(e && e.message || e) }); }
  }
  // One evaluation pass. signals: {idleMs, runningApps|null}. Returns the
  // list of rules that fired (with per-rule success), never throws.
  async tick(rules, signals = {}) {
    const out = [];
    const now = this.now();
    const enabled = (Array.isArray(rules) ? rules : []).filter((r) => r && r.enabled !== false);
    // --- idle bookkeeping (before rules, so arming uses this tick's data)
    const idleMs = Number(signals.idleMs);
    if (Number.isFinite(idleMs)) {
      const anyIdle = enabled.some((r) => r.trigger.type === 'idle');
      if (anyIdle) {
        const minThreshold = Math.min(...enabled.filter((r) => r.trigger.type === 'idle').map((r) => r.trigger.idleMinutes)) * 60000;
        if (idleMs < minThreshold) { this.seenActive = true; for (const r of enabled) if (r.trigger.type === 'idle') this.idleArmed.add(r.id); }
      }
    }
    // --- app-launch baseline
    let runningSet = null;
    if (Array.isArray(signals.runningApps)) {
      runningSet = new Set(signals.runningApps.map((x) => String(x).toLowerCase()));
      if (this.prevApps === null) this.prevApps = runningSet; // first sighting is the baseline: nothing "launched"
    }
    for (const rule of enabled) {
      const t = rule.trigger;
      if (t.type === 'at-time') {
        if (hhmm(now) === t.time && this.firedDay.get(rule.id) !== dayKey(now)) {
          this.firedDay.set(rule.id, dayKey(now));
          await this.fire(rule, out);
        }
      } else if (t.type === 'app-launch') {
        if (runningSet && this.prevApps && runningSet.has(t.app.toLowerCase()) && !this.prevApps.has(t.app.toLowerCase())) {
          await this.fire(rule, out);
        }
      } else if (t.type === 'idle') {
        if (this.seenActive && this.idleArmed.has(rule.id) && Number.isFinite(idleMs) && idleMs >= t.idleMinutes * 60000) {
          this.idleArmed.delete(rule.id);
          await this.fire(rule, out);
        }
      }
    }
    if (runningSet) this.prevApps = runningSet;
    return out;
  }
  // Entry point for main's globalShortcut registrations.
  async hotkey(rules, accelerator) {
    const out = [];
    const want = String(accelerator || '').trim().toLowerCase();
    const now = this.now();
    for (const rule of (Array.isArray(rules) ? rules : [])) {
      if (!rule || rule.enabled === false || rule.trigger.type !== 'hotkey') continue;
      if (String(rule.trigger.accelerator).trim().toLowerCase() !== want) continue;
      if (now - (this.lastHotkeyAt.get(rule.id) || 0) < 800) continue; // auto-repeat guard
      this.lastHotkeyAt.set(rule.id, now);
      await this.fire(rule, out);
    }
    return out;
  }
}

module.exports = { TRIGGER_TYPES, ACTION_TYPES, saneRule, WorkflowStore, WorkflowEngine };
