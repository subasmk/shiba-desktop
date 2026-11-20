# Relay

An experimental Windows desktop assistant for chat, voice, notes and everyday tools, with an animated companion on your desktop.

**Daru**, the horned hooded kid, is the only desktop companion. Rex, Dex and Ria animation assets are saved for future reuse in the private `relay-mascots-archive` repository.

This project is under active development. Implemented features are not a promise of reliable end-to-end behavior on every Windows machine.

## What Relay includes

- **Desktop companions:** drag, tap, resize, roam, perch on windows, or dock the mascot near the top-screen notch. Fast throws have bounded rebounds. Repeated interactions build annoyance; the screen-break effect ends with a one-second visual blackout, then returns automatically. Click or press Esc to dismiss it. It does not sleep or lock the computer.
- **Dashboard and notch:** a settings window, customizable action tiles, and CPU/RAM/battery information.
- **Chat:** local Ollama models, plus optional OpenRouter and Groq connections using your own keys and a cloud-consent gate for each message.
- **Voice:** local Whisper recognition and Kokoro speech, voice sessions, interruption handling, hold-to-talk, and an optional wake phrase. System voice and a separately configured Chatterbox sidecar are also available.
- **Notes, timers and routines:** local notes with search and pinning, focus timers, and saved app-launch routines.
- **Music:** queue YouTube links and save playlists. Screenshot imports create song titles that still need playable YouTube links.
- **Workflows:** rules triggered by time, foreground app, idle time or a hotkey, with actions such as speaking, launching apps, adding notes, playing music or posting to a configured Discord webhook. Relay must be running.
- **Optional awareness and vision:** foreground-app context, screen descriptions and pointing through a local Ollama vision model.
- **Optional online tools:** web search, page fetching and headline offers.
- **Optional power mode:** command execution and file tools. Commands and file writes require confirmation; file access is checked against allowed roots. These checks are guardrails, not a security sandbox.

The existing wake phrase remains **"Hey Daru"** for compatibility. Renaming the app does not change its voice trigger or the mascots' identities.

## Run from source

Windows is the intended target. Install Git, Node.js and npm, clone this repository, and run these commands from its directory:

```sh
npm ci
npm start
```

Do not enable power mode or add credentials to an untrusted checkout.

### Local AI and voice setup

Open the dashboard and choose **Run setup**. Setup checks available RAM, selects a local Ollama model and downloads brain/voice components. Internet access, disk space and time are needed for downloads; inference performance depends on your hardware.

Use **Brain** settings to check installed Ollama models. Vision requires its own compatible model; do not assume chat setup also installs vision.

Already have an Ollama model? Start Ollama, then open **Brain > Check installed models**, click the exact model name and **Save**. Text chat does not require Run setup. Run setup can choose/download a different recommended model; voice still needs its separate speech models.

If model discovery fails, the error appears below the button with the server address. Relay defaults to `http://127.0.0.1:11434`. A custom local port can be set with `OLLAMA_HOST` before launching Relay; discovery, chat, setup and vision use that same address. Remote hosts are not accepted for local processing.

Cloud chat is optional. Add your own provider key, select the provider and approve the message leaving your laptop. OpenRouter uses its free-router path; provider availability, quotas and pricing are outside this project's control. A failed request does not intentionally fall back to a paid model.

## Data and privacy

Local-first does not mean every feature stays offline.

| Feature | Data handling |
| --- | --- |
| Settings, pet memory/history, notes, playlists and workflows | Stored locally. Rex and Dex have separate pet memory and history stores. |
| Local chat and default voice | Use local Ollama and voice components after their dependencies/models are installed. |
| Cloud chat | Sends the message and app-generated prompt to the selected provider after the consent gate. |
| Context awareness | When enabled, keeps a bounded local history of foreground app names, window titles and activity categories. This is separate from pet action counts. |
| Vision and pointing | Process screen imagery with the configured local Ollama vision service. These capture paths use memory rather than saving image files. |
| Screen-break effect | Uses a temporary local screen image for the overlay, clears it at blackout and destroys the overlay on return. This path does not save, upload or log image contents. |
| Web tools, news, music and Discord | Contact external services. Discord messages and enabled workflow posts leave the device. |
| Provider keys and Discord webhook | Stored with Electron's OS-backed secure storage; saving is refused when secure storage is unavailable. |

