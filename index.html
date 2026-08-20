// ============================================================
// NyXia — Les Cercles (cercle.nyxia.top)
// Worker + HTML — même D1 affiliation-pro-db, même KV
// Vocabulaire visible : cercle, entraide, partage, marraine, ambassadeur
// ============================================================

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 jours
const COOKIE_NAME = 'nyxia_cercle';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
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

// Compat : certains comptes Affiliation Pro peuvent avoir un hash différent.
// On tente d'abord le format salt+hash stocké en JSON ou colonnes séparées.
async function verifyUserPassword(password, user) {
  if (!user || !user.password_hash) return false;
  // Format systemeprompt-like: si password_hash contient "salt:hash"
  if (user.password_hash.includes(':')) {
    const [salt, hash] = user.password_hash.split(':');
    return verifyPassword(password, salt, hash);
  }
  // Format Affiliation Pro (lib/auth) — souvent bcrypt ou autre.
  // On compare en PBKDF2 si salt fourni dans une colonne, sinon échec contrôlé.
  if (user.salt) {
    return verifyPassword(password, user.salt, user.password_hash);
  }
  // Dernier recours : comparaison directe (à éviter, mais utile si hash déjà brut en test)
  return password === user.password_hash;
}

function buildCookie(token, maxAge, requestUrl) {
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

function clearCookie(requestUrl) {
  let domain = '';
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) domain = '; Domain=.nyxia.top';
  } catch (_) {}
  return COOKIE_NAME + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' + domain;
}

function getToken(request) {
  const h = request.headers.get('X-Cercle-Token');
  if (h) return h;
  const c = request.headers.get('Cookie') || '';
  const m = c.match(/(?:^|;\s*)nyxia_cercle=([^;]+)/);
  return m ? m[1] : null;
}

async function getSession(request, env) {
  const token = getToken(request);
  if (!token) return null;
  const raw = await env.CASHFLOW_KV.get('cercles:session:' + token);
  if (!raw) return null;
  return { token, ...JSON.parse(raw) };
}

// ─── Auth ───

async function handleLogin(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) return json({ error: 'Courriel et mot de passe requis.' }, 400);

  const user = await env.DB.prepare(
    `SELECT id, email, password_hash, full_name, role, affiliate_code, parent_id, status, created_at
     FROM users WHERE email = ?`
  ).bind(email.toLowerCase().trim()).first();

  if (!user) return json({ error: 'Identifiants incorrects.' }, 401);

  // status optionnel selon schéma
  if (user.status === 'suspended') {
    return json({ error: 'Ce compte est désactivé. Contacte l’équipe pour le réactiver.' }, 403);
  }

  // Vérification mot de passe
  // Les comptes créés par Affiliation Pro utilisent leur propre hash (voir lib/auth du repo).
  // On supporte : "salt:hash" PBKDF2, ou colonne salt séparée si présente.
  let valid = false;
  if (user.password_hash && user.password_hash.includes(':')) {
    const [salt, hash] = user.password_hash.split(':');
    valid = await verifyPassword(password, salt, hash);
  } else {
    // Tentative via une éventuelle colonne salt — sinon on lit le format stocké tel quel
    const row = await env.DB.prepare(
      `SELECT password_hash FROM users WHERE id = ?`
    ).bind(user.id).first();
    // Si le projet Affiliation Pro stocke un hash scrypt/bcrypt, la vérif native Worker
    // nécessitera d'aligner l'algo. Pour l'instant PBKDF2 salt:hash et fallback.
    valid = false;
    if (row && row.password_hash) {
      if (row.password_hash.includes(':')) {
        const [s, h] = row.password_hash.split(':');
        valid = await verifyPassword(password, s, h);
      }
    }
  }

  if (!valid) {
    // Message neutre — on ne révèle pas la cause technique
    return json({
      error: 'Identifiants incorrects. Si ton compte vient de l’ancien portail, l’équipe peut réaligner ton accès.'
    }, 401);
  }

  const token = randomToken();
  const firstName = (user.full_name || '').trim().split(/\s+/)[0] || '';
  await env.CASHFLOW_KV.put(
    'cercles:session:' + token,
    JSON.stringify({
      userId: user.id,
      email: user.email,
      firstName,
      role: user.role,
      affiliateCode: user.affiliate_code
    }),
    { expirationTtl: SESSION_TTL }
  );

  // last_login si la colonne existe (ignoré sinon)
  try {
    await env.DB.prepare(
      `UPDATE users SET updated_at = datetime('now') WHERE id = ?`
    ).bind(user.id).run();
  } catch (_) {}

  const res = json({
    success: true,
    token,
    firstName,
    affiliateCode: user.affiliate_code,
    role: user.role
  });
  res.headers.append('Set-Cookie', buildCookie(token, SESSION_TTL, request.url));
  return res;
}

async function handleLogout(request, env) {
  const token = getToken(request);
  if (token) await env.CASHFLOW_KV.delete('cercles:session:' + token);
  const res = json({ success: true });
  res.headers.append('Set-Cookie', clearCookie(request.url));
  return res;
}

