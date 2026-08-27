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
  const billing = ['one_time','subscription','both'].includes(String(body.billing_type || ''))
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

// ───────────── FORMATIONS (KV partagé avec le Portail Alex) ─────────────
// Les formations sont stockées dans le MÊME KV que le Portail Alex, à la clé
// formation:{agent}:{id}. Le worker d'Alex les lit directement. Aucun contenu inventé ici :
// le Super Admin ne fait qu'écrire ce que Diane saisit.
const FORMATION_AGENTS = ['diane', 'nyxia', 'eric', 'alex', 'lena', 'selena', 'kael'];

function formationKey(agent, id) { return 'formation:' + agent + ':' + id; }

function slugifyFormationId(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const FORMATION_BLOC_TYPES = ['texte', 'image', 'audio', 'video', 'exercice', 'intervention'];

// Nettoie/valide un bloc selon son type, sans rien inventer.
function sanitizeFormationBloc(raw) {
  const type = FORMATION_BLOC_TYPES.includes(String(raw && raw.type)) ? raw.type : 'texte';
  const b = { type };
  const str = (v) => (v == null ? '' : String(v));
  if (type === 'texte' || type === 'intervention') { b.contenu = str(raw.contenu); }
  else if (type === 'image') { b.url = str(raw.url).trim(); b.legende = str(raw.legende); }
  else if (type === 'audio' || type === 'video') { b.url = str(raw.url).trim(); b.titre = str(raw.titre); b.intro = str(raw.intro); }
  else if (type === 'exercice') { b.objectif = str(raw.objectif); b.consigne = str(raw.consigne); }
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
  const out = [];
  try {
    const list = await env.CASHFLOW_KV.list({ prefix: 'formation:' + agent + ':' });
    for (const k of list.keys || []) {
      const raw = await env.CASHFLOW_KV.get(k.name);
      if (!raw) continue;
      let doc; try { doc = JSON.parse(raw); } catch (_) { continue; }
      if (doc && doc.id) out.push(doc);
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
  const doc = sanitizeFormationDoc(body.formation || body);
  if (!doc.id) return json({ error: 'Donne au moins un titre à la formation.' }, 400);
  if (!doc.titre) return json({ error: 'Le titre est requis.' }, 400);
  try {
    await env.CASHFLOW_KV.put(formationKey(agent, doc.id), JSON.stringify(doc));
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
  const id = slugifyFormationId(body.id);
  if (!id) return json({ error: 'Identifiant requis.' }, 400);
  try {
    await env.CASHFLOW_KV.delete(formationKey(agent, id));
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
      if (path === '/api/portals' && request.method === 'GET') return await handleListPortals(request, env);
      if (path === '/api/portals' && request.method === 'POST') return await handleSavePortals(request, env);
      if (path === '/api/portals/add' && request.method === 'POST') return await handleAddPortal(request, env);
      if (path === '/api/portals/remove' && request.method === 'POST') return await handleRemovePortal(request, env);
      if (path === '/api/portal-clients' && request.method === 'GET') return await handleListPortalClients(request, env);
      if (path === '/api/portal-clients' && request.method === 'POST') return await handleCreatePortalClient(request, env);
      if (path === '/api/portal-clients/delete' && request.method === 'POST') return await handleDeletePortalClient(request, env);
      if (path === '/api/formations' && request.method === 'GET') return await handleListFormations(request, env);
      if (path === '/api/formations/save' && request.method === 'POST') return await handleSaveFormation(request, env);
      if (path === '/api/formations/delete' && request.method === 'POST') return await handleDeleteFormation(request, env);
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

