const { test } = require('node:test'); const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { resolveEngine, decodeWav, ChatterboxSidecar, createVoiceEngine } = require('./voice-clone.cjs');

function wav16(samples, sampleRate = 24000, channels = 1) {
  const data = Buffer.alloc(samples.length * 2 * channels);
  samples.forEach((s, i) => { for (let c = 0; c < channels; c++) data.writeInt16LE(Math.round(s * 32767), (i * channels + c) * 2); });
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36, 'latin1'); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
// Fake sidecar process speaking Viktor's line protocol.
function fakeChild(script, { ready = true } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.killed = false;
  child.stdin = { write(line) { const req = JSON.parse(line); const out = script(req); if (out !== null) queueMicrotask(() => child.stdout.emit('data', JSON.stringify(out) + '\n')); } };
  child.kill = () => { child.killed = true; };
  if (ready) queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ ready: true }) + '\n'));
  return child;
}

test('engine resolution: known engines pass, anything else falls back to kokoro', () => {
  assert.equal(resolveEngine({ voiceEngine: 'chatterbox' }), 'chatterbox');
  assert.equal(resolveEngine({ voiceEngine: 'system' }), 'system');
  assert.equal(resolveEngine({ voiceEngine: 'kokoro' }), 'kokoro');
  assert.equal(resolveEngine({ voiceEngine: 'nonsense' }), 'kokoro');
  assert.equal(resolveEngine({}), 'kokoro');
  assert.equal(resolveEngine(null), 'kokoro');
});
test('decodeWav: PCM16 mono round-trips; stereo mixes down; junk rejected', () => {
  const d = decodeWav(wav16([0, 0.5, -0.5, 1]));
  assert.equal(d.sampleRate, 24000); assert.equal(d.samples.length, 4);
  assert.ok(Math.abs(d.samples[1] - 0.5) < 0.001);
  const st = decodeWav(wav16([0.25], 16000, 2));
  assert.equal(st.samples.length, 1); assert.equal(st.sampleRate, 16000);
  assert.throws(() => decodeWav(Buffer.from('not a wav at all, nope nope nope')), /unreadable/);
});
test('dispatch: kokoro delegates to the injected worker call', async () => {
  let seen = null;
  const eng = createVoiceEngine({ getSettings: () => ({ voiceEngine: 'kokoro' }), kokoroSynthesize: async (t) => { seen = t; return { samples: [0], sampleRate: 24000 }; } });
  const r = await eng.synthesize('hello');
  assert.equal(seen, 'hello'); assert.equal(r.sampleRate, 24000);
});
test('dispatch: system returns the speechSynthesis marker without calling kokoro', async () => {
  let called = false;
  const eng = createVoiceEngine({ getSettings: () => ({ voiceEngine: 'system' }), kokoroSynthesize: async () => { called = true; } });
  const r = await eng.synthesize('hi there');
  assert.deepEqual(r, { system: true, text: 'hi there' }); assert.equal(called, false);
});
test('dispatch: chatterbox without a configured command fails honestly', async () => {
  const eng = createVoiceEngine({ getSettings: () => ({ voiceEngine: 'chatterbox', chatterboxCommand: '' }), kokoroSynthesize: async () => { throw Error('must not be called'); } });
  await assert.rejects(() => eng.synthesize('hello'), /not set up/);
});
test('sidecar: full speak round-trip with a fake runner', async () => {
  const wav = wav16([0.1, 0.2]);
  const sidecar = new ChatterboxSidecar({ command: 'fake-python', spawnFn: () => fakeChild(() => ({ ok: true, wav: 'C:\\voice\\say\\x.wav' })), readFileFn: () => wav });
  const r = await sidecar.speak('vanakkam');
  assert.equal(r.sampleRate, 24000); assert.equal(r.samples.length, 2);
});
test('sidecar: spawn failure and server error are honest failures', async () => {
  const enoent = new ChatterboxSidecar({ command: 'missing', spawnFn: () => { const c = fakeChild(() => null, { ready: false }); queueMicrotask(() => c.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))); return c; } });
  await assert.rejects(() => enoent.speak('hi'), /could not start/);
  const failing = new ChatterboxSidecar({ command: 'fake', spawnFn: () => fakeChild(() => ({ ok: false, error: 'model exploded' })), readFileFn: () => wav16([0]) });
  await assert.rejects(() => failing.speak('hi'), /model exploded/);
});

test('dispatch: voiceLang ta/tanglish routes to the Tamil branch on the kokoro path', async () => {
  let kokoroUsed = false;
  const eng = createVoiceEngine({
    getSettings: () => ({ voiceEngine: 'kokoro', voiceLang: 'tanglish' }),
    kokoroSynthesize: async () => { kokoroUsed = true; return { samples: [0], sampleRate: 24000 }; },
    tamilSynthesize: async (t) => ({ samples: [0.5], sampleRate: 22050, got: t }),
  });
  const r = await eng.synthesize('Seri bro');
  assert.equal(r.sampleRate, 22050); assert.equal(r.got, 'Seri bro'); assert.equal(kokoroUsed, false);
});
test('dispatch: Tamil failure falls back to Kokoro and fires the notice callback', async () => {
  let noticed = null;
  const eng = createVoiceEngine({
    getSettings: () => ({ voiceLang: 'ta' }),
    kokoroSynthesize: async () => ({ samples: [0], sampleRate: 24000 }),
    tamilSynthesize: async () => { throw Error('Tamil voice is not set up.'); },
    onTamilFallback: (e) => { noticed = e.message; },
  });
  const r = await eng.synthesize('Vanakkam');
  assert.equal(r.sampleRate, 24000); assert.match(noticed, /not set up/);
});
test('dispatch: explicit system/chatterbox engine wins over voiceLang', async () => {
  let tamilUsed = false;
  const eng = createVoiceEngine({
    getSettings: () => ({ voiceEngine: 'system', voiceLang: 'ta' }),
    kokoroSynthesize: async () => ({ samples: [0], sampleRate: 24000 }),
    tamilSynthesize: async () => { tamilUsed = true; return { samples: [0], sampleRate: 22050 }; },
  });
  const r = await eng.synthesize('hi');
  assert.equal(r.system, true); assert.equal(tamilUsed, false);
});
