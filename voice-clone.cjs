// Voice engine selection for spoken replies, ported from Viktor's
// voiceEngine preference (auto/chatterbox/basic). Shiba's engines:
//   'kokoro'    - the existing local Kokoro worker voice (default).
//   'system'    - the OS system voice (renderer speechSynthesis), the
//                 equivalent of Viktor's basic pyttsx3/SAPI fallback.
//   'chatterbox'- the optional cloned voice, via a LOCAL Chatterbox sidecar
//                 the user installs and configures himself. Nothing is
//                 bundled and nothing is downloaded by this app.
//
// The sidecar protocol is Viktor's, unchanged (voice/chatterbox_server.py):
// spawn the configured command once; the first stdout line must be
// {"ready":true} once the model is loaded; after that, one JSON line in
// ({"text":"..."}) gets one JSON line out: {"ok":true,"wav":"<path>"} or
// {"ok":false,"error":"..."}. The wav is read locally and decoded to the
// same {samples, sampleRate} shape the Kokoro worker returns.
//
// Honest failure is a feature: not configured, binary missing, server
// error, or an unreadable wav all reject with a plain in-app message -
// the voice call surfaces it instead of silently falling back or faking
// audio.
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const ENGINES = ['kokoro', 'system', 'chatterbox'];
function resolveEngine(settings) {
  const e = settings && settings.voiceEngine;
  return ENGINES.includes(e) ? e : 'kokoro';
}

// --- wav decode (pure) -----------------------------------------------------
// PCM 16-bit and IEEE float32 WAV -> mono Float32Array + sampleRate.
function decodeWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE')
    throw Error('Chatterbox returned an unreadable audio file.');
  let fmt = null, dataOff = -1, dataLen = 0;
  for (let off = 12; off + 8 <= buf.length;) {
    const id = buf.toString('latin1', off, off + 4), len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') { dataOff = off + 8; dataLen = Math.min(len, buf.length - dataOff); break; }
    off += 8 + len + (len % 2);
  }
  if (!fmt || dataOff < 0 || !fmt.channels || !fmt.sampleRate) throw Error('Chatterbox returned an unreadable audio file.');
  const ch = fmt.channels;
  let frames, read;
  if (fmt.format === 1 && fmt.bits === 16) { frames = Math.floor(dataLen / 2 / ch); read = (i, c) => buf.readInt16LE(dataOff + (i * ch + c) * 2) / 32768; }
  else if (fmt.format === 3 && fmt.bits === 32) { frames = Math.floor(dataLen / 4 / ch); read = (i, c) => buf.readFloatLE(dataOff + (i * ch + c) * 4); }
  else throw Error('Chatterbox audio format is not supported (need PCM16 or float32 WAV).');
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < ch; c++) s += read(i, c); samples[i] = s / ch; }
  return { samples, sampleRate: fmt.sampleRate };
}

// --- Chatterbox sidecar ----------------------------------------------------
class ChatterboxSidecar {
  constructor({ command, args = [], spawnFn = spawn, readFileFn = fs.readFileSync, readyTimeoutMs = 180000, speakTimeoutMs = 120000 } = {}) {
    this.command = typeof command === 'string' ? command.trim() : '';
    this.args = Array.isArray(args) ? args.map(String) : String(args || '').split(/\s+/).filter(Boolean);
    this.spawnFn = spawnFn; this.readFileFn = readFileFn;
    this.readyTimeoutMs = readyTimeoutMs; this.speakTimeoutMs = speakTimeoutMs;
    this.child = null; this.buffer = ''; this.waiters = [];
  }
  _failAll(err) { const w = this.waiters.splice(0); for (const x of w) { clearTimeout(x.timer); x.reject(err); } }
  _onData(chunk) {
    this.buffer += String(chunk);
    let i;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).trim(); this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      const w = this.waiters.shift();
      if (!w) continue;
      clearTimeout(w.timer);
      try { w.resolve(JSON.parse(line)); } catch { w.reject(Error('Chatterbox sidecar sent an unreadable reply.')); }
    }
  }
  _nextLine(timeoutMs, what) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { const i = this.waiters.findIndex((w) => w.timer === timer); if (i >= 0) this.waiters.splice(i, 1); reject(Error('Chatterbox sidecar timed out while ' + what + '.')); }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }
  async ensureStarted() {
    if (this.child) return;
    if (!this.command) throw Error('Chatterbox voice is not set up: add the sidecar command in the Brain drawer first.');
    let child;
    try { child = this.spawnFn(this.command, this.args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { throw Error('Chatterbox sidecar could not start. Check the command in the Brain drawer.'); }
    this.child = child; this.buffer = '';
    child.stdout.on('data', (c) => this._onData(c));
    child.on('error', () => { if (this.child === child) this.child = null; this._failAll(Error('Chatterbox sidecar could not start. Check the command in the Brain drawer.')); });
    child.on('exit', () => { if (this.child === child) this.child = null; this._failAll(Error('Chatterbox sidecar stopped.')); });
    const hello = await this._nextLine(this.readyTimeoutMs, 'loading the voice model');
    if (!hello || hello.ready !== true) { this.stop(); throw Error('Chatterbox sidecar did not report ready.'); }
  }
  async speak(text) {
    const t = String(text || '').trim();
    if (!t) throw Error('Nothing to speak.');
    await this.ensureStarted();
    const replyPromise = this._nextLine(this.speakTimeoutMs, 'speaking');
    try { this.child.stdin.write(JSON.stringify({ text: t.slice(0, 2500) }) + '\n'); }
    catch { throw Error('Chatterbox sidecar stopped.'); }
    const reply = await replyPromise;
    if (!reply || reply.ok !== true) throw Error('Chatterbox could not speak that: ' + ((reply && reply.error) || 'unknown error'));
    if (typeof reply.wav !== 'string' || !reply.wav) throw Error('Chatterbox returned no audio file.');
    let buf;
    try { buf = this.readFileFn(reply.wav); } catch { throw Error('Chatterbox audio file could not be read.'); }
    return decodeWav(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  }
  stop() { const c = this.child; this.child = null; this._failAll(Error('Chatterbox sidecar stopped.')); try { c && c.kill(); } catch {} }
}

// --- engine dispatch -------------------------------------------------------
// kokoroSynthesize(text) is the existing voice worker call, injected by main.
// Returns the worker/sidecar {samples, sampleRate}, or {system:true, text}
// for the system engine (the renderer speaks it via speechSynthesis).
function createVoiceEngine({ getSettings, kokoroSynthesize, sidecarFactory } = {}) {
  let sidecar = null;
  const makeSidecar = sidecarFactory || ((s) => new ChatterboxSidecar({ command: s.chatterboxCommand, args: s.chatterboxArgs }));
  return {
    async synthesize(text) {
      const settings = (typeof getSettings === 'function' ? getSettings() : {}) || {};
      const engine = resolveEngine(settings);
      if (engine === 'system') return { system: true, text: String(text || '') };
      if (engine === 'chatterbox') {
        if (!sidecar) sidecar = makeSidecar(settings);
        return sidecar.speak(text);
      }
      return kokoroSynthesize(text);
    },
    stopSidecar() { if (sidecar) { sidecar.stop(); sidecar = null; } },
  };
}

module.exports = { ENGINES, resolveEngine, decodeWav, ChatterboxSidecar, createVoiceEngine };
