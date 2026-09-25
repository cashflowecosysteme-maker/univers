import superAdmin2 from './superadmin2/_worker.js';
import superAdmin3 from './superadmin3/_worker.js';
import superAdmin4 from './superadmin4/_worker.js';
// NyXia Univers — SuperAdmin central (système complet jumelé Cercles + Répertoire)
const SESSION_TTL = 60 * 60 * 12;
const COOKIE_NAME = 'nyxia_univers';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function randomToken() { return crypto.randomUUID() + crypto.randomUUID(); }
function generateId() { return crypto.randomUUID(); }
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomSalt() {
  return crypto.randomUUID();
}
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPasswordAffil(password) {
  const salt = crypto.randomUUID().replace(/-/g, '');
  const data = new TextEncoder().encode(salt + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hashHex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `$sha256$${salt}$${hashHex}`;
}
function buildSessionCookie(token, maxAge, requestUrl) {
  const parts = [COOKIE_NAME + '=' + token, 'Path=/', 'Max-Age=' + maxAge, 'HttpOnly', 'Secure', 'SameSite=Lax'];
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) parts.push('Domain=.nyxia.top');
  } catch (_) {}
  return parts.join('; ');
}
function clearSessionCookie(requestUrl) {
  let d = '';
  try {
    const host = new URL(requestUrl).hostname;
    if (host === 'nyxia.top' || host.endsWith('.nyxia.top')) d = '; Domain=.nyxia.top';
  } catch (_) {}
  return COOKIE_NAME + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' + d;
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
  if (!token) return false;
  return !!(await env.CASHFLOW_KV.get('univers:session:' + token));
}

async function handleLogin(request, env) {
  const { password } = await request.json();
  if (!password) return json({ error: 'Mot de passe requis.' }, 400);
  const initial = env.ADMIN_INITIAL_PASSWORD;
  if (!initial || typeof initial !== 'string') {
    return json({ error: 'Configure le secret ADMIN_INITIAL_PASSWORD dans Cloudflare.' }, 503);
  }
  if (password !== initial) return json({ error: 'Mot de passe incorrect.' }, 401);
  const token = randomToken();
  await env.CASHFLOW_KV.put('univers:session:' + token, JSON.stringify({ role: 'superadmin', at: new Date().toISOString() }), { expirationTtl: SESSION_TTL });
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
  return json({ valid: !!raw, role: 'superadmin' });
}

// ─── % des 3 cercles (table programs) ───
async function handleGetProgram(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  let prog = await env.DB.prepare(`SELECT * FROM programs WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1`).first();
  if (!prog) {
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO programs (id, name, description, commission_l1, commission_l2, commission_l3, owner_id, is_active, created_at)
       VALUES (?, 'Programme principal', 'Cercles NyXia', 25, 10, 5, 'superadmin', 1, datetime('now'))`
    ).bind(id).run();
    prog = await env.DB.prepare(`SELECT * FROM programs WHERE id = ?`).bind(id).first();
  }
  return json({
    program: {
      id: prog.id,
      name: prog.name,
      cercle1: Number(prog.commission_l1),
      cercle2: Number(prog.commission_l2),
      cercle3: Number(prog.commission_l3)
    }
  });
}
async function handleSaveProgram(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const c1 = Number(body.cercle1);
  const c2 = Number(body.cercle2);
  const c3 = Number(body.cercle3);
  if ([c1, c2, c3].some(n => isNaN(n) || n < 0 || n > 100)) {
    return json({ error: 'Pourcentages invalides (0–100).' }, 400);
  }
  let prog = await env.DB.prepare(`SELECT id FROM programs WHERE is_active = 1 LIMIT 1`).first();
  if (!prog) {
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO programs (id, name, commission_l1, commission_l2, commission_l3, owner_id, is_active, created_at)
       VALUES (?, 'Programme principal', ?, ?, ?, 'superadmin', 1, datetime('now'))`
    ).bind(id, c1, c2, c3).run();
  } else {
    await env.DB.prepare(
      `UPDATE programs SET commission_l1 = ?, commission_l2 = ?, commission_l3 = ? WHERE id = ?`
    ).bind(c1, c2, c3, prog.id).run();
  }
  return json({ success: true, cercle1: c1, cercle2: c2, cercle3: c3 });
}

// ─── Membres (Admin + Promoteurs) ───

async function handleRegenerateCode(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  const body = await request.json().catch(() => ({}));
  const id = (body.id || '').trim();
  if (!id) return json({ error: 'Id membre requis.' }, 400);
  const user = await env.DB.prepare(`SELECT id, email, role, affiliate_code FROM users WHERE id = ?`).bind(id).first();
  if (!user) return json({ error: 'Membre introuvable.' }, 404);

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let newCode = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    newCode = '';
    const buf = crypto.getRandomValues(new Uint8Array(8));
    for (let i = 0; i < 8; i++) newCode += chars[buf[i] % chars.length];
    const exists = await env.DB.prepare(`SELECT id FROM users WHERE affiliate_code = ? AND id != ?`).bind(newCode, id).first();
    if (!exists) break;
  }
  if (!newCode) newCode = ('N' + crypto.randomUUID().replace(/-/g, '')).slice(0, 10).toUpperCase();

  await env.DB.prepare(
    `UPDATE users SET affiliate_code = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(newCode, id).run();

  return json({ success: true, id, email: user.email, role: user.role, old_code: user.affiliate_code, code: newCode });
}


async function ensureCommissionsTable(env) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS commissions (
      id TEXT PRIMARY KEY,
      sale_id TEXT,
      product_id TEXT,
      seller_id TEXT,
      beneficiary_id TEXT,
      beneficiary_code TEXT,
      level INTEGER DEFAULT 1,
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'CAD',
      status TEXT DEFAULT 'pending',
      buyer_email TEXT,
      ref_code TEXT,
      source TEXT,
      created_at TEXT,
      paid_at TEXT
    )`).run();
  } catch (e) { console.error(e); }
}

