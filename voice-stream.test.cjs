const { test } = require('node:test'), a = require('node:assert/strict');
const { VoiceSession } = require('./voice-session.cjs');
const { splitSentences } = require('./speech-chunker.cjs');

// VoiceSession with a streaming synthesizer: sentence 1 must be PLAYED
// before the full reply has been synthesized (time-to-first-sentence),
// and Stop/barge-in must cancel the rest of the queue.
function fixture({ delayMs = 5 } = {}) {
  const calls = [];
  const io = {
    startMic: async () => calls.push('mic-on'), stopMic: async () => calls.push('mic-off'),
    cancelAudio: () => calls.push('cancel-audio'),
    transcribe: async () => 'hello', reply: async () => 'One. Two. Three.',
    synthesize: async () => { throw Error('whole-reply synthesize must not be used when streaming exists'); },
    synthesizeStream: async function* (text) {
      for (const s of splitSentences(text)) { await new Promise((r) => setTimeout(r, delayMs)); calls.push('synth:' + s); yield 'audio:' + s; }
    },
    play: async (audio) => calls.push('play:' + audio),
  };
  return { calls, io };
}
test('streaming: sentences are synthesized and played in order, first audio early', async () => {
  const f = fixture(), s = new VoiceSession(f.io);
  await s.start();
  await s.utterance([0]);
  const order = f.calls.filter((c) => c.startsWith('synth:') || c.startsWith('play:'));
  a.deepEqual(order, ['synth:One.', 'play:audio:One.', 'synth:Two.', 'play:audio:Two.', 'synth:Three.', 'play:audio:Three.']);
  a.equal(s.phase, 'listening');
  await s.stop();
});
test('streaming: barge-in discards the remaining sentence queue', async () => {
  const f = fixture({ delayMs: 20 }), s = new VoiceSession(f.io);
  await s.start();
  const p = s.utterance([0]);
  await new Promise((r) => setTimeout(r, 30)); // first sentence is playing/synthesizing
  s.speechStart(); // user barges in
  await p;
  const played = f.calls.filter((c) => c.startsWith('play:'));
  a.ok(played.length <= 1, 'only the first sentence may have played, got ' + played.join(','));
  a.equal(s.phase, 'listening');
  await s.stop();
});
test('non-streaming io keeps the original whole-reply path', async () => {
  const calls = [];
  const io = {
    startMic: async () => {}, stopMic: async () => {}, cancelAudio: () => {},
    transcribe: async () => 'hi', reply: async () => 'hello',
    synthesize: async () => { calls.push('synthesize'); return 'audio'; },
    play: async () => calls.push('play'),
  };
  const s = new VoiceSession(io);
  await s.start(); await s.utterance([0]);
  a.deepEqual(calls, ['synthesize', 'play']);
  await s.stop();
});