On Windows, local app data remains under `%APPDATA%\shiba-desktop`. The repository name, package identifier and existing data directory are unchanged by Relay branding. Notes and workflow definitions are ordinary local JSON, not an encrypted vault. Do not put secrets in them.

An enabled wake phrase listens through the microphone. Hold-to-talk activates input, and a started voice session listens until stopped. Stop active input and disable wake listening when you want the microphone off; `Ctrl+Shift+M` controls wake-word muting.

Power mode can read/list files inside its allowed roots and run approved commands. Default roots include the home directory and Documents. Review commands and destinations before confirming; a denylist cannot make arbitrary commands safe.

## Current limits

- Windows-specific integration and packaged-app behavior need Windows testing. Linux UI recordings do not prove Windows rendering, microphone/audio, perching, app discovery or global key-release behavior.
- Mascots have different animation coverage and fallback art. Cursor play is currently disabled in the dashboard while its art is being rebuilt.
- Voice is experimental. Model loading, latency, interruption and echo handling depend on the machine and audio devices; headphones can help.
- Tamil/Tanglish voice uses a separately downloaded local model with English fallback. Reliable Latin-letter pronunciation/transliteration is not guaranteed. The Tamil model's provenance is not independently verified; treat it as a personal prototype component.
- Online services can fail or change. YouTube playback, search, cloud providers, feeds and Discord require their own network access and permissions.
- Windows packaging scripts exist, but this README does not promise a signed, release-ready installer.

## Development

```sh
npm run check   # JavaScript syntax checks
npm test        # Full listed unit-test suite
npm run test:ci # Narrower suite, excluding voice-backend.test.cjs
```

Some tests and UI/voice harnesses need models, audio fixtures, a graphical session or Windows. The full voice-backend tests require local model fixtures that are not guaranteed to be present. A CI pass does not establish working microphone/audio or visual correctness.

`npm run build:win` is the existing portable Windows packaging command. A branding or documentation change does not create or validate a new binary release.

## Third-party notices

See [NOTICES.md](NOTICES.md) and [licenses/](licenses/) for component notices. Do not infer a blanket license for this project or its artwork from a dependency's license.

## Ria, original pixel-girl mascot

Update with `git pull --ff-only`, then `npm start`. Open Settings > Pet behavior >
Mascot > **Ria - pixel girl**, then drag her out of the notch. Dex stays the default;
Rex and Dex retain their existing art and behavior. Ria is a provisional name.

Her four Polymation clips run offline in the bundled Rive canvas runtime:
Idle, Walk (also run/drag movement), Wave (greeting/landing), Cheer
(success/idea/celebration). The Pet behavior tab has four preview buttons.
Missing art, including sleep, sit, angry reactions and speech mouth shapes,
uses idle rather than borrowing Rex or Dex art. She still has drag, facing,
tap effects and the existing assistant tools. She has separate local memory
and history, a friendly/curious personality, and her own voice settings.
No Fish clone is supplied; configure a voice ID yourself if using Fish.

`relay-girl-source.png` is the original input, `relay-girl.riv` is the baked
asset, and `relay-girl-riv.js` embeds the same bytes for offline file loading.
Regenerate the embedding with `node tools/embed-riv.cjs`.
The runtime is @rive-app/canvas-single 2.51.0, a single-file build of Rive's
canvas renderer with wasm inlined. No CDN or Rive account is needed.

Verified in Electron on Linux, not on a real Windows desktop.
