// NyXia — Super Admin 2 / NyXia Créatrice
// Worker séparé de Super Admin 1. Aucun secret n'est stocké ici : utiliser les Secrets Cloudflare.

const API = '/api/superadmin2';
const SESSION_TTL = 60 * 60 * 12;
const COOKIE_NAME = 'nyxia_univers';
const REFRESH_COOKIE_NAME = 'nyxia_super2_refresh';
const REFRESH_HEADER = 'X-Univers-Refresh';
const EVENT_INDEX_KEY = 'super2:creator:events:index';
const EVENT_PREFIX = 'super2:creator:event:';
const PLAN_PREFIX = 'super2:creator:plan:';
const SETTINGS_KEY = 'super2:creator:settings';
const CHAT_PREFIX = 'super2:creator:chat:';
const BRIEF_PREFIX = 'super2:creator:brief:';
const PERFORMANCE_KEY = 'super2:creator:performance';
const CUSTOM_TOOLS_KEY = 'super2:labo:customtools';

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  brainModel: 'openai/gpt-5.3-chat',
  controlModel: 'openai/gpt-5.3-chat',
  imageModel: 'openai/gpt-image-2.5-sunburst',
  imageFallbackModel: 'openai/gpt-image-1.5',
  videoModel: 'kling-video/v1.6/standard/text-to-video',
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

