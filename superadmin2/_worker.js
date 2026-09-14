// NyXia — Super Admin 2 / NyXia Créatrice
// Worker séparé de Super Admin 1. Aucun secret n'est stocké ici : utiliser les Secrets Cloudflare.

const API = '/api/superadmin2';
const SESSION_TTL = 60 * 60 * 12;
const COOKIE_NAME = 'nyxia_univers';
const EVENT_INDEX_KEY = 'super2:creator:events:index';
const EVENT_PREFIX = 'super2:creator:event:';
const PLAN_PREFIX = 'super2:creator:plan:';
const SETTINGS_KEY = 'super2:creator:settings';

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  brainModel: 'openai/gpt-5.3-chat',
  controlModel: 'openai/gpt-5.3-chat',
  imageModel: 'openai/gpt-image-2.5-sunburst',
  imageFallbackModel: 'openai/gpt-image-1.5',
  strictControl: true,
  imageGenerationEnabled: true,
  paidVideoGenerationEnabled: false,
  defaultVideoDuration: 30,
  brand: {
    name: 'NyXia',
    night: '#060A18',
    violet: '#7B5CFF',
    lavender: '#A78BFA',
    gold: '#F4C86A',
    visualRule: 'Moderne, magique, premium, technologique, lisible mobile, jamais générique.',
    backgroundVideoUrl: '',
    backgroundLocked: true,
    characterFacesLocked: true,
    characterReferences: {
      nyxia: '/NyXia.png',
      diane: '/Diane.png',
      eric: '/Eric.png',
      lena: '/Lena.png',
      selena: '/Selena.png',
      kael: '/Kael.png',
      alex: '/Alex.png'
    }
  }
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}
function nowIso() { return new Date().toISOString(); }
function uid(prefix = '') { return prefix + crypto.randomUUID(); }
function safeText(v, max = 20000) { return String(v == null ? '' : v).trim().slice(0, max); }
function normalizeEmail(v) { return safeText(v, 300).toLowerCase(); }
function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function slugFile(name) {
  return safeText(name, 140).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'media';
}
function randomToken() { return crypto.randomUUID() + crypto.randomUUID(); }

function getTokenFromRequest(request) {
  const h = request.headers.get('X-Univers-Token');
  if (h) return h;
  const cookies = request.headers.get('Cookie') || '';
  const m = cookies.match(/(?:^|;\s*)nyxia_univers=([^;]+)/);
  return m ? m[1] : null;
}
function buildSessionCookie(token, maxAge, requestUrl) {
  const parts = [`${COOKIE_NAME}=${token}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'Secure', 'SameSite=Lax'];
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) parts.push('Domain=.nyxia.top');
  } catch (_) {}
  return parts.join('; ');
}
function clearSessionCookie(requestUrl) {
  let domain = '';
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) domain = '; Domain=.nyxia.top';
  } catch (_) {}
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax${domain}`;
}
async function requireAdmin(request, env) {
  if (!env.CASHFLOW_KV) return false;
  const token = getTokenFromRequest(request);
  if (!token) return false;
  return !!(await env.CASHFLOW_KV.get('univers:session:' + token));
}
async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const password = body.password || '';
  if (!env.ADMIN_INITIAL_PASSWORD) return json({ error: 'Secret ADMIN_INITIAL_PASSWORD absent du Worker Super 2.' }, 503);
  if (password !== env.ADMIN_INITIAL_PASSWORD) return json({ error: 'Mot de passe incorrect.' }, 401);
  const token = randomToken();
  await env.CASHFLOW_KV.put('univers:session:' + token, JSON.stringify({ role: 'superadmin', source: 'super2', at: nowIso() }), { expirationTtl: SESSION_TTL });
  const res = json({ success: true, token });
  res.headers.append('Set-Cookie', buildSessionCookie(token, SESSION_TTL, request.url));
  return res;
}
async function handleCheckAuth(request, env) {
  return json({ valid: await requireAdmin(request, env), role: 'superadmin' });
}
async function handleLogout(request, env) {
  const token = getTokenFromRequest(request);
  if (token && env.CASHFLOW_KV) await env.CASHFLOW_KV.delete('univers:session:' + token);
  const res = json({ success: true });
  res.headers.append('Set-Cookie', clearSessionCookie(request.url));
  return res;
}

async function readJsonKV(env, key, fallback) {
  const raw = await env.CASHFLOW_KV.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}
async function writeJsonKV(env, key, value) {
  await env.CASHFLOW_KV.put(key, JSON.stringify(value));
}

