# Shiba Desktop — Dexter Upgrade Pack (7 features)

Built on v0.2.0 (commit `2d782a45`). Every feature is its own module with unit
tests, wired into the existing app with minimal edits. The app's consent
posture is unchanged and extended to the new features: microphone still only
turns on with the voice-call Start button, vision is off by default, context
tracking is off by default, proactive comments are off by default, and pet
memory only stores what the user explicitly states.

## The 7 features

### 1. Context awareness — `context.cjs`
Polls the foreground window every 5 s on Windows via one fixed PowerShell
script (user32 `GetForegroundWindow`/`GetWindowText` + process name, same
`execFile` pattern as `apps.cjs`). Maintains `{app, title, activity, since,
dwellMs, recentChanges}` and emits change events. A pure classifier maps
app/title to `coding | video | game | music | browsing | other`. An optional
vision pass (Electron `desktopCapturer` → local Ollama vision model) stores a
one-line scene description in memory only — screenshots are never written to
disk. Non-Windows platforms get an honest stub (polling returns nothing).

Settings: `contextAware` (default **OFF** — foreground-app tracking changes
the app's previous "never tracks app usage" posture, so it is opt-in),
`contextVision` (default **OFF**, requires `contextAware`), `visionModel`
(default `moondream`; any local Ollama vision model name works).

### 2. Proactive engine — `proactive.cjs`
Decides unprompted comments from local signals (context + dwell, idle time,
time of day, focus-timer state, pet action counts). Rules are pure functions
of `(signals, now, state)`: master toggle `proactive` (default **OFF**),
quiet hours 23:00–07:00 (the late-night rule is the single exception — it
exists for those hours — and still respects caps), per-rule cooldowns,
10-minute global gap, cap of 6 comments/day, one at a time. Six starter
rules: morning greeting (once/day), focus-completed celebration (once per
finish, exempt from the global gap), timer-ignored nudge, long same-app
dwell, late-night, app-hopping. Lines are fixed templates built only from
the passed-in facts. Output goes to the existing speech bubble; it is spoken
aloud only while a voice call is live (main tracks a `voice-active` flag the
voice UI sets on Start/Stop; `pet-speak` events are ignored by the voice UI
unless its session is active and listening).

### 3. Tanglish voice — `transliterate.cjs` + `tamil-voice.cjs`
`transliterate.cjs` is a faithful port of the verified Python helper from the
TTS voice lab (same dictionary, same greedy longest-match rules, same
documented limits — e.g. `sapadu` → சபடு is an approximation).
`tamil-voice.cjs` is the wrapper seam for the experimental Tamil spike:
`prepareTamilText()` transliterates Latin-script input before the Tamil
model sees it (raw Latin is otherwise phonemized as English — proven in the
lab); Tamil-script input passes through untouched; mixed text converts only
the Latin runs. A `tamil-prepare` IPC channel exposes the conversion.

**Plug-in point (not yet wired into the live voice worker):** the shipped
worker serves Whisper STT + Kokoro TTS only. To make Tamil audible: prepare
the model with `tools/tamil-voice-setup.cjs`, then in the voice-synthesize
path add a `settings.voiceLang === 'ta'` branch that calls
`tamil-voice.synthesizeTamil()` with a sherpa-wasm engine loaded from the
prepared dir. Until that branch exists, `synthesizeTamil()` without an
injected engine fails with an honest setup message — it never fakes audio.
New setting: `voiceLang` (`'ta'` selects Tamil; unset = current behaviour).

### 4. Deeper PC control — `pc-control.cjs`
Fixed allowlist only. Every command is a pre-built PowerShell template in
the module — no free-form shell, no model-generated commands. Actions:
activate / minimize / close / arrange-left / arrange-right / arrange-max for
a named running app (names validated to a safe charset and single-quote
escaped), media play-pause / next / prev, volume up / down / mute. `close`
is confirm-first: `execute()` returns `confirm-required` and runs nothing
unless the caller passes `confirmed:true`. Calls are exposed over the
`pc-action` IPC channel and recorded in a bounded in-module action log
(action, target, ok/failed — nothing else). Non-Windows calls return
`windows-only`; anything outside the allowlist returns `refused`.

**Partial:** "open + arrange" combos are supported as data via
`buildCombo(steps)` (each step allowlist-checked; `open` steps stay with the
existing `apps.cjs` launcher). Routines in v0.2.0 store plain app-name lists
with no step runner, so combos are not yet executed from routines — the
builder and the seam are in place for when routines gain steps.

### 5. Free-roam body — `roam.cjs` (+ 3 GIFs)
Pure roam controller (same UMD shape as `pet-behavior.cjs`, also loaded by
`index.html`): idle at the bottom of the work area → portal vanish → portal
appear at a spawn point → walk along the bottom → idle. The driver lives in
`main.cjs` (not the renderer) because only the main process can move the pet
window; it ticks at 50 ms, clamps through the existing `petPosition()`, and
drives the existing `walk`/`portal` sprite animations. Roam pauses whenever
the pet is dragged, docked/hidden, or the window is not visible, and resumes
after. Toggle: the existing `roaming` setting, default **OFF** (v0.2.0 has a
`roaming` settings key but no roam/pause affordance in the UI patterns, so
off is the safe default). `portal_travel.gif`, `vanish.gif` and
`cursor_chase.gif` from the animation pack are included at the repo root for
the portal transitions — the app's own sprite pipeline may replace them.

### 6. Memory & continuity — `pet-memory.cjs`
Local store persisted in settings (`settings.petMemory`), mirroring the
pet-history pattern. Captures ONLY: an explicit `remember this: …` chat
command (confirmed back to the user with a fixed local reply), and simple
stated-fact patterns (`my X is …`, `I like/love/prefer …`). Anything that
looks like a secret (password, OTP, card, PIN, Aadhaar, API key…) is refused
at capture, at load, and in summaries. Recall injects a clearly delimited
`[PET MEMORY]` block into the chat system prompt with an explicit exception
sentence (the prompt otherwise forbids memory claims); the cloud chat path
receives it too when the user consents to cloud mode. After every 16 chat
lines, the local brain writes a one-paragraph session summary (stored with
its date, capped, secret-filtered). The existing "Clear pet action memory"
control now clears this store too.

### 7. Contextual banter — `banter.cjs`
Builds a grounded prompt from a signal snapshot (only facts passed in) and
asks the local Ollama brain for ONE short Tanglish/English tease. The output
passes a grounding filter: it is rejected if it mentions an app or activity
absent from the snapshot, invents a number, contains a link, or runs long.
On rejection, failure, or timeout the caller falls back to the fixed
template lines. When used by the proactive engine it inherits that engine's
toggles, cooldowns and caps; persona intensity follows the existing
`personality` setting.

## Modified existing files (kept minimal)
- `main.cjs` — requires + state; `save()` persists `petMemory`; monitor /
  engine constructed at startup; `clear-history` also clears pet memory;
  `pc-action`, `get-context`, `tamil-prepare` IPC + `voice-active` listener;
  `save-settings` allowlist extended (below); chat handler gains memory
  capture, recall injection, and session-summary trigger; focus-timer state
  tracked from existing `timer-start`/`timer-finish` pet events; three
  loops added (proactive 10 s, vision 60 s, roam 50 ms).
- `preload.cjs` — allowlists extended: send `voice-active`; invoke
  `pc-action`, `get-context`, `tamil-prepare`; event `pet-speak`.
- `voice-ui.js` — sends `voice-active` on Start/Stop/unload; speaks
  `pet-speak` lines only while its session is active and listening.
- `index.html` — loads `roam.cjs` alongside `pet-behavior.cjs`.
- `package.json` — `test`/`check` scripts extended to the new suites and
  modules; build `files` gains `*.gif`.

## New settings and defaults
| Setting | Default | Meaning |
| --- | --- | --- |
| `contextAware` | OFF | Foreground-app polling (Windows) |
| `contextVision` | OFF | Screenshot → local vision model (needs `contextAware`) |
| `visionModel` | `moondream` | Ollama vision model name |
| `proactive` | OFF | Unprompted pet comments |
| `voiceLang` | unset | `'ta'` selects the Tamil voice seam |
| `roaming` | OFF (existing key) | Free-roam body |

## Tested on this Linux VM vs must-test on Windows
Tested here: all unit suites (new: 33 tests; existing suites unchanged and
passing — see BUILD-LOG.md), `node --check` on every file, and a headless
Xvfb + Electron smoke run (app boots, panel renders, roam driver moves the
extracted pet along the bottom; the pet-extraction click was simulated in a
throwaway copy because the VM has no mouse user — shipped code untouched).

Must be tested on the Windows laptop: foreground-window polling (real
PowerShell/user32), `pc-action` window/media/volume control end-to-end,
screenshot capture + vision model pass, roam overlay behaviour over real
apps (always-on-top, multi-monitor), proactive speech during a live voice
call, Tamil engine wiring once the spike branch is added, and the packaged
build (`build:win`).
