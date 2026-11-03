# Shiba Desktop

A small standalone desktop pet with a compact dark launcher. Separate from VIKTOR, Hermes, Telegram and OmniRoute. No streaming controls and no microphone recording.

## Included

- Top-edge ears, hover-reveal launcher, header drag-out and one desktop pet.
- Supplied drag, impact/tumble/landing, four-frame idle and action art. Six extra hand-authored dust-effect frames, not newly drawn body in-betweens.
- Searchable local actions, persistent quick note, focus timer and personality selection.
- ChatGPT browser shortcut. n8n accepts only a local address and checks that it responds before opening. It does not install n8n or create workflows.
- Local Ollama chat, default `qwen3:1.7b`, 2K context, brief replies. It never installs/pulls models automatically or controls the computer.
- Optional OpenRouter free-only chat. Explicit per-message cloud consent. No paid fallback, auto-recharge, tools or spending. Key encrypted with OS secure storage where available. No secrets stored in this repo.
- Optional read-aloud using installed system voices. Microphone remains off. Voice quality and availability vary by system.

## Controls

Hover the ears to reveal controls. Drag the header head onto the desktop. Click the pet for a reaction, never to open the dashboard. Right-click the pet or press Escape while it has focus to dock. Escape closes the launcher. Hover and docking are provisional implementation defaults because the reference did not establish those gestures.

## Run

Node.js 20 or newer: `npm ci`, then `npm start`. No administrator permission required. Windows portable build: `npm run build:win`. This app does not add startup tasks, terminate processes or change other assistants.

## Verification and limits

Syntax checks, pure security/helper tests, mocked renderer tests and a real Linux Electron smoke flow are included. See TESTING.md. Windows transparent-window behavior, actual laptop performance, cloud inference, local model inference and installed system voices must be tested on the target device. n8n/ChatGPT shortcut availability does not mean integrated automation. Laptop-hosted services need the laptop awake. The sprite art has sparse poses; dust/easing cannot replace missing hand-drawn body transitions.

## Sources

User-supplied Shiba sheets, cleaned locally. No new online art generation. Do not redistribute supplied art without verifying its rights.

Free access references: https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq ; https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform ; https://docs.n8n.io/deploy/host-n8n/community-edition-features ; https://openrouter.ai/docs/guides/routing/model-variants/free . Free services have limits and may change. n8n external nodes may still be paid.
