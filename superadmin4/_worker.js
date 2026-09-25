// NyXia Univers — Super Admin 4 · Projets Portails
// Même session Univers, même CASHFLOW_KV. Aucun stockage parallèle.

const PROJECT_INDEX_KEY = 'superadmin4:projects:index';
const PROJECT_PREFIX = 'superadmin4:project:';
const TOOL_PREFIX = 'superadmin4:project-tool:';
const MAX_INDEX_ITEMS = 500;
// Limite technique de sécurité par FICHIER, sous la limite Cloudflare KV.
// Ce n'est PAS une limite sur le nombre d'outils.
const MAX_TOOL_BYTES = 20 * 1024 * 1024;
const COOKIE_NAME = 'nyxia_univers';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function nowIso() { return new Date().toISOString(); }
function cleanText(value, max = 500) { return String(value == null ? '' : value).trim().slice(0, max); }
function safeId(value) { return cleanText(value, 120).replace(/[^a-zA-Z0-9_-]/g, ''); }

function getTokenFromRequest(request) {
  const header = request.headers.get('X-Univers-Token');
  if (header) return header.trim();
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)'));
  return match ? match[1] : '';
}

async function requireAdmin(request, env) {
  if (!env.CASHFLOW_KV) return false;
  const token = getTokenFromRequest(request);
  if (!token) return false;
  const raw = await env.CASHFLOW_KV.get('univers:session:' + token);
  if (!raw) return false;
  try {
    const session = JSON.parse(raw);
    return !session.role || session.role === 'superadmin';
  } catch (_) {
    return true; // compatibilité avec une ancienne session Univers non JSON
  }
}

function projectMeta(project) {
  const data = project && project.data && typeof project.data === 'object' ? project.data : {};
  return {
    id: project.id,
    title: project.title || data.title || 'Portail sans titre',
    portalId: data.portalId || '',
    host: data.host || '',
    status: project.status || 'brouillon',
    toolCount: Array.isArray(data.tools) ? data.tools.length : 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

async function loadIndex(env) {
  if (!env.CASHFLOW_KV) return [];
  const raw = await env.CASHFLOW_KV.get(PROJECT_INDEX_KEY);
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; }
  catch (_) { return []; }
}

async function saveIndex(env, index) {
  if (!env.CASHFLOW_KV) throw new Error('CASHFLOW_KV absente.');
  const sorted = [...index]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, MAX_INDEX_ITEMS);
  await env.CASHFLOW_KV.put(PROJECT_INDEX_KEY, JSON.stringify(sorted));
}