async function getSettings(env) {
  const saved = await readJsonKV(env, SETTINGS_KEY, null);
  if (!saved) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...saved,
    brand: {
      ...structuredClone(DEFAULT_SETTINGS.brand),
      ...(saved.brand || {}),
      characterReferences: {
        ...structuredClone(DEFAULT_SETTINGS.brand.characterReferences),
        ...((saved.brand && saved.brand.characterReferences) || {})
      }
    },
    paidVideoGenerationEnabled: false
  };
}
async function handleSettings(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (request.method === 'GET') {
    const settings = await getSettings(env);
    return json({ settings, bindings: bindingStatus(env) });
  }
  const body = await request.json().catch(() => ({}));
  const current = await getSettings(env);
  const brandIn = body.brand || {};
  const settings = {
    ...current,
    brainModel: safeText(body.brainModel || current.brainModel, 120),
    controlModel: safeText(body.controlModel || current.controlModel, 120),
    imageModel: safeText(body.imageModel || current.imageModel, 120),
    imageFallbackModel: safeText(body.imageFallbackModel || current.imageFallbackModel, 120),
    strictControl: body.strictControl !== false,
    imageGenerationEnabled: body.imageGenerationEnabled !== false,
    paidVideoGenerationEnabled: false,
    defaultVideoDuration: clampNumber(body.defaultVideoDuration, 15, 60, current.defaultVideoDuration),
    brand: {
      ...current.brand,
      name: safeText(brandIn.name || current.brand.name, 100),
      night: safeText(brandIn.night || current.brand.night, 20),
      violet: safeText(brandIn.violet || current.brand.violet, 20),
      lavender: safeText(brandIn.lavender || current.brand.lavender, 20),
      gold: safeText(brandIn.gold || current.brand.gold, 20),
      visualRule: safeText(brandIn.visualRule || current.brand.visualRule, 2000),
      backgroundVideoUrl: safeText(brandIn.backgroundVideoUrl || '', 3000),
      backgroundLocked: true,
      characterFacesLocked: true,
      characterReferences: {
        ...current.brand.characterReferences,
        ...(brandIn.characterReferences || {})
      }
    },
    updatedAt: nowIso()
  };
  await writeJsonKV(env, SETTINGS_KEY, settings);
  return json({ success: true, settings, bindings: bindingStatus(env) });
}
function bindingStatus(env) {
  return {
    kv: !!env.CASHFLOW_KV,
    mediaBucket: !!env.MEDIA_BUCKET,
    aimlapi: !!env.AIMLAPI_CREATOR_KEY,
    pexels: !!env.PEXELS_KEY,
    unsplash: !!(env.UNSPLASH_ACCES_KEY || env.UNSPLASH_ACCESS_KEY || env.UNSPLASH_KEY)
  };
}