function b64urlEncodeBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecodeBytes(value) {
  let s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function hmacKey(env) {
  if (!env.ADMIN_INITIAL_PASSWORD) return null;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_INITIAL_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}
async function createRefreshToken(env) {
  const key = await hmacKey(env);
  if (!key) return '';
  const payload = {
    scope: 'superadmin2',
    exp: Date.now() + SESSION_TTL * 1000,
    nonce: crypto.randomUUID()
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payload64 = b64urlEncodeBytes(payloadBytes);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload64));
  return payload64 + '.' + b64urlEncodeBytes(new Uint8Array(sig));
}
async function verifyRefreshToken(value, env) {
  try {
    const token = String(value || '');
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const key = await hmacKey(env);
    if (!key) return false;
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecodeBytes(parts[1]),
      new TextEncoder().encode(parts[0])
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecodeBytes(parts[0])));
    return payload && payload.scope === 'superadmin2' && Number(payload.exp) > Date.now();
  } catch (_) {
    return false;
  }
}
function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const safe = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = cookies.match(new RegExp('(?:^|;\\\\s*)' + safe + '=([^;]+)'));
  return m ? m[1] : '';
}
function getTokenFromRequest(request) {
  const h = request.headers.get('X-Univers-Token');
  if (h) return h;
  return getCookie(request, COOKIE_NAME) || null;
}
function getRefreshFromRequest(request) {
  return request.headers.get(REFRESH_HEADER) || getCookie(request, REFRESH_COOKIE_NAME) || '';
}
function cookieDomain(requestUrl) {
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) return 'Domain=.nyxia.top';
  } catch (_) {}
  return '';
}
function buildCookie(name, value, maxAge, requestUrl) {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${maxAge}`, 'HttpOnly', 'Secure', 'SameSite=Lax'];
  const domain = cookieDomain(requestUrl);
  if (domain) parts.push(domain);
  return parts.join('; ');
}
function clearCookie(name, requestUrl) {
  const parts = [`${name}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  const domain = cookieDomain(requestUrl);
  if (domain) parts.push(domain);
  return parts.join('; ');
}
function buildSessionCookie(token, maxAge, requestUrl) {
  return buildCookie(COOKIE_NAME, token, maxAge, requestUrl);
}
async function requireAdmin(request, env) {
  if (!env.CASHFLOW_KV) return false;
  const token = getTokenFromRequest(request);
  if (!token) return false;
  return !!(await env.CASHFLOW_KV.get('univers:session:' + token));
}
async function createServerSession(env) {
  const token = randomToken();
  await env.CASHFLOW_KV.put(
    'univers:session:' + token,
    JSON.stringify({ role: 'superadmin', source: 'super2', at: nowIso() }),
    { expirationTtl: SESSION_TTL }
  );
  return token;
}
async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const password = body.password || '';
  if (!env.ADMIN_INITIAL_PASSWORD) return json({ error: 'Secret ADMIN_INITIAL_PASSWORD absent du Worker Super 2.' }, 503);
  if (!env.CASHFLOW_KV) return json({ error: 'CASHFLOW_KV absent.' }, 503);
  if (password !== env.ADMIN_INITIAL_PASSWORD) return json({ error: 'Mot de passe incorrect.' }, 401);

  const token = await createServerSession(env);
  const refreshToken = await createRefreshToken(env);

  const res = json({ success: true, token, refreshToken, expiresIn: SESSION_TTL });
  res.headers.append('Set-Cookie', buildSessionCookie(token, SESSION_TTL, request.url));
  if (refreshToken) {
    res.headers.append('Set-Cookie', buildCookie(REFRESH_COOKIE_NAME, refreshToken, SESSION_TTL, request.url));
  }
  return res;
}
async function handleCheckAuth(request, env) {
  if (await requireAdmin(request, env)) {
    return json({ valid: true, role: 'superadmin' });
  }

  const refreshToken = getRefreshFromRequest(request);
  if (refreshToken && await verifyRefreshToken(refreshToken, env)) {
    if (!env.CASHFLOW_KV) return json({ valid: false, error: 'CASHFLOW_KV absent.' }, 503);
    const token = await createServerSession(env);
    const res = json({
      valid: true,
      role: 'superadmin',
      token,
      refreshToken,
      restored: true,
      expiresIn: SESSION_TTL
    });
    res.headers.append('Set-Cookie', buildSessionCookie(token, SESSION_TTL, request.url));
    res.headers.append('Set-Cookie', buildCookie(REFRESH_COOKIE_NAME, refreshToken, SESSION_TTL, request.url));
    return res;
  }

  return json({ valid: false, role: 'superadmin' });
}
async function handleLogout(request, env) {
  const token = getTokenFromRequest(request);
  if (token && env.CASHFLOW_KV) await env.CASHFLOW_KV.delete('univers:session:' + token);
  const res = json({ success: true });
  res.headers.append('Set-Cookie', clearCookie(COOKIE_NAME, request.url));
  res.headers.append('Set-Cookie', clearCookie(REFRESH_COOKIE_NAME, request.url));
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
    }
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
    videoModel: safeText(body.videoModel || current.videoModel, 160),
    strictControl: body.strictControl !== false,
    imageGenerationEnabled: body.imageGenerationEnabled !== false,
    paidVideoGenerationEnabled: body.paidVideoGenerationEnabled === true,
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
    pixabay: !!(env.PIXABAY_API_KEY || env.PIXABAY_KEY_IMAGES || env.PIXABAY_KEY_VIDEO),
    pixabayImages: !!(env.PIXABAY_KEY_IMAGES || env.PIXABAY_API_KEY),
    pixabayVideo: !!(env.PIXABAY_KEY_VIDEO || env.PIXABAY_API_KEY),
    unsplash: !!(env.UNSPLASH_ACCES_KEY || env.UNSPLASH_ACCESS_KEY || env.UNSPLASH_KEY),
    openverse: true,
    freesound: !!env.FREESOUND_API_KEY,
    youtube: !!env.YOUTUBE_API_KEY,
    browser: !!env.BROWSER,
    images: !!env.IMAGES
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
  if (!type.startsWith('image/') && !type.startsWith('video/') && !type.startsWith('audio/')) return json({ error: 'Seulement image, vidéo ou audio.' }, 400);
  if (file.size > 80 * 1024 * 1024) return json({ error: 'Fichier trop volumineux (80 Mo maximum par envoi).' }, 413);
  const key = `super2/${eventId}/${Date.now()}-${uid('').slice(0,8)}-${slugFile(file.name)}`;
  await env.MEDIA_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: type }, customMetadata: { originalName: file.name || '' } });
  const mediaType = type.startsWith('video/') ? 'video' : type.startsWith('audio/') ? 'audio' : 'image';
  return json({ success: true, media: { key, url: `${API}/media/file/${encodeURIComponent(key)}`, type: mediaType, originalName: file.name || '' } });
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
  if (!ct.startsWith('image/') && !ct.startsWith('video/') && !ct.startsWith('audio/')) return json({ error: 'La ressource distante n’est pas une image, vidéo ou audio reconnue.' }, 400);
  const len = Number(r.headers.get('content-length') || 0);
  if (len && len > 80 * 1024 * 1024) return json({ error: 'Média distant trop volumineux.' }, 413);
  const ext = ct.includes('png') ? '.png' : ct.includes('jpeg') ? '.jpg' : ct.includes('webp') ? '.webp' : ct.includes('mp4') ? '.mp4' : ct.includes('webm') ? '.webm' : ct.includes('mpeg') ? '.mp3' : ct.includes('ogg') ? '.ogg' : ct.includes('wav') ? '.wav' : '';
  const key = `super2/${eventId}/${Date.now()}-${uid('').slice(0,8)}-import${ext}`;
  await env.MEDIA_BUCKET.put(key, r.body, { httpMetadata: { contentType: ct }, customMetadata: { sourceUrl: u.toString() } });
  const mediaType = ct.startsWith('video/') ? 'video' : ct.startsWith('audio/') ? 'audio' : 'image';
  return json({ success: true, media: { key, url: `${API}/media/file/${encodeURIComponent(key)}`, type: mediaType, originalName: safeText(body.label, 300) || 'Import' } });
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
  if (provider === 'pixabay') {
    if (!['image','video'].includes(type)) return json({ error: 'Pixabay fournit ici des images et des vidéos.' }, 400);
    const pixabayKey = type === 'video'
      ? (env.PIXABAY_KEY_VIDEO || env.PIXABAY_API_KEY || env.PIXABAY_KEY_IMAGES)
      : (env.PIXABAY_KEY_IMAGES || env.PIXABAY_API_KEY || env.PIXABAY_KEY_VIDEO);
    if (!pixabayKey) return json({ error: type === 'video' ? 'PIXABAY_KEY_VIDEO ou PIXABAY_API_KEY absent.' : 'PIXABAY_KEY_IMAGES ou PIXABAY_API_KEY absent.' }, 503);
    const cacheKey = `super2:assetcache:pixabay:${type}:${q.toLowerCase()}`;
    if (env.CASHFLOW_KV) {
      const cached = await readJsonKV(env, cacheKey, null);
      if (cached && Array.isArray(cached.results)) return json({ ...cached, cached:true });
    }
    const base = type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
    const params = new URLSearchParams({ key: pixabayKey, q, per_page: '12', safesearch: 'true', lang: 'fr' });
    if (type === 'image') params.set('orientation', 'vertical');
    const r = await fetch(base + '?' + params.toString());
    if (!r.ok) return json({ error: 'Pixabay a refusé la recherche.', detail: (await r.text()).slice(0,800) }, 502);
    const d = await r.json();
    let results=[];
    if (type === 'video') {
      results = (d.hits || []).map(v => {
        const f = v.videos || {};
        const best = f.medium || f.large || f.small || f.tiny || {};
        return { provider:'pixabay', type:'video', id:String(v.id||''), preview:best.thumbnail||'', url:best.url||'', author:v.user||'', sourcePage:v.pageURL||'', name:(v.tags||'Vidéo Pixabay'), license:'Pixabay Content License' };
      }).filter(x=>x.url);
    } else {
      results = (d.hits || []).map(p => ({ provider:'pixabay', type:'image', id:String(p.id||''), preview:p.webformatURL||p.previewURL||'', url:p.largeImageURL||p.webformatURL||'', author:p.user||'', sourcePage:p.pageURL||'', name:p.tags||'Image Pixabay', license:'Pixabay Content License' })).filter(x=>x.url);
    }
    const payload={results};
    if(env.CASHFLOW_KV) await env.CASHFLOW_KV.put(cacheKey,JSON.stringify(payload),{expirationTtl:86400});
    return json(payload);
  }
  if (provider === 'openverse') {
    if (!['image','audio'].includes(type)) return json({ error: 'Openverse fournit ici des images et de l’audio.' }, 400);
    const endpoint = type === 'audio' ? 'https://api.openverse.org/v1/audio/' : 'https://api.openverse.org/v1/images/';
    const r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}&page_size=12`);
    if (!r.ok) return json({ error: 'Openverse a refusé la recherche.', detail: (await r.text()).slice(0,800) }, 502);
    const d = await r.json();
    const results = (d.results || []).map(x => ({
      provider:'openverse', type, id:String(x.id||''), name:safeText(x.title,300)||'Openverse',
      preview:type==='audio' ? (x.url||'') : (x.thumbnail||x.url||''), url:x.url||'',
      author:x.creator||'', sourcePage:x.foreign_landing_url||'', duration:type==='audio' ? Number(x.duration||0)/1000 : 0,
      license:[x.license,x.license_version].filter(Boolean).join(' ').toUpperCase(), attribution:safeText(x.attribution,1000)
    })).filter(x=>x.url);
    return json({ results });
  }
  if (provider === 'freesound') {
    if (!env.FREESOUND_API_KEY) return json({ error: 'FREESOUND_API_KEY absent.' }, 503);
    if (type !== 'audio') return json({ error: 'Freesound est utilisé ici pour les sons.' }, 400);
    const endpoint = `https://freesound.org/apiv2/search/?query=${encodeURIComponent(q)}&page_size=12&fields=id,name,previews,username,url,duration,license`;
    const r = await fetch(endpoint, { headers: { Authorization: `Token ${env.FREESOUND_API_KEY}` } });
    if (!r.ok) return json({ error: 'Freesound a refusé la recherche.', detail: (await r.text()).slice(0,800) }, 502);
    const d = await r.json();
    const results = (d.results || []).map(s => {
      const p = s.previews || {};
      const audioUrl = p['preview-hq-mp3'] || p['preview-lq-mp3'] || p['preview-hq-ogg'] || p['preview-lq-ogg'] || '';
      return {
        provider: 'freesound',
        type: 'audio',
        id: String(s.id || ''),
        name: safeText(s.name, 300),
        preview: audioUrl,
        url: audioUrl,
        author: safeText(s.username, 200),
        sourcePage: safeText(s.url, 1000),
        duration: Number(s.duration || 0),
        license: safeText(s.license, 500)
      };
    }).filter(x => x.url);
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


