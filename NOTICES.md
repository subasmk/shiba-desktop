# Third-party notices and obligations (Shiba Desktop, private prototype)

This file records verified license facts and OPEN obligations. It is not legal
advice and makes no claim that any particular distribution mode is compliant.
Verified 2026-11-04 against the upstream sources listed.

## Components shipped in the packaged app

1. sherpa-onnx (wasm runtime + native node addon), v2.0.1 - Apache License 2.0.
   Source: https://github.com/k2-fsa/sherpa-onnx (LICENSE verified verbatim).
   Obligation: retain license + NOTICE. Vendored copy: tts-wasm/NOTICE.txt.

2. Kokoro TTS model (kokoro-int8-multi-lang-v1_0) - Apache-2.0 licensed weights
   per the hexgrad/Kokoro-82M model card ("With Apache-licensed weights").
   Downloaded via k2-fsa's sherpa-onnx tts-models release (int8 quantization).
   Training data licenses vary by corpus; see the model card's data table.

3. OpenAI Whisper tiny (sherpa-onnx-whisper-tiny, int8) - MIT License
   (openai/whisper LICENSE verified verbatim).

4. ONNX Runtime (inside sherpa-onnx native/wasm builds) - MIT License
   (microsoft/onnxruntime LICENSE verified verbatim).

5. Electron / Chromium - MIT (electron LICENSE verified verbatim);
   Chromium components BSD-style; see LICENSES.chromium.html in the package.

6. Ollama (external, user-installed) - MIT + Open Rail-style model terms;
   qwen3 models: Apache-2.0 (Qwen). Not bundled by this app.

## Tamil spike route (NOT integrated; tools/tamil-voice-setup.cjs only)

7. piper-phonemize wasm (inside sherpa-onnx wasm release bundle) - the wasm
   STATICALLY LINKS espeak-ng, which is GNU GPL v3 (espeak-ng COPYING verified
   verbatim). Conveying that binary to third parties triggers GPLv3 obligations:
   provide the GPL text, corresponding source (or a written offer), and apply
   GPL to the covered combination. Whether any given delivery mode counts as
   conveyance is left OPEN here - do not assume a private repo delivery is
   exempt without checking; if in doubt, include the GPL text and source
   pointers regardless:
   - espeak-ng source: https://github.com/espeak-ng/espeak-ng
   - piper-phonemize source: https://github.com/rhasspy/piper-phonemize
   - sherpa-onnx wasm build: https://github.com/k2-fsa/sherpa-onnx

8. ta_IN-ValluvarNeural-medium Tamil voice - HF model card carries an
   "Apache 2.0" badge but the repo has NO LICENSE file and training data is
   undocumented. The license claim is the uploader's self-declaration;
   provenance unverified. Personal-prototype use only until clarified.