async function readCoreProject(env, id) {
  if (!env.CASHFLOW_KV) return null;
  const raw = await env.CASHFLOW_KV.get(PROJECT_PREFIX + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function toolKey(projectId, toolId) { return TOOL_PREFIX + projectId + ':' + toolId; }

async function hydrateProjectTools(env, project) {
  if (!project) return null;
  const clone = structuredClone(project);
  clone.data = clone.data && typeof clone.data === 'object' ? clone.data : {};
  const tools = Array.isArray(clone.data.tools) ? clone.data.tools : [];
  clone.data.tools = await Promise.all(tools.map(async (tool) => {
    const t = { ...tool };
    if (!t.id || !t.hasContent) { t.content = typeof t.content === 'string' ? t.content : ''; return t; }
    const content = await env.CASHFLOW_KV.get(toolKey(project.id, t.id));
    t.content = content == null ? '' : content;
    return t;
  }));
  return clone;
}

async function getProject(env, id) {
  const core = await readCoreProject(env, id);
  return core ? hydrateProjectTools(env, core) : null;
}

async function saveProject(env, incoming, existing = null) {
  if (!env.CASHFLOW_KV) throw new Error('CASHFLOW_KV absente.');
  const project = structuredClone(incoming || {});
  project.data = project.data && typeof project.data === 'object' ? project.data : {};
  const oldProject = existing || await readCoreProject(env, project.id);
  const oldTools = oldProject && oldProject.data && Array.isArray(oldProject.data.tools) ? oldProject.data.tools : [];
  const oldById = new Map(oldTools.map(t => [String(t.id || ''), t]));
  const incomingTools = Array.isArray(project.data.tools) ? project.data.tools : [];
  const coreTools = [];
  const keepIds = new Set();

  for (const raw of incomingTools) {
    if (!raw || typeof raw !== 'object') continue;
    const id = safeId(raw.id || crypto.randomUUID().replace(/-/g, '').slice(0, 16));
    if (!id) continue;
    keepIds.add(id);
    const old = oldById.get(id) || {};
    const hasIncomingContent = typeof raw.content === 'string';
    const content = hasIncomingContent ? raw.content : null;
    if (hasIncomingContent) {
      const bytes = new TextEncoder().encode(content).byteLength;
      if (bytes > MAX_TOOL_BYTES) throw new Error('Le fichier HTML « ' + cleanText(raw.name || raw.fileName || id, 180) + ' » dépasse la limite technique de 20 Mo par fichier.');
      await env.CASHFLOW_KV.put(toolKey(project.id, id), content);
    }
    const hasContent = hasIncomingContent ? true : !!old.hasContent;
    coreTools.push({
      id,
      icon: cleanText(raw.icon || old.icon || '🧰', 20),
      name: cleanText(raw.name || old.name || '', 180),
      path: cleanText(raw.path || old.path || '', 300),
      fileName: cleanText(raw.fileName || old.fileName || '', 260),
      hasContent
    });
  }

  // Nettoyage des fichiers retirés du projet.
  for (const old of oldTools) {
    const id = safeId(old.id);
    if (id && !keepIds.has(id)) await env.CASHFLOW_KV.delete(toolKey(project.id, id));
  }

  project.data.tools = coreTools;
  await env.CASHFLOW_KV.put(PROJECT_PREFIX + project.id, JSON.stringify(project));
  const index = await loadIndex(env);
  const next = index.filter(item => item.id !== project.id);
  next.push(projectMeta(project));
  await saveIndex(env, next);
  return hydrateProjectTools(env, project);
}

async function deleteProject(env, id) {
  const core = await readCoreProject(env, id);
  if (!core) return false;
  const tools = core.data && Array.isArray(core.data.tools) ? core.data.tools : [];
  for (const tool of tools) {
    const tid = safeId(tool.id);
    if (tid) await env.CASHFLOW_KV.delete(toolKey(id, tid));
  }
  await env.CASHFLOW_KV.delete(PROJECT_PREFIX + id);
  await saveIndex(env, (await loadIndex(env)).filter(item => item.id !== id));
  return true;
}

function normalizeProjectBody(body, existing = null, forcedId = '') {
  const stamp = nowIso();
  const id = safeId(forcedId || body.id || (existing && existing.id) || crypto.randomUUID());
  if (!id) throw new Error('Identifiant projet invalide.');
  const data = body.data && typeof body.data === 'object'
    ? body.data
    : (existing && existing.data && typeof existing.data === 'object' ? existing.data : {});
  const title = cleanText(body.title != null ? body.title : (existing && existing.title), 180) || cleanText(data.title, 180) || 'Nouveau portail';
  return {
    ...(existing || {}),
    ...body,
    id,
    kind: 'nyxia-portal',
    title,
    status: cleanText(body.status != null ? body.status : (existing && existing.status), 40) || 'brouillon',
    createdAt: existing && existing.createdAt ? existing.createdAt : stamp,
    updatedAt: stamp,
    data
  };
}

async function handleProjects(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // api, superadmin4, projects, id, action
  const id = safeId(parts[3] || '');
  const action = cleanText(parts[4] || '', 40);

  if (request.method === 'GET' && !id) return json({ projects: await loadIndex(env) });

  if (request.method === 'POST' && !id) {
    const body = await request.json().catch(() => ({}));
    const project = normalizeProjectBody(body);
    const saved = await saveProject(env, project);
    return json({ ok: true, project: saved }, 201);
  }

  if (request.method === 'GET' && id && !action) {
    const project = await getProject(env, id);
    return project ? json({ project }) : json({ error: 'Projet introuvable.' }, 404);
  }

  if (request.method === 'PUT' && id && !action) {
    const existing = await readCoreProject(env, id);
    if (!existing) return json({ error: 'Projet introuvable.' }, 404);
    const body = await request.json().catch(() => ({}));
    const project = normalizeProjectBody(body, existing, id);
    const saved = await saveProject(env, project, existing);
    return json({ ok: true, project: saved });
  }

  if (request.method === 'DELETE' && id && !action) {
    const deleted = await deleteProject(env, id);
    return deleted ? json({ ok: true }) : json({ error: 'Projet introuvable.' }, 404);
  }

  if (request.method === 'POST' && id && action === 'duplicate') {
    const source = await getProject(env, id);
    if (!source) return json({ error: 'Projet introuvable.' }, 404);
    const body = await request.json().catch(() => ({}));
    const stamp = nowIso();
    const copy = structuredClone(source);
    copy.id = crypto.randomUUID();
    copy.title = cleanText(body.title || (source.title + ' — copie'), 180);
    copy.status = 'brouillon';
    copy.createdAt = stamp;
    copy.updatedAt = stamp;
    if (body.dataPatch && typeof body.dataPatch === 'object') copy.data = { ...(copy.data || {}), ...body.dataPatch };
    const saved = await saveProject(env, copy);
    return json({ ok: true, project: saved }, 201);
  }

  return json({ error: 'Route Super Admin 4 inconnue.' }, 404);
}

export default {
  async fetch(request, env) {
    if (!(await requireAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
    const url = new URL(request.url);

    try {
      // Coque officielle protégée : le parent Univers achemine cette URL ici.
      if (request.method === 'GET' && url.pathname === '/superadmin4/portail-shell-template.zip') {
        if (!env.ASSETS) return json({ error: 'Assets Univers non configurés.' }, 503);
        return env.ASSETS.fetch(request);
      }
      if (request.method === 'GET' && url.pathname === '/api/superadmin4/health') {
        return json({
          ok: !!env.CASHFLOW_KV,
          kv: !!env.CASHFLOW_KV,
          bindings: { kv: 'CASHFLOW_KV', d1: 'nyxia-cercles-db', vectorize: 'univers-livres' },
          version: 'superadmin4-portails-6.0-projects-voice-ids'
        });
      }
      if (url.pathname === '/api/superadmin4/projects' || url.pathname.startsWith('/api/superadmin4/projects/')) {
        return await handleProjects(request, env, url);
      }
      return json({ error: 'Route Super Admin 4 inconnue.' }, 404);
    } catch (error) {
      return json({ error: error && error.message ? error.message : String(error) }, 500);
    }
  }
};
