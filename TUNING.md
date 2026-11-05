# Shiba Desktop — tuning guide

Starting values for the owner's laptop: **Ryzen 5 7235HS · 16 GB RAM ·
RTX 3050 (laptop)**. Every knob below trades quality against speed or
battery; the defaults are the safe middle. Change one thing at a time,
then run **Brain drawer → Run diagnostics** to confirm nothing broke.

## Brain model (`ollamaModel`, Brain drawer)

| Choice | Where it runs | Feel |
| --- | --- | --- |
| `qwen3:1.7b` (setup default) | CPU comfortably | Fast, short replies; banter quality is basic |
| `qwen3:4b` | CPU ok, GPU better | Noticeably better jokes/facts discipline |
| `qwen3:8b` | **RTX 3050 GPU** (Ollama offloads automatically when the model fits VRAM; a Q4 8B needs ~5–6 GB) | Best local replies; first token slower on CPU, fine on GPU |

Notes: Ollama decides CPU vs GPU offload itself — the app cannot force
or verify it, and diagnostics deliberately does not claim GPU use.
If replies feel slow, check `nvidia-smi` while chatting: if the model
is not on the GPU, the usual cause is VRAM pressure from a game.
Banter and summaries also use this model, so a bigger brain improves
the proactive lines too (the grounding filter still applies).

## Speech-to-text (Whisper)

The worker ships Whisper **tiny** (fast, ~1–2 s per utterance on CPU;
occasional mis-hears, and the wake-word matcher already tolerates
shiba/sheba/siba). A larger Whisper (base/small) would hear better —
including Tanglish — but costs several times the CPU per window, which
matters because the wake listener decodes a few windows per minute.
Tiny is the right default for an always-available pet; revisit only if
mis-hears annoy you in practice.

## Spoken replies (sentence chunking)

Replies are split into sentences (`speech-chunker.cjs`, max ~180 chars
per chunk) and synthesized one sentence ahead while the previous one
plays, so the first sound starts after sentence 1 instead of the whole
reply. On this tuning laptop expect the first audio in roughly
0.3–1.5 s for a typical first sentence (Kokoro on CPU). Shorter chunks
= faster first sound but choppier prosody and more per-call overhead;
the 180-char cap is the balance point. Barge-in and Stop cancel the
whole queue — if a stale sentence ever plays after Stop, that is a bug
to report, not a tuning issue.

## Vision comments (`contextVision`, `visionModel`, `visionIntervalSec`)

| Model | Size | Feel |
| --- | --- | --- |
| `moondream` (default) | ~1.7 GB | Fast scene lines; sometimes vague |
| `qwen2.5vl:7b` | ~6 GB | **Recommended on the RTX 3050**: much better at naming the app/content ("GTA 6 trailer"), still quick on GPU |

Interval: default **60 s** between screenshots. Lower (30 s) reacts
faster to scene changes but doubles vision GPU/CPU use and battery
drain; higher (120–300 s) is plenty if you only want occasional
comments. Screenshots are analyzed in memory and never stored.
The proactive engine's own caps (10-minute gap, 6/day, quiet hours)
apply on top, so a fast interval cannot make the pet chatty.

## Wake word (`wakeWord`)

The listener is energy-gated: audio windows open only when the room is
louder than the RMS threshold (0.025 in `voice-ui.js`), and windows cap
at ~2.4 s. In a noisy room (TV, fans), expect occasional false
triggers on "shiba"-like sounds — Ctrl+Shift+M is the instant mute.
If it misses soft speech, speak closer to the mic rather than lowering
the threshold (a lower threshold mostly buys false triggers).

## Roam / perch / cursor play

Roam checks every 50 ms but moves at most ~70 px/s walking (170 px/s
chasing) — CPU cost is negligible. Perch needs **context awareness
ON** (it reuses the foreground window's rect) and a window at least
~200 px wide; it leaves the title bar the moment the window moves,
closes, or loses focus. Cursor play rolls rarely by design
(~1 in 3 idle moves, 4 s max) so the pet never becomes a cursor pest.

## Tamil voice (experimental)

Valluvar (Piper medium) runs at 22 050 Hz on CPU through the WASM
runtime — synthesis is real-time-or-better for sentence-size chunks on
this laptop class. Tanglish quality is bounded by the transliterator's
dictionary (see `transliterate.cjs` limits): common words are exact,
unusual spellings are approximations. If a word always sounds wrong,
adding it to the dictionary in `transliterate.cjs` is a one-line fix.