async function listEventIds(env) {
  return await readJsonKV(env, EVENT_INDEX_KEY, []);
}
async function readEvent(env, id) {
  return await readJsonKV(env, EVENT_PREFIX + id, null);
}
async function saveEventRecord(env, event) {
  await writeJsonKV(env, EVENT_PREFIX + event.id, event);
  const ids = await listEventIds(env);
  if (!ids.includes(event.id)) {
    ids.unshift(event.id);
    await writeJsonKV(env, EVENT_INDEX_KEY, ids);
  }
}
function sanitizeHeartMedia(raw) {
  const type = raw && raw.type === 'video' ? 'video' : 'image';
  return {
    id: safeText(raw && raw.id, 100) || uid('media-'),
    type,
    url: safeText(raw && raw.url, 3000),
    storageKey: safeText(raw && raw.storageKey, 1000),
    originalName: safeText(raw && raw.originalName, 300),
    source: safeText(raw && raw.source, 80) || 'manual',
    role: ['principal','secondaire','cta','demonstration','temoignage','ambiance','character-reference'].includes(raw && raw.role) ? raw.role : 'secondaire',
    label: safeText(raw && raw.label, 200),
    priority: clampNumber(raw && raw.priority, 1, 99, 10),
    frequency: ['always','often','sometimes','relevant'].includes(raw && raw.frequency) ? raw.frequency : 'relevant',
    position: ['start','middle','end','free'].includes(raw && raw.position) ? raw.position : 'free',
    canCrop: raw && raw.canCrop !== false,
    canCut: raw && raw.canCut !== false,
    canOverlayText: raw && raw.canOverlayText !== false,
    audio: ['keep','mute','free'].includes(raw && raw.audio) ? raw.audio : 'free',
    note: safeText(raw && raw.note, 3000)
  };
}
function sanitizeEventInput(body, existing = null) {
  const id = safeText(body.id || (existing && existing.id), 100).replace(/[^a-zA-Z0-9_-]/g, '') || uid('event-');
  const createdAt = existing && existing.createdAt ? existing.createdAt : nowIso();
  const locked = existing ? !!existing.locked : !!body.locked;
  const media = Array.isArray(body.mediaHeart) ? body.mediaHeart.map(sanitizeHeartMedia).slice(0, 80) : ((existing && existing.mediaHeart) || []);
  const event = {
    schemaVersion: 1,
    id,
    name: safeText(body.name, 240),
    status: ['draft','active','ended'].includes(body.status) ? body.status : 'draft',
    locked,
    eventStart: safeText(body.eventStart, 30),
    eventEnd: safeText(body.eventEnd, 30),
    contentStart: safeText(body.contentStart, 30),
    contentEnd: safeText(body.contentEnd, 30),
    publishTime: safeText(body.publishTime, 20) || '19:30',
    timezone: safeText(body.timezone, 80) || 'America/Toronto',
    frequency: safeText(body.frequency, 40) || 'daily',
    platforms: {
      facebook: !!(body.platforms && body.platforms.facebook),
      tiktok: !!(body.platforms && body.platforms.tiktok)
    },
    formats: {
      facebookImage: body.formats ? body.formats.facebookImage !== false : true,
      shortVideo: body.formats ? body.formats.shortVideo !== false : true
    },
    exactTheme: safeText(body.exactTheme, 6000),
    audience: safeText(body.audience, 4000),
    promise: safeText(body.promise, 4000),
    eventReality: safeText(body.eventReality, 12000),
    day1: safeText(body.day1, 5000),
    day2: safeText(body.day2, 5000),
    day3: safeText(body.day3, 5000),
    cta: safeText(body.cta, 3000),
    mandatory: safeText(body.mandatory, 5000),
    forbidden: safeText(body.forbidden, 5000),
    studioPromptRole: safeText(body.studioPromptRole, 5000),
    vip: safeText(body.vip, 5000),
    notes: safeText(body.notes, 8000),
    mediaHeart: media.sort((a,b) => a.priority - b.priority),
    createdAt,
    updatedAt: nowIso()
  };
  return event;
}
async function handleEvents(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (request.method === 'GET') {
    const ids = await listEventIds(env);
    const events = [];
    for (const id of ids) {
      const event = await readEvent(env, id);
      if (event) events.push(event);
    }
    events.sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return json({ events });
  }
  const body = await request.json().catch(() => ({}));
  const existing = body.id ? await readEvent(env, safeText(body.id, 100)) : null;
  if (existing && existing.locked) return json({ error: 'Campagne verrouillée. Déverrouille-la explicitement avant de modifier sa vérité.' }, 423);
  const event = sanitizeEventInput(body, existing);
  if (!event.name) return json({ error: 'Nom de l’événement requis.' }, 400);
  if (!event.exactTheme) return json({ error: 'Le thème exact est requis.' }, 400);
  await saveEventRecord(env, event);
  return json({ success: true, event });
}
async function handleEventGet(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const id = safeText(new URL(request.url).searchParams.get('id'), 100);
  const event = await readEvent(env, id);
  return event ? json({ event }) : json({ error: 'Événement introuvable.' }, 404);
}
async function handleEventDelete(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const id = safeText(body.id, 100);
  const event = await readEvent(env, id);
  if (!event) return json({ error: 'Introuvable.' }, 404);
  if (event.locked) return json({ error: 'Déverrouille la campagne avant de la supprimer.' }, 423);
  await env.CASHFLOW_KV.delete(EVENT_PREFIX + id);
  await env.CASHFLOW_KV.delete(PLAN_PREFIX + id);
  const ids = (await listEventIds(env)).filter(x => x !== id);
  await writeJsonKV(env, EVENT_INDEX_KEY, ids);
  return json({ success: true });
}
async function handleEventLock(request, env, lockValue) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const id = safeText(body.id, 100);
  const event = await readEvent(env, id);
  if (!event) return json({ error: 'Événement introuvable.' }, 404);
  event.locked = lockValue;
  event.updatedAt = nowIso();
  await saveEventRecord(env, event);
  return json({ success: true, event });
}
async function handleEventDuplicate(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const original = await readEvent(env, safeText(body.id, 100));
  if (!original) return json({ error: 'Événement introuvable.' }, 404);
  const copy = structuredClone(original);
  copy.id = uid('event-');
  copy.name = safeText((body.name || original.name + ' — copie'), 240);
  copy.locked = false;
  copy.status = 'draft';
  copy.createdAt = nowIso();
  copy.updatedAt = copy.createdAt;
  await saveEventRecord(env, copy);
  return json({ success: true, event: copy });
}

