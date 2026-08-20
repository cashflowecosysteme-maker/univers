// ============================================================
// NyXia — Univers (SuperAdmin central)
// Cockpit unique pour piloter tous les portails + outils
// ============================================================

const SESSION_TTL = 60 * 60 * 12; // 12 heures (équipe)
const COOKIE_NAME = 'nyxia_univers';

// ───────────── Helpers ─────────────

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
  const computed = await hashPassword(password, salt);
  return computed === hash;
}

function buildSessionCookie(token, maxAgeSeconds, requestUrl) {
  const parts = [
    COOKIE_NAME + '=' + token,
    'Path=/',
    'Max-Age=' + maxAgeSeconds,
    'HttpOnly',
    'Secure',
    'SameSite=Lax'
  ];
  try {
    const host = requestUrl ? new URL(requestUrl).hostname : '';
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) {
      parts.push('Domain=.nyxia.top');
    }
  } catch (_) {}
  return parts.join('; ');
}

function clearSessionCookie(requestUrl) {
  let domainPart = '';
  try {
    const host = requestUrl ? new URL(requestUrl).hostname : '';
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) {
      domainPart = '; Domain=.nyxia.top';
    }
  } catch (_) {}
  return COOKIE_NAME + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' + domainPart;
}

function getTokenFromRequest(request) {
  // 1. Header (frontend)
  const headerToken = request.headers.get('X-Univers-Token');
  if (headerToken) return headerToken;

  // 2. Cookie partagé
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)'));
  if (match) return match[1];

  return null;
}

async function getAdminCredentials(env) {
  const raw = await env.CASHFLOW_KV.get('univers:admin:credentials');
  if (raw) return JSON.parse(raw);

  // Premier démarrage : mot de passe lu depuis la variable d'environnement
  // Cloudflare → Worker → Variables / Secrets → ADMIN_INITIAL_PASSWORD
  const initialPassword = env.ADMIN_INITIAL_PASSWORD;
  if (!initialPassword || typeof initialPassword !== 'string' || initialPassword.length < 8) {
    return null; // pas encore configuré
  }

  const salt = randomSalt();
  const hash = await hashPassword(initialPassword, salt);
  const creds = { salt, hash, mustChange: true };
  await env.CASHFLOW_KV.put('univers:admin:credentials', JSON.stringify(creds));
  return creds;
}

async function requireAdmin(request, env) {
  const token = getTokenFromRequest(request);
  if (!token) return false;
  const raw = await env.CASHFLOW_KV.get(`univers:session:${token}`);
  return !!raw;
}

// ───────────── Handlers ─────────────

async function handleLogin(request, env) {
  const { password } = await request.json();
  if (!password) return json({ error: 'Mot de passe requis.' }, 400);

  const creds = await getAdminCredentials(env);
  if (!creds) {
    return json({
      error: 'Mot de passe initial non configuré. Ajoute le secret ADMIN_INITIAL_PASSWORD dans Cloudflare (Variables / Secrets), puis réessaie.'
    }, 503);
  }
  const valid = await verifyPassword(password, creds.salt, creds.hash);
  if (!valid) return json({ error: 'Mot de passe incorrect.' }, 401);

  const token = randomToken();
  await env.CASHFLOW_KV.put(
    `univers:session:${token}`,
    JSON.stringify({ role: 'superadmin', connectedAt: new Date().toISOString() }),
    { expirationTtl: SESSION_TTL }
  );

  const response = json({
    success: true,
    token,
    mustChangePassword: !!creds.mustChange
  });
  response.headers.append('Set-Cookie', buildSessionCookie(token, SESSION_TTL, request.url));
  return response;
}

async function handleLogout(request, env) {
  const token = getTokenFromRequest(request);
  if (token) {
    await env.CASHFLOW_KV.delete(`univers:session:${token}`);
  }
  const response = json({ success: true });
  response.headers.append('Set-Cookie', clearSessionCookie(request.url));
  return response;
}

async function handleCheckAuth(request, env) {
  const token = getTokenFromRequest(request);
  if (!token) return json({ valid: false });

  const raw = await env.CASHFLOW_KV.get(`univers:session:${token}`);
  if (!raw) return json({ valid: false });

  const session = JSON.parse(raw);
  return json({ valid: true, role: session.role });
}

async function handleChangePassword(request, env) {
  if (!await requireAdmin(request, env)) return json({ error: 'Non autorisé.' }, 401);

  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return json({ error: 'Champs requis.' }, 400);
  if (newPassword.length < 10) return json({ error: 'Le nouveau mot de passe doit faire au moins 10 caractères.' }, 400);

  const creds = await getAdminCredentials(env);
  const valid = await verifyPassword(currentPassword, creds.salt, creds.hash);
  if (!valid) return json({ error: 'Mot de passe actuel incorrect.' }, 401);

  const salt = randomSalt();
  const hash = await hashPassword(newPassword, salt);
  await env.CASHFLOW_KV.put('univers:admin:credentials', JSON.stringify({ salt, hash, mustChange: false }));

  return json({ success: true });
}

// ───────────── Router ─────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API
    try {
      if (path === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (path === '/api/logout' && request.method === 'POST') return await handleLogout(request, env);
      if (path === '/api/check-auth' && request.method === 'POST') return await handleCheckAuth(request, env);
      if (path === '/api/change-password' && request.method === 'POST') return await handleChangePassword(request, env);
    } catch (e) {
      console.error('API error', e);
      return json({ error: 'Erreur serveur.' }, 500);
    }

    // Assets (HTML, etc.)
    if (env.ASSETS) {
      // Racine → index.html
      if (path === '/' || path === '') {
        const asset = await env.ASSETS.fetch(new URL('/index.html', request.url));
        return asset;
      }
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};
