// NyXia · Super Admin 3 — Infolettres Systeme.io
// Isolé du Worker 1. Expéditeur figé : NyXia · Univers <info@universnyxia.top>

const SENDER_NAME = 'NyXia · Univers';
const SENDER_EMAIL = 'info@universnyxia.top';
const SYSTEME_API = 'https://api.systeme.io/api';
const JOURNAL_KEY = 'univers:sa3:journal';
const JOURNAL_MAX = 80;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function getTokenFromRequest(request) {
  const h = request.headers.get('X-Univers-Token');
  if (h) return h;
  const c = request.headers.get('Cookie') || '';
  const m = c.match(/(?:^|;\s*)nyxia_univers=([^;]+)/);
  return m ? m[1] : null;
}

async function requireAdmin(request, env) {
  const token = getTokenFromRequest(request);
  if (!token || !env.CASHFLOW_KV) return false;
  return !!(await env.CASHFLOW_KV.get('univers:session:' + token));
}

function systemeKey(env) {
  return env.SYSTEME_API_KEY || env.SYSTEMEIO_API_KEY || '';
}

async function systemeFetch(env, path, method = 'GET', body) {
  const key = systemeKey(env);
  if (!key) {
    const err = new Error('Clé SYSTEME_API_KEY absente des secrets Cloudflare.');
    err.status = 503;
    throw err;
  }
  const opts = {
    method,
    headers: {
      Accept: 'application/json',
      'X-API-Key': key
    }
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(SYSTEME_API + path, opts);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {
    data = { raw: text.slice(0, 800) };
  }
  if (!r.ok) {
    const err = new Error((data && (data.message || data.error || data.detail)) || ('Systeme.io ' + r.status));
    err.status = r.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function readJournal(env) {
  if (!env.CASHFLOW_KV) return [];
  try {
    const raw = await env.CASHFLOW_KV.get(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

async function pushJournal(env, entry) {
  if (!env.CASHFLOW_KV) return;
  const list = await readJournal(env);
  list.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  await env.CASHFLOW_KV.put(JOURNAL_KEY, JSON.stringify(list.slice(0, JOURNAL_MAX)));
}

function wrapHtml(bodyHtml, preview) {
  const inner = String(bodyHtml || '').trim();
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(preview || 'Infolettre NyXia')}</title></head><body style="margin:0;padding:0;background:#060A18;color:#F7F4FF;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#060A18;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0F1733;border:1px solid rgba(167,139,250,.28);border-radius:16px;">
<tr><td style="padding:28px 28px 8px;font-family:Inter,Arial,sans-serif;color:#F4C86A;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">NyXia · Univers</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:16px;line-height:1.7;color:#F7F4FF;">${inner}</td></tr>
<tr><td style="padding:0 28px 28px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#AAA6C7;">NyXia · Univers · info@universnyxia.top</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function paragraphsToHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p></p>';
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

async function handleStatus(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  return json({
    module: 'superadmin3',
    senderName: SENDER_NAME,
    senderEmail: SENDER_EMAIL,
    systemeKeyConfigured: !!systemeKey(env),
    note: 'Les tests d’envoi attendent que info@universnyxia.top soit vérifiée dans Systeme.io.'
  });
}

async function handleTags(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  try {
    const data = await systemeFetch(env, '/tags?limit=100');
    const items = data.items || data.data || data.tags || (Array.isArray(data) ? data : []);
    return json({ tags: items });
  } catch (e) {
    return json({ error: e.message, detail: e.payload || null, tags: [] }, e.status || 502);
  }
}

async function handleNewsletters(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  try {
    const data = await systemeFetch(env, '/newsletters?limit=30');
    const items = data.items || data.data || data.newsletters || (Array.isArray(data) ? data : []);
    return json({ newsletters: items });
  } catch (e) {
    return json({ error: e.message, detail: e.payload || null, newsletters: [] }, e.status || 502);
  }
}

async function handleDraft(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject || '').trim();
  const preview = String(body.preview || '').trim();
  const theme = String(body.theme || '').trim();
  const content = String(body.content || '').trim();
  const includeTagIds = Array.isArray(body.includeTagIds) ? body.includeTagIds : [];
  const excludeTagIds = Array.isArray(body.excludeTagIds) ? body.excludeTagIds : [];
  if (!subject) return json({ error: 'Le sujet est requis.' }, 400);
  if (!content) return json({ error: 'Le contenu est requis.' }, 400);

  const html = wrapHtml(paragraphsToHtml(content), subject);
  const payload = {
    subject,
    previewText: preview || theme || subject,
    editor: 'classic',
    senderName: SENDER_NAME,
    senderEmail: SENDER_EMAIL,
    html,
    content: html,
    includeTags: includeTagIds,
    excludeTags: excludeTagIds
  };

  try {
    const created = await systemeFetch(env, '/newsletters', 'POST', payload);
    await pushJournal(env, {
      action: 'draft',
      subject,
      theme,
      sender: SENDER_EMAIL,
      includeTagIds,
      excludeTagIds,
      systemeId: created && (created.id || created.newsletterId) || null
    });
    return json({ ok: true, newsletter: created, senderName: SENDER_NAME, senderEmail: SENDER_EMAIL });
  } catch (e) {
    await pushJournal(env, { action: 'draft_error', subject, theme, error: e.message });
    return json({ error: e.message, detail: e.payload || null, sentPayload: payload }, e.status || 502);
  }
}

async function handleJournal(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  return json({ journal: await readJournal(env) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/superadmin3/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    try {
      if ((path === '/' || path === '/status') && request.method === 'GET') return handleStatus(request, env);
      if (path === '/tags' && request.method === 'GET') return handleTags(request, env);
      if (path === '/newsletters' && request.method === 'GET') return handleNewsletters(request, env);
      if (path === '/draft' && request.method === 'POST') return handleDraft(request, env);
      if (path === '/journal' && request.method === 'GET') return handleJournal(request, env);
      return json({ error: 'Route Super Admin 3 inconnue.', path }, 404);
    } catch (e) {
      return json({ error: 'Erreur Super Admin 3.', detail: String(e.message || e) }, 500);
    }
  }
};