async function handleMediaUpload(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.MEDIA_BUCKET) return json({ error: 'Le binding R2 MEDIA_BUCKET n’est pas encore configuré. Tu peux quand même ajouter un média par URL.' }, 503);
  const form = await request.formData();
  const file = form.get('file');
  const eventId = safeText(form.get('eventId'), 100).replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  if (!file || typeof file === 'string') return json({ error: 'Fichier requis.' }, 400);
  const type = String(file.type || 'application/octet-stream');
  if (!type.startsWith('image/') && !type.startsWith('video/')) return json({ error: 'Seulement image ou vidéo.' }, 400);
  if (file.size > 80 * 1024 * 1024) return json({ error: 'Fichier trop volumineux (80 Mo maximum par envoi).' }, 413);
  const key = `super2/${eventId}/${Date.now()}-${uid('').slice(0,8)}-${slugFile(file.name)}`;
  await env.MEDIA_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: type }, customMetadata: { originalName: file.name || '' } });
  return json({ success: true, media: { key, url: `${API}/media/file/${encodeURIComponent(key)}`, type: type.startsWith('video/') ? 'video' : 'image', originalName: file.name || '' } });
}
async function handleMediaImport(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.MEDIA_BUCKET) return json({ error: 'Le binding R2 MEDIA_BUCKET n’est pas configuré.' }, 503);
  const body = await request.json().catch(() => ({}));
  const rawUrl = safeText(body.url, 3000);
  const eventId = safeText(body.eventId, 100).replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  let u;
  try { u = new URL(rawUrl); } catch (_) { return json({ error: 'URL invalide.' }, 400); }
  if (!['https:','http:'].includes(u.protocol)) return json({ error: 'URL non autorisée.' }, 400);
  const r = await fetch(u.toString(), { headers: { 'User-Agent': 'NyXiaCreator/1.0' } });
  if (!r.ok || !r.body) return json({ error: 'Impossible de récupérer ce média.' }, 400);
  const ct = r.headers.get('content-type') || 'application/octet-stream';
  if (!ct.startsWith('image/') && !ct.startsWith('video/')) return json({ error: 'La ressource distante n’est pas une image/vidéo reconnue.' }, 400);
  const len = Number(r.headers.get('content-length') || 0);
  if (len && len > 80 * 1024 * 1024) return json({ error: 'Média distant trop volumineux.' }, 413);
  const ext = ct.includes('png') ? '.png' : ct.includes('jpeg') ? '.jpg' : ct.includes('webp') ? '.webp' : ct.includes('mp4') ? '.mp4' : ct.includes('webm') ? '.webm' : '';
  const key = `super2/${eventId}/${Date.now()}-${uid('').slice(0,8)}-import${ext}`;
  await env.MEDIA_BUCKET.put(key, r.body, { httpMetadata: { contentType: ct }, customMetadata: { sourceUrl: u.toString() } });
  return json({ success: true, media: { key, url: `${API}/media/file/${encodeURIComponent(key)}`, type: ct.startsWith('video/') ? 'video' : 'image', originalName: safeText(body.label, 300) || 'Import' } });
}
async function handleMediaFile(request, env, encodedKey) {
  if (!env.MEDIA_BUCKET) return new Response('MEDIA_BUCKET absent', { status: 404 });
  const key = decodeURIComponent(encodedKey || '');
  if (!key.startsWith('super2/')) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  return new Response(obj.body, { headers });
}
async function handleMediaDelete(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.MEDIA_BUCKET) return json({ error: 'MEDIA_BUCKET absent.' }, 503);
  const body = await request.json().catch(() => ({}));
  const key = safeText(body.key, 1000);
  if (!key.startsWith('super2/')) return json({ error: 'Clé invalide.' }, 400);
  await env.MEDIA_BUCKET.delete(key);
  return json({ success: true });
}

