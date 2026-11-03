# Verification

- `npm run check`: JavaScript syntax.
- `npm test`: URL scheme restrictions, local-only n8n address, free-only cloud model selection, screen-edge clamping.
- `node ui-test.cjs`: renderer with mocked IPC. Search filtering, note-save feedback, timer, supplied action requests, extraction request, truthful missing-Ollama error. Mock replies do not prove live inference.
- `xvfb-run -a node electron-test.cjs`: real Electron main/preload/renderers and real disk settings in isolated Linux environment. Two windows, secure IPC, persisted note, absent local service, drag state, landing/idle, collapse, click-not-open, explicit docking.

No target Windows/laptop test or successful cloud/local inference claimed. Credentials not configured. No unattended mic or computer-control tools. System speech not auditioned.

Also passed a local mocked Ollama HTTP-server protocol test: /api/tags, /api/chat payload, 2K context, non-streaming, no-thinking flag, reply parsing and cloud-without-consent rejection. This is not real inference. Real Electron extraction test now uses mouse down/move/up on the actual header, not only a synthetic IPC call. Screenshots inspected after final changes. The test runner occasionally reports terminated Electron helper children after assertions; do not confuse assertion pass with a clean process teardown on every run.

The authoritative app is the flat root layout. Old prefixed files and nested src/assets directories are upload remnants, not used by package.json or the app. Root core.test.cjs is the current helper test. Root ui-test.cjs, electron-test.cjs and brain-integration.cjs are the current integration harnesses. Run the mocked brain test with `xvfb-run -a node brain-integration.cjs`. No test needs a real API key. The Windows portable executable has been packaged locally but is not included in this repository or tested on Windows.
