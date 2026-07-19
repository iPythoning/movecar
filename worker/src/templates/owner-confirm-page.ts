import { escapeHtml } from '../lib/html'
import type { Locale, Messages } from '../lib/i18n'
import { htmlLang } from '../lib/i18n'

interface OwnerConfirmProps {
  token: string
  notificationId: string
  message?: string
  requesterLocation?: { lat: number; lng: number }
  locale: Locale
  messages: Messages
}

export function renderOwnerConfirmPage(p: OwnerConfirmProps): string {
  const { messages: m, locale, token, notificationId, message, requesterLocation } = p
  const mapLink = requesterLocation
    ? `https://maps.google.com/?q=${requesterLocation.lat},${requesterLocation.lng}`
    : null

  return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(m.owner.title)} · MoveCar</title>
<style>${OWNER_CSS}</style>
</head>
<body>
<main class="container">
  <header class="card header">
    <div class="icon-wrap"><span>📣</span></div>
    <h1>${escapeHtml(m.owner.title)}</h1>
    <p>${escapeHtml(m.owner.subtitle)}</p>
  </header>

  ${message ? `<section class="card"><div class="label">${escapeHtml(m.owner.requesterMessage)}</div><div class="msg">${escapeHtml(message)}</div></section>` : ''}

  ${
    mapLink
      ? `<section class="card">
          <div class="label">${escapeHtml(m.owner.requesterLocation)}</div>
          <a href="${mapLink}" target="_blank" rel="noopener" class="map-link">
            <span class="map-icon">🗺️</span>
            <span>${escapeHtml(m.owner.requesterLocation)} →</span>
          </a>
        </section>`
      : ''
  }

  <form id="reply-form" class="stack">
    <div class="card">
      <div class="quick-replies">
        <button type="button" class="chip" data-reply="${escapeHtml(m.owner.quickReplies.coming)}">${escapeHtml(m.owner.quickReplies.coming)}</button>
        <button type="button" class="chip" data-reply="${escapeHtml(m.owner.quickReplies.tenMin)}">${escapeHtml(m.owner.quickReplies.tenMin)}</button>
        <button type="button" class="chip" data-reply="${escapeHtml(m.owner.quickReplies.cannot)}">${escapeHtml(m.owner.quickReplies.cannot)}</button>
      </div>
      <textarea id="reply" maxlength="500" placeholder="${escapeHtml(m.owner.customReplyPlaceholder)}"></textarea>
      <label class="share-loc">
        <input type="checkbox" id="share-loc">
        <span>${escapeHtml(m.owner.shareLocation)}</span>
      </label>
    </div>

    <button type="submit" class="btn-main" id="submit-btn">${escapeHtml(m.owner.submit)}</button>
  </form>

  <section id="done-card" class="card hidden">
    <h2>${escapeHtml(m.owner.doneTitle)}</h2>
    <p>${escapeHtml(m.owner.doneBody)}</p>
  </section>
</main>

<script>
(() => {
  const TOKEN = ${JSON.stringify(token)};
  const NOTIF_ID = ${JSON.stringify(notificationId)};
  const chips = document.querySelectorAll('.chip');
  const textarea = document.getElementById('reply');
  const shareLoc = document.getElementById('share-loc');
  const form = document.getElementById('reply-form');
  const submit = document.getElementById('submit-btn');
  const doneCard = document.getElementById('done-card');

  chips.forEach((c) => c.addEventListener('click', () => {
    const v = c.getAttribute('data-reply') || '';
    textarea.value = v;
  }));

  function getPos() {
    return new Promise((resolve) => {
      if (!shareLoc.checked || !('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 4000, maximumAge: 60000 }
      );
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reply = textarea.value.trim();
    if (!reply) { textarea.focus(); return; }
    submit.disabled = true;

    const ownerLocation = await getPos();
    try {
      const res = await fetch('/api/owner-confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          oneTimeToken: TOKEN,
          notificationId: NOTIF_ID,
          ownerReply: reply,
          ownerLocation,
        }),
      });
      if (!res.ok) throw new Error('status ' + res.status);
      form.classList.add('hidden');
      doneCard.classList.remove('hidden');
    } catch (err) {
      submit.disabled = false;
      alert('Failed: ' + (err && err.message || err));
    }
  });
})();
</script>
</body></html>`
}

export function renderOwnerInvalidPage(locale: Locale, messages: Messages): string {
  const m = messages.owner
  return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(m.invalidTitle)}</title>
<style>${OWNER_CSS}
.invalid { text-align: center; }
.invalid h1 { font-size: clamp(22px,5.5vw,30px); margin-bottom: 12px; }
.invalid p { color: var(--muted); }
</style>
</head>
<body>
<main class="container">
  <div class="card invalid">
    <div class="icon-wrap"><span>⏳</span></div>
    <h1>${escapeHtml(m.invalidTitle)}</h1>
    <p>${escapeHtml(m.invalidBody)}</p>
  </div>
</main>
</body></html>`
}