async function readPerformance(env) {
  const rows = await readJsonKV(env, PERFORMANCE_KEY, []);
  return Array.isArray(rows) ? rows : [];
}
function metric(n, d) { return d > 0 ? n / d : 0; }
function performanceSummary(rows, eventId = '') {
  const all = (rows || []).map(r => ({
    ...r,
    ctr: metric(Number(r.clicks||0), Number(r.impressions||0)),
    cpl: Number(r.leads||0) > 0 ? Number(r.spend||0) / Number(r.leads||0) : 0,
    cpa: Number(r.sales||0) > 0 ? Number(r.spend||0) / Number(r.sales||0) : 0,
    roas: Number(r.spend||0) > 0 ? Number(r.revenue||0) / Number(r.spend||0) : 0
  }));
  const relevant = eventId ? all.filter(r => r.eventId === eventId) : all;
  const source = relevant.length ? relevant : all;
  const totals = source.reduce((a,r) => {
    ['spend','impressions','clicks','leads','sales','revenue'].forEach(k => a[k] += Number(r[k]||0)); return a;
  }, {spend:0,impressions:0,clicks:0,leads:0,sales:0,revenue:0});
  const top = source.slice().sort((a,b) => (b.roas*100 + b.sales*10 + b.ctr) - (a.roas*100 + a.sales*10 + a.ctr)).slice(0,8)
    .map(r => ({ platform:r.platform, format:r.format, angle:r.angle, hook:r.hook, ctr:r.ctr, cpl:r.cpl, cpa:r.cpa, roas:r.roas, sales:r.sales, notes:r.notes }));
  return {
    records: source.length,
    totals,
    averages: { ctr: metric(totals.clicks, totals.impressions), cpl: totals.leads ? totals.spend/totals.leads : 0, cpa: totals.sales ? totals.spend/totals.sales : 0, roas: totals.spend ? totals.revenue/totals.spend : 0 },
    top
  };
}
async function handlePerformance(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  if (request.method === 'GET') {
    const rows = await readPerformance(env);
    return json({ rows, summary: performanceSummary(rows) });
  }
  const b = await request.json().catch(()=>({}));
  const rows = await readPerformance(env);
  const id = safeText(b.id,100) || uid('perf-');
  const row = {
    id,
    eventId:safeText(b.eventId,100), postId:safeText(b.postId,100), date:safeText(b.date,30),
    platform:safeText(b.platform,40), format:safeText(b.format,60), angle:safeText(b.angle,600), hook:safeText(b.hook,1500),
    spend:clampNumber(b.spend,0,1e9,0), impressions:clampNumber(b.impressions,0,1e12,0), clicks:clampNumber(b.clicks,0,1e12,0),
    leads:clampNumber(b.leads,0,1e12,0), sales:clampNumber(b.sales,0,1e12,0), revenue:clampNumber(b.revenue,0,1e12,0),
    notes:safeText(b.notes,3000), updatedAt:nowIso()
  };
  const i=rows.findIndex(x=>x.id===id); if(i>=0) rows[i]=row; else rows.unshift(row);
  await writeJsonKV(env, PERFORMANCE_KEY, rows.slice(0,1000));
  return json({ success:true, row, rows, summary:performanceSummary(rows) });
}
async function handlePerformanceDelete(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  const b=await request.json().catch(()=>({}));
  const rows=(await readPerformance(env)).filter(x=>x.id!==b.id);
  await writeJsonKV(env, PERFORMANCE_KEY, rows);
  return json({ success:true, rows, summary:performanceSummary(rows) });
}
function contextKey(v){ return safeText(v,100).replace(/[^a-zA-Z0-9_-]/g,'') || 'general'; }
async function handleBrief(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  if(request.method==='GET'){
    const eventId=contextKey(new URL(request.url).searchParams.get('eventId'));
    return json({ brief: await readJsonKV(env, BRIEF_PREFIX+eventId, '') });
  }
  const b=await request.json().catch(()=>({})), eventId=contextKey(b.eventId);
  const brief=safeText(b.brief,12000); await writeJsonKV(env,BRIEF_PREFIX+eventId,brief);
  return json({success:true,brief});
}
async function handleChat(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  const url=new URL(request.url);
  if(request.method==='GET'){
    const eventId=contextKey(url.searchParams.get('eventId'));
    const history=await readJsonKV(env,CHAT_PREFIX+eventId,[]);
    const brief=await readJsonKV(env,BRIEF_PREFIX+eventId,'');
    return json({history:Array.isArray(history)?history:[],brief});
  }
  const b=await request.json().catch(()=>({}));
  const eventId=contextKey(b.eventId), message=safeText(b.message,7000);
  if(!message)return json({error:'Écris un message à NyXia.'},400);
  const settings=await getSettings(env);
  const historyRaw=await readJsonKV(env,CHAT_PREFIX+eventId,[]);
  const history=Array.isArray(historyRaw)?historyRaw:[];
  const brief=await readJsonKV(env,BRIEF_PREFIX+eventId,'');
  const perf=performanceSummary(await readPerformance(env), eventId==='general'?'':eventId);
  const event=eventId==='general'?null:await readEvent(env,eventId);
  const truth=event?campaignTruth(event,settings):null;
  const system=`Tu es NyXia Créative, la partenaire créative de Diane dans son Super Admin privé. Tu peux discuter normalement, rebondir sur une idée, améliorer un texte, proposer des angles, poser une question utile et challenger une idée avec bienveillance. Tu n'es PAS un distributeur automatique de prompts.\n\nRÈGLE DE VÉRITÉ: une conversation créative ou un brief ne modifie jamais silencieusement les faits d'une campagne. Si une Fiche Maîtresse est fournie, elle est prioritaire sur toute idée. Le brief créatif peut guider le ton, les angles et les formes, jamais contredire les faits verrouillés. Si Diane brainstorme quelque chose qui change un fait, indique clairement que c'est une idée à valider dans la Fiche Maîtresse.\n\nSTYLE: français naturel du Québec, tutoiement, concret, créatif, pas vendeur de tapis. Tu peux être enthousiaste mais utile. Ne remplis pas avec du blabla.\n\nBRIEF CRÉATIF ACTUEL:\n${brief||'(aucun)'}\n\nMÉMOIRE DE PERFORMANCE:\n${JSON.stringify(perf)}\n\nFICHE MAÎTRESSE / CONTEXTE:\n${truth?JSON.stringify(truth):'(conversation générale)'}`;
  const msgs=[{role:'system',content:system},...history.slice(-24).map(x=>({role:x.role,content:x.content})),{role:'user',content:message}];
  const answer=await aimlChat(env,settings.brainModel,msgs,false);
  const saved=[...history,{role:'user',content:message,at:nowIso()},{role:'assistant',content:answer,at:nowIso()}].slice(-60);
  await writeJsonKV(env,CHAT_PREFIX+eventId,saved);
  return json({success:true,answer,history:saved,brief});
}
async function handleChatClear(request, env){
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  const b=await request.json().catch(()=>({})); const eventId=contextKey(b.eventId); await writeJsonKV(env,CHAT_PREFIX+eventId,[]); return json({success:true});
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
    generatedVideoUrl: safeText(p.generatedVideoUrl, 5000),
    generatedVideoStorageKey: safeText(p.generatedVideoStorageKey, 1000),
    generatedVideoJobId: safeText(p.generatedVideoJobId, 300),
    generatedVideoStatus: safeText(p.generatedVideoStatus, 80),
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
  truth.creativeBrief = await readJsonKV(env, BRIEF_PREFIX + event.id, '');
  truth.performanceMemory = performanceSummary(await readPerformance(env), event.id);
  const count = Math.round(clampNumber(body.count, 1, 60, 14));
  const instructions = `Tu es NyXia Créatrice. Tu ne redéfinis JAMAIS la campagne.\n
RÈGLE ABSOLUE : dans CAMPAGNE_VERROUILLEE, event.* contient les faits. creativeBrief et performanceMemory sont seulement des guides de création et d'apprentissage; ils ne deviennent jamais des faits et ne peuvent jamais contredire event.*. Si une information factuelle n'est pas dans event.*, tu ne l'inventes pas. Tu es créative sur la forme, jamais sur les faits.\n
Pour les vidéos : ${settings.paidVideoGenerationEnabled ? 'la génération vidéo IA premium est autorisée uniquement sur action manuelle de la propriétaire; tu peux prévoir des concepts qui pourraient bénéficier d’un clip premium, mais tu ne déclenches jamais toi-même une dépense' : 'aucune génération vidéo IA payante'}. Le fond vidéo officiel ciel étoilé + étoiles filantes reste la signature; tu composes par-dessus avec texte glow, images, médias cœur, Pexels/Unsplash, captures et animations.\n
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
Tu vérifies aussi : palette NyXia obligatoire; fond ciel étoilé + étoiles filantes comme signature vidéo; visages officiels verrouillés; ${settings.paidVideoGenerationEnabled ? 'vidéo IA premium permise seulement comme dépense manuelle explicitement déclenchée par la propriétaire' : 'aucune vidéo IA payante'}.\n
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

async function storeGeneratedVideo(env, eventId, rawUrl) {
  if (!rawUrl) return { url: '', storageKey: '' };
  if (!env.MEDIA_BUCKET) return { url: rawUrl, storageKey: '' };

  const r = await fetch(rawUrl, { headers: { 'User-Agent': 'NyXiaCreator/1.0' } });
  if (!r.ok || !r.body) return { url: rawUrl, storageKey: '' };

  let ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('video/')) ct = 'video/mp4';
  const len = Number(r.headers.get('content-length') || 0);
  if (len && len > 250 * 1024 * 1024) return { url: rawUrl, storageKey: '' };

  const ext = ct.includes('webm') ? '.webm' : '.mp4';
  const key = `super2/${eventId}/${Date.now()}-${uid('').slice(0,8)}-ai-video${ext}`;
  await env.MEDIA_BUCKET.put(key, r.body, {
    httpMetadata: { contentType: ct },
    customMetadata: { sourceUrl: rawUrl, source: 'aimlapi-video' }
  });
  return { url: `${API}/media/file/${encodeURIComponent(key)}`, storageKey: key };
}

function premiumVideoPrompt(event, settings, post) {
  const sceneIdeas = ((post.video && post.video.scenes) || [])
    .map(s => s.searchQuery || s.text || '')
    .filter(Boolean)
    .slice(0,4)
    .join(' | ');
  const idea = sceneIdeas || post.imagePrompt || post.hook || post.angle || event.exactTheme;
  return safeText(
    `Vertical cinematic marketing clip, visually strong, premium and modern. No readable text inside the generated footage because NyXia adds typography later. ` +
    `Campaign subject: ${event.exactTheme}. Visual idea: ${idea}. ` +
    `Palette inspiration: ${settings.brand.night}, ${settings.brand.violet}, ${settings.brand.lavender}, subtle golden light ${settings.brand.gold}. ` +
    `${settings.brand.visualRule}. Do not create or imitate any official NyXia character or recognizable face. ` +
    `The generated clip will be used as a visual insert inside the NyXia fixed starry-sky video identity.`,
    7000
  );
}

async function handleGenerateVideoStart(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const event = await readEvent(env, safeText(body.eventId, 100));
  if (!event || !event.locked) return json({ error: 'Campagne verrouillée requise.' }, 409);

  const settings = await getSettings(env);
  if (!settings.paidVideoGenerationEnabled) return json({ error: 'Vidéo IA premium désactivée dans Charte & moteurs.' }, 403);
  if (!env.AIMLAPI_CREATOR_KEY) return json({ error: 'AIMLAPI_CREATOR_KEY absent.' }, 503);
  if (!settings.videoModel) return json({ error: 'Choisis un moteur vidéo AIMLAPI dans Charte & moteurs.' }, 400);

  const plan = await readJsonKV(env, PLAN_PREFIX + event.id, null);
  const post = plan && Array.isArray(plan.posts) ? plan.posts.find(p => p.id === body.postId) : null;
  if (!post) return json({ error: 'Contenu introuvable dans le plan.' }, 404);
  if (post.format !== 'short-video') return json({ error: 'Ce contenu n’est pas un format vidéo.' }, 400);
  if ((post.characterReferences || []).length) {
    return json({ error: 'Clip IA premium bloqué pour ce contenu : il contient un personnage officiel. Utilise le Studio vidéo avec sa vraie image pour préserver son visage.' }, 409);
  }

  const prompt = safeText(body.prompt, 7000) || premiumVideoPrompt(event, settings, post);
  const r = await fetch('https://api.aimlapi.com/v2/video/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AIMLAPI_CREATOR_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: settings.videoModel, prompt })
  });
  if (!r.ok) return json({ error: 'AIMLAPI a refusé la génération vidéo.', detail: (await r.text()).slice(0,1000) }, 502);
  const d = await r.json();
  const generationId = safeText(d && (d.id || d.generation_id), 300);
  if (!generationId) return json({ error: 'AIMLAPI n’a retourné aucun identifiant de génération.' }, 502);

  post.generatedVideoJobId = generationId;
  post.generatedVideoStatus = safeText(d.status, 80) || 'queued';
  post.updatedAt = nowIso();
  plan.updatedAt = nowIso();
  await writeJsonKV(env, PLAN_PREFIX + event.id, plan);

  return json({
    success: true,
    generationId,
    status: post.generatedVideoStatus,
    model: settings.videoModel,
    prompt
  });
}

async function handleGenerateVideoStatus(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.AIMLAPI_CREATOR_KEY) return json({ error: 'AIMLAPI_CREATOR_KEY absent.' }, 503);

  const u = new URL(request.url);
  const eventId = safeText(u.searchParams.get('eventId'), 100);
  const postId = safeText(u.searchParams.get('postId'), 100);
  const event = await readEvent(env, eventId);
  if (!event) return json({ error: 'Événement introuvable.' }, 404);

  const plan = await readJsonKV(env, PLAN_PREFIX + event.id, null);
  const post = plan && Array.isArray(plan.posts) ? plan.posts.find(p => p.id === postId) : null;
  if (!post) return json({ error: 'Contenu introuvable.' }, 404);

  const generationId = safeText(u.searchParams.get('generationId'), 300) || post.generatedVideoJobId;
  if (!generationId) return json({ error: 'Identifiant de génération manquant.' }, 400);

  if (post.generatedVideoUrl && post.generatedVideoStatus === 'completed') {
    return json({
      success: true,
      status: 'completed',
      video: { url: post.generatedVideoUrl, storageKey: post.generatedVideoStorageKey || '' },
      post
    });
  }

  const r = await fetch(`https://api.aimlapi.com/v2/video/generations?generation_id=${encodeURIComponent(generationId)}`, {
    headers: { Authorization: `Bearer ${env.AIMLAPI_CREATOR_KEY}` }
  });
  if (!r.ok) return json({ error: 'Impossible de vérifier la vidéo AIMLAPI.', detail: (await r.text()).slice(0,1000) }, 502);
  const d = await r.json();

  const status = safeText(d && d.status, 80) || 'processing';
  post.generatedVideoJobId = generationId;
  post.generatedVideoStatus = status;

  let finalUrl = '';
  if (d && d.video && d.video.url) finalUrl = safeText(d.video.url, 5000);
  else if (d && d.data && d.data.video && d.data.video.url) finalUrl = safeText(d.data.video.url, 5000);
  else if (d && d.url) finalUrl = safeText(d.url, 5000);

  if (status === 'completed' && finalUrl) {
    const stored = await storeGeneratedVideo(env, event.id, finalUrl);
    post.generatedVideoUrl = stored.url || finalUrl;
    post.generatedVideoStorageKey = stored.storageKey || '';
  }

  post.updatedAt = nowIso();
  plan.updatedAt = nowIso();
  await writeJsonKV(env, PLAN_PREFIX + event.id, plan);

  return json({
    success: true,
    status,
    error: d && d.error || null,
    video: post.generatedVideoUrl ? { url: post.generatedVideoUrl, storageKey: post.generatedVideoStorageKey || '' } : null,
    post
  });
}


