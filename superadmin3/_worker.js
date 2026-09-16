// NyXia · Super Admin 3 — brief événement → série d'infolettres
const SENDER_NAME = 'NyXia · Univers';
const SENDER_EMAIL = 'info@universnyxia.top';
const SYSTEME_API = 'https://api.systeme.io/api';
const JOURNAL_KEY = 'univers:sa3:journal';
const PLAN_KEY = 'univers:sa3:last-plan';
const JOURNAL_MAX = 80;
const MAX_MAILS = 21;

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
  const opts = { method, headers: { Accept: 'application/json', 'X-API-Key': key } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(SYSTEME_API + path, opts);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text.slice(0, 800) }; }
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
  try { return JSON.parse(await env.CASHFLOW_KV.get(JOURNAL_KEY) || '[]'); } catch (_) { return []; }
}
async function pushJournal(env, entry) {
  if (!env.CASHFLOW_KV) return;
  const list = await readJournal(env);
  list.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  await env.CASHFLOW_KV.put(JOURNAL_KEY, JSON.stringify(list.slice(0, JOURNAL_MAX)));
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
function wrapHtml(bodyHtml, title) {
  const inner = String(bodyHtml || '').trim();
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title || 'Infolettre NyXia')}</title></head><body style="margin:0;padding:0;background:#060A18;color:#F7F4FF;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#060A18;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0F1733;border:1px solid rgba(167,139,250,.28);border-radius:16px;">
<tr><td style="padding:28px 28px 8px;font-family:Inter,Arial,sans-serif;color:#F4C86A;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">NyXia · Univers</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:16px;line-height:1.7;color:#F7F4FF;">${inner}</td></tr>
<tr><td style="padding:0 28px 28px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#AAA6C7;">NyXia · Univers · info@universnyxia.top</td></tr>
</table></td></tr></table></body></html>`;
}

function parseYMD(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
}
function fmtYMD(d) {
  return d.toISOString().slice(0, 10);
}
function buildSlots(brief) {
  const start = parseYMD(brief.sendStart);
  const end = parseYMD(brief.sendEnd);
  if (!start || !end || end < start) {
    const err = new Error('Dates d’envoi invalides.');
    err.status = 400;
    throw err;
  }
  const unit = brief.frequency === 'semaine' ? 'semaine' : 'jour';
  const qty = Math.max(1, Math.min(7, Number(brief.quantity) || 1));
  const slots = [];
  if (unit === 'jour') {
    for (let t = start.getTime(); t <= end.getTime() && slots.length < MAX_MAILS; t += 86400000) {
      const day = new Date(t);
      for (let i = 0; i < qty && slots.length < MAX_MAILS; i++) {
        slots.push({ date: fmtYMD(day), slot: qty > 1 ? (i === 0 ? 'matin' : 'soir') : 'jour' });
      }
    }
  } else {
    const weekdayHours = [1, 3, 5, 2, 4, 6, 0].slice(0, qty);
    for (let t = start.getTime(); t <= end.getTime() && slots.length < MAX_MAILS; t += 86400000) {
      const day = new Date(t);
      if (weekdayHours.includes(day.getUTCDay())) {
        slots.push({ date: fmtYMD(day), slot: 'jour' });
      }
    }
  }
  if (!slots.length) {
    const err = new Error('Aucune date d’envoi dans cette période.');
    err.status = 400;
    throw err;
  }
  return slots;
}

function fallbackCopy(brief, slot, index, total) {
  const n = index + 1;
  const eventBits = [brief.eventStart && `du ${brief.eventStart}`, brief.eventEnd && `au ${brief.eventEnd}`].filter(Boolean).join(' ');
  const link = brief.eventLink ? `\n\nLien de l’événement : ${brief.eventLink}` : '';
  const media = brief.materials ? `\n\nMatériel : ${brief.materials}` : '';
  const sig = brief.signature || 'NyXia · Univers';
  return {
    date: slot.date,
    slot: slot.slot,
    subject: `${brief.theme || brief.topic || 'NyXia · Univers'} — envoi ${n}/${total}`,
    preview: brief.topic || brief.theme || '',
    body: `Allô,\n\n${brief.topic || brief.theme || ''}\n\nÉvénement ${eventBits || ''}.${media}${link}\n\n${sig}`
  };
}

async function writeSeriesWithAI(env, brief, slots) {
  if (!env.AI) {
    return slots.map((s, i) => fallbackCopy(brief, s, i, slots.length));
  }
  const prompt = `Tu rédiges une SÉRIE d'infolettres en français québécois, voix NyXia · Univers : chaleureuse, précise, jamais agressive, curiosity gap, sans te violenter.

Brief:
- Événement: ${brief.eventStart || '?'} → ${brief.eventEnd || '?'}
- Thème: ${brief.theme || ''}
- Sujet à écrire: ${brief.topic || ''}
- Matériel (photos, liens, vidéo, audio): ${brief.materials || 'aucun'}
- Signature EXACTE à coller à la fin de chaque mail: ${brief.signature || 'NyXia · Univers'}
- Lien événement à inclure quand c'est utile: ${brief.eventLink || ''}
- Dates d'envoi (dans l'ordre): ${slots.map((s, i) => `${i + 1}) ${s.date} ${s.slot}`).join(' | ')}

