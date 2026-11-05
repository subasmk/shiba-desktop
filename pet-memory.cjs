// Pet memory: things the user EXPLICITLY stated and asked the pet to keep.
// Stored locally only (in settings, same persistence pattern as pet-history).
//
// Capture rules (deliberately narrow):
//  - an explicit "remember this: ..." command, or
//  - simple stated-fact patterns: "my <thing> is <value>", "I like/love/
//    prefer <thing>".
// There is NO inference from behaviour, no browsing/app data, and anything
// that looks like a secret (password, OTP, card, PIN...) is refused, never
// stored. The existing "clear pet action memory" control clears this store
// too (wired in main), and recall only ever returns what is stored here.
const MAX_FACTS = 100, MAX_SUMMARIES = 30, MAX_TEXT = 200;
const SECRET_RE = /password|passcode|otp|one[- ]time|credit card|debit card|card number|cvv|pin number|aadhaar|ssn|secret key|api key/i;

function cleanText(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT); }

class PetMemory {
  constructor(saved = {}) {
    this.facts = [];
    this.summaries = [];
    if (saved && typeof saved === 'object') {
      if (Array.isArray(saved.facts)) for (const f of saved.facts) {
        if (f && typeof f.text === 'string' && f.text && !SECRET_RE.test(f.text))
          this.facts.push({ text: f.text.slice(0, MAX_TEXT), kind: f.kind === 'preference' ? 'preference' : 'fact', at: Number.isSafeInteger(f.at) ? f.at : 0 });
      }
      if (Array.isArray(saved.summaries)) for (const s of saved.summaries) {
        if (s && typeof s.text === 'string' && s.text) this.summaries.push({ date: String(s.date || '').slice(0, 10), text: s.text.slice(0, 800) });
      }
    }
    this.facts = this.facts.slice(-MAX_FACTS);
    this.summaries = this.summaries.slice(-MAX_SUMMARIES);
  }
  snapshot() { return { facts: this.facts.map((f) => ({ ...f })), summaries: this.summaries.map((s) => ({ ...s })) }; }
  hasFacts() { return this.facts.length > 0 || this.summaries.length > 0; }
  addFact(text, kind = 'fact', at = Date.now()) {
    const t = cleanText(text);
    if (!t) return { stored: false, why: 'empty' };
    if (SECRET_RE.test(t)) return { stored: false, why: 'sensitive' };
    if (this.facts.some((f) => f.text.toLowerCase() === t.toLowerCase())) return { stored: false, why: 'duplicate' };
    this.facts.push({ text: t, kind, at });
    if (this.facts.length > MAX_FACTS) this.facts.splice(0, this.facts.length - MAX_FACTS);
    return { stored: true, text: t };
  }
  // Try to capture an explicitly stated fact from one chat line.
  // Returns {stored, via:'command'|'pattern', text} or {stored:false}.
  capture(text, at = Date.now()) {
    const t = String(text || '').trim();
    if (!t || t.length > 1000) return { stored: false };
    let m = t.match(/^remember(?: this)?[:\-]\s*(.{2,200})$/i);
    if (m) { const r = this.addFact(m[1], 'fact', at); return { ...r, via: 'command' }; }
    m = t.match(/\bmy ([a-z][a-z /-]{1,30}?) is ([^.!?]{2,120})/i);
    if (m) { const r = this.addFact('User\'s ' + m[1].trim() + ' is ' + m[2].trim(), 'fact', at); return { ...r, via: 'pattern' }; }
    m = t.match(/\bi (?:really )?(like|love|prefer) ([^.!?]{2,80})/i);
    if (m) { const r = this.addFact('User ' + m[1].toLowerCase() + 's ' + m[2].trim(), 'preference', at); return { ...r, via: 'pattern' }; }
    return { stored: false };
  }
  addSummary(date, text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!t) return false;
    this.summaries.push({ date: String(date || '').slice(0, 10), text: t });
    if (this.summaries.length > MAX_SUMMARIES) this.summaries.splice(0, this.summaries.length - MAX_SUMMARIES);
    return true;
  }
  // Delimited block for the brain's context. Only stored items, clearly
  // marked as user-stated facts - matches the app's grounded style.
  recallBlock(maxFacts = 8) {
    if (!this.hasFacts()) return '';
    const lines = ['[PET MEMORY - facts the user explicitly stated and asked to remember. Use them only when relevant; never invent others.]'];
    const last = this.summaries[this.summaries.length - 1];
    if (last) lines.push('Last session (' + last.date + '): ' + last.text);
    for (const f of this.facts.slice(-maxFacts)) lines.push('- ' + f.text);
    lines.push('[/PET MEMORY]');
    return lines.join('\n');
  }
  clear() { this.facts = []; this.summaries = []; }
}

// End-of-session summary: ask the local brain for ONE short paragraph about
// the conversation, store it with the date. brainFn(messages) is injected
// (main wires it to the same local Ollama call as chat). Refuses to store
// anything that smells like a secret, and caps length.
async function summarizeSession(memory, lines, brainFn, dateStr) {
  const convo = (Array.isArray(lines) ? lines : []).filter((l) => l && typeof l.text === 'string').slice(-40);
  if (convo.length < 2 || typeof brainFn !== 'function') return false;
  const transcript = convo.map((l) => (l.role === 'user' ? 'User: ' : 'Pet: ') + l.text.slice(0, 300)).join('\n');
  const out = await brainFn([{ role: 'user', content: 'Summarize this chat in one short paragraph (max 60 words) for the pet\'s local memory. Only facts the user stated; no inventions.\n' + transcript }]);
  const text = String(out || '').replace(/\s+/g, ' ').trim();
  if (!text || SECRET_RE.test(text)) return false;
  return memory.addSummary(dateStr, text.slice(0, 800));
}

module.exports = { PetMemory, summarizeSession };