function isPrivateHost(host){
  const h=String(host||'').toLowerCase();
  if(h==='localhost'||h.endsWith('.local')||h==='127.0.0.1'||h==='::1')return true;
  if(/^10\./.test(h)||/^192\.168\./.test(h))return true;
  const m=h.match(/^172\.(\d+)\./); if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
  return false;
}
async function handleCapturePage(request, env){
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  if(!env.BROWSER)return json({error:'Binding Cloudflare BROWSER absent.'},503);
  if(!env.MEDIA_BUCKET)return json({error:'R2 MEDIA_BUCKET absent.'},503);
  const b=await request.json().catch(()=>({})); let u;
  try{u=new URL(safeText(b.url,3000))}catch(_){return json({error:'URL invalide.'},400)}
  if(!['http:','https:'].includes(u.protocol)||isPrivateHost(u.hostname))return json({error:'Adresse non autorisée.'},400);
  const presets={mobile:{width:430,height:932},desktop:{width:1440,height:900},square:{width:1080,height:1080}};
  const viewport=presets[b.preset]||presets.mobile;
  const result=await env.BROWSER.quickAction('screenshot',{url:u.toString(),viewport,screenshotOptions:{fullPage:!!b.fullPage}});
  let bytes=null,ct='image/png';
  if(result instanceof Response){if(!result.ok)return json({error:'Browser Run a refusé la capture.',detail:(await result.text()).slice(0,800)},502);ct=result.headers.get('content-type')||ct;bytes=await result.arrayBuffer()}
  else if(result&&result.screenshot){bytes=b64ToBytes(result.screenshot).buffer}
  else if(result instanceof ArrayBuffer){bytes=result}
  if(!bytes)return json({error:'Capture Browser Run vide.'},502);
  const eventId=contextKey(b.eventId||'screenshots'); const key=`super2/${eventId}/${Date.now()}-${uid('').slice(0,8)}-screenshot.png`;
  await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:ct},customMetadata:{sourceUrl:u.toString(),source:'browser-run'}});
  return json({success:true,media:{key,url:`${API}/media/file/${encodeURIComponent(key)}`,type:'image',originalName:'capture-page.png'},sourceUrl:u.toString()});
}
async function handleImageTransform(request, env){
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  if(!env.MEDIA_BUCKET)return json({error:'R2 MEDIA_BUCKET absent.'},503);
  if(!env.IMAGES)return json({error:'Binding Cloudflare IMAGES absent.'},503);
  const u=new URL(request.url),key=safeText(u.searchParams.get('key'),1000),preset=safeText(u.searchParams.get('preset'),40)||'square';
  if(!key.startsWith('super2/'))return json({error:'Clé média invalide.'},400);
  const presets={square:{width:1080,height:1080},feed:{width:1080,height:1350},story:{width:1080,height:1920},landscape:{width:1200,height:628}};
  const dim=presets[preset]; if(!dim)return json({error:'Format inconnu.'},400);
  const obj=await env.MEDIA_BUCKET.get(key); if(!obj)return json({error:'Image introuvable.'},404);
  const out=await env.IMAGES.input(obj.body).transform({...dim,fit:'cover',gravity:'center'}).output({format:'image/jpeg',quality:90});
  const headers={'Cache-Control':'private, max-age=3600'};
  if(u.searchParams.get('download')==='1')headers['Content-Disposition']=`attachment; filename="nyxia-${preset}.jpg"`;
  return out.response({headers});
}

