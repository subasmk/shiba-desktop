// Self-test / diagnostics (last-mile item 6): one "Run diagnostics" pass
// that checks the whole feature stack and reports pass / warn / fail with
// a plain-language fix for anything wrong. Every check is a pure function
// of a `facts` object gathered by injected probes, so the logic is fully
// unit-testable without hardware: main.cjs gathers the real facts
// (Ollama status, model files on disk, settings, key presence), the
// renderer adds the microphone fact (only the renderer can enumerate
// devices), and this module judges them.
//
// A check only FAILs when a feature the user has actually enabled cannot
// work. Disabled optional features report 'pass' with an "off" note, or
// 'warn' when something is half-configured (e.g. Tamil selected but the
// model was never prepared) - warn means "works, but not the way you
// asked", fail means "broken".

function checkOllama(f) {
  if (!f.ollama || !f.ollama.running) return { status: 'fail', detail: 'Ollama is not reachable on this laptop.', fix: 'Install Ollama, open it once, then run First-run setup again.' };
  return { status: 'pass', detail: 'Ollama is running with ' + (f.ollama.models || []).length + ' model(s) installed.' };
}
function checkBrainModel(f) {
  const want = f.brainModel || 'qwen3:1.7b';
  const models = (f.ollama && f.ollama.models) || [];
  if (!f.ollama || !f.ollama.running) return { status: 'warn', detail: 'Cannot check the brain model while Ollama is down.', fix: 'Fix Ollama first, then re-run diagnostics.' };
  const present = models.some((m) => m === want || m.startsWith(want.split(':')[0] + ':'));
  return present
    ? { status: 'pass', detail: 'Brain model ' + want + ' is installed.' }
    : { status: 'fail', detail: 'Brain model ' + want + ' is not installed in Ollama.', fix: 'Run First-run setup, or in a terminal: ollama pull ' + want };
}
function checkGroq(f) {
  if (!f.groqSelected) return { status: 'pass', detail: 'Groq is not the selected brain (only checked when selected).' };
  if (!f.hasGroqKey) return { status: 'fail', detail: 'Groq is selected but no Groq key is saved.', fix: 'Brain drawer > Groq cloud: paste your key and save. (No test call was made - diagnostics never sends your key anywhere.)' };
  return { status: 'pass', detail: 'Groq key is saved. (Presence only - diagnostics makes no live Groq call without your consent.)' };
}
function checkVoiceModels(f) {
  if (!f.voice) return { status: 'warn', detail: 'Voice model status unknown.', fix: 'Re-run diagnostics; if it persists, run First-run setup.' };
  if (f.voice.ready) return { status: 'pass', detail: 'Whisper (ears) and Kokoro (voice) model files are present.' };
  return { status: 'fail', detail: 'Voice model files are missing: ' + (f.voice.missing || []).slice(0, 3).join(', ') + ((f.voice.missing || []).length > 3 ? '…' : ''), fix: 'Run First-run setup to download the free local voice models.' };
}
function checkTamil(f) {
  const lang = f.voiceLang || 'en';
  if (lang !== 'ta' && lang !== 'tanglish') return { status: 'pass', detail: 'Tamil voice is not selected (voice language: English).' };
  if (!f.tamilModelReady) return { status: 'warn', detail: 'Tamil/Tanglish voice is selected but the Tamil model is not prepared - replies will fall back to the English voice with a notice.', fix: 'Open the Voice session drawer and re-pick Tamil/Tanglish - the app downloads the model itself (one-time, ~150 MB, checksum-verified).' };
  if (f.tamilPhonemizerReady === false) return { status: 'warn', detail: 'Tamil model is prepared but the phonemizer files are missing (older setup run) - replies will fall back to the English voice with a notice.', fix: 'Open the Voice session drawer and re-pick Tamil/Tanglish - the app downloads the phonemizer itself.' };
  return { status: 'pass', detail: 'Tamil voice model (Valluvar) and phonemizer are prepared and ready.' };
}
function checkVision(f) {
  if (!f.visionOn) return { status: 'pass', detail: 'Screen vision comments are off.' };
  const model = f.visionModel || 'moondream';
  const models = (f.ollama && f.ollama.models) || [];
  if (!f.ollama || !f.ollama.running) return { status: 'warn', detail: 'Vision is on but Ollama is down, so no scene comments can be made.', fix: 'Start Ollama, then re-run diagnostics.' };
  const present = models.some((m) => m === model || m.startsWith(model.split(':')[0] + ':'));
  return present
    ? { status: 'pass', detail: 'Vision is on and model ' + model + ' is installed.' }
    : { status: 'fail', detail: 'Vision is on but model ' + model + ' is not installed in Ollama.', fix: 'In a terminal: ollama pull ' + model + ' (moondream is small; qwen2.5vl:7b is sharper on a gaming GPU).' };
}
function checkMic(f) {
  switch (f.mic) {
    case 'ok': return { status: 'pass', detail: 'A microphone is available to the app.' };
    case 'denied': return { status: 'fail', detail: 'Microphone permission is denied.', fix: 'Windows Settings > Privacy > Microphone: allow desktop apps, then restart Rex.' };
    case 'no-device': return { status: 'fail', detail: 'No microphone device was found.', fix: 'Plug in or enable a microphone, then re-run diagnostics.' };
    default: return { status: 'warn', detail: 'Microphone could not be checked from here.', fix: 'Open the Voice session drawer and press Start once - if the mic works there, this is fine.' };
  }
}
function checkPowerRoots(f) {
  const roots = Array.isArray(f.powerRoots) ? f.powerRoots : [];
  if (!roots.length) return { status: 'warn', detail: 'No power-mode folders are configured.', fix: 'Power mode file tools stay inside your home and Documents folders by default; nothing to do unless you changed them.' };
  const missing = roots.filter((r) => !r.exists);
  if (missing.length) return { status: 'warn', detail: 'These power-mode folders do not exist: ' + missing.map((r) => r.path).join(', '), fix: 'Create the folder(s), or leave it - file tools will simply refuse paths inside them.' };
  return { status: 'pass', detail: 'Power-mode folders all exist (' + roots.length + '). Power mode itself is ' + (f.powerMode ? 'ON' : 'off') + '.' };
}
function checkToggles(f) {
  const bits = [];
  bits.push('wake word ' + (f.wakeWord ? 'ON' : 'off'));
  bits.push('free roam ' + (f.roaming ? 'ON' : 'off'));
  bits.push('perch ' + (f.perch === false ? 'off' : 'ON'));
  bits.push('cursor play ' + (f.cursorPlay ? 'ON' : 'off'));
  return { status: 'pass', detail: 'Current switches: ' + bits.join(' · ') + '.' };
}