async function handleCommissionsToPay(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  await ensureCommissionsTable(env);

  // Commissions dues par Super Admin (ses produits)
  const rows = await env.DB.prepare(
    `SELECT c.*, u.full_name as benef_name, u.email as benef_email, u.paypal_email as benef_paypal
     FROM commissions c
     LEFT JOIN users u ON u.id = c.beneficiary_id
     WHERE (c.seller_id = 'superadmin' OR c.seller_id = 'SUPERADMIN' OR lower(c.seller_id) = 'superadmin')
     ORDER BY c.created_at DESC
     LIMIT 500`
  ).all();

  const list = rows.results || [];
  let pending = 0, paid = 0;
  for (const r of list) {
    if (r.status === 'paid') paid += Number(r.amount) || 0;
    else pending += Number(r.amount) || 0;
  }

  return json({
    success: true,
    pending: Math.round(pending * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    commissions: list
  });
}

async function handleMarkCommissionPaid(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  const body = await request.json().catch(() => ({}));
  const id = (body.id || '').trim();
  if (!id) return json({ error: 'id requis' }, 400);
  await ensureCommissionsTable(env);
  await env.DB.prepare(
    `UPDATE commissions SET status = 'paid', paid_at = ? WHERE id = ? AND (seller_id = 'superadmin' OR seller_id = 'SUPERADMIN')`
  ).bind(new Date().toISOString(), id).run();
  return json({ success: true });
}

async function handleListMembers(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const url = new URL(request.url);
  const role = url.searchParams.get('role'); // admin | affiliate | all
  let q = `SELECT id, email, full_name, role, affiliate_code, parent_id, paypal_email, created_at FROM users`;
  const binds = [];
  if (role === 'admin' || role === 'affiliate') {
    q += ` WHERE role = ?`;
    binds.push(role);
  }
  q += ` ORDER BY created_at DESC LIMIT 300`;
  const rows = binds.length
    ? await env.DB.prepare(q).bind(...binds).all()
    : await env.DB.prepare(q).all();
  const members = (rows.results || []).map(u => ({
    id: u.id,
    email: u.email,
    prenom: (u.full_name || '').trim().split(/\s+/)[0] || '—',
    role: u.role,
    code: u.affiliate_code,
    paypal: u.paypal_email || '',
    parentId: u.parent_id,
    depuis: u.created_at
  }));
  return json({ members });
}

async function handleCreateMember(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const prenom = (body.prenom || '').trim();
  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';
  const role = body.role === 'admin' ? 'admin' : 'affiliate';
  const parentCode = (body.parentCode || '').trim().toUpperCase();
  const paypal = (body.paypal || '').trim();

  if (!prenom || !email || !password) return json({ error: 'Prénom, courriel et mot de passe requis.' }, 400);
  if (password.length < 6) return json({ error: 'Mot de passe : minimum 6 caractères.' }, 400);

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (existing) return json({ error: 'Ce courriel existe déjà.' }, 409);

  let parentId = null;
  if (parentCode) {
    const parent = await env.DB.prepare(`SELECT id FROM users WHERE affiliate_code = ?`).bind(parentCode).first();
    if (!parent) return json({ error: 'Code de rattachement introuvable.' }, 400);
    parentId = parent.id;
  }

  let code = generateCode();
  for (let i = 0; i < 6; i++) {
    const clash = await env.DB.prepare(`SELECT id FROM users WHERE affiliate_code = ?`).bind(code).first();
    if (!clash) break;
    code = generateCode();
  }

  const passwordHash = await hashPasswordAffil(password);
  const userId = generateId();
  const webhookSecret = role === 'admin'
    ? [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
    : null;

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, role, affiliate_code, parent_id, paypal_email, webhook_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(userId, email, passwordHash, prenom, role, code, parentId, paypal || null, webhookSecret).run();

  try {
    const program = await env.DB.prepare(`SELECT id FROM programs WHERE is_active = 1 LIMIT 1`).first();
    if (program) {
      let parentAffId = null, grandparentAffId = null;
      if (parentId) {
        const pAff = await env.DB.prepare(`SELECT id, parent_affiliate_id FROM affiliates WHERE user_id = ? LIMIT 1`).bind(parentId).first();
        if (pAff) { parentAffId = pAff.id; grandparentAffId = pAff.parent_affiliate_id || null; }
      }
      const siteUrl = (env.SITE_URL || 'https://cercle.nyxia.top').replace('univers.', 'cercle.');
      await env.DB.prepare(
        `INSERT INTO affiliates (id, program_id, user_id, affiliate_link, parent_affiliate_id, grandparent_affiliate_id, status, total_earnings, total_referrals, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', 0, 0, datetime('now'))`
      ).bind(generateId(), program.id, userId, `${siteUrl}/r/${code}`, parentAffId, grandparentAffId).run();
    }
  } catch (e) { console.error('affiliate insert', e); }

  return json({ success: true, member: { id: userId, email, prenom, code, role } });
}

async function handleDeleteMember(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const { id } = await request.json();
  if (!id) return json({ error: 'Identifiant requis.' }, 400);
  try { await env.DB.prepare(`DELETE FROM affiliates WHERE user_id = ?`).bind(id).run(); } catch (_) {}
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
  return json({ success: true });
}

// ─── Produits SuperAdmin ───
async function ensureCategory(env) {
  let cat = await env.DB.prepare(`SELECT id FROM marketplace_categories WHERE active = 1 ORDER BY sort_order ASC LIMIT 1`).first();
  if (!cat) {
    await env.DB.prepare(
      `INSERT INTO marketplace_categories (name, slug, icon, sort_order, active, created_at) VALUES ('Général', 'general', '✨', 0, 1, datetime('now'))`
    ).run();
    cat = await env.DB.prepare(`SELECT id FROM marketplace_categories ORDER BY id DESC LIMIT 1`).first();
  }
  return cat.id;
}


async function handleStats(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  async function cnt(sql) {
    try {
      const r = await env.DB.prepare(sql).first();
      return Number((r && r.c) || 0);
    } catch (_) { return 0; }
  }
  const products_total = await cnt(`SELECT COUNT(*) as c FROM marketplace_products`);
  const products_active = await cnt(`SELECT COUNT(*) as c FROM marketplace_products WHERE status='active' OR status='published'`);
  const products_draft = await cnt(`SELECT COUNT(*) as c FROM marketplace_products WHERE status='draft'`);
  const users_total = await cnt(`SELECT COUNT(*) as c FROM users`);
  const affiliates_total = await cnt(`SELECT COUNT(*) as c FROM users WHERE role='affiliate'`);
  const admins_total = await cnt(`SELECT COUNT(*) as c FROM users WHERE role='admin'`);
  let portal_clients = 0;
  try {
    if (env.CASHFLOW_KV) {
      const list = await env.CASHFLOW_KV.list({ prefix: 'client:' });
      portal_clients = (list.keys || []).length;
    }
  } catch (_) {}
  return json({
    success: true,
    products_total, products_active, products_draft,
    users_total, affiliates_total, admins_total, portal_clients
  });
}

async function handleListProducts(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const rows = await env.DB.prepare(
    `SELECT p.*, u.full_name as seller_name, u.role as seller_role
     FROM marketplace_products p
     LEFT JOIN users u ON p.seller_id = u.id
     ORDER BY p.created_at DESC LIMIT 200`
  ).all();
  return json({ products: rows.results || [] });
}

async function ensureMarketplaceBillingColumns(env) {
  if (!env.DB) return;
  try { await env.DB.prepare(`ALTER TABLE marketplace_products ADD COLUMN price_monthly REAL DEFAULT 0`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE marketplace_products ADD COLUMN billing_type TEXT DEFAULT 'one_time'`).run(); } catch (_) {}
}

async function handleCreateProduct(request, env) {
  await ensureMarketplaceBillingColumns(env);
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const title = (body.title || '').trim();
  if (!title) return json({ error: 'Titre requis.' }, 400);
  const prog = await env.DB.prepare(`SELECT commission_l1, commission_l2, commission_l3 FROM programs WHERE is_active = 1 LIMIT 1`).first();
  const n1 = body.n1 != null ? Number(body.n1) : (prog ? Number(prog.commission_l1) : 25);
  const n2 = body.n2 != null ? Number(body.n2) : (prog ? Number(prog.commission_l2) : 10);
  const n3 = body.n3 != null ? Number(body.n3) : (prog ? Number(prog.commission_l3) : 5);
  const catId = await ensureCategory(env);
  const id = generateId();
  const status = (body.status === 'draft') ? 'draft' : 'active';
  const billing = ['one_time','subscription','both','appointment_free'].includes(String(body.billing_type || ''))
    ? String(body.billing_type) : 'one_time';
  const priceMonthly = Number(body.price_monthly || body.priceMonthly || 0) || 0;
  try { await env.DB.prepare(`ALTER TABLE marketplace_products ADD COLUMN price_monthly REAL DEFAULT 0`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE marketplace_products ADD COLUMN billing_type TEXT DEFAULT 'one_time'`).run(); } catch (_) {}
  await env.DB.prepare(
    `INSERT INTO marketplace_products
     (id, seller_id, category_id, title, description_short, description_long, image_url, price, price_monthly, billing_type,
      commission_n1, commission_n2, commission_n3, affiliate_link, status, created_at, updated_at)
     VALUES (?, 'superadmin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    id, catId, title,
    (body.description || '').trim(),
    (body.descriptionLong || '').trim() || null,
    (body.imageUrl || '').trim() || null,
    Number(body.price) || 0,
    priceMonthly,
    billing,
    n1, n2, n3,
    (body.affiliateLink || '').trim() || null,
    status
  ).run();
  try {
    await env.DB.prepare(`ALTER TABLE marketplace_products ADD COLUMN promo_guide TEXT`).run();
  } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE marketplace_products ADD COLUMN join_url TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE marketplace_products ADD COLUMN join_type TEXT DEFAULT 'free'`).run(); } catch (_) {}
  try {
    let joinUrl = (body.join_url || '').trim();
    if (!joinUrl) {
      joinUrl = 'https://repertoire.nyxia.top/?product=' + encodeURIComponent(id) + '&ref=NYXIA';
    }
    await env.DB.prepare(`UPDATE marketplace_products SET promo_guide = ?, join_url = ?, join_type = ? WHERE id = ?`).bind(
      (body.promo_guide || '').trim() || null,
      joinUrl,
      body.join_type || 'free',
      id
    ).run();
  } catch (e) { console.error(e); }
  return json({ success: true, id });
}

async function handleUpdateProduct(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  if (!body.id) return json({ error: 'Id requis.' }, 400);
  await env.DB.prepare(
    `UPDATE marketplace_products SET
      title = COALESCE(?, title),
      description_short = COALESCE(?, description_short),
      price = COALESCE(?, price),
      commission_n1 = COALESCE(?, commission_n1),
      commission_n2 = COALESCE(?, commission_n2),
      commission_n3 = COALESCE(?, commission_n3),
      affiliate_link = COALESCE(?, affiliate_link),
      image_url = COALESCE(?, image_url),
      promo_guide = COALESCE(?, promo_guide),
      join_url = COALESCE(?, join_url),
      join_type = COALESCE(?, join_type),
      status = COALESCE(?, status),
      updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    body.title || null,
    body.description || null,
    body.price != null ? Number(body.price) : null,
    body.n1 != null ? Number(body.n1) : null,
    body.n2 != null ? Number(body.n2) : null,
    body.n3 != null ? Number(body.n3) : null,
    body.affiliateLink || null,
    body.imageUrl || null,
    (body.promo_guide || body.promoGuide || '').trim() || null,
    (body.join_url || body.joinUrl || '').trim() || null,
    (body.join_type || body.joinType) || null,
    body.status || null,
    body.id
  ).run();
  return json({ success: true });
}

async function handleDeleteProduct(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const { id } = await request.json();
  if (!id) return json({ error: 'Id requis.' }, 400);
  await env.DB.prepare(`DELETE FROM marketplace_products WHERE id = ?`).bind(id).run();
  return json({ success: true });
}

// ─── Boutique NyXia (catalogue central dans CASHFLOW_KV) ───
const BOUTIQUE_PRODUCT_PREFIX = 'boutique:product:';
const BOUTIQUE_INDEX_KEY = 'boutique:products:index';
const BOUTIQUE_SETTINGS_KEY = 'boutique:settings';
const BOUTIQUE_PORTALS = ['nyxia', 'diane', 'eric', 'lena', 'selena', 'kael', 'alex'];
const BOUTIQUE_CTA_TYPES = ['acheter', 'rendez-vous', 'appel', 'en-savoir-plus'];

const BOUTIQUE_DEFAULT_PORTALS = [
  { id: 'nyxia', name: 'NyXia', intro: 'Solutions techniques, accompagnement et services Done For You.', imageUrl: '/images/nyxia.png', order: 1, active: true },
  { id: 'diane', name: 'Diane', intro: 'Parcours, livres et créations de la fondatrice de l’écosystème.', imageUrl: '/images/diane.png', order: 2, active: true },
  { id: 'eric', name: 'Éric', intro: 'Marketing relationnel, communication et univers CashFlow™.', imageUrl: '/images/eric.png', order: 3, active: true },
  { id: 'lena', name: 'Léna', intro: 'Dons, outils spirituels et méthode DDM.', imageUrl: '/images/lena.png', order: 4, active: true },
  { id: 'selena', name: 'Séléna', intro: 'Libération émotionnelle, miroir et méthode A.M.I.E.™.', imageUrl: '/images/selena.png', order: 5, active: true },
  { id: 'kael', name: 'Kael', intro: 'Relations, activités et expériences à vivre à deux.', imageUrl: '/images/kael.png', order: 6, active: true },
  { id: 'alex', name: 'Alex', intro: 'Écriture, livres et parcours pour aller jusqu’au mot FIN.', imageUrl: '/images/alex.png', order: 7, active: true }
];

function boutiqueText(value, max = 5000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function boutiqueBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function boutiqueNumber(value, fallback = null) {
  if (value === '' || value === undefined || value === null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boutiqueUrl(value) {
  const url = boutiqueText(value, 2000);
  if (!url) return '';
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.toString() : '';
  } catch (_) {
    return '';
  }
}

function boutiqueSlug(value) {
  return boutiqueText(value, 160)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'produit';
}

function boutiqueTestimonials(body, old) {
  const source = Array.isArray(body.testimonials)
    ? body.testimonials
    : (old && Array.isArray(old.testimonials) ? old.testimonials : []);
  const items = [];
  let invalidImage = false;

  for (const raw of source.slice(0, 30)) {
    if (!raw || typeof raw !== 'object') continue;
    const type = raw.type === 'image' ? 'image' : 'text';
    const id = boutiqueText(raw.id, 100).replace(/[^a-zA-Z0-9_-]/g, '') || crypto.randomUUID();
    if (type === 'image') {
      const original = boutiqueText(raw.imageUrl, 2000);
      if (!original) continue;
      const imageUrl = boutiqueUrl(original);
      if (!imageUrl) { invalidImage = true; continue; }
      items.push({
        id,
        type: 'image',
        imageUrl,
        caption: boutiqueText(raw.caption, 240)
      });
    } else {
      const text = boutiqueText(raw.text, 3000);
      if (!text) continue;
      items.push({
        id,
        type: 'text',
        text,
        author: boutiqueText(raw.author, 180)
      });
    }
  }

  /* Compatibilité avec les anciens produits à un seul témoignage. */
  if (!items.length && !Array.isArray(body.testimonials)) {
    const legacyQuote = boutiqueText(
      body.testimonialQuote !== undefined ? body.testimonialQuote : (old && old.testimonialQuote),
      1200
    );
    const legacyAuthor = boutiqueText(
      body.testimonialAuthor !== undefined ? body.testimonialAuthor : (old && old.testimonialAuthor),
      120
    );
    if (legacyQuote) {
      items.push({ id: crypto.randomUUID(), type: 'text', text: legacyQuote, author: legacyAuthor });
    }
  }

  return { items, invalidImage };
}

function boutiqueCors(response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=60');
  return response;
}

async function boutiqueIndex(env) {
  const raw = await env.CASHFLOW_KV.get(BOUTIQUE_INDEX_KEY);
  if (raw) {
    try {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) return ids.filter(Boolean);
    } catch (_) {}
  }
  const listed = await env.CASHFLOW_KV.list({ prefix: BOUTIQUE_PRODUCT_PREFIX });
  const ids = (listed.keys || []).map((key) => key.name.slice(BOUTIQUE_PRODUCT_PREFIX.length)).filter(Boolean);
  await env.CASHFLOW_KV.put(BOUTIQUE_INDEX_KEY, JSON.stringify(ids));
  return ids;
}

async function boutiqueProducts(env) {
  const ids = await boutiqueIndex(env);
  const rows = await Promise.all(ids.map(async (id) => {
    const raw = await env.CASHFLOW_KV.get(BOUTIQUE_PRODUCT_PREFIX + id);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }));
  return rows.filter(Boolean).sort((a, b) =>
    (Number(a.order) || 0) - (Number(b.order) || 0) ||
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
}

async function boutiqueSettings(env) {
  const defaults = {
    title: 'Boutique NyXia',
    heroTitle: 'Sept portes. Sept univers. Une seule boutique vivante.',
    heroText: 'Choisis l’univers qui t’appelle et découvre ses livres, formations, outils, services, activités et événements.',
    appointmentUrl: '',
    appointmentLabel: 'Prendre un rendez-vous',
    portals: BOUTIQUE_DEFAULT_PORTALS,
    updatedAt: null
  };
  const raw = await env.CASHFLOW_KV.get(BOUTIQUE_SETTINGS_KEY);
  if (!raw) return defaults;
  try {
    const saved = JSON.parse(raw);
    const savedPortals = Array.isArray(saved.portals) ? saved.portals : [];
    return {
      ...defaults,
      ...saved,
      portals: BOUTIQUE_DEFAULT_PORTALS.map((portal) => {
        const savedPortal = savedPortals.find((item) => item && item.id === portal.id) || {};
        return { ...portal, ...savedPortal, imageUrl: savedPortal.imageUrl || portal.imageUrl };
      })
    };
  } catch (_) {
    return defaults;
  }
}

function boutiquePublicProduct(product) {
  const expires = product.promoExpiresAt ? Date.parse(product.promoExpiresAt) : NaN;
  const promoActive = !!product.promoCode && (!Number.isFinite(expires) || expires >= Date.now());
  return {
    ...product,
    promoActive,
    promoCode: promoActive ? product.promoCode : '',
    promoText: promoActive ? product.promoText : ''
  };
}

async function handleBoutiqueProductsAdmin(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  return json({ products: await boutiqueProducts(env) });
}

async function handleBoutiqueProductSave(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const title = boutiqueText(body.title, 180);
  const portal = boutiqueText(body.portal, 30).toLowerCase();
  if (!title) return json({ error: 'Titre requis.' }, 400);
  if (!BOUTIQUE_PORTALS.includes(portal)) return json({ error: 'Portail invalide.' }, 400);

  let id = boutiqueText(body.id, 100).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) id = crypto.randomUUID();
  const oldRaw = await env.CASHFLOW_KV.get(BOUTIQUE_PRODUCT_PREFIX + id);
  let old = null;
  try { old = oldRaw ? JSON.parse(oldRaw) : null; } catch (_) {}

  const imageValues = Array.isArray(body.images) ? body.images : [body.image1, body.image2, body.image3, body.image4];
  const imageMainRaw = boutiqueText(body.imageMain, 2000);
  const ctaUrlRaw = boutiqueText(body.ctaUrl, 2000);
  const promoExpiresRaw = boutiqueText(body.promoExpiresAt, 40);
  const invalidImage = imageMainRaw && !boutiqueUrl(imageMainRaw);
  const invalidCta = ctaUrlRaw && !boutiqueUrl(ctaUrlRaw);
  if (invalidImage || invalidCta) return json({ error: 'Un lien est invalide. Utilise une adresse https:// complète.' }, 400);
  if (promoExpiresRaw && !Number.isFinite(Date.parse(promoExpiresRaw))) return json({ error: 'La date d’expiration de la promotion est invalide.' }, 400);
  const price = boutiqueNumber(body.price);
  const oldPrice = boutiqueNumber(body.oldPrice);
  if ((price != null && price < 0) || (oldPrice != null && oldPrice < 0)) return json({ error: 'Le prix ne peut pas être négatif.' }, 400);

  const testimonialData = boutiqueTestimonials(body, old);
  if (testimonialData.invalidImage) return json({ error: 'Une image de témoignage contient un lien invalide. Utilise une adresse https:// complète.' }, 400);
  const testimonials = testimonialData.items;
  const testimonialTitle = body.testimonialTitle !== undefined
    ? boutiqueText(body.testimonialTitle, 180)
    : boutiqueText(old && old.testimonialTitle, 180);
  const firstTextTestimonial = testimonials.find((item) => item.type === 'text') || null;

  const ctaType = BOUTIQUE_CTA_TYPES.includes(body.ctaType) ? body.ctaType : 'en-savoir-plus';
  const now = new Date().toISOString();
  const product = {
    schemaVersion: 2,
    id,
    slug: boutiqueSlug(body.slug || title),
    portal,
    type: boutiqueText(body.type, 80) || 'autre',
    category: boutiqueText(body.category, 100),
    title,
    shortDescription: boutiqueText(body.shortDescription, 500),
    description: boutiqueText(body.description, 12000),
    price,
    oldPrice,
    priceLabel: boutiqueText(body.priceLabel, 80),
    currency: ['CAD', 'EUR', 'USD'].includes(body.currency) ? body.currency : 'CAD',
    imageMain: boutiqueUrl(imageMainRaw),
    images: imageValues.map(boutiqueUrl).filter(Boolean).slice(0, 4),
    testimonialTitle,
    testimonials,
    testimonialQuote: firstTextTestimonial ? boutiqueText(firstTextTestimonial.text, 1200) : '',
    testimonialAuthor: firstTextTestimonial ? boutiqueText(firstTextTestimonial.author, 120) : '',
    ctaType,
    ctaUrl: boutiqueUrl(ctaUrlRaw),
    order: Math.max(0, Math.trunc(boutiqueNumber(body.order, 0))),
    active: boutiqueBool(body.active, false),
    featured: boutiqueBool(body.featured, false),
    promoCode: boutiqueText(body.promoCode, 80),
    promoText: boutiqueText(body.promoText, 500),
    promoExpiresAt: promoExpiresRaw ? new Date(promoExpiresRaw).toISOString() : '',
    createdAt: old && old.createdAt ? old.createdAt : now,
    updatedAt: now
  };

  await env.CASHFLOW_KV.put(BOUTIQUE_PRODUCT_PREFIX + id, JSON.stringify(product));
  const ids = await boutiqueIndex(env);
  if (!ids.includes(id)) {
    ids.push(id);
    await env.CASHFLOW_KV.put(BOUTIQUE_INDEX_KEY, JSON.stringify(ids));
  }
  return json({ success: true, product });
}

async function handleBoutiqueProductDelete(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const id = boutiqueText(body.id, 100).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return json({ error: 'Identifiant requis.' }, 400);
  await env.CASHFLOW_KV.delete(BOUTIQUE_PRODUCT_PREFIX + id);
  const ids = (await boutiqueIndex(env)).filter((item) => item !== id);
  await env.CASHFLOW_KV.put(BOUTIQUE_INDEX_KEY, JSON.stringify(ids));
  return json({ success: true });
}

async function handleBoutiqueSettingsAdmin(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (request.method === 'GET') return json({ settings: await boutiqueSettings(env) });
  const body = await request.json().catch(() => ({}));
  const current = await boutiqueSettings(env);
  const incomingPortals = Array.isArray(body.portals) ? body.portals : [];
  const appointmentRaw = boutiqueText(body.appointmentUrl, 2000);
  if (appointmentRaw && !boutiqueUrl(appointmentRaw)) return json({ error: 'Le lien central du rendez-vous est invalide.' }, 400);
  const invalidPortalImage = incomingPortals.some((portal) => {
    const image = boutiqueText(portal && portal.imageUrl, 2000);
    return image && !boutiqueUrl(image);
  });
  if (invalidPortalImage) return json({ error: 'Une image de portail contient un lien invalide.' }, 400);
  const settings = {
    title: boutiqueText(body.title, 120) || current.title,
    heroTitle: boutiqueText(body.heroTitle, 240) || current.heroTitle,
    heroText: boutiqueText(body.heroText, 1200) || current.heroText,
    appointmentUrl: boutiqueUrl(appointmentRaw),
    appointmentLabel: boutiqueText(body.appointmentLabel, 80) || 'Prendre un rendez-vous',
    portals: BOUTIQUE_DEFAULT_PORTALS.map((fallback) => {
      const incoming = incomingPortals.find((item) => item && item.id === fallback.id) || {};
      const prior = current.portals.find((item) => item && item.id === fallback.id) || fallback;
      const imageRaw = boutiqueText(incoming.imageUrl, 2000);
      return {
        id: fallback.id,
        name: boutiqueText(incoming.name, 80) || prior.name || fallback.name,
        intro: boutiqueText(incoming.intro, 500) || prior.intro || fallback.intro,
        imageUrl: boutiqueUrl(imageRaw),
        order: Math.max(0, Math.trunc(boutiqueNumber(incoming.order, prior.order || fallback.order))),
        active: boutiqueBool(incoming.active, prior.active !== false)
      };
    }),
    updatedAt: new Date().toISOString()
  };
  await env.CASHFLOW_KV.put(BOUTIQUE_SETTINGS_KEY, JSON.stringify(settings));
  return json({ success: true, settings });
}

async function handleBoutiqueCatalog(request, env) {
  const url = new URL(request.url);
  const portal = boutiqueText(url.searchParams.get('portal'), 30).toLowerCase();
  const id = boutiqueText(url.searchParams.get('id'), 100);
  const q = boutiqueText(url.searchParams.get('q'), 200).toLowerCase();
  let products = (await boutiqueProducts(env)).filter((product) => product.active);
  if (portal && BOUTIQUE_PORTALS.includes(portal)) products = products.filter((product) => product.portal === portal);
  if (id) products = products.filter((product) => product.id === id || product.slug === id);
  if (q) products = products.filter((product) =>
    [product.title, product.shortDescription, product.description, product.category, product.type]
      .join(' ').toLowerCase().includes(q)
  );
  return boutiqueCors(json({ products: products.map(boutiquePublicProduct), count: products.length }));
}

async function handleBoutiqueConfig(request, env) {
  return boutiqueCors(json({ settings: await boutiqueSettings(env) }));
}


// Portails configurables (KV univers:portals)
async function getPortalsList(env) {
  const raw = await env.CASHFLOW_KV.get('univers:portals');
  if (raw) {
    try { return JSON.parse(raw); } catch (_) {}
  }
  // Défaut initial
  const defaults = [
    { id: 'systemeprompt', name: 'Studio Prompt', active: true },
    { id: 'cercles', name: 'Les Cercles', active: true },
    { id: 'repertoire', name: 'Le Répertoire', active: true },
    { id: 'affiliation', name: 'Affiliation', active: true },
    { id: 'marketplace', name: 'Marketplace', active: true }
  ];
  await env.CASHFLOW_KV.put('univers:portals', JSON.stringify(defaults));
  return defaults;
}

async function handleListPortals(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const portals = await getPortalsList(env);
  return json({ portals });
}

async function handleSavePortals(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  let portals = body.portals;
  if (!Array.isArray(portals)) return json({ error: 'Liste invalide.' }, 400);
  portals = portals.map(p => ({
    id: String(p.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    name: String(p.name || '').trim(),
    active: p.active !== false
  })).filter(p => p.id && p.name);
  await env.CASHFLOW_KV.put('univers:portals', JSON.stringify(portals));
  return json({ success: true, portals });
}

async function handleAddPortal(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const id = String(body.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const name = String(body.name || '').trim();
  if (!id || !name) return json({ error: 'Identifiant et nom requis.' }, 400);
  const portals = await getPortalsList(env);
  if (portals.some(p => p.id === id)) return json({ error: 'Ce portail existe déjà.' }, 409);
  portals.push({ id, name, active: true });
  await env.CASHFLOW_KV.put('univers:portals', JSON.stringify(portals));
  return json({ success: true, portals });
}

async function handleRemovePortal(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const id = String(body.id || '').trim();
  let portals = await getPortalsList(env);
  portals = portals.filter(p => p.id !== id);
  await env.CASHFLOW_KV.put('univers:portals', JSON.stringify(portals));
  return json({ success: true, portals });
}

// Clients portails (même format KV que Studio : client:email)
async function handleListPortalClients(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const list = await env.CASHFLOW_KV.list({ prefix: 'client:' });
  const clients = [];
  for (const key of list.keys || []) {
    const raw = await env.CASHFLOW_KV.get(key.name);
    if (!raw) continue;
    try {
      const c = JSON.parse(raw);
      clients.push({
        email: c.email || key.name.replace('client:', ''),
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        name: c.name || '',
        products: c.products || [],
        active: c.active !== false,
        createdAt: c.createdAt || ''
      });
    } catch (_) {}
  }
  clients.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return json({ clients });
}

async function handleCreatePortalClient(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';
  const firstName = (body.firstName || body.prenom || '').trim();
  const lastName = (body.lastName || '').trim();
  const products = Array.isArray(body.products) ? body.products : [];

  if (!email || !password) return json({ error: 'Courriel et mot de passe requis.' }, 400);
  if (password.length < 6) return json({ error: 'Mot de passe : minimum 6 caractères.' }, 400);
  if (!products.length) return json({ error: 'Sélectionne au moins un portail.' }, 400);

  const existingRaw = await env.CASHFLOW_KV.get('client:' + email);

  // 1 courriel = 1 client : on AJOUTE des portails/produits, on ne refuse pas
  if (existingRaw) {
    const client = JSON.parse(existingRaw);
    const current = Array.isArray(client.products) ? client.products.slice() : [];
    const added = [];
    for (const p of products) {
      if (!current.map(String).includes(String(p))) {
        current.push(p);
        added.push(p);
      }
    }
    client.products = current;
    if (firstName) client.firstName = firstName;
    if (lastName) client.lastName = lastName;
    if (firstName || lastName) client.name = (firstName + ' ' + lastName).trim() || firstName;
    if (password && password.length >= 6) {
      const salt = randomSalt();
      client.salt = salt;
      client.passwordHash = await hashPassword(password, salt);
      client.password = password;
    }
    client.active = true;
    client.updatedAt = new Date().toISOString();
    await env.CASHFLOW_KV.put('client:' + email, JSON.stringify(client));

    if (current.includes('cercles') || current.includes('affiliation')) {
      try {
        const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (!exists) {
          const userId = generateId();
          let code = generateCode();
          const passwordHashAffil = await hashPasswordAffil(password || crypto.randomUUID().slice(0, 10));
          await env.DB.prepare(
            `INSERT INTO users (id, email, password_hash, full_name, role, affiliate_code, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'affiliate', ?, datetime('now'), datetime('now'))`
          ).bind(userId, email, passwordHashAffil, firstName || email.split('@')[0], code).run();
        }
      } catch (e) { console.error('D1 client', e); }
    }

    return json({
      success: true,
      email,
      products: client.products,
      added,
      merged: true,
      message: added.length ? 'Client existant : portail(s) ajouté(s).' : 'Déjà inscrit à ces portails.'
    });
  }

  // Nouveau client
  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);

  const client = {
    firstName,
    lastName,
    name: (firstName + ' ' + lastName).trim() || firstName,
    email,
    password,
    passwordHash,
    salt,
    role: 'client',
    products,
    active: true,
    createdAt: new Date().toISOString()
  };
  await env.CASHFLOW_KV.put('client:' + email, JSON.stringify(client));

  if (products.includes('cercles') || products.includes('affiliation')) {
    try {
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (!exists) {
        const userId = generateId();
        let code = generateCode();
        const passwordHashAffil = await hashPasswordAffil(password);
        await env.DB.prepare(
          `INSERT INTO users (id, email, password_hash, full_name, role, affiliate_code, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'affiliate', ?, datetime('now'), datetime('now'))`
        ).bind(userId, email, passwordHashAffil, firstName || email.split('@')[0], code).run();
      }
    } catch (e) { console.error('D1 client', e); }
  }

  return json({ success: true, email, products, merged: false });
}

async function handleDeletePortalClient(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const email = (body.email || '').toLowerCase().trim();
  if (!email) return json({ error: 'Email requis.' }, 400);
  await env.CASHFLOW_KV.delete('client:' + email);
  return json({ success: true });
}


// ───────────── DÉGUSTATIONS & ACCÈS TEMPORAIRES NYXIA ─────────────
// Administration centralisée. Les portails disponibles proviennent TOUJOURS de univers:portals.
const DG_CAMPAIGNS_KEY = 'univers:degustations';
const DG_PERMANENT_KEY = 'univers:access:permanent';
const DG_GRANT_PREFIX = 'univers:access:grant:';
const DG_ACTIVATION_PREFIX = 'univers:access:activation:';
const DG_OWNER_EMAIL = 'magiquebusiness@gmail.com';

function dgEmail(v) { return String(v || '').trim().toLowerCase(); }
function dgId(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 100); }
function dgText(v, max = 2000) { return String(v == null ? '' : v).trim().slice(0, max); }
function dgUrl(v) {
  const s = dgText(v, 2000); if (!s) return '';
  try { const u = new URL(s); return ['http:','https:'].includes(u.protocol) ? u.toString() : ''; } catch (_) { return ''; }
}
function dgNumber(v, fallback = null) { if (v === '' || v == null) return fallback; const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function dgNow() { return new Date().toISOString(); }
function dgGrantKey(email, campaignId, portalId) { return DG_GRANT_PREFIX + encodeURIComponent(dgEmail(email)) + ':' + dgId(campaignId) + ':' + dgId(portalId); }
function dgActivationKey(email, campaignId) { return DG_ACTIVATION_PREFIX + encodeURIComponent(dgEmail(email)) + ':' + dgId(campaignId); }

async function dgReadCampaigns(env) {
  const raw = await env.CASHFLOW_KV.get(DG_CAMPAIGNS_KEY);
  if (!raw) return [];
  try { const list = JSON.parse(raw); return Array.isArray(list) ? list : []; } catch (_) { return []; }
}
async function dgWriteCampaigns(env, list) { await env.CASHFLOW_KV.put(DG_CAMPAIGNS_KEY, JSON.stringify(list)); }

async function dgReadPermanent(env) {
  let list = [];
  const raw = await env.CASHFLOW_KV.get(DG_PERMANENT_KEY);
  if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) list = p; } catch (_) {} }
  const owner = list.find((x) => dgEmail(x && x.email) === DG_OWNER_EMAIL);
  if (owner) {
    owner.email = DG_OWNER_EMAIL; owner.role = 'owner'; owner.allPortals = true; owner.portalIds = []; owner.protected = true;
    if (!owner.createdAt) owner.createdAt = dgNow();
  } else {
    list.unshift({ email: DG_OWNER_EMAIL, role: 'owner', allPortals: true, portalIds: [], note: 'OWNER NyXia — accès permanent protégé', protected: true, createdAt: dgNow(), updatedAt: dgNow() });
  }
  await env.CASHFLOW_KV.put(DG_PERMANENT_KEY, JSON.stringify(list));
  return list;
}
async function dgWritePermanent(env, list) {
  // L'OWNER ne peut jamais disparaître ni perdre l'accès aux futurs portails.
  list = (Array.isArray(list) ? list : []).filter((x) => dgEmail(x && x.email) !== DG_OWNER_EMAIL);
  list.unshift({ email: DG_OWNER_EMAIL, role: 'owner', allPortals: true, portalIds: [], note: 'OWNER NyXia — accès permanent protégé', protected: true, createdAt: dgNow(), updatedAt: dgNow() });
  await env.CASHFLOW_KV.put(DG_PERMANENT_KEY, JSON.stringify(list));
  return list;
}

async function dgNormalizeCampaign(env, body, existing) {
  const portals = await getPortalsList(env);
  const validIds = new Set((portals || []).map((p) => p.id));
  const portalIds = Array.isArray(body.portalIds) ? body.portalIds.map(dgId).filter((id) => validIds.has(id)) : [];
  const name = dgText(body.name, 180);
  const durationHours = Math.max(1, Math.round(dgNumber(body.durationHours, 72) || 72));
  const startMode = body.startMode === 'activation' ? 'activation' : 'first_login';
  const status = ['draft','active','ended'].includes(body.status) ? body.status : 'draft';
  const availableFrom = body.availableFrom && Number.isFinite(Date.parse(body.availableFrom)) ? new Date(body.availableFrom).toISOString() : '';
  const availableUntil = body.availableUntil && Number.isFinite(Date.parse(body.availableUntil)) ? new Date(body.availableUntil).toISOString() : '';
  if (availableFrom && availableUntil && Date.parse(availableUntil) < Date.parse(availableFrom)) throw new Error('La fin de disponibilité doit être après le début.');
  const checkoutRaw = dgText(body.checkoutUrl, 2000); const checkoutUrl = checkoutRaw ? dgUrl(checkoutRaw) : '';
  if (checkoutRaw && !checkoutUrl) throw new Error('Le lien de paiement est invalide.');
  const afterIn = body.afterExpiry || {};
  const afterType = ['offer','checkout','boutique','appointment','custom'].includes(afterIn.type) ? afterIn.type : 'offer';
  const afterRaw = dgText(afterIn.url, 2000); let afterUrl = afterRaw ? dgUrl(afterRaw) : '';
  if (afterRaw && !afterUrl) throw new Error('Le lien après expiration est invalide.');
  if (afterType === 'boutique' && !afterUrl) afterUrl = 'https://boutique.nyxia.top';
  const continuation = (Array.isArray(body.continuation) ? body.continuation : []).slice(0, 5).map((x) => {
    const raw = dgText(x && x.url, 2000); const url = raw ? dgUrl(raw) : '';
    if (raw && !url) throw new Error('Un lien de continuité est invalide.');
    return { label: dgText(x && x.label, 120), price: dgNumber(x && x.price, null), url };
  }).filter((x) => x.label || x.price != null || x.url);
  return {
    id: dgId(body.id) || (existing && existing.id) || crypto.randomUUID(),
    name, status, portalIds, durationHours, startMode,
    availableFrom, availableUntil,
    price: dgNumber(body.price, null), currency: ['CAD','EUR','USD'].includes(body.currency) ? body.currency : 'CAD',
    checkoutUrl, afterExpiry: { type: afterType, url: afterUrl }, continuation,
    webhookKey: (existing && existing.webhookKey) || crypto.randomUUID().replace(/-/g, ''),
    createdAt: (existing && existing.createdAt) || dgNow(), updatedAt: dgNow()
  };
}
function dgCampaignObtainable(c) {
  if (!c || c.status !== 'active') return false;
  const now = Date.now();
  if (c.availableFrom && Date.parse(c.availableFrom) > now) return false;
  if (c.availableUntil && Date.parse(c.availableUntil) < now) return false;
  return true;
}

async function dgCreateOrReuseActivation(env, campaign, email, source, forceAdmin) {
  email = dgEmail(email);
  if (!email) throw new Error('Courriel requis.');
  if (!forceAdmin && !dgCampaignObtainable(campaign)) throw new Error('Cette dégustation n’est pas disponible actuellement.');
  const aKey = dgActivationKey(email, campaign.id);
  const oldRaw = await env.CASHFLOW_KV.get(aKey);
  if (oldRaw) {
    try { const old = JSON.parse(oldRaw); if (old && old.campaignId) return old; } catch (_) {}
  }
  const pending = campaign.startMode === 'first_login';
  const startedAt = pending ? '' : dgNow();
  const expiresAt = pending ? '' : new Date(Date.parse(startedAt) + Number(campaign.durationHours) * 3600000).toISOString();
  const activation = { email, campaignId: campaign.id, campaignName: campaign.name, source: source || 'manual', pending, startedAt, expiresAt, createdAt: dgNow() };
  await env.CASHFLOW_KV.put(aKey, JSON.stringify(activation));
  for (const portalId of campaign.portalIds || []) {
    const key = dgGrantKey(email, campaign.id, portalId);
    const existingRaw = await env.CASHFLOW_KV.get(key);
    if (existingRaw) continue; // jamais remettre le compteur à zéro
    const grant = { key, email, campaignId: campaign.id, campaignName: campaign.name, portalId, pending, startedAt, expiresAt, createdAt: dgNow(), source: source || 'manual' };
    await env.CASHFLOW_KV.put(key, JSON.stringify(grant));
  }
  return activation;
}

async function dgStartPendingCampaign(env, email, campaignId) {
  email = dgEmail(email); campaignId = dgId(campaignId);
  const campaigns = await dgReadCampaigns(env);
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) return null;
  const aKey = dgActivationKey(email, campaignId);
  let activation = null;
  const raw = await env.CASHFLOW_KV.get(aKey);
  if (raw) { try { activation = JSON.parse(raw); } catch (_) {} }
  if (!activation) return null;
  if (!activation.pending && activation.startedAt) return activation;
  const startedAt = dgNow();
  const expiresAt = new Date(Date.parse(startedAt) + Number(campaign.durationHours || 72) * 3600000).toISOString();
  activation.pending = false; activation.startedAt = startedAt; activation.expiresAt = expiresAt; activation.updatedAt = dgNow();
  await env.CASHFLOW_KV.put(aKey, JSON.stringify(activation));
  // Même compteur pour TOUS les portails de cette campagne.
  for (const portalId of campaign.portalIds || []) {
    const key = dgGrantKey(email, campaignId, portalId);
    const gRaw = await env.CASHFLOW_KV.get(key); if (!gRaw) continue;
    try {
      const g = JSON.parse(gRaw); g.pending = false; g.startedAt = startedAt; g.expiresAt = expiresAt; g.updatedAt = dgNow();
      await env.CASHFLOW_KV.put(key, JSON.stringify(g));
    } catch (_) {}
  }
  return activation;
}

async function dgListGrants(env) {
  const list = await env.CASHFLOW_KV.list({ prefix: DG_GRANT_PREFIX });
  const out = [];
  for (const k of list.keys || []) {
    const raw = await env.CASHFLOW_KV.get(k.name); if (!raw) continue;
    try { const g = JSON.parse(raw); g.key = k.name; out.push(g); } catch (_) {}
  }
  out.sort((a,b) => String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return out;
}
async function dgGrantsFor(env, email, portalId) {
  const prefix = DG_GRANT_PREFIX + encodeURIComponent(dgEmail(email)) + ':';
  const list = await env.CASHFLOW_KV.list({ prefix }); const out=[];
  for (const k of list.keys || []) {
    const raw=await env.CASHFLOW_KV.get(k.name); if(!raw)continue;
    try { const g=JSON.parse(raw); if(g.portalId===portalId){g.key=k.name;out.push(g);} } catch(_){}
  }
  return out.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

async function dgCheckAccess(env, email, portalId) {
  email = dgEmail(email); portalId = dgId(portalId);
  if (!email || !portalId) return { allowed:false, reason:'missing' };
  // 1) OWNER / STAFF / TEST permanent.
  const permanent = await dgReadPermanent(env);
  const p = permanent.find((x) => dgEmail(x.email) === email);
  if (p && (p.allPortals || (p.portalIds || []).includes(portalId))) return { allowed:true, accessType:'permanent', role:p.role || 'staff', expiresAt:null };
  // 2) Accès déjà acheté / permanent existant dans le système client. Ne jamais le casser.
  const clientRaw = await env.CASHFLOW_KV.get('client:' + email);
  if (clientRaw) {
    try {
      const client = JSON.parse(clientRaw); const products = Array.isArray(client.products) ? client.products.map((x)=>String(x).toLowerCase()) : [];
      if (client.active !== false && products.includes(portalId)) return { allowed:true, accessType:'purchased', role:client.role || 'client', expiresAt:null };
    } catch (_) {}
  }
  // 3) Dégustation temporaire.
  let grants = await dgGrantsFor(env, email, portalId);
  const pending = grants.find((g) => g.pending);
  if (pending) {
    await dgStartPendingCampaign(env, email, pending.campaignId);
    grants = await dgGrantsFor(env, email, portalId);
  }
  const active = grants.find((g) => g.expiresAt && Date.parse(g.expiresAt) > Date.now());
  if (active) return { allowed:true, accessType:'temporary', campaignId:active.campaignId, campaignName:active.campaignName, startedAt:active.startedAt, expiresAt:active.expiresAt };
  const expired = grants.find((g) => g.expiresAt && Date.parse(g.expiresAt) <= Date.now());
  if (expired) {
    const campaigns = await dgReadCampaigns(env); const c = campaigns.find((x)=>x.id===expired.campaignId) || {};
    return { allowed:false, reason:'expired', campaignId:expired.campaignId, campaignName:expired.campaignName, expiresAt:expired.expiresAt, afterExpiry:c.afterExpiry || null, continuation:c.continuation || [] };
  }
  return { allowed:false, reason:'no_access' };
}

function dgExtractEmail(body) {
  return dgEmail(body && (body.email || body.contact_email || body.contactEmail || (body.contact && body.contact.email) || (body.customer && body.customer.email) || (body.data && body.data.email) || (body.fields && body.fields.email)));
}
async function dgAccessCallerAllowed(request, env) {
  if (await requireAdmin(request, env)) return true;
  const expected = String(env.NYXIA_ACCESS_KEY || '').trim();
  const got = String(request.headers.get('X-NyXia-Access-Key') || '').trim();
  return !!expected && got === expected;
}
function dgCors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Univers-Token, X-NyXia-Access-Key');
  return res;
}

async function handleDgMeta(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  return json({ success:true, ownerEmail:DG_OWNER_EMAIL, portals:await getPortalsList(env), campaigns:await dgReadCampaigns(env), permanent:await dgReadPermanent(env) });
}
async function handleDgCampaigns(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error:'Non autorisé.' },401);
  if (request.method === 'GET') return json({ campaigns:await dgReadCampaigns(env) });
  const body=await request.json().catch(()=>({})); const campaigns=await dgReadCampaigns(env);
  const existing=body.id?campaigns.find((c)=>c.id===dgId(body.id)):null;
  let c; try{c=await dgNormalizeCampaign(env,body,existing);}catch(e){return json({error:e.message},400);}
  if(!c.name)return json({error:'Nom requis.'},400); if(!c.portalIds.length)return json({error:'Choisis au moins un portail actif.'},400);
  const idx=campaigns.findIndex((x)=>x.id===c.id); if(idx>=0)campaigns[idx]=c;else campaigns.push(c);
  await dgWriteCampaigns(env,campaigns); return json({success:true,campaign:c,campaigns});
}
async function handleDgDeleteCampaign(request, env) {
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  const b=await request.json().catch(()=>({})); const id=dgId(b.id); let list=await dgReadCampaigns(env); list=list.filter((c)=>c.id!==id); await dgWriteCampaigns(env,list); return json({success:true,campaigns:list});
}
async function handleDgPermanent(request, env) {
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  if(request.method==='GET')return json({permanent:await dgReadPermanent(env)});
  const b=await request.json().catch(()=>({})); const email=dgEmail(b.email); if(!email)return json({error:'Courriel requis.'},400);
  if(email===DG_OWNER_EMAIL)return json({error:'Le compte OWNER est protégé et possède déjà tous les accès.'},400);
  const portals=await getPortalsList(env);const valid=new Set(portals.map((p)=>p.id));const portalIds=Array.isArray(b.portalIds)?b.portalIds.map(dgId).filter((id)=>valid.has(id)):[];
  const allPortals=!!b.allPortals;if(!allPortals&&!portalIds.length)return json({error:'Choisis au moins un portail ou tous les portails.'},400);
  let list=await dgReadPermanent(env);const old=list.find((x)=>dgEmail(x.email)===email);const row={email,role:['staff','test'].includes(b.role)?b.role:'staff',allPortals,portalIds:allPortals?[]:portalIds,note:dgText(b.note,300),protected:false,createdAt:(old&&old.createdAt)||dgNow(),updatedAt:dgNow()};
  const i=list.findIndex((x)=>dgEmail(x.email)===email);if(i>=0)list[i]=row;else list.push(row);list=await dgWritePermanent(env,list);return json({success:true,permanent:list});
}
async function handleDgDeletePermanent(request, env) {
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  const b=await request.json().catch(()=>({}));const email=dgEmail(b.email);if(email===DG_OWNER_EMAIL)return json({error:'Impossible de retirer le compte OWNER.'},403);
  let list=await dgReadPermanent(env);list=list.filter((x)=>dgEmail(x.email)!==email);list=await dgWritePermanent(env,list);return json({success:true,permanent:list});
}
async function handleDgGrants(request, env) {
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);return json({grants:await dgListGrants(env)});
}
async function handleDgGrantManual(request, env) {
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  const b=await request.json().catch(()=>({}));const email=dgEmail(b.email),campaignId=dgId(b.campaignId);const campaigns=await dgReadCampaigns(env);const c=campaigns.find((x)=>x.id===campaignId);if(!c)return json({error:'Campagne introuvable.'},404);
  try{const activation=await dgCreateOrReuseActivation(env,c,email,'superadmin',true);return json({success:true,activation,grants:await dgListGrants(env)});}catch(e){return json({error:e.message},400);}
}
async function handleDgDeleteGrant(request, env) {
  if (!(await requireAdmin(request, env))) return json({error:'Non autorisé.'},401);
  const b=await request.json().catch(()=>({}));const key=String(b.key||'');if(!key.startsWith(DG_GRANT_PREFIX))return json({error:'Clé invalide.'},400);await env.CASHFLOW_KV.delete(key);return json({success:true});
}
async function handleDgActivate(request, env) {
  const url=new URL(request.url);const campaignId=dgId(url.searchParams.get('campaign'));const key=String(url.searchParams.get('key')||'');const campaigns=await dgReadCampaigns(env);const c=campaigns.find((x)=>x.id===campaignId);
  if(!c||!key||key!==c.webhookKey)return dgCors(json({error:'Webhook invalide.'},403));
  const b=await request.json().catch(()=>({}));const email=dgExtractEmail(b);if(!email)return dgCors(json({error:'Courriel introuvable dans le webhook.'},400));
  try{const activation=await dgCreateOrReuseActivation(env,c,email,'systeme.io',false);return dgCors(json({success:true,activation}));}catch(e){return dgCors(json({error:e.message},400));}
}
async function handleDgAccessCheck(request, env) {
  if (!(await dgAccessCallerAllowed(request,env))) return dgCors(json({error:'Non autorisé.'},401));
  let b={};if(request.method==='GET'){const u=new URL(request.url);b={email:u.searchParams.get('email'),portalId:u.searchParams.get('portal')||u.searchParams.get('portalId')};}else b=await request.json().catch(()=>({}));
  return dgCors(json(await dgCheckAccess(env,b.email,b.portalId||b.portal)));
}

// ───────────── FORMATIONS (KV partagé avec le Portail Alex) ─────────────
// Les formations sont stockées dans le MÊME KV que le Portail Alex, à la clé
// formation:{agent}:{id}. Le worker d'Alex les lit directement. Aucun contenu inventé ici :
// le Super Admin ne fait qu'écrire ce que Diane saisit.
const FORMATION_AGENTS = ['diane', 'nyxia', 'eric', 'alex', 'lena', 'selena', 'kael'];

function slugPortail(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
const PORTAILS_FORMATION = ['lena','selena','kael','alex','diane','nyxia','eric','studio'];
function formationKey(portail, agent, id) {
  const p = slugPortail(portail) || 'lena';
  return 'formation:' + p + ':' + agent + ':' + id;
}
function formationKeyLegacy(agent, id) { return 'formation:' + agent + ':' + id; }

function slugifyFormationId(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const FORMATION_BLOC_TYPES = ['texte', 'image', 'audio', 'video', 'exercice', 'intervention', 'lien'];

// Nettoie/valide un bloc selon son type, sans rien inventer.
function sanitizeFormationBloc(raw) {
  const type = FORMATION_BLOC_TYPES.includes(String(raw && raw.type)) ? raw.type : 'texte';
  const b = { type };
  const str = (v) => (v == null ? '' : String(v));
  if (type === 'texte' || type === 'intervention') { b.contenu = str(raw.contenu); }
  else if (type === 'image') { b.url = str(raw.url).trim(); b.legende = str(raw.legende); }
  else if (type === 'audio' || type === 'video') { b.url = str(raw.url).trim(); b.titre = str(raw.titre); b.intro = str(raw.intro); }
  else if (type === 'exercice') { b.objectif = str(raw.objectif); b.consigne = str(raw.consigne); }
  else if (type === 'lien') { b.url = str(raw.url).trim(); b.titre = str(raw.titre || raw.legende); b.intro = str(raw.intro || raw.contenu); }
  return b;
}

function sanitizeFormationDoc(input) {
  const id = slugifyFormationId(input && (input.id || input.titre));
  const modulesIn = Array.isArray(input && input.modules) ? input.modules : [];
  const modules = modulesIn.map((m, i) => ({
    id: String((m && m.id) || ('m' + (i + 1))).trim() || ('m' + (i + 1)),
    numero: Number.isFinite(m && m.numero) ? m.numero : (i + 1),
    titre: String((m && m.titre) || ('Module ' + (i + 1))),
    blocs: Array.isArray(m && m.blocs) ? m.blocs.map(sanitizeFormationBloc) : []
  }));
  return {
    id,
    titre: String((input && input.titre) || '').trim(),
    description: String((input && input.description) || '').trim(),
    ordre: Number.isFinite(input && input.ordre) ? input.ordre : 0,
    modules
  };
}

async function handleListFormations(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('agent') || 'alex').toLowerCase();
  const catalog = await lirePersonnages(env);
  const allowed = catalog.map(p => p.code).concat(FORMATION_AGENTS);
  const agent = allowed.includes(asked) ? asked : 'alex';
  const portail = slugPortail(url.searchParams.get('portail') || url.searchParams.get('portal') || 'lena');
  const out = [];
  try {
    const list = await env.CASHFLOW_KV.list({ prefix: 'formation:' + portail + ':' + agent + ':' });
    for (const k of list.keys || []) {
      const raw = await env.CASHFLOW_KV.get(k.name);
      if (!raw) continue;
      let doc; try { doc = JSON.parse(raw); } catch (_) { continue; }
      if (doc && doc.id) { doc.portail = portail; out.push(doc); }
    }
  } catch (e) { return json({ error: 'Lecture impossible : ' + e.message }, 500); }
  out.sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || String(a.titre || '').localeCompare(String(b.titre || '')));
  return json({ formations: out });
}

async function handleSaveFormation(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const asked = String(body.agent || 'alex').toLowerCase();
  const catalog = await lirePersonnages(env);
  const allowed = catalog.map(p => p.code).concat(FORMATION_AGENTS);
  const agent = allowed.includes(asked) ? asked : 'alex';
  const portail = slugPortail(body.portail || body.portal || 'lena');
  const doc = sanitizeFormationDoc(body.formation || body);
  doc.portail = portail;
  doc.agent = agent;
  if (!doc.id) return json({ error: 'Donne au moins un titre à la formation.' }, 400);
  if (!doc.titre) return json({ error: 'Le titre est requis.' }, 400);
  try {
    await env.CASHFLOW_KV.put(formationKey(portail, agent, doc.id), JSON.stringify(doc));
  } catch (e) { return json({ error: 'Enregistrement impossible : ' + e.message }, 500); }
  return json({ success: true, formation: doc });
}

async function handleDeleteFormation(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const asked = String(body.agent || 'alex').toLowerCase();
  const catalog = await lirePersonnages(env);
  const allowed = catalog.map(p => p.code).concat(FORMATION_AGENTS);
  const agent = allowed.includes(asked) ? asked : 'alex';
  const portail = slugPortail(body.portail || body.portal || 'lena');
  const id = slugifyFormationId(body.id);
  if (!id) return json({ error: 'Identifiant requis.' }, 400);
  try {
    await env.CASHFLOW_KV.delete(formationKey(portail, agent, id));
    await env.CASHFLOW_KV.delete(formationKeyLegacy(agent, id));
  } catch (e) { return json({ error: 'Suppression impossible : ' + e.message }, 500); }
  return json({ success: true });
}

function yearFromDate(d) {
  const m = String(d || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function rowToDefunt(row) {
  if (!row) return null;
  const stories = [row.circumstance, row.message, row.incomplete, row.unsaid].filter(Boolean);
  return {
    id: row.id,
    prenom: row.prenom,
    nom: row.nom || '',
    birth: row.birth || '',
    death: row.death || '',
    born: yearFromDate(row.birth),
    died: yearFromDate(row.death),
    circumstance: row.circumstance || '',
    message: row.message || '',
    incomplete: row.incomplete || '',
    unsaid: row.unsaid || '',
    tone: row.tone === 'grouch' ? 'grouch' : 'story',
    active: Number(row.active) === 1,
    soiree: row.soiree || '',
    sort_order: row.sort_order || 0,
    stories
  };
}

async function ensureDefuntsTable(env) {
  if (!env.DB) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS defunts (
    id TEXT PRIMARY KEY,
    prenom TEXT NOT NULL,
    nom TEXT DEFAULT '',
    birth TEXT DEFAULT '',
    death TEXT DEFAULT '',
    circumstance TEXT DEFAULT '',
    message TEXT DEFAULT '',
    incomplete TEXT DEFAULT '',
    unsaid TEXT DEFAULT '',
    tone TEXT DEFAULT 'story',
    active INTEGER DEFAULT 1,
    soiree TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )`).run();
}

async function readDefunts(env) {
  if (!env.DB) return [];
  await ensureDefuntsTable(env);
  const res = await env.DB.prepare(`SELECT * FROM defunts ORDER BY sort_order ASC, created_at ASC`).all();
  return (res.results || []).map(rowToDefunt);
}

async function handleListDefunts(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  return json({ defunts: await readDefunts(env) });
}

async function handleSaveDefunt(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  await ensureDefuntsTable(env);
  const body = await request.json().catch(() => ({}));
  const prenom = String(body.prenom || '').trim();
  if (!prenom) return json({ error: 'Le prénom est requis.' }, 400);
  const now = new Date().toISOString();
  const id = String(body.id || crypto.randomUUID());
  const existing = await env.DB.prepare(`SELECT id, sort_order, created_at FROM defunts WHERE id = ?`).bind(id).first();
  const nom = String(body.nom || '').trim();
  const birth = String(body.birth || '').trim();
  const death = String(body.death || '').trim();
  const circumstance = String(body.circumstance || '').trim();
  const message = String(body.message || '').trim();
  const incomplete = String(body.incomplete || '').trim();
  const unsaid = String(body.unsaid || '').trim();
  const tone = body.tone === 'grouch' ? 'grouch' : 'story';
  const active = (body.active === false || body.active === 0 || body.active === '0') ? 0 : 1;
  const soiree = String(body.soiree || '').trim();
  if (existing) {
    await env.DB.prepare(`UPDATE defunts SET prenom=?, nom=?, birth=?, death=?, circumstance=?, message=?, incomplete=?, unsaid=?, tone=?, active=?, soiree=?, updated_at=? WHERE id=?`)
      .bind(prenom, nom, birth, death, circumstance, message, incomplete, unsaid, tone, active, soiree, now, id).run();
  } else {
    const maxRow = await env.DB.prepare(`SELECT MAX(sort_order) as m FROM defunts`).first();
    const sort = (maxRow && maxRow.m != null) ? Number(maxRow.m) + 1 : 0;
    await env.DB.prepare(`INSERT INTO defunts (id, prenom, nom, birth, death, circumstance, message, incomplete, unsaid, tone, active, soiree, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, prenom, nom, birth, death, circumstance, message, incomplete, unsaid, tone, active, soiree, sort, now, now).run();
  }
  const row = await env.DB.prepare(`SELECT * FROM defunts WHERE id = ?`).bind(id).first();
  if (env.CASHFLOW_KV) {
    const all = await readDefunts(env);
    await env.CASHFLOW_KV.put('ovilus:defunts', JSON.stringify(all));
  }
  return json({ success: true, defunt: rowToDefunt(row) });
}

async function handleDeleteDefunt(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  await ensureDefuntsTable(env);
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id) return json({ error: 'Identifiant requis.' }, 400);
  await env.DB.prepare(`DELETE FROM defunts WHERE id = ?`).bind(id).run();
  if (env.CASHFLOW_KV) {
    const all = await readDefunts(env);
    await env.CASHFLOW_KV.put('ovilus:defunts', JSON.stringify(all));
  }
  return json({ success: true });
}

async function handleReorderDefunt(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  if (!env.DB) return json({ error: 'DB absente' }, 500);
  await ensureDefuntsTable(env);
  const body = await request.json().catch(() => ({}));
  const list = await readDefunts(env);
  const i = list.findIndex((d) => d.id === body.id);
  if (i < 0) return json({ error: 'Introuvable.' }, 404);
  const j = i + Number(body.dir || 0);
  if (j < 0 || j >= list.length) return json({ success: true, defunts: list });
  const a = list[i];
  const b = list[j];
  await env.DB.prepare(`UPDATE defunts SET sort_order = ? WHERE id = ?`).bind(b.sort_order, a.id).run();
  await env.DB.prepare(`UPDATE defunts SET sort_order = ? WHERE id = ?`).bind(a.sort_order, b.id).run();
  const all = await readDefunts(env);
  if (env.CASHFLOW_KV) await env.CASHFLOW_KV.put('ovilus:defunts', JSON.stringify(all));
  return json({ success: true, defunts: all });
}

function corsCast(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

async function handleOvilusCast(request, env) {
  const all = await readDefunts(env);
  const defunts = all.filter((d) => d.active).map((d) => ({
    id: d.id,
    name: [d.prenom, d.nom].filter(Boolean).join(' '),
    prenom: d.prenom,
    nom: d.nom,
    born: d.born,
    died: d.died,
    birth: d.birth,
    death: d.death,
    era: (d.born || '') + '-' + (d.died || ''),
    tone: d.tone || 'story',
    circumstance: d.circumstance,
    message: d.message,
    incomplete: d.incomplete,
    unsaid: d.unsaid,
    stories: d.stories,
    soiree: d.soiree || ''
  }));
  return corsCast(json({ defunts }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Super Admin 2 reste dans son propre fichier.
    // Le Worker principal fait uniquement l'aiguillage de ses routes API.
    if (path === '/api/superadmin2' || path.startsWith('/api/superadmin2/')) {
      return superAdmin2.fetch(request, env);
    }
    // Super Admin 3 : infolettres. Le monstre n'aiguillage que.
    if (path === '/api/superadmin3' || path.startsWith('/api/superadmin3/')) {
      return superAdmin3.fetch(request, env);
    }

    // Super Admin 4 : création, sauvegarde et reprise des projets de portails.
    if (path === '/api/superadmin4' || path.startsWith('/api/superadmin4/')) {
      return superAdmin4.fetch(request, env);
    }
    // Coque officielle de création de portail, servie derrière la session Super Admin.
    if (path === '/superadmin4/portail-shell-template.zip') {
      return superAdmin4.fetch(request, env);
    }

    try {
      if (path === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (path === '/api/logout' && request.method === 'POST') return await handleLogout(request, env);
      if (path === '/api/check-auth' && request.method === 'POST') return await handleCheckAuth(request, env);
      if (path === '/api/program' && request.method === 'GET') return await handleGetProgram(request, env);
      if (path === '/api/program' && request.method === 'POST') return await handleSaveProgram(request, env);
      if (path === '/api/members' && request.method === 'GET') return await handleListMembers(request, env);
      if (path === '/api/members' && request.method === 'POST') return await handleCreateMember(request, env);
      if (path === '/api/members/delete' && request.method === 'POST') return await handleDeleteMember(request, env);
      if (path === '/api/members/regenerate-code' && request.method === 'POST') return await handleRegenerateCode(request, env);
      if (path === '/api/stats' && (request.method === 'GET' || request.method === 'POST')) return await handleStats(request, env);
      if (path === '/api/commissions/to-pay' && request.method === 'GET') return await handleCommissionsToPay(request, env);
      if (path === '/api/commissions/mark-paid' && request.method === 'POST') return await handleMarkCommissionPaid(request, env);
      if (path === '/api/products' && request.method === 'GET') return await handleListProducts(request, env);
      if (path === '/api/products' && request.method === 'POST') return await handleCreateProduct(request, env);
      if (path === '/api/products/update' && request.method === 'POST') return await handleUpdateProduct(request, env);
      if (path === '/api/products/delete' && request.method === 'POST') return await handleDeleteProduct(request, env);
      if (path === '/api/boutique/products' && request.method === 'GET') return await handleBoutiqueProductsAdmin(request, env);
      if (path === '/api/boutique/products/save' && request.method === 'POST') return await handleBoutiqueProductSave(request, env);
      if (path === '/api/boutique/products/delete' && request.method === 'POST') return await handleBoutiqueProductDelete(request, env);
      if (path === '/api/boutique/settings' && (request.method === 'GET' || request.method === 'POST')) return await handleBoutiqueSettingsAdmin(request, env);
      if (path === '/api/boutique/catalog' && request.method === 'GET') return await handleBoutiqueCatalog(request, env);
      if (path === '/api/boutique/catalog' && request.method === 'OPTIONS') return boutiqueCors(new Response(null, { status: 204 }));
      if (path === '/api/boutique/config' && request.method === 'GET') return await handleBoutiqueConfig(request, env);
      if (path === '/api/boutique/config' && request.method === 'OPTIONS') return boutiqueCors(new Response(null, { status: 204 }));
      if (path === '/api/portals' && request.method === 'GET') return await handleListPortals(request, env);
      if (path === '/api/portals' && request.method === 'POST') return await handleSavePortals(request, env);
      if (path === '/api/portals/add' && request.method === 'POST') return await handleAddPortal(request, env);
      if (path === '/api/portals/remove' && request.method === 'POST') return await handleRemovePortal(request, env);
      if (path === '/api/portal-clients' && request.method === 'GET') return await handleListPortalClients(request, env);
      if (path === '/api/portal-clients' && request.method === 'POST') return await handleCreatePortalClient(request, env);
      if (path === '/api/portal-clients/delete' && request.method === 'POST') return await handleDeletePortalClient(request, env);
      if (path === '/api/degustations/meta' && request.method === 'GET') return await handleDgMeta(request, env);
      if (path === '/api/degustations' && (request.method === 'GET' || request.method === 'POST')) return await handleDgCampaigns(request, env);
      if (path === '/api/degustations/delete' && request.method === 'POST') return await handleDgDeleteCampaign(request, env);
      if (path === '/api/access/permanent' && (request.method === 'GET' || request.method === 'POST')) return await handleDgPermanent(request, env);
      if (path === '/api/access/permanent/delete' && request.method === 'POST') return await handleDgDeletePermanent(request, env);
      if (path === '/api/access/grants' && request.method === 'GET') return await handleDgGrants(request, env);
      if (path === '/api/access/grant' && request.method === 'POST') return await handleDgGrantManual(request, env);
      if (path === '/api/access/grants/delete' && request.method === 'POST') return await handleDgDeleteGrant(request, env);
      if (path === '/api/access/activate' && request.method === 'POST') return await handleDgActivate(request, env);
      if (path === '/api/access/activate' && request.method === 'OPTIONS') return dgCors(new Response(null, { status: 204 }));
      if (path === '/api/access/check' && (request.method === 'GET' || request.method === 'POST')) return await handleDgAccessCheck(request, env);
      if (path === '/api/access/check' && request.method === 'OPTIONS') return dgCors(new Response(null, { status: 204 }));
      if (path === '/api/formations' && request.method === 'GET') return await handleListFormations(request, env);
      if (path === '/api/formations/save' && request.method === 'POST') return await handleSaveFormation(request, env);
      if (path === '/api/formations/delete' && request.method === 'POST') return await handleDeleteFormation(request, env);
      if (path === '/api/vectorize/stats' && request.method === 'GET') return await handleVectorizeStats(request, env);
      if (path === '/api/vectorize/ingest' && request.method === 'POST') return await handleVectorizeIngest(request, env);
      if (path === '/api/vectorize/wipe' && request.method === 'POST') return await handleVectorizeWipe(request, env);
      if ((path === '/api/personnages' || path === '/api/formations/agents') && (request.method === 'GET' || request.method === 'POST')) return await handlePersonnagesList(request, env);
      if ((path === '/api/personnages/save' || path === '/api/formations/agents/save') && request.method === 'POST') return await handlePersonnagesSave(request, env);
      if ((path === '/api/personnages/delete' || path === '/api/formations/agents/delete') && request.method === 'POST') return await handlePersonnagesDelete(request, env);
      if (path === '/api/defunts' && request.method === 'GET') return await handleListDefunts(request, env);
      if (path === '/api/defunts/save' && request.method === 'POST') return await handleSaveDefunt(request, env);
      if (path === '/api/defunts/delete' && request.method === 'POST') return await handleDeleteDefunt(request, env);
      if (path === '/api/defunts/reorder' && request.method === 'POST') return await handleReorderDefunt(request, env);
      if (path === '/api/ovilus/cast' && request.method === 'GET') return await handleOvilusCast(request, env);
      if (path === '/api/ovilus/cast' && request.method === 'OPTIONS') return corsCast(new Response(null, { status: 204 }));
    } catch (e) {
      console.error(e);
      return json({ error: 'Erreur serveur.', detail: String(e.message || e) }, 500);
    }
    if (env.ASSETS) {
      if (path === '/' || path === '') return env.ASSETS.fetch(new URL('/index.html', request.url));
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  }
};

// ───────────── Personnages partagés (Univers + Studio Prompt, même KV) ─────────────
const PERSONNAGES_KV_KEY = 'nyxia:personnages';
const PERSONNAGES_KV_KEY_LEGACY = 'formations:agents';
const PERSONNAGES_DEFAUT = [
  { code: 'diane', nom: 'Diane', portail: 'lena', custom: false },
  { code: 'nyxia', nom: 'NyXia', portail: 'tous', custom: false },
  { code: 'lena', nom: 'Léna', portail: 'lena', custom: false },
  { code: 'sophia', nom: 'Sophia', portail: 'lena', custom: false },
  { code: 'aletheia', nom: 'Aletheia', portail: 'lena', custom: false },
  { code: 'cassandre', nom: 'Cassandre', portail: 'lena', custom: false },
  { code: 'celeste', nom: 'Céleste', portail: 'lena', custom: false },
  { code: 'selena', nom: 'Séléna', portail: 'selena', custom: false },
  { code: 'kael', nom: 'Kael', portail: 'kael', custom: false },
  { code: 'eric', nom: 'Éric', portail: 'cercles', custom: false },
  { code: 'alex', nom: 'Alex', portail: 'alex', custom: false }
];
function slugPersonnage(nom) {
  return String(nom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
async function lirePersonnages(env) {
  const raw = (await env.CASHFLOW_KV.get(PERSONNAGES_KV_KEY)) || (await env.CASHFLOW_KV.get(PERSONNAGES_KV_KEY_LEGACY));
  let extra = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      extra = Array.isArray(parsed) ? parsed : (parsed.agents || parsed.personnages || []);
    } catch (_) {}
  }
  const map = {};
  PERSONNAGES_DEFAUT.concat(extra).forEach((p) => {
    const code = String(p.code || p.id || '').toLowerCase().trim();
    if (!code) return;
    map[code] = {
      code,
      nom: p.nom || p.name || code,
      portail: p.portail || p.portal || '',
      custom: !!p.custom || !PERSONNAGES_DEFAUT.some((d) => d.code === code)
    };
  });
  return Object.values(map).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
async function ecrirePersonnages(env, list) {
  const custom = list.filter((p) => p.custom);
  await env.CASHFLOW_KV.put(PERSONNAGES_KV_KEY, JSON.stringify(custom));
  await env.CASHFLOW_KV.put(PERSONNAGES_KV_KEY_LEGACY, JSON.stringify({ agents: custom }));
}
async function handlePersonnagesList(request, env) {
  const agents = await lirePersonnages(env);
  return json({ success: true, personnages: agents, agents });
}
async function handlePersonnagesSave(request, env) {
  const body = await request.json().catch(() => ({}));
  const nom = String(body.nom || body.name || '').trim();
  const code = slugPersonnage(body.code || nom);
  if (!nom || !code) return json({ error: 'Nom requis.' }, 400);
  const list = await lirePersonnages(env);
  const exist = list.find((p) => p.code === code);
  const row = { code, nom, portail: String(body.portail || body.portal || '').toLowerCase(), custom: true };
  if (exist) Object.assign(exist, row);
  else list.push(row);
  await ecrirePersonnages(env, list);
  return json({ success: true, agent: row, personnage: row });
}
async function handlePersonnagesDelete(request, env) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || body.id || '').toLowerCase().trim();
  if (!code) return json({ error: 'code requis.' }, 400);
  const list = (await lirePersonnages(env)).filter((p) => p.code !== code);
  await ecrirePersonnages(env, list);
  return json({ success: true });
}

async function handleVectorizeStats(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const url = new URL(request.url);
  const agent = String(url.searchParams.get('agent') || 'alex').toLowerCase();
  const bindings = { vectorize: !!(env.VECTORIZE_INDEX || env.VECTORIZE), ai: !!env.AI, kv: !!env.CASHFLOW_KV };
  const sourcesMap = {};
  let vectors = 0;
  try {
    const prefix = 'brain_id:' + agent + ':';
    let cursor;
    do {
      const list = await env.CASHFLOW_KV.list({ prefix, cursor });
      for (const k of (list.keys || [])) {
        vectors++;
        const id = k.name.slice(prefix.length);
        let book = id.replace(/-chapitre-.*$/i, '').replace(/-\d+$/, '') || id;
        if (!sourcesMap[book]) sourcesMap[book] = { id: book, source: book, chunks: 0 };
        sourcesMap[book].chunks++;
      }
      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);
  } catch (e) {}
  return json({ success: true, data: { vectors, sources: Object.values(sourcesMap), bindings, agent } });
}

async function handleVectorizeIngest(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const agent = String(body.agent || 'alex').toLowerCase();
  const source = String(body.source || 'sans-titre').slice(0, 200);
  const text = String(body.text || '');
  if (!text.trim()) return json({ error: 'Texte requis.' }, 400);
  if (!env.AI || !(env.VECTORIZE_INDEX || env.VECTORIZE)) {
    return json({ error: 'Vectorisation inactive sur Univers. Utilise Ingestion (Studio Prompt) pour remplir le cerveau.' }, 400);
  }
  const index = env.VECTORIZE_INDEX || env.VECTORIZE;
  const chunks = [];
  const raw = text.replace(/\r/g, '');
  let parts = raw.split(/\n(?=#{1,3} )/);
  if (parts.length < 2) {
    for (let i = 0; i < raw.length; i += 1500) parts.push(raw.slice(i, i + 1800));
  }
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i].trim();
    if (piece.length < 20) continue;
    n++;
    const id = agent + '-' + source.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + n;
    await env.CASHFLOW_KV.put('brain_text:' + agent + ':' + id, piece);
    await env.CASHFLOW_KV.put('brain_id:' + agent + ':' + id, '1');
    const embedText = piece.length > 8000 ? piece.slice(0, 8000) : piece;
    const embeddings = await env.AI.run('@cf/baai/bge-m3', { text: [embedText] });
    await index.upsert([{
      id, values: embeddings.data[0], namespace: agent,
      metadata: { texte_original: piece.slice(0, 1500), source, cible: agent, has_full: piece.length > 1500 ? '1' : '0' }
    }]);
    chunks.push(id);
  }
  return json({ success: true, chunks: chunks.length });
}

async function handleVectorizeWipe(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json().catch(() => ({}));
  const agent = String(body.agent || body.personnage || '').toLowerCase();
  if (!agent) return json({ error: 'agent requis.' }, 400);
  const prefix = 'brain_id:' + agent + ':';
  const ids = [], kvKeys = [];
  let cursor;
  do {
    const list = await env.CASHFLOW_KV.list({ prefix, cursor });
    for (const k of (list.keys || [])) { kvKeys.push(k.name); ids.push(k.name.slice(prefix.length)); }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);
  const index = env.VECTORIZE_INDEX || env.VECTORIZE;
  if (index) {
    for (let i = 0; i < ids.length; i += 500) {
      try { await index.deleteByIds(ids.slice(i, i + 500)); } catch (_) {}
    }
  }
  for (const key of kvKeys) { try { await env.CASHFLOW_KV.delete(key); } catch (_) {} }
  return json({ success: true, deleted: ids.length });
}