function customToolId(v) {
  return safeText(v, 100).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
}
function sanitizeObjectMap(raw, maxEntries = 40) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.entries(raw).slice(0,maxEntries).forEach(([k,v]) => {
    const key=safeText(k,120);
    if (!key) return;
    out[key]=safeText(v,8000);
  });
  return out;
}
function sanitizeCustomTool(raw, existing = null) {
  const methods=['GET','POST','PUT','PATCH','DELETE'];
  const authModes=['none','header','query'];
  const bodyTypes=['none','json','text'];
  const id=customToolId(raw && raw.id) || (existing && existing.id) || ('tool-'+crypto.randomUUID().slice(0,8));
  const fields=Array.isArray(raw && raw.fields) ? raw.fields.slice(0,30).map((f,i)=>({
    id: customToolId(f.id || f.name) || `field-${i+1}`,
    name: safeText(f.name,100).replace(/[^A-Za-z0-9_.-]/g,''),
    label: safeText(f.label || f.name,160),
    location: ['path','query','body','header'].includes(f.location) ? f.location : 'query',
    defaultValue: safeText(f.defaultValue,5000),
    required: !!f.required
  })).filter(f=>f.name) : [];
  return {
    id,
    name: safeText(raw && raw.name,160) || (existing && existing.name) || 'Nouvel outil API',
    icon: safeText(raw && raw.icon,20) || '🧩',
    category: safeText(raw && raw.category,80) || 'utilitaires',
    method: methods.includes(String(raw && raw.method || '').toUpperCase()) ? String(raw.method).toUpperCase() : 'GET',
    host: safeText(raw && raw.host,260).replace(/^https?:\/\//i,'').replace(/\/$/,''),
    pathTemplate: safeText(raw && raw.pathTemplate,3000) || '/',
    fixedHeaders: sanitizeObjectMap(raw && raw.fixedHeaders),
    fixedQuery: sanitizeObjectMap(raw && raw.fixedQuery),
    bodyType: bodyTypes.includes(raw && raw.bodyType) ? raw.bodyType : 'none',
    bodyTemplate: safeText(raw && raw.bodyTemplate,50000),
    authMode: authModes.includes(raw && raw.authMode) ? raw.authMode : 'none',
    authName: safeText(raw && raw.authName,160),
    authPrefix: safeText(raw && raw.authPrefix,120),
    authSecretName: safeText(raw && raw.authSecretName,160).replace(/[^A-Za-z0-9_]/g,''),
    fields,
    enabled: raw && raw.enabled !== false,
    createdAt: existing && existing.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}
function safeCustomHost(host) {
  const h=String(host||'').toLowerCase().split(':')[0].replace(/^\[|\]$/g,'');
  if (!h || h==='localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h==='metadata.google.internal') return false;
  if (h==='::1' || h==='0.0.0.0' || h==='169.254.169.254') return false;
  const m=h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a=m.slice(1).map(Number); if(a.some(x=>x<0||x>255))return false;
    if(a[0]===10 || a[0]===127 || (a[0]===169&&a[1]===254) || (a[0]===192&&a[1]===168) || (a[0]===172&&a[1]>=16&&a[1]<=31)) return false;
  }
  return /^[a-z0-9.-]+$/i.test(h) && h.includes('.');
}
function applyToolTemplate(value, values, encode = false) {
  return String(value||'').replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g,(_,name)=>{
    const v=values && values[name] != null ? String(values[name]) : '';
    return encode ? encodeURIComponent(v) : v;
  });
}
function smartValue(v) {
  const s=String(v==null?'':v).trim();
  if (s==='true') return true; if (s==='false') return false; if (s==='null') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('{')&&s.endsWith('}'))||(s.startsWith('[')&&s.endsWith(']'))) { try{return JSON.parse(s)}catch(_){} }
  return v == null ? '' : v;
}
async function readCustomTools(env) {
  const rows=await readJsonKV(env,CUSTOM_TOOLS_KEY,[]);
  return Array.isArray(rows)?rows:[];
}
async function handleCustomTools(request, env, id = '') {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  const rows=await readCustomTools(env);
  if (request.method==='GET') return json({ tools:rows });
  if (request.method==='DELETE') {
    const next=rows.filter(x=>x.id!==id); await writeJsonKV(env,CUSTOM_TOOLS_KEY,next); return json({success:true,tools:next});
  }
  const body=await request.json().catch(()=>({}));
  if (request.method==='POST') {
    const tool=sanitizeCustomTool(body); if(!tool.host)return json({error:'Hôte API requis.'},400); if(!safeCustomHost(tool.host))return json({error:'Hôte API refusé pour sécurité.'},400);
    const next=[tool,...rows.filter(x=>x.id!==tool.id)].slice(0,200); await writeJsonKV(env,CUSTOM_TOOLS_KEY,next); return json({success:true,tool,tools:next});
  }
  if (request.method==='PUT') {
    const old=rows.find(x=>x.id===id); if(!old)return json({error:'Outil introuvable.'},404);
    const tool=sanitizeCustomTool({...body,id},old); if(!tool.host||!safeCustomHost(tool.host))return json({error:'Hôte API invalide ou refusé.'},400);
    const next=rows.map(x=>x.id===id?tool:x); await writeJsonKV(env,CUSTOM_TOOLS_KEY,next); return json({success:true,tool,tools:next});
  }
  return json({error:'Méthode non supportée.'},405);
}
async function handleCustomToolCall(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  const b=await request.json().catch(()=>({}));
  const tools=await readCustomTools(env),tool=tools.find(x=>x.id===safeText(b.id,100));
  if(!tool||!tool.enabled)return json({error:'Outil introuvable ou désactivé.'},404);
  if(!safeCustomHost(tool.host))return json({error:'Hôte API refusé pour sécurité.'},400);
  const values=b.values&&typeof b.values==='object'?b.values:{};
  for(const f of tool.fields||[]) if(f.required && !String(values[f.name]??f.defaultValue??'').trim()) return json({error:`Champ requis : ${f.label||f.name}`},400);
  const resolved={}; (tool.fields||[]).forEach(f=>resolved[f.name]=values[f.name]!=null?values[f.name]:f.defaultValue||'');
  let path=applyToolTemplate(tool.pathTemplate||'/',resolved,true); if(!path.startsWith('/'))path='/'+path;
  const qs=new URLSearchParams(); Object.entries(tool.fixedQuery||{}).forEach(([k,v])=>qs.set(k,applyToolTemplate(v,resolved,false)));
  (tool.fields||[]).filter(f=>f.location==='query').forEach(f=>qs.set(f.name,String(resolved[f.name]??'')));
  const headers=new Headers(); Object.entries(tool.fixedHeaders||{}).forEach(([k,v])=>{
    const lk=k.toLowerCase(); if(['host','cookie','authorization','cf-connecting-ip','x-univers-token','x-univers-refresh'].includes(lk)||lk.startsWith('cf-'))return;
    headers.set(k,applyToolTemplate(v,resolved,false));
  });
  (tool.fields||[]).filter(f=>f.location==='header').forEach(f=>headers.set(f.name,String(resolved[f.name]??'')));
  if(tool.authMode!=='none') {
    if(!tool.authSecretName)return json({error:'Nom du secret Cloudflare manquant dans la configuration.'},400);
    const secret=env[tool.authSecretName]; if(!secret)return json({error:`Secret Cloudflare absent : ${tool.authSecretName}`},503);
    if(tool.authMode==='header') { if(!tool.authName)return json({error:'Nom du header d’authentification manquant.'},400); headers.set(tool.authName,(tool.authPrefix||'')+secret); }
    else { if(!tool.authName)return json({error:'Nom du paramètre d’authentification manquant.'},400); qs.set(tool.authName,(tool.authPrefix||'')+secret); }
  }
  const options={method:tool.method,headers,redirect:'follow'};
  if(!['GET','DELETE'].includes(tool.method) && tool.bodyType!=='none') {
    if(tool.bodyTemplate) {
      options.body=applyToolTemplate(tool.bodyTemplate,resolved,false);
      if(tool.bodyType==='json'&&!headers.has('content-type'))headers.set('content-type','application/json');
    } else if(tool.bodyType==='json') {
      const obj={}; (tool.fields||[]).filter(f=>f.location==='body').forEach(f=>obj[f.name]=smartValue(resolved[f.name])); options.body=JSON.stringify(obj); if(!headers.has('content-type'))headers.set('content-type','application/json');
    } else {
      options.body=(tool.fields||[]).filter(f=>f.location==='body').map(f=>String(resolved[f.name]??'')).join('\n');
    }
  }
  const target=`https://${tool.host}${path}${qs.toString()?'?'+qs.toString():''}`;
  const started=Date.now(); let r;
  try{r=await fetch(target,options)}catch(e){return json({error:'Appel API impossible.',detail:String(e&&e.message||e)},502)}
  const text=(await r.text()).slice(0,300000); let data=text; try{data=JSON.parse(text)}catch(_){}
  const responseHeaders={}; ['content-type','content-length','x-ratelimit-remaining','retry-after'].forEach(k=>{const v=r.headers.get(k);if(v)responseHeaders[k]=v});
  return json({success:r.ok,status:r.status,statusText:r.statusText,durationMs:Date.now()-started,url:target.replace(/([?&](?:key|api_key|token|access_token|client_secret)=)[^&]+/ig,'$1***'),headers:responseHeaders,data},r.ok?200:502);
}

