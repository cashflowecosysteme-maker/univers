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

async function ensureSchema(env) {
  if (!env.DB) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      full_name TEXT, role TEXT NOT NULL DEFAULT 'affiliate', affiliate_code TEXT UNIQUE,
      parent_id TEXT, paypal_email TEXT, webhook_secret TEXT, created_at TEXT, updated_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY, name TEXT, description TEXT,
      commission_l1 REAL DEFAULT 25, commission_l2 REAL DEFAULT 10, commission_l3 REAL DEFAULT 5,
      owner_id TEXT, is_active INTEGER DEFAULT 1, created_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS marketplace_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT, icon TEXT,
      sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS marketplace_products (
      id TEXT PRIMARY KEY, seller_id TEXT, category_id INTEGER, title TEXT NOT NULL,
      description_short TEXT, description_long TEXT, image_url TEXT, price REAL DEFAULT 0,
      commission_n1 REAL, commission_n2 REAL, commission_n3 REAL, affiliate_link TEXT,
      promo_code TEXT, status TEXT DEFAULT 'draft', created_at TEXT, updated_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS affiliates (
      id TEXT PRIMARY KEY, program_id TEXT, user_id TEXT, affiliate_link TEXT,
      parent_affiliate_id TEXT, grandparent_affiliate_id TEXT, status TEXT DEFAULT 'active',
      total_earnings REAL DEFAULT 0, total_referrals INTEGER DEFAULT 0, created_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portals (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_clients (
      id TEXT PRIMARY KEY, email TEXT, full_name TEXT, password_hash TEXT, portal_ids TEXT, created_at TEXT
    )`)
  ]);
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

async function handleCreateProduct(request, env) {
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
  const status = body.status === 'draft' ? 'draft' : 'active';
  await env.DB.prepare(
    `INSERT INTO marketplace_products
     (id, seller_id, category_id, title, description_short, description_long, image_url, price,
      commission_n1, commission_n2, commission_n3, affiliate_link, status, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    id, catId, title,
    (body.description || '').trim(),
    (body.descriptionLong || '').trim() || null,
    (body.imageUrl || '').trim() || null,
    Number(body.price) || 0,
    n1, n2, n3,
    (body.affiliateLink || '').trim() || null,
    status
  ).run();
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

  const existing = await env.CASHFLOW_KV.get('client:' + email);
  if (existing) return json({ error: 'Ce courriel existe déjà.' }, 409);

  // Hash compatible Studio Prompt (PBKDF2)
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

  // Si portail cercles/affiliation : créer aussi en D1 si pas déjà là
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

  return json({ success: true, email, products });
}

async function handleDeletePortalClient(request, env) {
  if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const body = await request.json();
  const email = (body.email || '').toLowerCase().trim();
  if (!email) return json({ error: 'Email requis.' }, 400);
  await env.CASHFLOW_KV.delete('client:' + email);
  return json({ success: true });
}

export default {
  async fetch(request, env) {
    try { await ensureSchema(env); } catch (e) { console.error("schema", e); }

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
