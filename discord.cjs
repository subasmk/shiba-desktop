// Discord posting through an incoming webhook the USER creates in their
// own server (Discord: Server Settings -> Integrations -> Webhooks) and
// pastes into the dashboard. No webhook is bundled or invented here.
//
// The webhook URL is a credential - anyone holding it can post - so main
// stores it safeStorage-encrypted (settings.discordSecret, same pattern
// as the brain keys), never returns it to a renderer, and this module
// only ever receives it as an argument. The unconfigured state is a
// first-class honest result, never a fake send.
const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[\w.-]+$/;

function isWebhookUrl(u) { return WEBHOOK_RE.test(String(u || '').trim()); }

// Discord rejects empty content and caps a message at 2000 characters.
function buildPayload(text) {
  const content = String(text || '').trim().slice(0, 2000);
  if (!content) throw Error('Nothing to post - the message is empty.');
  return { content };
}

// Chat/voice command: "post to discord: <text>" (and close variants).
// Deliberately prefix-anchored so ordinary chat never posts by accident.
function parseDiscordIntent(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(?:post to discord|post in discord|discord post|discord):\s*(.{1,1800})$/i);
  return m ? m[1].trim() : null;
}

async function postToDiscord({ url, text, fetchFn = fetch, timeoutMs = 15000 } = {}) {
  if (!url) return { ok: false, reason: 'no-webhook', message: 'Discord webhook set pannala - add it in the dashboard (Features > Discord) first.' };
  if (!isWebhookUrl(url)) return { ok: false, reason: 'bad-webhook', message: 'The saved Discord webhook address does not look valid. Save it again in the dashboard.' };
  let payload;
  try { payload = buildPayload(text); } catch (e) { return { ok: false, reason: 'empty', message: e.message }; }
  let r;
  try {
    r = await fetchFn(String(url).trim(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) { return { ok: false, reason: 'network', message: 'Discord post failed: ' + e.message }; }
  if (r.ok || r.status === 204) return { ok: true };
  return { ok: false, reason: 'http-' + r.status, message: 'Discord refused the post (' + r.status + '). The webhook may have been deleted in Discord.' };
}

module.exports = { WEBHOOK_RE, isWebhookUrl, buildPayload, parseDiscordIntent, postToDiscord };
