import { escapeHtml } from '../lib/html'
import type { Locale, Messages } from '../lib/i18n'
import { htmlLang } from '../lib/i18n'

interface ScanPageProps {
  shortCode: string
  locale: Locale
  messages: Messages
  autoglobalUrl: string // https://autoglobal.ai
  templateId: string
}

/**
 * Scan landing page (requester facing). Server-rendered HTML, no React.
 * Autoglobal CTA is a big bottom third — this is the matrix entry point.
 */
export function renderScanPage(p: ScanPageProps): string {
  const { messages: m, shortCode, locale, autoglobalUrl } = p

  return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(m.scan.title)} · MoveCar</title>
<style>${SCAN_CSS}</style>
</head>
<body>
<main class="container">
  <header class="card header">
    <div class="icon-wrap"><span>🚗</span></div>
    <h1>${escapeHtml(m.scan.title)}</h1>
    <p>${escapeHtml(m.scan.subtitle)}</p>
  </header>

  <form id="notify-form" class="stack">
    <div class="card">
      <textarea id="message" maxlength="500" placeholder="${escapeHtml(m.scan.inputPlaceholder)}"></textarea>
      <div class="chips" role="group">
        <button type="button" class="chip" data-msg="${escapeHtml(m.scan.quickTags.blocked)}">${escapeHtml(m.scan.quickTags.blocked)}</button>
        <button type="button" class="chip" data-msg="${escapeHtml(m.scan.quickTags.shortPark)}">${escapeHtml(m.scan.quickTags.shortPark)}</button>
        <button type="button" class="chip" data-msg="${escapeHtml(m.scan.quickTags.noAnswer)}">${escapeHtml(m.scan.quickTags.noAnswer)}</button>
        <button type="button" class="chip" data-msg="${escapeHtml(m.scan.quickTags.urgent)}">${escapeHtml(m.scan.quickTags.urgent)}</button>
      </div>
    </div>

    <div class="card loc-card" id="loc-card">
      <div class="loc-icon">📍</div>
      <div class="loc-content">
        <div class="loc-title">${escapeHtml(m.scan.myLocation)}</div>
        <div class="loc-status" id="loc-status">…</div>
      </div>
    </div>

    <button type="submit" class="btn-main" id="submit-btn">${escapeHtml(m.scan.submit)}</button>
  </form>

  <section id="sent-card" class="card hidden" aria-live="polite">
    <h2>${escapeHtml(m.scan.sentTitle)}</h2>
    <p>${escapeHtml(m.scan.sentBody)}</p>
  </section>

  <!-- Autoglobal CTA: matrix-level strong placement -->
  <aside class="autoglobal-cta">
    <div class="autoglobal-title">${escapeHtml(m.scan.autoglobalCTATitle)}</div>
    <div class="autoglobal-body">${escapeHtml(m.scan.autoglobalCTABody)}</div>
    <a class="autoglobal-btn" href="${autoglobalUrl}?utm_source=movecar&utm_medium=scan&utm_campaign=matrix" target="_blank" rel="noopener">
      ${escapeHtml(m.scan.autoglobalCTAButton)}
    </a>
  </aside>
</main>