Règles:
- Un mail DIFFÉRENT par date (pas de copier-coller).
- Progression: ouverture → profondeur → rappel → veille d'événement → pendant si la date tombe dedans.
- Intègre le matériel par URL, ne invente pas d'autres liens.
- Réponds UNIQUEMENT un JSON: {"emails":[{"date":"YYYY-MM-DD","slot":"jour","subject":"...","preview":"...","body":"..."}]}
- body en texte (paragraphes séparés par une ligne vide), pas de HTML.`;

  try {
    const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'Tu produis uniquement du JSON valide.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 3500
    });
    const text = typeof res === 'string' ? res : (res.response || res.result || JSON.stringify(res));
    const match = String(text).match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    const emails = parsed && Array.isArray(parsed.emails) ? parsed.emails : [];
    return slots.map((s, i) => {
      const hit = emails.find(e => e.date === s.date) || emails[i] || {};
      const fb = fallbackCopy(brief, s, i, slots.length);
      return {
        date: s.date,
        slot: s.slot,
        subject: String(hit.subject || fb.subject).slice(0, 180),
        preview: String(hit.preview || fb.preview).slice(0, 140),
        body: String(hit.body || fb.body)
      };
    });
  } catch (_) {
    return slots.map((s, i) => fallbackCopy(brief, s, i, slots.length));
  }
}

function readBrief(body) {
  return {
    eventStart: String(body.eventStart || '').trim(),
    eventEnd: String(body.eventEnd || '').trim(),
    theme: String(body.theme || '').trim(),
    topic: String(body.topic || '').trim(),
    materials: String(body.materials || '').trim(),
    signature: String(body.signature || 'NyXia · Univers').trim(),
    eventLink: String(body.eventLink || '').trim(),
    sendStart: String(body.sendStart || '').trim(),
    sendEnd: String(body.sendEnd || '').trim(),
    frequency: body.frequency === 'semaine' ? 'semaine' : 'jour',
    quantity: Number(body.quantity) || 1,
    includeTagIds: Array.isArray(body.includeTagIds) ? body.includeTagIds : [],
    excludeTagIds: Array.isArray(body.excludeTagIds) ? body.excludeTagIds : []
  };
}

async function handleStatus(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  return json({
    module: 'superadmin3',
    senderName: SENDER_NAME,
    senderEmail: SENDER_EMAIL,
    systemeKeyConfigured: !!systemeKey(env),
    aiConfigured: !!env.AI
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
async function handlePlan(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const brief = readBrief(await request.json().catch(() => ({})));
  if (!brief.theme && !brief.topic) return json({ error: 'Thème ou sujet requis.' }, 400);
  if (!brief.sendStart || !brief.sendEnd) return json({ error: 'Période d’envoi requise.' }, 400);
  const slots = buildSlots(brief);
  const emails = await writeSeriesWithAI(env, brief, slots);
  const plan = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    senderName: SENDER_NAME,
    senderEmail: SENDER_EMAIL,
    brief,
    emails
  };
  if (env.CASHFLOW_KV) await env.CASHFLOW_KV.put(PLAN_KEY, JSON.stringify(plan));
  await pushJournal(env, { action: 'plan', subject: brief.theme || brief.topic, count: emails.length });
  return json({ ok: true, plan });
}
async function handleLastPlan(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.CASHFLOW_KV) return json({ plan: null });
  try {
    const raw = await env.CASHFLOW_KV.get(PLAN_KEY);
    return json({ plan: raw ? JSON.parse(raw) : null });
  } catch (_) { return json({ plan: null }); }
}
async function createOneDraft(env, mail, brief) {
  const html = wrapHtml(paragraphsToHtml(mail.body), mail.subject);
  const payload = {
    subject: mail.subject,
    previewText: mail.preview || brief.theme || mail.subject,
    editor: 'classic',
    senderName: SENDER_NAME,
    senderEmail: SENDER_EMAIL,
    html,
    content: html,
    includeTags: brief.includeTagIds,
    excludeTags: brief.excludeTagIds,
    scheduledAt: mail.date ? `${mail.date}T14:00:00-04:00` : undefined
  };
  const created = await systemeFetch(env, '/newsletters', 'POST', payload);
  return { ok: true, date: mail.date, subject: mail.subject, newsletter: created };
}
async function handleDraftSeries(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const emails = Array.isArray(body.emails) ? body.emails : [];
  const brief = readBrief(body.brief || body);
  if (!emails.length) return json({ error: 'Aucune infolettre à pousser.' }, 400);
  const results = [];
  for (const mail of emails) {
    try {
      results.push(await createOneDraft(env, mail, brief));
    } catch (e) {
      results.push({ ok: false, date: mail.date, subject: mail.subject, error: e.message, detail: e.payload || null });
    }
  }
  await pushJournal(env, {
    action: 'draft_series',
    subject: brief.theme || brief.topic,
    ok: results.filter(r => r.ok).length,
    fail: results.filter(r => !r.ok).length
  });
  return json({ senderName: SENDER_NAME, senderEmail: SENDER_EMAIL, results });
}
async function handleJournal(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  return json({ journal: await readJournal(env) });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/^\/api\/superadmin3/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    try {
      if ((path === '/' || path === '/status') && request.method === 'GET') return handleStatus(request, env);
      if (path === '/tags' && request.method === 'GET') return handleTags(request, env);
      if (path === '/newsletters' && request.method === 'GET') return handleNewsletters(request, env);
      if (path === '/plan' && request.method === 'POST') return handlePlan(request, env);
      if (path === '/plan' && request.method === 'GET') return handleLastPlan(request, env);
      if (path === '/draft-series' && request.method === 'POST') return handleDraftSeries(request, env);
      if (path === '/journal' && request.method === 'GET') return handleJournal(request, env);
      return json({ error: 'Route Super Admin 3 inconnue.', path }, 404);
    } catch (e) {
      return json({ error: 'Erreur Super Admin 3.', detail: String(e.message || e) }, e.status || 500);
    }
  }
};