async function handleAssetSearch(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const url = new URL(request.url);
  const provider = safeText(url.searchParams.get('provider'), 30).toLowerCase();
  const type = safeText(url.searchParams.get('type'), 20).toLowerCase() || 'image';
  const q = safeText(url.searchParams.get('q'), 200);
  if (!q) return json({ error: 'Recherche requise.' }, 400);
  if (provider === 'pexels') {
    if (!env.PEXELS_KEY) return json({ error: 'PEXELS_KEY absent.' }, 503);
    const endpoint = type === 'video'
      ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=12&orientation=portrait`
      : `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12&orientation=portrait`;
    const r = await fetch(endpoint, { headers: { Authorization: env.PEXELS_KEY } });
    if (!r.ok) return json({ error: 'Pexels a refusé la recherche.', detail: await r.text() }, 502);
    const d = await r.json();
    if (type === 'video') {
      const results = (d.videos || []).map(v => {
        const files = (v.video_files || []).slice().sort((a,b) => (a.width || 0) - (b.width || 0));
        const best = files.find(f => (f.width || 0) >= 720 && (f.width || 0) <= 1080) || files[0] || {};
        return { provider: 'pexels', type: 'video', id: String(v.id), preview: v.image || '', url: best.link || '', author: v.user && v.user.name || '', sourcePage: v.url || '' };
      }).filter(x => x.url);
      return json({ results });
    }
    const results = (d.photos || []).map(p => ({ provider: 'pexels', type: 'image', id: String(p.id), preview: p.src && (p.src.medium || p.src.small) || '', url: p.src && (p.src.large2x || p.src.large || p.src.original) || '', author: p.photographer || '', sourcePage: p.url || '' })).filter(x => x.url);
    return json({ results });
  }
  if (provider === 'unsplash') {
    const key = env.UNSPLASH_ACCES_KEY || env.UNSPLASH_ACCESS_KEY || env.UNSPLASH_KEY;
    if (!key) return json({ error: 'Clé Unsplash absente.' }, 503);
    if (type === 'video') return json({ error: 'Unsplash est utilisé ici pour les images. Pour la vidéo, utilise Pexels.' }, 400);
    const endpoint = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=12&orientation=portrait`;
    const r = await fetch(endpoint, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
    if (!r.ok) return json({ error: 'Unsplash a refusé la recherche.', detail: await r.text() }, 502);
    const d = await r.json();
    const results = (d.results || []).map(p => ({ provider: 'unsplash', type: 'image', id: String(p.id), preview: p.urls && (p.urls.small || p.urls.thumb) || '', url: p.urls && (p.urls.regular || p.urls.full) || '', author: p.user && p.user.name || '', sourcePage: p.links && p.links.html || '' })).filter(x => x.url);
    return json({ results });
  }
  return json({ error: 'Fournisseur inconnu.' }, 400);
}

function campaignTruth(event, settings) {
  return {
    event: {
      name: event.name,
      dates: { start: event.eventStart, end: event.eventEnd },
      exactTheme: event.exactTheme,
      audience: event.audience,
      promise: event.promise,
      whatReallyHappens: event.eventReality,
      day1: event.day1,
      day2: event.day2,
      day3: event.day3,
      cta: event.cta,
      mandatory: event.mandatory,
      forbidden: event.forbidden,
      studioPromptRole: event.studioPromptRole,
      vip: event.vip,
      notes: event.notes,
      mediaHeart: (event.mediaHeart || []).map(m => ({ id: m.id, type: m.type, role: m.role, label: m.label, priority: m.priority, frequency: m.frequency, position: m.position, note: m.note }))
    },
    schedule: {
      contentStart: event.contentStart,
      contentEnd: event.contentEnd,
      publishTime: event.publishTime,
      timezone: event.timezone,
      frequency: event.frequency,
      platforms: event.platforms,
      formats: event.formats
    },
    brand: {
      palette: [settings.brand.night, settings.brand.violet, settings.brand.lavender, settings.brand.gold],
      rule: settings.brand.visualRule,
      fixedVideoBackground: settings.brand.backgroundVideoUrl ? 'Le fond officiel ciel étoilé + étoiles filantes est obligatoire pour toute vidéo.' : 'Le fond officiel doit être configuré avant export vidéo.',
      characters: 'Les visages officiels sont verrouillés. Ne jamais réinterpréter un personnage.'
    }
  };
}
async function aimlChat(env, model, messages, jsonMode = true) {
  if (!env.AIMLAPI_CREATOR_KEY) throw new Error('AIMLAPI_CREATOR_KEY absent du Worker Super 2.');
  const payload = { model, messages, temperature: 0.5 };
  if (jsonMode) payload.response_format = { type: 'json_object' };
  let r = await fetch('https://api.aimlapi.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.AIMLAPI_CREATOR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok && jsonMode) {
    delete payload.response_format;
    r = await fetch('https://api.aimlapi.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.AIMLAPI_CREATOR_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  if (!r.ok) throw new Error(`AIMLAPI ${r.status}: ${(await r.text()).slice(0,800)}`);
  const d = await r.json();
  return safeText(d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content, 200000);
}
function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (_) {}
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch (_) {}
  }
  throw new Error('La réponse IA n’est pas un JSON exploitable.');
}
function normalizePlan(raw, event) {
  const arr = Array.isArray(raw && raw.posts) ? raw.posts : Array.isArray(raw && raw.items) ? raw.items : [];
  const posts = arr.slice(0, 60).map((p, i) => ({
    id: safeText(p.id, 100) || uid('post-'),
    date: safeText(p.date, 20),
    publishTime: safeText(p.publishTime, 20) || event.publishTime,
    platform: ['facebook','tiktok'].includes(String(p.platform || '').toLowerCase()) ? String(p.platform).toLowerCase() : 'facebook',
    format: ['facebook-image','short-video','text-only'].includes(String(p.format || '').toLowerCase()) ? String(p.format).toLowerCase() : 'facebook-image',
    angle: safeText(p.angle, 500),
    objective: safeText(p.objective, 500),
    hook: safeText(p.hook, 1200),
    caption: safeText(p.caption, 8000),
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.map(x => safeText(x, 80)).filter(Boolean).slice(0,20) : [],
    cta: safeText(p.cta, 1500),
    imagePrompt: safeText(p.imagePrompt, 7000),
    characterReferences: Array.isArray(p.characterReferences) ? p.characterReferences.map(x => safeText(x, 60).toLowerCase()).filter(Boolean).slice(0,7) : [],
    mediaHeartIds: Array.isArray(p.mediaHeartIds) ? p.mediaHeartIds.map(x => safeText(x, 100)).filter(Boolean).slice(0,20) : [],
    video: {
      duration: clampNumber(p.video && p.video.duration, 15, 60, 30),
      voiceover: safeText(p.video && p.video.voiceover, 7000),
      scenes: Array.isArray(p.video && p.video.scenes) ? p.video.scenes.slice(0,12).map((s,j) => ({
        id: safeText(s.id, 80) || `scene-${j+1}`,
        seconds: clampNumber(s.seconds, 2, 15, 5),
        text: safeText(s.text, 1200),
        visualType: ['text-only','heart-media','generated-image','pexels-video','stock-image','screenshot'].includes(String(s.visualType || '')) ? s.visualType : 'text-only',
        searchQuery: safeText(s.searchQuery, 300),
        mediaHeartIds: Array.isArray(s.mediaHeartIds) ? s.mediaHeartIds.map(x => safeText(x,100)).filter(Boolean).slice(0,10) : []
      })) : []
    },
    status: safeText(p.status, 30) || 'draft',
    fidelityScore: clampNumber(p.fidelityScore, 0, 100, 0),
    generatedImageUrl: safeText(p.generatedImageUrl, 5000),
    generatedImageStorageKey: safeText(p.generatedImageStorageKey, 1000),
    createdAt: p.createdAt || nowIso()
  }));
  return { posts, summary: safeText(raw && raw.summary, 5000), updatedAt: nowIso() };
}
async function handleGeneratePlan(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const event = await readEvent(env, safeText(body.eventId, 100));
  if (!event) return json({ error: 'Événement introuvable.' }, 404);
  if (!event.locked) return json({ error: 'Verrouille d’abord la campagne. NyXia ne crée pas tant que la vérité de l’événement peut encore bouger.' }, 409);
  const settings = await getSettings(env);
  const truth = campaignTruth(event, settings);
  const count = Math.round(clampNumber(body.count, 1, 60, 14));
  const instructions = `Tu es NyXia Créatrice. Tu ne redéfinis JAMAIS la campagne.\n
RÈGLE ABSOLUE : les faits contenus dans CAMPAGNE_VERROUILLEE ci-dessous sont la seule vérité. Si une information n'y est pas, tu ne l'inventes pas. Tu es créative sur la forme, jamais sur les faits.\n
Pour les vidéos : aucune génération vidéo IA payante. Le fond vidéo officiel ciel étoilé + étoiles filantes est fixe; tu composes par-dessus avec texte glow, images, médias cœur, Pexels/Unsplash, captures et animations.\n
Pour les personnages : si tu proposes un visuel contenant un personnage officiel, renseigne characterReferences avec son identifiant exact (nyxia,diane,eric,lena,selena,kael,alex). Son visage ne doit jamais être recréé sans référence.\n
Crée ${count} contenus distincts, sans répétition d'angle, adaptés aux plateformes activées. Respecte l'heure programmée. Les formats possibles sont facebook-image, short-video, text-only.\n
Pour chaque contenu retourne : id,date,publishTime,platform,format,angle,objective,hook,caption,hashtags,cta,imagePrompt,characterReferences,mediaHeartIds,video{duration,voiceover,scenes[{seconds,text,visualType,searchQuery,mediaHeartIds}]},fidelityScore.\n
Chaque vidéo dure 15 à 60 secondes et utilise le fond officiel fixe. Les scènes peuvent être text-only, heart-media, generated-image, pexels-video, stock-image ou screenshot.\n
Retourne UNIQUEMENT un objet JSON {summary,posts:[...]}.`;
  const creatorText = await aimlChat(env, settings.brainModel, [
    { role: 'system', content: instructions },
    { role: 'user', content: `CAMPAGNE_VERROUILLEE:\n${JSON.stringify(truth)}` }
  ], true);
  let plan = normalizePlan(parseJsonLoose(creatorText), event);

  if (settings.strictControl && plan.posts.length) {
    const controlPrompt = `Tu es NyXia Contrôle. Tu n'es pas créatrice. Tu vérifies la fidélité factuelle d'un plan publicitaire à une campagne verrouillée.\n
Tu dois REFUSER tout élément qui invente un contenu d'événement, change le thème, change la promesse, fait de Studio Prompt un sujet principal si la campagne ne le dit pas, invente une fonctionnalité, un prix, une date ou un bénéfice non fourni.\n
Tu vérifies aussi : palette NyXia obligatoire; fond ciel étoilé + étoiles filantes obligatoire pour vidéo; visages officiels verrouillés; aucune vidéo IA payante.\n
Corrige uniquement ce qui dérape sans modifier la stratégie définie par l'utilisateur. Retourne UNIQUEMENT JSON : {pass:boolean,issues:[...],correctedPlan:{summary,posts:[...]}}.`;
    const controlText = await aimlChat(env, settings.controlModel, [
      { role: 'system', content: controlPrompt },
      { role: 'user', content: `CAMPAGNE_VERROUILLEE:\n${JSON.stringify(truth)}\n\nPLAN_A_VERIFIER:\n${JSON.stringify(plan)}` }
    ], true);
    const checked = parseJsonLoose(controlText);
    if (checked && checked.correctedPlan) plan = normalizePlan(checked.correctedPlan, event);
    plan.control = { pass: checked && checked.pass !== false, issues: Array.isArray(checked && checked.issues) ? checked.issues.slice(0,100) : [] };
  } else {
    plan.control = { pass: true, issues: [] };
  }
  plan.eventId = event.id;
  plan.generatedAt = nowIso();
  await writeJsonKV(env, PLAN_PREFIX + event.id, plan);
  return json({ success: true, plan });
}
async function handleGetPlan(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const eventId = safeText(new URL(request.url).searchParams.get('eventId'), 100);
  const plan = await readJsonKV(env, PLAN_PREFIX + eventId, null);
  return json({ plan });
}
async function handleSavePlan(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const event = await readEvent(env, safeText(body.eventId,100));
  if (!event) return json({ error: 'Événement introuvable.' }, 404);
  const plan = normalizePlan(body.plan || {}, event);
  plan.eventId = event.id;
  plan.control = body.plan && body.plan.control || { pass: true, issues: [] };
  plan.updatedAt = nowIso();
  await writeJsonKV(env, PLAN_PREFIX + event.id, plan);
  return json({ success: true, plan });
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function storeGeneratedImage(env, eventId, payload, contentType = 'image/png') {
  if (!env.MEDIA_BUCKET) return { url: payload.url || '', storageKey: '', dataUrl: payload.b64 ? `data:${contentType};base64,${payload.b64}` : '' };
  const key = `super2/${eventId}/generated/${Date.now()}-${uid('').slice(0,8)}.png`;
  if (payload.b64) {
    await env.MEDIA_BUCKET.put(key, b64ToBytes(payload.b64), { httpMetadata: { contentType } });
  } else if (payload.url) {
    const r = await fetch(payload.url);
    if (!r.ok || !r.body) throw new Error('Impossible de récupérer l’image générée.');
    const ct = r.headers.get('content-type') || contentType;
    await env.MEDIA_BUCKET.put(key, r.body, { httpMetadata: { contentType: ct } });
  } else throw new Error('Aucune image retournée.');
  return { url: `${API}/media/file/${encodeURIComponent(key)}`, storageKey: key, dataUrl: '' };
}
async function fetchReferenceBlob(url, request) {
  const absolute = new URL(url, request.url).toString();
  const r = await fetch(absolute, { headers: { Cookie: request.headers.get('Cookie') || '' } });
  if (!r.ok) throw new Error(`Référence introuvable: ${url}`);
  const ct = r.headers.get('content-type') || 'image/png';
  const blob = await r.blob();
  return { blob, ct, name: absolute.split('/').pop() || 'reference.png' };
}
async function callImageGeneration(env, settings, prompt) {
  const body = { model: settings.imageModel, prompt, size: '1024x1024', quality: 'medium' };
  let r = await fetch('https://api.aimlapi.com/v1/images/generations', {
    method: 'POST', headers: { Authorization: `Bearer ${env.AIMLAPI_CREATOR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok && settings.imageFallbackModel) {
    body.model = settings.imageFallbackModel;
    r = await fetch('https://api.aimlapi.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${env.AIMLAPI_CREATOR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  }
  if (!r.ok) throw new Error(`Image AIMLAPI ${r.status}: ${(await r.text()).slice(0,800)}`);
  const d = await r.json();
  const item = d && d.data && d.data[0] || {};
  return { url: item.url || '', b64: item.b64_json || item.b64 || '' };
}
async function callImageEdit(env, request, settings, prompt, refs) {
  const form = new FormData();
  form.append('model', settings.imageModel);
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', 'high');
  for (const ref of refs.slice(0, 8)) {
    const f = await fetchReferenceBlob(ref, request);
    form.append('image', f.blob, f.name);
  }
  const r = await fetch('https://api.aimlapi.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${env.AIMLAPI_CREATOR_KEY}` }, body: form
  });
  if (!r.ok) throw new Error(`Édition référence AIMLAPI ${r.status}: ${(await r.text()).slice(0,800)}`);
  const d = await r.json();
  const item = d && d.data && d.data[0] || {};
  return { url: item.url || '', b64: item.b64_json || item.b64 || '' };
}
async function handleGenerateImage(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const event = await readEvent(env, safeText(body.eventId, 100));
  if (!event || !event.locked) return json({ error: 'Campagne verrouillée requise.' }, 409);
  const settings = await getSettings(env);
  if (!settings.imageGenerationEnabled) return json({ error: 'Génération d’image désactivée.' }, 403);
  if (!env.AIMLAPI_CREATOR_KEY) return json({ error: 'AIMLAPI_CREATOR_KEY absent.' }, 503);
  const plan = await readJsonKV(env, PLAN_PREFIX + event.id, null);
  const post = plan && Array.isArray(plan.posts) ? plan.posts.find(p => p.id === body.postId) : null;
  if (!post) return json({ error: 'Contenu introuvable dans le plan.' }, 404);
  const palette = `${settings.brand.night}, ${settings.brand.violet}, ${settings.brand.lavender}, accent lumière dorée ${settings.brand.gold}`;
  const basePrompt = `${post.imagePrompt || post.hook}\n\nCONTRAINTES NYXIA VERROUILLEES: palette ${palette}. ${settings.brand.visualRule}. Aucune couleur dominante hors palette. Publicité cohérente avec l'événement: ${event.exactTheme}. Ne jamais inventer de texte lisible dans l'image sauf si explicitement demandé.`;
  const chars = (post.characterReferences || []).filter(c => settings.brand.characterReferences[c]);
  let result;
  if (chars.length) {
    const refs = chars.map(c => settings.brand.characterReferences[c]);
    const prompt = `${basePrompt}\n\nIDENTITE PERSONNAGE: préserver exactement les visages et identités des images de référence. Ne pas réinterpréter le visage.`;
    result = await callImageEdit(env, request, settings, prompt, refs);
  } else {
    result = await callImageGeneration(env, settings, basePrompt);
  }
  const stored = await storeGeneratedImage(env, event.id, result);
  post.generatedImageUrl = stored.url || stored.dataUrl || result.url;
  post.generatedImageStorageKey = stored.storageKey || '';
  post.updatedAt = nowIso();
  plan.updatedAt = nowIso();
  await writeJsonKV(env, PLAN_PREFIX + event.id, plan);
  return json({ success: true, image: { url: post.generatedImageUrl, storageKey: post.generatedImageStorageKey, transient: !stored.storageKey }, post });
}

async function handlePortalRegistry(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const portals = await readJsonKV(env, 'univers:portals', []);
  return json({ portals: Array.isArray(portals) ? portals : [] });
}

function routeMatch(path, prefix) { return path === prefix || path.startsWith(prefix + '/'); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === API + '/login' && request.method === 'POST') return await handleLogin(request, env);
      if (path === API + '/check-auth' && (request.method === 'GET' || request.method === 'POST')) return await handleCheckAuth(request, env);
      if (path === API + '/logout' && request.method === 'POST') return await handleLogout(request, env);

      if (path === API + '/settings' && (request.method === 'GET' || request.method === 'POST')) return await handleSettings(request, env);
      if (path === API + '/events' && (request.method === 'GET' || request.method === 'POST')) return await handleEvents(request, env);
      if (path === API + '/event' && request.method === 'GET') return await handleEventGet(request, env);
      if (path === API + '/event/delete' && request.method === 'POST') return await handleEventDelete(request, env);
      if (path === API + '/event/lock' && request.method === 'POST') return await handleEventLock(request, env, true);
      if (path === API + '/event/unlock' && request.method === 'POST') return await handleEventLock(request, env, false);
      if (path === API + '/event/duplicate' && request.method === 'POST') return await handleEventDuplicate(request, env);

      if (path === API + '/media/upload' && request.method === 'POST') return await handleMediaUpload(request, env);
      if (path === API + '/media/import' && request.method === 'POST') return await handleMediaImport(request, env);
      if (path === API + '/media/delete' && request.method === 'POST') return await handleMediaDelete(request, env);
      if (routeMatch(path, API + '/media/file') && request.method === 'GET') {
        const encodedKey = path.slice((API + '/media/file/').length);
        return await handleMediaFile(request, env, encodedKey);
      }
      if (path === API + '/assets/search' && request.method === 'GET') return await handleAssetSearch(request, env);

      if (path === API + '/creator/plan' && request.method === 'POST') return await handleGeneratePlan(request, env);
      if (path === API + '/creator/plan' && request.method === 'GET') return await handleGetPlan(request, env);
      if (path === API + '/creator/plan/save' && request.method === 'POST') return await handleSavePlan(request, env);
      if (path === API + '/creator/image' && request.method === 'POST') return await handleGenerateImage(request, env);
      if (path === API + '/portals' && request.method === 'GET') return await handlePortalRegistry(request, env);

      return json({ error: 'Route Super Admin 2 introuvable.' }, 404);
    } catch (e) {
      console.error('super2', e);
      return json({ error: 'Erreur Super Admin 2.', detail: String(e && e.message || e) }, 500);
    }
  }
};