<script>
(() => {
  const SHORT_CODE = ${JSON.stringify(shortCode)};
  const STATUS_GRANTED = ${JSON.stringify(m.scan.locationGranted)};
  const STATUS_DENIED = ${JSON.stringify(m.scan.locationDenied)};
  const STATUS_WAITING = ${JSON.stringify(m.scan.waiting)};

  const statusEl = document.getElementById('loc-status');
  const chips = document.querySelectorAll('.chip');
  const textarea = document.getElementById('message');
  const form = document.getElementById('notify-form');
  const sentCard = document.getElementById('sent-card');
  const submitBtn = document.getElementById('submit-btn');

  let coords = null;
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        statusEl.textContent = STATUS_GRANTED;
      },
      () => { statusEl.textContent = STATUS_DENIED; },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  } else {
    statusEl.textContent = STATUS_DENIED;
  }

  chips.forEach((c) => c.addEventListener('click', () => {
    const v = c.getAttribute('data-msg') || '';
    textarea.value = textarea.value ? (textarea.value + ' ' + v) : v;
    textarea.focus();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = STATUS_WAITING;

    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shortCode: SHORT_CODE,
          message: textarea.value.trim() || undefined,
          requesterLocation: coords,
        }),
      });
      if (!res.ok) throw new Error('status ' + res.status);
      form.classList.add('hidden');
      sentCard.classList.remove('hidden');
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = ${JSON.stringify(m.scan.submit)};
      alert('Failed: ' + (err && err.message || err));
    }
  });
})();
</script>
</body></html>`
}

const SCAN_CSS = `
:root {
  --primary: #0093e9;
  --primary-2: #80d0c7;
  --text: #1a202c;
  --muted: #718096;
  --card-bg: rgba(255,255,255,0.95);
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
html { font-size: 16px; -webkit-text-size-adjust: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(160deg, var(--primary) 0%, var(--primary-2) 100%);
  min-height: 100vh;
  padding: clamp(16px, 4vw, 24px);
  color: var(--text);
}
.container { max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; gap: clamp(12px,3vw,20px); }
.stack { display: flex; flex-direction: column; gap: clamp(12px,3vw,20px); }
.card {
  background: var(--card-bg);
  border-radius: clamp(20px,5vw,28px);
  padding: clamp(18px,4vw,28px);
  box-shadow: 0 10px 40px rgba(0,147,233,0.2);
}
.hidden { display: none !important; }
.header { text-align: center; background: white; }
.icon-wrap {
  width: clamp(72px,18vw,100px); height: clamp(72px,18vw,100px);
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  border-radius: clamp(22px,5vw,32px);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto clamp(14px,3vw,24px);
  box-shadow: 0 12px 32px rgba(0,147,233,0.35);
}
.icon-wrap span { font-size: clamp(36px,9vw,52px); }
.header h1 { font-size: clamp(22px,5.5vw,30px); font-weight: 700; margin-bottom: 6px; }
.header p { font-size: clamp(13px,3.5vw,16px); color: var(--muted); font-weight: 500; }
textarea {
  width: 100%; min-height: clamp(90px,20vw,120px);
  border: none; padding: clamp(16px,4vw,24px) 0;
  font-size: clamp(15px,4vw,18px); font-family: inherit;
  resize: none; outline: none; color: var(--text); background: transparent;
  line-height: 1.5;
}
textarea::placeholder { color: #a0aec0; }
.chips { display: flex; gap: clamp(6px,2vw,10px); overflow-x: auto; padding-top: 8px; }
.chip {
  background: linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%);
  color: #00796b;
  padding: clamp(8px,2vw,12px) clamp(12px,3vw,18px);
  border-radius: 20px; border: 1px solid #80cbc4;
  font-size: clamp(13px,3.5vw,15px); font-weight: 600; white-space: nowrap;
  min-height: 44px; display: inline-flex; align-items: center; cursor: pointer;
}
.loc-card { display: flex; align-items: center; gap: clamp(10px,3vw,16px); min-height: 64px; }
.loc-icon {
  width: clamp(44px,11vw,56px); height: clamp(44px,11vw,56px);
  border-radius: clamp(14px,3.5vw,18px);
  display: flex; align-items: center; justify-content: center;
  font-size: clamp(22px,5.5vw,28px); background: #d4edda; flex-shrink: 0;
}
.loc-title { font-size: clamp(15px,4vw,18px); font-weight: 600; }
.loc-status { font-size: clamp(12px,3.2vw,14px); color: #28a745; margin-top: 3px; }
.btn-main {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: white; border: none;
  padding: clamp(16px,4vw,22px); border-radius: clamp(16px,4vw,22px);
  font-size: clamp(16px,4.2vw,20px); font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  box-shadow: 0 10px 30px rgba(0,147,233,0.35); min-height: 56px;
}
.btn-main:disabled { opacity: 0.6; cursor: wait; }
.autoglobal-cta {
  background: linear-gradient(135deg, #1a1f3a 0%, #2d3561 100%);
  color: white; border-radius: clamp(20px,5vw,28px);
  padding: clamp(24px,5vw,36px);
  margin-top: clamp(16px,4vw,24px);
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  text-align: center;
}
.autoglobal-title { font-size: clamp(18px,4.5vw,24px); font-weight: 700; margin-bottom: 8px; }
.autoglobal-body { font-size: clamp(14px,3.8vw,17px); opacity: 0.85; margin-bottom: 18px; line-height: 1.5; }
.autoglobal-btn {
  display: inline-block;
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.3);
  color: white; text-decoration: none;
  padding: clamp(12px,3vw,16px) clamp(20px,5vw,32px);
  border-radius: 999px;
  font-weight: 600; font-size: clamp(14px,3.8vw,16px);
  transition: background 0.2s;
}
.autoglobal-btn:hover { background: rgba(255,255,255,0.2); }
`

interface ExpiredPageProps {
  locale: Locale
  messages: Messages
  saasUrl: string
}

export function renderExpiredPage(p: ExpiredPageProps): string {
  const { messages: m, locale, saasUrl } = p
  return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(m.scan.expiredTitle)}</title>
<style>${SCAN_CSS}
.expired { text-align: center; }
.expired h1 { font-size: clamp(22px,5.5vw,30px); margin-bottom: 12px; }
.expired p { color: var(--muted); margin-bottom: 24px; }
.expired a {
  display: inline-block; background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none;
  font-weight: 600;
}
</style>
</head>
<body>
<main class="container">
  <div class="card expired">
    <div class="icon-wrap"><span>⚠️</span></div>
    <h1>${escapeHtml(m.scan.expiredTitle)}</h1>
    <p>${escapeHtml(m.scan.expiredBody)}</p>
    <a href="${saasUrl}/pricing">${escapeHtml(m.scan.expiredCTA)}</a>
  </div>
</main>
</body></html>`
}
