const test = require('node:test');
const assert = require('node:assert/strict');
const { API_URL, MODELS, DEFAULT_MODEL, sanitizeVoiceId, sanitizeFishVoices, resolveFishVoice, resolveFishModel, fishSpeak } = require('./fish-voice.cjs');
const { resolveEngine, createVoiceEngine } = require('./voice-clone.cjs');

// Minimal PCM16 mono WAV, the shape decodeWav accepts.
function makeWav(samples = [0, 1000, -1000, 0], sampleRate = 22050) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0, 'latin1'); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1'); buf.writeUInt32LE(dataLen, 40);
  samples.forEach((s, i) => buf.writeInt16LE(s, 44 + i * 2));
  return buf;
}
const okFetch = (wav, seen) => async (url, opts) => {
  if (seen) { seen.url = url; seen.opts = opts; }
  return { ok: true, status: 200, arrayBuffer: async () => wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) };
};

test('sanitize: voice IDs accept token shapes and reject everything else', () => {
  assert.equal(sanitizeVoiceId('933563129e564b19a115bedd57b7406a'), '933563129e564b19a115bedd57b7406a');
  assert.equal(sanitizeVoiceId('  abc-DEF_123  '), 'abc-DEF_123');
  assert.equal(sanitizeVoiceId('https://fish.audio/voice/abc'), '');
  assert.equal(sanitizeVoiceId('my voice is rex'), '');
  assert.equal(sanitizeVoiceId('ab'), '');
  assert.equal(sanitizeVoiceId(''), '');
  assert.equal(sanitizeVoiceId(null), '');
  assert.equal(sanitizeVoiceId(42), '');
});

test('sanitize: per-assistant voices survive garbage settings', () => {
  assert.deepEqual(sanitizeFishVoices(null), { rex: '', dex: '', girl: '' });
  assert.deepEqual(sanitizeFishVoices({}), { rex: '', dex: '', girl: '' });
  assert.deepEqual(sanitizeFishVoices({ fishVoiceByMascot: 'nope' }), { rex: '', dex: '', girl: '' });
  assert.deepEqual(
    sanitizeFishVoices({ fishVoiceByMascot: { rex: 'rexvoice1', dex: 'not a voice id!' } }),
    { rex: 'rexvoice1', dex: '', girl: '' });
});

test('resolve: each assistant gets its own voice, unknown mascots use the Dex bucket', () => {
  const s = { fishVoiceByMascot: { rex: 'rexvoice1', dex: 'dexvoice1' } };
  assert.equal(resolveFishVoice(s, 'rex'), 'rexvoice1');
  assert.equal(resolveFishVoice(s, 'dex'), 'dexvoice1');
  assert.equal(resolveFishVoice(s, undefined), 'dexvoice1');
  assert.equal(resolveFishVoice({}, 'rex'), '');
});

test('resolve: model defaults to the free S2.1 Pro and rejects unknown models', () => {
  assert.equal(DEFAULT_MODEL, 's2.1-pro-free');
  assert.ok(MODELS.includes('s2.1-pro'));
  assert.equal(resolveFishModel({}), 's2.1-pro-free');
  assert.equal(resolveFishModel({ fishModel: 's2.1-pro' }), 's2.1-pro');
  assert.equal(resolveFishModel({ fishModel: 's1' }), 's2.1-pro-free');
  assert.equal(resolveFishModel(null), 's2.1-pro-free');
});

test('speak: missing key, missing voice and empty text are honest errors', async () => {
  await assert.rejects(() => fishSpeak({ apiKey: '', text: 'hi', referenceId: 'abc123' }), /not set up/);
  await assert.rejects(() => fishSpeak({ apiKey: 'K', text: 'hi', referenceId: '' }), /No Fish voice is set/);
  await assert.rejects(() => fishSpeak({ apiKey: 'K', text: '  ', referenceId: 'abc123' }), /Nothing to speak/);
});

test('speak: posts to the Fish API with the key, model header and the assistant voice', async () => {
  const wav = makeWav();
  const seen = {};
  const buf = await fishSpeak({ apiKey: 'TESTKEY', text: 'Vanakkam', referenceId: 'dexvoice1', fetchFn: okFetch(wav, seen) });
  assert.equal(seen.url, API_URL);
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers.Authorization, 'Bearer TESTKEY');
  assert.equal(seen.opts.headers.model, 's2.1-pro-free');
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.text, 'Vanakkam');
  assert.equal(body.reference_id, 'dexvoice1');
  assert.equal(body.format, 'wav');
  assert.ok(buf.equals(wav));
});

test('speak: rejected key, empty credit and network failures read plainly', async () => {
  const err = (status) => async () => ({ ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) });
  await assert.rejects(() => fishSpeak({ apiKey: 'K', text: 'hi', referenceId: 'abc123', fetchFn: err(401) }), /rejected the API key/);
  await assert.rejects(() => fishSpeak({ apiKey: 'K', text: 'hi', referenceId: 'abc123', fetchFn: err(402) }), /no credit/);
  await assert.rejects(() => fishSpeak({ apiKey: 'K', text: 'hi', referenceId: 'abc123', fetchFn: err(500) }), /refused the request \(500\)/);
  await assert.rejects(() => fishSpeak({ apiKey: 'K', text: 'hi', referenceId: 'abc123', fetchFn: async () => { throw Error('socket hang up'); } }), /could not be reached/);
});

test('engine: fish is a valid engine and dispatch speaks with the ACTIVE assistant voice', async () => {
  assert.equal(resolveEngine({ voiceEngine: 'fish' }), 'fish');
  const wav = makeWav([0, 2000, -2000, 0]);
  const seen = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = okFetch(wav, seen);
  try {
    const engine = createVoiceEngine({
      getSettings: () => ({ voiceEngine: 'fish', mascot: 'dex', fishModel: 's2.1-pro', fishVoiceByMascot: { rex: 'rexvoice1', dex: 'dexvoice1' } }),
      getFishKey: () => 'TESTKEY',
      kokoroSynthesize: async () => { throw Error('kokoro must not run on the fish engine'); },
    });
    const out = await engine.synthesize('Hello from Dex');
    assert.equal(out.sampleRate, 22050);
    assert.equal(out.samples.length, 4);
    assert.equal(JSON.parse(seen.opts.body).reference_id, 'dexvoice1');
    assert.equal(seen.opts.headers.model, 's2.1-pro');
    assert.equal(seen.opts.headers.Authorization, 'Bearer TESTKEY');
  } finally { globalThis.fetch = realFetch; }
});