const OWNER_CSS = `
:root {
  --primary: #6366f1;
  --primary-2: #8b5cf6;
  --text: #1a202c;
  --muted: #718096;
  --card-bg: rgba(255,255,255,0.95);
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
html { font-size: 16px; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(160deg, var(--primary) 0%, var(--primary-2) 100%);
  min-height: 100vh; padding: clamp(16px,4vw,24px); color: var(--text);
}
.container { max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; gap: clamp(12px,3vw,20px); }
.stack { display: flex; flex-direction: column; gap: clamp(12px,3vw,20px); }
.card {
  background: var(--card-bg);
  border-radius: clamp(20px,5vw,28px); padding: clamp(18px,4vw,28px);
  box-shadow: 0 10px 40px rgba(99,102,241,0.25);
}
.hidden { display: none !important; }
.header { text-align: center; background: white; }
.icon-wrap {
  width: clamp(72px,18vw,100px); height: clamp(72px,18vw,100px);
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  border-radius: clamp(22px,5vw,32px);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto clamp(14px,3vw,24px);
  box-shadow: 0 12px 32px rgba(99,102,241,0.35);
}
.icon-wrap span { font-size: clamp(36px,9vw,52px); }
.header h1 { font-size: clamp(22px,5.5vw,30px); font-weight: 700; margin-bottom: 6px; }
.header p { font-size: clamp(13px,3.5vw,16px); color: var(--muted); font-weight: 500; }
.label { font-size: 13px; color: var(--muted); font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
.msg { font-size: clamp(15px,4vw,18px); line-height: 1.5; }
.map-link {
  display: flex; align-items: center; gap: 12px;
  color: var(--primary); text-decoration: none; font-weight: 600;
  padding: 12px; background: rgba(99,102,241,0.08); border-radius: 12px;
}
.map-icon { font-size: 24px; }
.quick-replies { display: flex; gap: clamp(6px,2vw,10px); flex-wrap: wrap; margin-bottom: 14px; }
.chip {
  background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
  color: #5b21b6;
  padding: clamp(8px,2vw,12px) clamp(12px,3vw,18px);
  border-radius: 20px; border: 1px solid #c4b5fd;
  font-size: clamp(13px,3.5vw,15px); font-weight: 600;
  min-height: 44px; cursor: pointer;
}
textarea {
  width: 100%; min-height: clamp(80px,18vw,110px);
  border: 1px solid #e2e8f0; border-radius: 12px;
  padding: clamp(12px,3vw,18px);
  font-size: clamp(15px,4vw,18px); font-family: inherit;
  resize: none; outline: none; color: var(--text);
  line-height: 1.5; margin-bottom: 12px;
}
textarea:focus { border-color: var(--primary); }
.share-loc { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); cursor: pointer; }
.share-loc input { width: 18px; height: 18px; cursor: pointer; }
.btn-main {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: white; border: none;
  padding: clamp(16px,4vw,22px); border-radius: clamp(16px,4vw,22px);
  font-size: clamp(16px,4.2vw,20px); font-weight: 700; cursor: pointer;
  box-shadow: 0 10px 30px rgba(99,102,241,0.35); min-height: 56px;
}
.btn-main:disabled { opacity: 0.6; cursor: wait; }
`
