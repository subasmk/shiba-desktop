// Groq brain provider: Viktor Core's default cloud provider, ported as
// Shiba's third brain next to local Ollama (default) and OpenRouter.
// Groq speaks the same OpenAI-compatible chat API Viktor Core used
// (https://api.groq.com/openai/v1, default model llama-3.3-70b-versatile),
// so this is request shaping + reply parsing, nothing more exotic.
// Consent posture matches Shiba's OpenRouter mode exactly: the user's own
// key, stored via safeStorage (settings.groqSecret, handled in main like
// cloudSecret), and a per-message consent checkbox before anything is
// sent. Provider choice is per-message in the Brain drawer, so switching
// providers is hot - no restart, same as the existing local/cloud switch.
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function buildGroqRequest({ apiKey, model, messages, maxTokens = 180 } = {}) {
  return {
    url: GROQ_BASE + '/chat/completions',
    init: {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || GROQ_DEFAULT_MODEL, messages, max_tokens: maxTokens }),
    },
  };
}
// OpenAI-shaped reply: choices[0].message.content (Ollama's /api/chat uses
// message.content instead - main's chat handler already accepts both).
function parseGroqReply(json) {
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  return typeof content === 'string' && content ? content : 'No reply returned.';
}
async function groqChat({ apiKey, model, messages, fetchFn, signal, timeoutMs = 45000 } = {}) {
  if (!apiKey) throw Error('Add your own Groq key locally first.');
  const { url, init } = buildGroqRequest({ apiKey, model, messages });
  const f = fetchFn || fetch;
  const r = await f(url, { ...init, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw Error('Brain request failed (' + r.status + '). No paid fallback was attempted.');
  return parseGroqReply(await r.json());
}

module.exports = { GROQ_BASE, GROQ_DEFAULT_MODEL, buildGroqRequest, parseGroqReply, groqChat };