async function handleYouTubeRadar(request, env){
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  if(!env.YOUTUBE_API_KEY)return json({error:'YOUTUBE_API_KEY absent.'},503);
  const u=new URL(request.url),q=safeText(u.searchParams.get('q'),200),region=safeText(u.searchParams.get('region'),4).toUpperCase(),days=Math.round(clampNumber(u.searchParams.get('days'),1,365,30));
  if(!q)return json({error:'Recherche YouTube requise.'},400);
  const after=new Date(Date.now()-days*86400000).toISOString();
  const p=new URLSearchParams({part:'snippet',type:'video',maxResults:'12',q,order:'viewCount',publishedAfter:after,relevanceLanguage:'fr',key:env.YOUTUBE_API_KEY});
  if(['CA','FR','BE','CH'].includes(region))p.set('regionCode',region);
  const r=await fetch('https://www.googleapis.com/youtube/v3/search?'+p.toString());
  if(!r.ok)return json({error:'YouTube a refusé la recherche.',detail:(await r.text()).slice(0,1000)},502);
  const d=await r.json(),ids=(d.items||[]).map(x=>x.id&&x.id.videoId).filter(Boolean);
  if(!ids.length)return json({results:[]});
  const sr=await fetch('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({part:'statistics,contentDetails',id:ids.join(','),key:env.YOUTUBE_API_KEY}).toString());
  const sd=sr.ok?await sr.json():{items:[]}; const sm=new Map((sd.items||[]).map(x=>[x.id,x]));
  const results=(d.items||[]).map(x=>{const id=x.id.videoId,s=sm.get(id)||{},st=s.statistics||{};return{id,title:x.snippet.title,description:x.snippet.description,channel:x.snippet.channelTitle,publishedAt:x.snippet.publishedAt,thumbnail:(x.snippet.thumbnails&&((x.snippet.thumbnails.high||x.snippet.thumbnails.medium||x.snippet.thumbnails.default)||{}).url)||'',views:Number(st.viewCount||0),likes:Number(st.likeCount||0),comments:Number(st.commentCount||0),url:`https://www.youtube.com/watch?v=${id}`}});
  return json({results,query:q,days,region});
}
async function handleYouTubeAnalyze(request,env){
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  const b=await request.json().catch(()=>({})),items=Array.isArray(b.items)?b.items.slice(0,12):[]; if(!items.length)return json({error:'Aucun résultat à analyser.'},400);
  const settings=await getSettings(env),perf=performanceSummary(await readPerformance(env));
  const prompt=`Tu es NyXia Créative en mode Radar. Analyse ces résultats YouTube publics pour comprendre les MÉCANISMES d'attention: thèmes, angles, promesses, structures de titres, questions, tensions, formats. Ne copie jamais un titre ni le contenu d'un créateur. Cherche des opportunités originales adaptées à l'univers NyXia. Mets en évidence ce qui est observation vs hypothèse.\n\nRECHERCHE: ${safeText(b.query,300)}\nRÉSULTATS: ${JSON.stringify(items)}\nMÉMOIRE DE PERFORMANCE NYXIA: ${JSON.stringify(perf)}\n\nRéponds en français, avec: 1) ce qui ressort, 2) 5 angles originaux NyXia, 3) ce qu'il vaut mieux éviter, 4) une petite expérience à tester.`;
  const answer=await aimlChat(env,settings.brainModel,[{role:'system',content:'Tu analyses les tendances sans plagier ni présenter des corrélations comme des certitudes.'},{role:'user',content:prompt}],false);
  return json({success:true,answer});
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
      if (path === API + '/capture/page' && request.method === 'POST') return await handleCapturePage(request, env);
      if (path === API + '/media/transform' && request.method === 'GET') return await handleImageTransform(request, env);
      if (path === API + '/chat' && (request.method === 'GET' || request.method === 'POST')) return await handleChat(request, env);
      if (path === API + '/chat/clear' && request.method === 'POST') return await handleChatClear(request, env);
      if (path === API + '/chat/brief' && (request.method === 'GET' || request.method === 'POST')) return await handleBrief(request, env);
      if (path === API + '/performance' && (request.method === 'GET' || request.method === 'POST')) return await handlePerformance(request, env);
      if (path === API + '/performance/delete' && request.method === 'POST') return await handlePerformanceDelete(request, env);
      if (path === API + '/radar/youtube' && request.method === 'GET') return await handleYouTubeRadar(request, env);
      if (path === API + '/radar/youtube/analyze' && request.method === 'POST') return await handleYouTubeAnalyze(request, env);

      if (path === API + '/labo/tools' && (request.method === 'GET' || request.method === 'POST')) return await handleCustomTools(request, env);
      if (path.startsWith(API + '/labo/tools/') && (request.method === 'PUT' || request.method === 'DELETE')) return await handleCustomTools(request, env, decodeURIComponent(path.slice((API + '/labo/tools/').length)));
      if (path === API + '/labo/call' && request.method === 'POST') return await handleCustomToolCall(request, env);

      if (path === API + '/creator/plan' && request.method === 'POST') return await handleGeneratePlan(request, env);
      if (path === API + '/creator/plan' && request.method === 'GET') return await handleGetPlan(request, env);
      if (path === API + '/creator/plan/save' && request.method === 'POST') return await handleSavePlan(request, env);
      if (path === API + '/creator/image' && request.method === 'POST') return await handleGenerateImage(request, env);
      if (path === API + '/creator/video/start' && request.method === 'POST') return await handleGenerateVideoStart(request, env);
      if (path === API + '/creator/video/status' && request.method === 'GET') return await handleGenerateVideoStatus(request, env);
      if (path === API + '/portals' && request.method === 'GET') return await handlePortalRegistry(request, env);

      return json({ error: 'Route Super Admin 2 introuvable.' }, 404);
    } catch (e) {
      console.error('super2', e);
      return json({ error: 'Erreur Super Admin 2.', detail: String(e && e.message || e) }, 500);
    }
  }
};
