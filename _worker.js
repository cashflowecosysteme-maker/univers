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

  // Le secret Cloudflare fait TOUJOURS autorité.
  // Aucune clé KV à supprimer de ton côté.
  const initial = env.ADMIN_INITIAL_PASSWORD;
  if (!initial || typeof initial !== 'string') {
    return json({
      error: 'Configure le secret ADMIN_INITIAL_PASSWORD dans Cloudflare (Worker → Variables / Secrets).'
    }, 503);
  }
  if (password !== initial) {
    return json({ error: 'Mot de passe incorrect.' }, 401);
  }

  // Session uniquement (préfixe univers:) — n'écrase aucune clé Studio
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
  // Le mot de passe est géré uniquement via le secret Cloudflare ADMIN_INITIAL_PASSWORD.
  return json({
    error: 'Pour changer le mot de passe, modifie le secret ADMIN_INITIAL_PASSWORD dans Cloudflare (Worker → Variables / Secrets), puis reconnecte-toi.'
  }, 400);
}


// ─── Membres (D1 partagée) ───

function generateId() {
  return crypto.randomUUID();
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function handleListMembers(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'Base D1 non liée.' }, 500);

  const rows = await env.DB.prepare(
    `SELECT id, email, full_name, role, affiliate_code, parent_id, created_at, updated_at
     FROM users
     ORDER BY created_at DESC
     LIMIT 200`
  ).all();

  const members = (rows.results || []).map((u) => {
    const prenom = (u.full_name || '').trim().split(/\s+/)[0] || '—';
    return {
      id: u.id,
      email: u.email,
      prenom,
      role: u.role,
      code: u.affiliate_code,
      parentId: u.parent_id,
      depuis: u.created_at
    };
  });

  return json({ members });
}

async function handleCreateMember(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'Base D1 non liée.' }, 500);

  const body = await request.json();
  const prenom = (body.prenom || '').trim();
  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';
  const parentCode = (body.parentCode || '').trim().toUpperCase();

  if (!prenom || !email || !password) {
    return json({ error: 'Prénom, courriel et mot de passe requis.' }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'Mot de passe : minimum 6 caractères.' }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first();
  if (existing) return json({ error: 'Ce courriel existe déjà.' }, 409);

  let parentId = null;
  if (parentCode) {
    const parent = await env.DB.prepare(
      `SELECT id FROM users WHERE affiliate_code = ?`
    ).bind(parentCode).first();
    if (!parent) return json({ error: 'Code de rattachement introuvable.' }, 400);
    parentId = parent.id;
  }

  // Code unique
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const clash = await env.DB.prepare(
      `SELECT id FROM users WHERE affiliate_code = ?`
    ).bind(code).first();
    if (!clash) break;
    code = generateCode();
  }

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const passwordHash = salt + ':' + hash;
  const userId = generateId();

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, role, affiliate_code, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'affiliate', ?, ?, datetime('now'), datetime('now'))`
  ).bind(userId, email, passwordHash, prenom, code, parentId).run();

  // Enregistrement affiliates si programme actif
  try {
    const program = await env.DB.prepare(
      `SELECT id FROM programs WHERE is_active = 1 LIMIT 1`
    ).first();
    if (program) {
      let parentAffId = null;
      let grandparentAffId = null;
      if (parentId) {
        const pAff = await env.DB.prepare(
          `SELECT id, parent_affiliate_id FROM affiliates WHERE user_id = ? LIMIT 1`
        ).bind(parentId).first();
        if (pAff) {
          parentAffId = pAff.id;
          grandparentAffId = pAff.parent_affiliate_id || null;
        }
      }
      const siteUrl = env.SITE_URL || 'https://cercle.nyxia.top';
      const affId = generateId();
      const link = siteUrl.replace('univers.', 'cercle.') + '/r/' + code;
      await env.DB.prepare(
        `INSERT INTO affiliates (id, program_id, user_id, affiliate_link, parent_affiliate_id, grandparent_affiliate_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))`
      ).bind(affId, program.id, userId, link, parentAffId, grandparentAffId).run();
    }
  } catch (e) {
    console.error('affiliates insert', e);
  }

  return json({
    success: true,
    member: { id: userId, email, prenom, code }
  });
}



async function handleDeleteMember(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'Base D1 non liée.' }, 500);

  const body = await request.json();
  const id = (body.id || '').trim();
  if (!id) return json({ error: 'Identifiant requis.' }, 400);

  // Nettoyer affiliates liés
  try {
    await env.DB.prepare(`DELETE FROM affiliates WHERE user_id = ?`).bind(id).run();
  } catch (e) {
    console.error('delete affiliates', e);
  }

  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
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
      if (path === '/api/members' && request.method === 'GET') return await handleListMembers(request, env);
      if (path === '/api/members' && request.method === 'POST') return await handleCreateMember(request, env);
      if (path === '/api/members/delete' && request.method === 'POST') return await handleDeleteMember(request, env);
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
