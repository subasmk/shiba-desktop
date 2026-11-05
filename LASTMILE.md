# Shiba Desktop — Last-mile pack (integration & polish)

Built on base `2ae5795a6ddc41d836dac10cc072ca73be14a424` (v0.2.0 +
Dexter pack `cbb7684d` + Viktor parity `e4220ae6` + 2 CI commits).
This pack wires the previously-seamed features into the shipped app:
Tamil/Tanglish voice in the main loop, vision-driven comments,
animation events, streaming chat + chunked speech, perch & cursor
play, self-diagnostics + tuning guide, and release polish. Nothing
here changes any existing default-off safety toggle.

## 1. Tanglish/Tamil voice in the main loop — SHIPPED + PROVEN

- New setting `voiceLang`: `'en'` (default, Kokoro exactly as before),
  `'ta'` (Tamil), `'tanglish'` (Latin-script Tamil input is run
  through `transliterate.cjs` first; Tamil-script input passes
  through untouched). Selectable in the Voice drawer and in the
  Brain drawer's guided card.
- Synthesis route (the spike's proven one, now in the shipped worker):
  `piper-phonemize` (WASM) phonemizes the Tamil text → phoneme
  codepoints → sherpa-onnx WASM VITS `generateWithConfig` with the
  `ta_IN-ValluvarNeural-medium` model. This WASM build has no espeak
  frontend, so model metadata alone cannot synthesize Tamil — the
  phonemizer step is mandatory, not optional.
- `tools/tamil-voice-setup.cjs` now prepares BOTH the model
  (sha256 pinned: `42b910a553962c11c78c994adb649c9e74c2f9b286a859706eb161b1645100c4`)
  and the phonemizer files, fetched from the sherpa-onnx v2.0.1
  release bundle (sha256 `dabcdcbde457756143a28e1b3d249dcee8899477774009fa53e9d01404bc4947`)
  into `<model-dir>/piper-phonemize/`. Verified end-to-end on Linux.
- Routing lives in `tamil-voice.cjs` (`resolveVoiceLang`,
  `prepareForLang`, `routeReply`) and `voice-clone.cjs`
  (`createVoiceEngine`): the Tamil branch engages only on the Kokoro
  path — an explicit System-voice or Chatterbox choice always wins.
  Tamil utterances go through the same playback + barge-in/cancel
  contract as Kokoro ones.
- Fallback is honest: if the Tamil model/phonemizer is missing or
  synthesis fails, the pet falls back to the English engine and says
  so (bubble via `onTamilFallback`) — never silent fake audio.
- PROOF (this Linux VM, through the NEW branch code, not the spike):
  - "Seri bro, timer start pannu." (`tanglish` → transliterated →
    Tamil voice): 2.00 s, 22050 Hz PCM16, RMS 0.0707, peak 0.450.
  - A Tamil-script sentence (`ta`): 2.15 s, RMS 0.0755, peak 0.484.
  Both non-silent, ffprobe-verified.

## 2. Vision → comments — SHIPPED

- `context.cjs`: the Windows foreground query now also returns the
  window rect (GetWindowRect); the snapshot carries `rect` and
  `sceneChangedAt`. Scene comparison is similarity-based (Jaccard
  ≥ 0.6 counts as the same scene), so model rephrasings of the same
  scene do NOT retrigger comments.
- `proactive.cjs`: new `scene-change` rule — fires only on a new app
  AND a fresh scene change, once per app+scene, 25-minute cooldown;
  the existing quiet-hours, daily-cap and spacing rules all apply.
- `banter.cjs`: the scene line is an allowed grounding fact (plus a
  small synonym map: trailer/watching → video, etc.). The grounding
  filter still rejects anything beyond the provided facts — invented
  apps, numbers and activities are rejected in tests.
- Settings: `visionModel` (default `moondream`; use `qwen2.5vl:7b`
  on the RTX 3050 for sharper descriptions) and `visionIntervalSec`
  (default 60, clamped 30–300). **Vision stays OFF by default**
  (`contextVision` unchanged).

## 3. Animation event wiring — SHIPPED

- All 17 animation GIFs now live at the repo root (14 copied in;
  `portal_travel`, `vanish`, `cursor_chase` were already there).
- New `anim-events.cjs`: a pure event → {gif, sprite, ms} map plus
  pure trigger helpers. Wired events: celebrate (focus complete),
  timer-ignored (rage), scene-change / proactive-comment (gesture
  point), power-run (hacking), roam leap/swing/climb/cursor/portal,
  wake summon, voice-listen start (charging/scan), tap combo
  (throw attack), drag drop (fall/getup), long idle (sleep), chat
  reaction (emote pack), idle breathe (default).
- The GIF layer is an overlay on the existing sprite system
  (`pet-gif` channel), so the two never fight: sprites remain the
  base, GIFs play as short event overlays and hand control back.

## 4. Speed — SHIPPED

- Streaming chat: new `chat-stream` IPC shares one handler with
  `chat`; providers stream via NDJSON (Ollama) / SSE (Groq,
  OpenRouter) and the renderer renders tokens incrementally
  (`chat-delta` events), falling back to the whole-reply path when a
  provider can't stream.
- `speech-chunker.cjs` (pure, unit-tested): sentence splitting that
  does not break on decimals or abbreviations and keeps lowercase
  Tanglish continuations in one breath. The voice session synthesizes
  sentence 1 immediately and queues the rest with 1-sentence
  prefetch; barge-in / Stop cancels the whole queue through the
  existing generation guards.
- Benchmark (THIS VM, CPU only, FAKE TTS at 40 ms + 8 ms/char —
  labeled, not a real-voice measurement): time-to-first-audio
  **145 ms chunked vs 1056 ms whole-reply (7.3×)** on a 127-char,
  4-sentence reply.
- GPU: no code fakes GPU use. Ollama decides offloading itself; see
  TUNING.md for the qwen3:8b-on-RTX-3050 recommendation.

## 5. Perch + cursor play — SHIPPED

- `roam.cjs` gains perch and chase states with pure geometry
  (`perchPosition`: title-bar top edge, 16 px overlap, clamped to
  the work area). The pet perches on the foreground window's title
  bar and leaves when the window moves > 6 px, the foreground app
  changes, roaming/perch is toggled off, or after 45 s.
- Cursor play: while roaming and idle, the pet may chase the cursor
  for a few seconds, then returns to roaming.
- Defaults and reasoning: **`perch` ON** — it is passive, instantly
  reversible, and is core Dexter behaviour; it only positions the
  pet window. **`cursorPlay` OFF** — it actively follows the user's
  own pointer, which can surprise or annoy mid-work, so it is
  opt-in. Both still require the roaming toggle.
- Non-Windows: rect/cursor come back null from the context poller,
  so both features are honestly unavailable there (no fake data).

## 6. Self-test + tuning — SHIPPED

- `selftest.cjs`: 9 pure checks over injected facts — Ollama
  reachable, brain model present, Groq key present if Groq selected
  (presence only, no live call), voice model files, Tamil model +
  phonemizer when `voiceLang` is ta/tanglish, vision model when
  vision is ON, mic enumerable, power-mode roots exist, toggle
  states. Each result is pass/warn/fail with a plain-language fix.
- Brain drawer → **Run diagnostics**: results render in a panel and
  are written to `userData/diagnostics.json`.
- `TUNING.md`: starting values for Ryzen 5 7235HS / 16 GB /
  RTX 3050 — brain model (qwen3:8b GPU vs 1.7b CPU), Whisper size,
  TTS chunking, vision interval, wake threshold 0.025 — with what
  each knob trades off.

## 7. Release polish — SHIPPED

- Brain drawer opens with a **"New in this build — guided tour"**
  card: wake word, proactive, context, vision (+ model & interval),
  perch, cursor play, voice language — one line each, toggles save
  instantly, **nothing is auto-enabled**.
- `package.json`: test script covers all 26 test files; build file
  list verified by an actual `electron-builder --linux dir` build —
  the packaged `app.asar` contains all 17 GIFs and
  `tools/tamil-voice-setup.cjs` (re-included after the `!tools/**`
  exclusion), plus selftest/anim-events/speech-chunker/TUNING.md.

## Defaults introduced by this pack

| Setting | Default | Why |
| --- | --- | --- |
| `voiceLang` | `'en'` | Kokoro behaviour unchanged unless chosen |
| `visionIntervalSec` | 60 (30–300) | One scene check a minute is plenty |
| `perch` | ON | Passive, reversible, core Dexter behaviour |
| `cursorPlay` | OFF | Actively follows the user's pointer — opt-in |
| `contextVision` | OFF (unchanged) | Screen reading is always opt-in |

## Remaining Windows-only verification

Not provable on this Linux VM — run on the laptop after pulling:

1. Tamil voice inside the **packaged** Windows build (WASM worker +
   phonemizer paths under `resources/`), including barge-in during a
   Tamil utterance.
2. Vision comments against a real screen (real Ollama vision model,
   real scene changes — e.g. open a trailer, then switch apps).
3. Perch on real windows (title-bar position, leave-on-move) and
   cursor play with a real pointer.
4. Wake-word false-trigger rate in a real room over a day.
5. Streaming chat against a live Groq key and local Ollama GPU
   offload (`nvidia-smi` while chatting).
6. Full packaged installer pass: install, first-run guided card,
   Run diagnostics with real Ollama/models present.
