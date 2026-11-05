# Shiba Desktop — Viktor Parity Pack

Viktor is retired; its remaining features are ported here, redesigned into
Shiba's CommonJS modules and consent posture. Built on the Dexter pack
(commit `cbb7684d`). Every feature is opt-in and off by default unless
noted; the mic, privacy and "no silent online" rules of the app are
unchanged.

## The 6 features

### 1. Wake word — `wakeword.cjs` (+ adapter in `voice-ui.js`)
Viktor's design, faithfully: there is no separate wake model — the app's
own Whisper transcription spots the phrase in short energy-gated windows
(Viktor's faster-whisper watcher worked exactly this way). The pure half
(phrase matching with ASR mis-hear tolerance — shiba|sheba|siba|sheeba —
plus the off → listening → triggered → cooldown state machine) lives in
`wakeword.cjs` and is unit-tested; the panel adapter captures the mic,
transcribes ~2.4 s windows via the existing `voice-transcribe` worker
call, and feeds the detector.

Rails (mandatory in the design): setting `wakeWord` default **OFF**; a
visible listening indicator whenever it runs (🎙 dot on the panel handle
and on the pet window); a global mute hotkey **Ctrl+Shift+M** (registered
in main only while the toggle is on) that kills the listener instantly;
a trigger may only **start** the normal voice call — the app's existing
Start/Stop, barge-in and generation-guard rules then apply. A command
spoken in the same breath ("Hey Shiba, what time is it") is sent to chat
once the call is up; otherwise the call simply opens and listens, like
Viktor's two-step flow.

Costs to know: while wake listening is on, the mic is open and Whisper
tiny decodes a few short windows per minute of speech — some CPU/battery.
The pet may also false-trigger on TV speech containing "shiba"; the
hotkey is the instant remedy.

### 2. Voice cloning option — `voice-clone.cjs`
A `voiceEngine` preference next to Viktor's (auto/chatterbox/basic):
- `kokoro` (default) — the existing local Kokoro worker voice.
- `system` — the OS system voice via renderer `speechSynthesis`
  (Viktor's "basic" equivalent).
- `chatterbox` — the cloned voice through a **local Chatterbox sidecar
  you configure**; nothing is bundled or downloaded. The protocol is
  Viktor's unchanged (`voice/chatterbox_server.py` from the Viktor repo):
  spawn once, first stdout line `{"ready":true}`, then one JSON line in
  (`{"text"}`) → one out (`{"ok":true,"wav":path}` / `{"ok":false,...}`).
  The WAV (PCM16/float32) is decoded to the worker's `{samples,
  sampleRate}` shape. Not configured / binary missing / server error all
  fail with a plain in-app error — no silent fallback, no fake audio.

To reuse Viktor's existing install: command
`D:\viktor-voice\venv\Scripts\python.exe`, arguments = the path to
`chatterbox_server.py` in your Viktor repo's `voice\` folder (its
`VIKTOR_VOICE_HOME` / D-drive layout keeps working, since the server is
Viktor's own script).

### 3. RSS scout — `scout.cjs`
Viktor's hardened scout, kept rule-for-rule: bounded public RSS/Atom
fetch; **36-hour freshness gate** (undated items are never offered);
recognizable-outlet scoring with hoax-bait demotion and keyword boosts
from your quick note; **at most one pending offer**, expiring after
2 minutes; an offered URL is never offered again. Offers are admitted
through the proactive engine's gates first (master toggle, quiet hours,
daily cap, global gap — via `admitExternal`), so the scout can never make
the pet chattier than proactive settings allow. The bubble shows the
destination host and "nothing else runs"; clicking it sends `scout-open`,
and main opens **only** the stored offer URL after re-validating it
(https only, no credentials, no control characters — the renderer never
supplies a URL).

Settings: `scout` default **OFF** (and it needs `proactive` on too),
`scoutFeeds` editable list, defaults are two Google News searches for
AI announcements / big tech launches and AI/ML news.

### 4. Power mode tools — `power-tools.cjs`
Viktor Core's tools as deterministic chat commands (same dispatch style
as app launching — the LLM never invents these calls):
`run command: <cmd>` (or `/run <cmd>`), `read file <path>`,
`list files in <path>`, `write file <path> with <content>`.
Layers, all enforced in the module: master toggle `powerMode` default
**OFF** (off = every tool refuses, nothing runs); Viktor Core's
destructive-pattern **denylist** ported verbatim plus three strengthenings
(`reg add`, `erase /s|/f|/q`, `rm -rf` anywhere); file tools confined to
**allowed roots** (`powerRoots` setting, default home + Documents —
paths resolved first, so `..` escapes refuse); `run_command` and
`write_file` need a **per-action confirmation** — chat replies with the
action summary, you reply `yes` within 60 s; every execution (done,
refused, declined, failed) lands in the module's bounded action log
(pc-control pattern).

### 5. Web tools — `web-tools.cjs`
Viktor Core's `web_search` (DuckDuckGo HTML, Viktor's parser) and
`web_fetch` (readable text, capped) as chat commands:
`search the web for <query>` / `web search <query>` / `search: <query>`,
and `fetch <https-url>` / `read page <https-url>`. (Bare "search X" is
deliberately not an intent — it would hijack in-app searches.)
Gate: settings `webTools` default **OFF** — your deliberate opt-in is
the online consent for these tools, mirroring how OpenRouter mode is
gated by its own enable + per-message consent. `web_fetch` is https-only
and refuses credentialed URLs.

### 6. Groq provider — `groq.cjs`
Viktor Core's default provider becomes Shiba's third brain: Brain drawer
mode **Groq cloud (opt-in)**, endpoint
`https://api.groq.com/openai/v1`, default model
**llama-3.3-70b-versatile** (`groqModel` setting). Your key is stored
exactly like the OpenRouter key (safeStorage-encrypted,
`settings.groqSecret`, never returned to the renderer), and the same
per-message consent checkbox rule applies before anything is sent.
Switching is per-message in the drawer — hot, no restart, consistent
with the existing local/cloud switch.

## Settings added (all in the Brain / Voice drawers)
`wakeWord` (OFF), `voiceEngine` (`kokoro`), `chatterboxCommand`,
`chatterboxArgs`, `scout` (OFF), `scoutFeeds` (AI/tech defaults),
`powerMode` (OFF), `powerRoots` (home + Documents), `webTools` (OFF),
`groqModel` (`llama-3.3-70b-versatile`), `groqSecret` (encrypted key).

## NOT ported
- **Hermes Agent dependency** — by design. Viktor was a face for Hermes;
  Shiba's built-in brain (Ollama / OpenRouter / now Groq) replaces it.
  Nothing here connects to a Hermes endpoint.

## What must be tested on the Windows laptop
Everything above is unit-tested here for its pure logic, and the app is
smoke-booted headlessly, but these paths only exist on Windows with real
hardware/accounts — verify them there:
1. **Wake-word mic loop**: enable it in the Voice drawer; the 🎙 dots
   show; "Hey Shiba" starts a call; Ctrl+Shift+M mutes instantly;
   Stop/re-Start behaves; false-trigger rate in a noisy room.
2. **Chatterbox sidecar**: point command/args at Viktor's install, pick
   the Chatterbox engine, take a voice call — first reply waits for the
   server's model load; also try a wrong path and confirm the honest
   error (not silence, not Kokoro) appears.
3. **Scout live feeds**: turn on Proactive + Scout; within a poll cycle
   a fresh headline bubble appears with its host; clicking opens only
   that link; ignoring it lets it expire.
4. **Power-mode execution**: `run command: ipconfig` → confirmation
   prompt → `yes` → output; `run command: shutdown /s` refuses even
   after yes; `read file` outside home/Documents refuses.
5. **Groq live call**: save a key, pick Groq mode, tick consent, send —
   and confirm a bad key produces the honest error line.
6. **Web tools live**: `search the web for …` with the toggle on vs the
   refusal with it off.