async function handleCheckAuth(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ valid: false });
  return json({
    valid: true,
    email: session.email,
    firstName: session.firstName,
    role: session.role,
    affiliateCode: session.affiliateCode
  });
}

// ─── Dashboard ───

async function handleDashboard(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Session expirée.' }, 401);

  const userId = session.userId;

  // Profil
  const profile = await env.DB.prepare(
    `SELECT id, email, full_name, affiliate_code, role, parent_id, created_at
     FROM users WHERE id = ?`
  ).bind(userId).first();

  if (!profile) return json({ error: 'Profil introuvable.' }, 404);

  const firstName = (profile.full_name || '').trim().split(/\s+/)[0] || session.firstName || '';

  // Enregistrement affilié (cercle)
  const affiliate = await env.DB.prepare(
    `SELECT id, affiliate_link, parent_affiliate_id, grandparent_affiliate_id,
            total_earnings, total_referrals, status, created_at
     FROM affiliates WHERE user_id = ? LIMIT 1`
  ).bind(userId).first();

  // Cercle direct (niveau 1) : users dont parent_id = moi
  const l1 = await env.DB.prepare(
    `SELECT id, email, full_name, affiliate_code, created_at
     FROM users WHERE parent_id = ? ORDER BY created_at DESC`
  ).bind(userId).all();

  const l1Rows = l1.results || [];
  const l1Ids = l1Rows.map(r => r.id);

  // Niveau 2 : parent_id dans L1
  let l2Rows = [];
  if (l1Ids.length) {
    const ph = l1Ids.map(() => '?').join(',');
    const l2 = await env.DB.prepare(
      `SELECT id, email, full_name, affiliate_code, parent_id, created_at
       FROM users WHERE parent_id IN (${ph}) ORDER BY created_at DESC`
    ).bind(...l1Ids).all();
    l2Rows = l2.results || [];
  }

  const l2Ids = l2Rows.map(r => r.id);
  let l3Rows = [];
  if (l2Ids.length) {
    const ph = l2Ids.map(() => '?').join(',');
    const l3 = await env.DB.prepare(
      `SELECT id, email, full_name, affiliate_code, parent_id, created_at
       FROM users WHERE parent_id IN (${ph}) ORDER BY created_at DESC`
    ).bind(...l2Ids).all();
    l3Rows = l3.results || [];
  }

  // Lien de partage
  const siteUrl = env.SITE_URL || 'https://cercle.nyxia.top';
  const shareLink = profile.affiliate_code
    ? `${siteUrl}/r/${profile.affiliate_code}`
    : null;

  // Messages (si table messages existe)
  let messages = [];
  try {
    const msg = await env.DB.prepare(
      `SELECT id, subject, content, read_at, created_at, sender_id
       FROM messages
       WHERE recipient_id = ? OR (is_broadcast = 1)
       ORDER BY created_at DESC LIMIT 20`
    ).bind(userId).all();
    messages = msg.results || [];
  } catch (_) {}

  // Mise en forme : prénom uniquement côté visible
  function mapMember(row) {
    const prenom = (row.full_name || '').trim().split(/\s+/)[0] || '—';
    return {
      id: row.id,
      prenom,
      code: row.affiliate_code,
      depuis: row.created_at
    };
  }

  return json({
    profil: {
      prenom: firstName,
      code: profile.affiliate_code,
      role: profile.role,
      depuis: profile.created_at
    },
    lienPartage: shareLink,
    cercle: {
      direct: l1Rows.map(mapMember),
      deuxieme: l2Rows.map(mapMember),
      troisieme: l3Rows.map(mapMember),
      totaux: {
        direct: l1Rows.length,
        deuxieme: l2Rows.length,
        troisieme: l3Rows.length
      }
    },
    // "ce qui revient" — montants techniques restés en coulisses dans total_earnings
    // On expose un total neutre sans jargon
    bilan: {
      total: affiliate ? Number(affiliate.total_earnings || 0) : 0,
      partageages: affiliate ? Number(affiliate.total_referrals || 0) : 0,
      statut: affiliate ? affiliate.status : null
    },
    messages
  });
}

// ─── Router ───

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (path === '/api/logout' && request.method === 'POST') return await handleLogout(request, env);
      if (path === '/api/check-auth' && request.method === 'POST') return await handleCheckAuth(request, env);
      if (path === '/api/dashboard' && request.method === 'POST') return await handleDashboard(request, env);

      // Redirection lien de partage /r/CODE → page d'accueil ou inscription (à brancher)
      if (path.startsWith('/r/')) {
        return Response.redirect(url.origin + '/login.html?ref=' + encodeURIComponent(path.slice(3)), 302);
      }
    } catch (e) {
      console.error('Cercles error', e);
      return json({ error: 'Erreur serveur.' }, 500);
    }

    if (env.ASSETS) {
      if (path === '/' || path === '') {
        return env.ASSETS.fetch(new URL('/login.html', request.url));
      }
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  }
};
