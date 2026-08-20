// ============================================================
// NyXia — Univers (SuperAdmin central)
// Auth : secret ADMIN_INITIAL_PASSWORD uniquement
// KV  : écritures UNIQUEMENT sous le préfixe univers:
//       (aucune lecture/écriture de admin:credentials ni sessions Studio)
// ============================================================

const SESSION_TTL = 60 * 60 * 12; // 12 h
const COOKIE_NAME = 'nyxia_univers';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function randomSalt() {
  return crypto.randomUUID();
}

function randomToken() {
  return crypto.randomUUID() + crypto.randomUUID();
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, salt, hash) {
  return (await hashPassword(password, salt)) === hash;
}

function buildSessionCookie(token, maxAge, requestUrl) {
  const parts = [
    COOKIE_NAME + '=' + token,
    'Path=/',
    'Max-Age=' + maxAge,
    'HttpOnly',
    'Secure',
    'SameSite=Lax'
  ];
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) {
      parts.push('Domain=.nyxia.top');
    }
  } catch (_) {}
  return parts.join('; ');
}

function clearSessionCookie(requestUrl) {
  let domain = '';
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) {
      domain = '; Domain=.nyxia.top';
    }
  } catch (_) {}
  return COOKIE_NAME + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' + domain;
}

function getTokenFromRequest(request) {
  const header = request.headers.get('X-Univers-Token');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)nyxia_univers=([^;]+)/);
  return m ? m[1] : null;
}

// Credentials Univers UNIQUEMENT sous univers:admin:credentials
// Jamais admin:credentials (réservé au Studio)
async function getUniversCredentials(env) {
  const raw = await env.CASHFLOW_KV.get('univers:admin:credentials');
  if (raw) return JSON.parse(raw);
  return null;
}

async function requireAdmin(request, env) {
  const token = getTokenFromRequest(request);
  if (!token) return false;
  const raw = await env.CASHFLOW_KV.get('univers:session:' + token);
  return !!raw;
}

async function handleLogin(request, env) {
  const body = await request.json();
  const password = body.password;
  if (!password) return json({ error: 'Mot de passe requis.' }, 400);

  // 1) Si un hash Univers existe déjà → on le vérifie
  let creds = await getUniversCredentials(env);
  if (creds) {
    const valid = await verifyPassword(password, creds.salt, creds.hash);
    if (!valid) return json({ error: 'Mot de passe incorrect.' }, 401);
  } else {
    // 2) Sinon : premier login = secret Cloudflare ADMIN_INITIAL_PASSWORD
    const initial = env.ADMIN_INITIAL_PASSWORD;
    if (!initial || typeof initial !== 'string') {
      return json({
        error: 'Configure le secret ADMIN_INITIAL_PASSWORD dans Cloudflare (Worker → Variables / Secrets).'
      }, 503);
    }
    if (password !== initial) {
      return json({ error: 'Mot de passe incorrect.' }, 401);
    }
    // On enregistre le hash sous univers: UNIQUEMENT (n'affecte pas le Studio)
    const salt = randomSalt();
    const hash = await hashPassword(password, salt);
    await env.CASHFLOW_KV.put('univers:admin:credentials', JSON.stringify({ salt, hash }));
  }

  const token = randomToken();
  await env.CASHFLOW_KV.put(
    'univers:session:' + token,
    JSON.stringify({ role: 'superadmin', at: new Date().toISOString() }),
    { expirationTtl: SESSION_TTL }
  );

  const res = json({ success: true, token });
  res.headers.append('Set-Cookie', buildSessionCookie(token, SESSION_TTL, request.url));
  return res;
}

async function handleLogout(request, env) {
  const token = getTokenFromRequest(request);
  if (token) await env.CASHFLOW_KV.delete('univers:session:' + token);
  const res = json({ success: true });
  res.headers.append('Set-Cookie', clearSessionCookie(request.url));
  return res;
}

async function handleCheckAuth(request, env) {
  const token = getTokenFromRequest(request);
  if (!token) return json({ valid: false });
  const raw = await env.CASHFLOW_KV.get('univers:session:' + token);
  if (!raw) return json({ valid: false });
  return json({ valid: true, role: 'superadmin' });
}

async function handleChangePassword(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);

  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return json({ error: 'Champs requis.' }, 400);
  if (newPassword.length < 10) return json({ error: 'Minimum 10 caractères.' }, 400);

  const creds = await getUniversCredentials(env);
  if (!creds) return json({ error: 'Aucun mot de passe enregistré.' }, 400);

  const valid = await verifyPassword(currentPassword, creds.salt, creds.hash);
  if (!valid) return json({ error: 'Mot de passe actuel incorrect.' }, 401);

  const salt = randomSalt();
  const hash = await hashPassword(newPassword, salt);
  // Écriture UNIQUEMENT sous univers:
  await env.CASHFLOW_KV.put('univers:admin:credentials', JSON.stringify({ salt, hash }));
  return json({ success: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (path === '/api/logout' && request.method === 'POST') return await handleLogout(request, env);
      if (path === '/api/check-auth' && request.method === 'POST') return await handleCheckAuth(request, env);
      if (path === '/api/change-password' && request.method === 'POST') return await handleChangePassword(request, env);
    } catch (e) {
      console.error(e);
      return json({ error: 'Erreur serveur.' }, 500);
    }

    if (env.ASSETS) {
      if (path === '/' || path === '') {
        return env.ASSETS.fetch(new URL('/index.html', request.url));
      }
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  }
};
