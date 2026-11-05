# Shiba Desktop

A private desktop pet for Windows. Everything runs on your laptop: no account,
no telemetry, no paid service required.

## What it does

- Lives on your desktop; drag it, tap it, dock it. Remembers only pet action
  counts (taps, drags, timers, chats) on this laptop - never your files,
  browsing, messages, or app usage.
- Chat from the panel. Local brain: Ollama (installed and picked automatically
  at first run based on your free RAM, verified with a real probe chat).
  Optional cloud: your own OpenRouter key, free models only, per-send consent
  checkbox. If a request fails you get an honest error, never a silent mock.
- Voice call (optional): press Start once, then talk naturally - continuous
  turns, interrupt it mid-sentence and it stops and listens. Stop turns the
  microphone fully off. Mic is never on without Start. Speech-to-text
  (Whisper tiny) and text-to-speech (Kokoro) run 100% locally.
- Friendly roasts: short Tanglish teases come from fixed templates driven by
  real pet action counts only. The AI never invents your activity.
- App launching: ask it to open an installed app; launching uses a fixed
  local Start-menu path, the AI never runs commands.
- n8n shortcut: open your own local n8n (address must be localhost/127.0.0.1;
  external addresses are refused). This app does not install n8n or run
  workflows for you.
- Focus timer and notes, stored only on this laptop. Clear pet action memory
  any time from the Personality drawer.

## First run

Setup runs inside the app: downloads Ollama if needed, picks the largest brain
your free RAM can run (with a real verification chat), and downloads the local
voice models (Whisper tiny + Kokoro). No card, no account, no command line.

## Optional Tamil voice spike (experimental, not part of the default voice)

`node tools/tamil-voice-setup.cjs <dir>` downloads ta_IN-ValluvarNeural-medium
(pinned sha256), prepares tokens and metadata, and the spike harness proves
local Tamil speech via piper-phonemize + sherpa wasm. Limits: Tamil SCRIPT
only; Tanglish (Latin letters) is not converted - the bundled local brains
failed transliteration in testing, and no offline free verified route is
bundled yet. Voice provenance is unverified (self-declared license); personal
prototype use only.

## For developers

- `npm test` - unit suites (brain/session/history/apps).
- `npm run check` - syntax gate.
- E2E harnesses (not shipped in the package): voice-integration.cjs (full mic
  fixture -> ASR -> brain -> TTS -> playback), vi-interrupt.cjs (barge-in),
  vi-2turn.cjs (repeated turns), vi-realbrain.cjs (live Ollama in chain),
  packaged-voice-test.cjs (packaged binary voice smoke), t6-n8n.cjs (live n8n).
- Notices and license texts: NOTICES.md and licenses/.

## Honest limits

- Voice reply latency: TTS generation takes a few seconds on modest CPUs; it
  is a conversation, not a phone call.
- Echo handling depends on your mic/speakers; use headphones for best results.
- Cloud replies require your own key and send that message off-device with
  your consent each time.