const CHECKS = [
  { id: 'ollama', label: 'Local brain service (Ollama)', run: checkOllama },
  { id: 'brain-model', label: 'Brain model installed', run: checkBrainModel },
  { id: 'groq', label: 'Groq key (only if Groq selected)', run: checkGroq },
  { id: 'voice-models', label: 'Voice models (Whisper + Kokoro)', run: checkVoiceModels },
  { id: 'tamil-model', label: 'Tamil voice model', run: checkTamil },
  { id: 'vision-model', label: 'Vision model (only if vision on)', run: checkVision },
  { id: 'mic', label: 'Microphone', run: checkMic },
  { id: 'power-roots', label: 'Power-mode folders', run: checkPowerRoots },
  { id: 'toggles', label: 'Feature switches', run: checkToggles },
];

// facts: {ollama:{running,models}, brainModel, groqSelected, hasGroqKey,
//   voice:{ready,missing}, voiceLang, tamilModelReady, tamilModelDir,
//   visionOn, visionModel, mic:'ok'|'denied'|'no-device'|'unknown',
//   powerRoots:[{path,exists}], powerMode, wakeWord, roaming, perch, cursorPlay}
function runSelfTest(facts = {}, { now = () => Date.now() } = {}) {
  const checks = CHECKS.map((c) => {
    let r;
    try { r = c.run(facts || {}); } catch (e) { r = { status: 'warn', detail: 'Check itself failed: ' + e.message, fix: 'Re-run diagnostics.' }; }
    return { id: c.id, label: c.label, status: r.status, detail: r.detail, fix: r.fix || null };
  });
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;
  return { at: new Date(now()).toISOString(), checks, summary, ok: summary.fail === 0 };
}

// One-line-per-check human summary (settings panel + saved report).
function formatReport(report) {
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
  const lines = ['Rex diagnostics - ' + report.at, 'Result: ' + report.summary.pass + ' pass, ' + report.summary.warn + ' warnings, ' + report.summary.fail + ' failures.'];
  for (const c of report.checks) {
    lines.push('[' + icon[c.status] + '] ' + c.label + ': ' + c.detail);
    if (c.fix && c.status !== 'pass') lines.push('       Fix: ' + c.fix);
  }
  return lines.join('\n');
}

module.exports = { CHECKS, runSelfTest, formatReport };
