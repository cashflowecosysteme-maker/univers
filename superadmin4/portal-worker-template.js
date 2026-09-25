// NyXia — Coque Portail universelle et neutre
// Cette coque ne contient aucune logique métier d'un portail précis.

const PORTAL_CONFIG_B64 = '__PORTAL_CONFIG_B64__';
const SESSION_TTL = 60 * 60 * 12;
const OPENROUTER_MODEL = 'deepseek/deepseek-v3.2';
const OPENROUTER_FALLBACK_MODEL = 'mistralai/mistral-small-3.2-24b-instruct';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

function portalRuntimeConfig() {
  const fallback = {
    id: 'portail', title: 'Portail NyXia', shortTitle: 'Portail', mission: '', welcome: '',
    formationAgent: '', activeAgents: [], agents: [], voiceVariables: {}
  };
  try {
    const raw = String(PORTAL_CONFIG_B64 || '');
    if (!raw || raw.startsWith('__PORTAL_')) return fallback;
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    return Object.assign({}, fallback, JSON.parse(new TextDecoder().decode(bytes)));
  } catch (_) { return fallback; }
}
const PORTAL = portalRuntimeConfig();
const ACTIVE_AGENTS = new Set((PORTAL.activeAgents || []).map(x => String(x || '').toLowerCase()));
const AGENT_MAP = Object.fromEntries((PORTAL.agents || []).map(a => [String(a.key || '').toLowerCase(), a]));

function randomToken() { return crypto.randomUUID() + crypto.randomUUID(); }
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function safeString(v, max = 8000) { return String(v == null ? '' : v).slice(0, max); }
function isHttpsUrl(v) { try { const u = new URL(String(v || '')); return u.protocol === 'https:'; } catch (_) { return false; } }
function agentKey(v) { return String(v || '').trim().toLowerCase(); }
function getAgent(key) { return AGENT_MAP[agentKey(key)] || null; }

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifyPassword(password, salt, hash) { return (await hashPassword(password, salt)) === hash; }
async function verifyPasswordAffil(password, stored) {
  if (!stored || !stored.startsWith('$sha256$')) return false;
  const parts = stored.split('$');
  if (parts.length < 4) return false;
  const data = new TextEncoder().encode(parts[2] + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const got = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return got === parts[3];
}

async function getSessionOrNull(token, env) {
  if (!token || !env.CASHFLOW_KV) return null;
  const raw = await env.CASHFLOW_KV.get('session:' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const firstname = String(body.firstname || body.firstName || '').trim();
  if (!email || !password) return json({ error: 'Courriel et mot de passe requis.' }, 400);

  if (env.DB) {
    try {
      const rows = await env.DB.prepare(
        `SELECT id, email, password_hash, full_name, role, affiliate_code, paypal_email
         FROM users WHERE email = ? AND role IN ('admin','affiliate')
         ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at ASC`
      ).bind(email).all();
      for (const user of (rows.results || [])) {
        if (await verifyPasswordAffil(password, user.password_hash)) {
          const token = randomToken();
          const session = {
            email: user.email, firstname: user.full_name || firstname || '', role: user.role || '',
            code: user.affiliate_code || '', paypal: user.paypal_email || '', userId: user.id
          };
          await env.CASHFLOW_KV.put('session:' + token, JSON.stringify(session), { expirationTtl: SESSION_TTL });
          return json({ success: true, token, firstname: session.firstname, role: session.role, code: session.code });
        }
      }
    } catch (e) { console.log('login D1', e && e.message); }
  }

  if (env.CASHFLOW_KV) {
    const raw = await env.CASHFLOW_KV.get('client:' + email);
    if (raw) {
      try {
        const client = JSON.parse(raw);
        const valid = await verifyPassword(password, client.salt, client.passwordHash);
        if (valid) {
          const token = randomToken();
          const session = { email: client.email || email, firstname: client.firstName || client.name || firstname || '' };
          await env.CASHFLOW_KV.put('session:' + token, JSON.stringify(session), { expirationTtl: SESSION_TTL });
          return json({ success: true, token, firstname: session.firstname });
        }
      } catch (_) {}
    }
  }
  return json({ error: 'Courriel ou mot de passe incorrect.' }, 401);
}

async function handleCheckAuth(request, env) {
  const body = await request.json().catch(() => ({}));
  const session = await getSessionOrNull(body.token, env);
  if (!session) return json({ valid: false });
  return json({ valid: true, email: session.email || '', firstname: session.firstname || '', role: session.role || '', code: session.code || '', portal: PORTAL.id, portal_access: true });
}
async function handleLogout(request, env) {
  const body = await request.json().catch(() => ({}));
  if (body.token && env.CASHFLOW_KV) await env.CASHFLOW_KV.delete('session:' + body.token);
  return json({ success: true });
}

// ───────────── FORMATION VIVANTE ─────────────
function portalSlug(env) { return String((env && (env.PORTAIL || env.PORTAL_SLUG)) || PORTAL.id || 'portail').toLowerCase(); }
function formationProgressKey(env, email) { return 'formation_progress:' + portalSlug(env) + ':' + normalizeEmail(email); }
function normalizeFormationModules(f) {
  return (Array.isArray(f && f.modules) ? f.modules : []).map((m, i) => ({
    id: String(m && m.id || ('m' + (i + 1))), numero: Number.isFinite(m && m.numero) ? m.numero : i + 1,
    titre: String(m && m.titre || ('Module ' + (i + 1))), blocs: Array.isArray(m && m.blocs) ? m.blocs : []
  }));
}
async function listFormations(env, agent) {
  if (!env.CASHFLOW_KV) return [];
  const portal = portalSlug(env), out = [], seen = new Set();
  const prefixes = ['formation:' + portal + ':' + agent + ':', 'formation:' + agent + ':'];
  for (const prefix of prefixes) {
    if (out.length && prefix === 'formation:' + agent + ':') break; // le spécifique au portail gagne
    let cursor;
    do {
      const list = await env.CASHFLOW_KV.list({ prefix, cursor });
      for (const k of (list.keys || [])) {
        const raw = await env.CASHFLOW_KV.get(k.name); if (!raw) continue;
        try { const f = JSON.parse(raw); if (f && f.id && !seen.has(f.id)) { seen.add(f.id); out.push(f); } } catch (_) {}
      }
      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);
  }
  out.sort((a,b)=>(a.ordre||0)-(b.ordre||0)||String(a.titre||'').localeCompare(String(b.titre||''),'fr'));
  return out;
}
async function getFormationProgress(env, email) {
  if (!env.CASHFLOW_KV || !email) return {};
  try { return JSON.parse(await env.CASHFLOW_KV.get(formationProgressKey(env,email)) || '{}'); } catch (_) { return {}; }
}
async function saveFormationProgress(env, email, formationId, state) {
  if (!env.CASHFLOW_KV || !email || !formationId) return;
  const all = await getFormationProgress(env,email); all[formationId] = { ...state, updatedAt: new Date().toISOString() };
  await env.CASHFLOW_KV.put(formationProgressKey(env,email), JSON.stringify(all));
}
function renderFormationBlock(bloc, ctx) {
  const b = bloc || {}, type = String(b.type || 'texte').toLowerCase(), parts = [];
  if (type === 'texte' || type === 'intervention') parts.push(String(b.contenu || '').replace(/\{prenom\}/gi, ctx.prenom || 'toi'));
  else if (type === 'exercice') { if (b.objectif) parts.push('🎯 ' + b.objectif); if (b.consigne) parts.push(String(b.consigne).replace(/\{prenom\}/gi,ctx.prenom||'toi')); }
  else if (type === 'image' && isHttpsUrl(b.url)) { if (b.legende) parts.push(b.legende); parts.push('[IMAGE: ' + String(b.url).trim() + ']'); }
  else if (type === 'audio' && isHttpsUrl(b.url)) { if (b.intro) parts.push(b.intro); parts.push('[AUDIO: ' + String(b.url).trim() + (b.titre ? '|' + b.titre : '') + ']'); }
  else if ((type === 'video' || type === 'vidéo') && isHttpsUrl(b.url)) { if (b.intro) parts.push(b.intro); parts.push('[VIDEO: ' + String(b.url).trim() + (b.titre ? '|' + b.titre : '') + ']'); }
  else if (type === 'lien' && isHttpsUrl(b.url)) { if (b.intro) parts.push(b.intro); parts.push('[LINK: ' + String(b.url).trim() + '|' + (b.titre || 'Ouvrir la ressource') + ']'); }
  return parts.filter(Boolean).join('\n\n');
}
function parseFormationControl(message) {
  const s = String(message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const moduleMatch = s.match(/module\s*(\d+)/);
  if (moduleMatch) return { action:'module', moduleNumero:Number(moduleMatch[1]) };
  if (/(commenc|debut|demarr).*(formation|cours)|commence ma formation/.test(s)) return { action:'start' };
  if (/(continue|reprend|reprendre).*(formation|cours)|continue ma formation/.test(s)) return { action:'resume' };
  if (/^(suite|suivant|continue|ok suite|prochaine etape)\b/.test(s.trim())) return { action:'advance' };
  return null;
}
async function runFormationControlTurn(env, session, agent, message) {
  const ctrl = parseFormationControl(message); if (!ctrl) return null;
  const forms = await listFormations(env,agent); if (!forms.length) return null;
  const progressAll = await getFormationProgress(env,session.email); let formation = forms[0];
  let state = progressAll[formation.id] || null; const modules = normalizeFormationModules(formation); if (!modules.length) return { content:'Cette formation n’a pas encore de module.' };
  let mi = 0, bi = 0;
  if (ctrl.action === 'module') { mi = Math.max(0,modules.findIndex(m=>m.numero===ctrl.moduleNumero)); if (mi < 0) mi = 0; }
  else if ((ctrl.action === 'resume' || ctrl.action === 'advance') && state) { mi = Math.max(0,Number(state.moduleIndex)||0); bi = Math.max(0,Number(state.blockIndex)||0); if (ctrl.action === 'advance') bi++; }
  if (mi >= modules.length) mi = modules.length - 1;
  while (mi < modules.length && bi >= modules[mi].blocs.length) { mi++; bi = 0; }
  if (mi >= modules.length) return { content:'✨ Tu as terminé « ' + (formation.titre || 'la formation') + ' ». Tu peux maintenant me poser tes questions ou revoir un module.' };
  const module = modules[mi]; const bloc = module.blocs[bi];
  if (!bloc) return { content:'Le module « '+module.titre+' » ne contient pas encore de contenu.' };
  await saveFormationProgress(env,session.email,formation.id,{moduleIndex:mi,blockIndex:bi,moduleId:module.id,moduleNumero:module.numero});
  const body = renderFormationBlock(bloc,{prenom:session.firstname||'toi'});
  const hint = (bi === module.blocs.length-1 && mi === modules.length-1) ? '\n\n— Tu es à la dernière étape. Dis-moi « suite » pour conclure.' : '\n\n— Quand tu es prête, dis-moi « suite ».';
  return { content:'🎓 **'+(formation.titre||'Formation')+' — Module '+module.numero+' · '+module.titre+'**\n\n'+body+hint };
}
async function handleFormationList(request, env) {
  const url = new URL(request.url), token = url.searchParams.get('token') || '';
  const session = await getSessionOrNull(token,env); if (!session) return json({error:'Session expirée.'},401);
  const agent = agentKey(url.searchParams.get('agent'));
  if (!ACTIVE_AGENTS.has(agent)) return json({error:'Personnage non disponible.'},403);
  const forms = await listFormations(env,agent), prog = await getFormationProgress(env,session.email);
  const rows = forms.map(f=>({id:f.id,titre:f.titre||'',description:f.description||'',modules:normalizeFormationModules(f).map(m=>({id:m.id,numero:m.numero,titre:m.titre})),progress:prog[f.id]||null}));
  return json({formations:rows,hasProgress:rows.some(f=>!!f.progress)});
}

// ───────────── VECTORIZE / MÉMOIRE ─────────────
async function retrieveBrain(env, agent, query, topK = 7) {
  if (!query || !query.trim() || !env.AI || !env.VECTORIZE_INDEX) return '';
  try {
    const embeddings = await env.AI.run('@cf/baai/bge-m3',{text:[query]});
    const results = await env.VECTORIZE_INDEX.query(embeddings.data[0],{topK,returnMetadata:'all',namespace:agent});
    const picked = (results.matches || []).filter(m=>m.score>0.35); const parts=[];
    for (const m of picked) {
      let body = m.metadata && m.metadata.texte_original || '';
      if (m.metadata && m.metadata.has_full === '1' && m.id && env.CASHFLOW_KV) {
        try { body = await env.CASHFLOW_KV.get('brain_text:'+agent+':'+m.id) || body; } catch (_) {}
      }
      if (body) parts.push(body);
    }
    return parts.join('\n\n---\n\n');
  } catch (e) { console.log('Vectorize',e&&e.message); return ''; }
}
function collectUrls(text) {
  const set = new Set(); const s = String(text || '');
  const re = /https:\/\/[^\s\]\)"'<>]+/g; let m; while ((m = re.exec(s))) set.add(m[0].replace(/[.,;:]+$/,''));
  return set;
}
function sanitizeMediaMarkers(content, approved) {
  let out = String(content || '');
  for (const kind of ['VIDEO','AUDIO','IMAGE','PDF','LINK']) {
    const re = new RegExp('\\['+kind+'\\s*:\\s*([^\\]\\r\\n]+)\\]','giu');
    out = out.replace(re, (full, raw) => {
      const val = String(raw||''); const pipe = val.indexOf('|'); const url=(pipe>-1?val.slice(0,pipe):val).trim();
      if (!isHttpsUrl(url) || !approved.has(url)) return '';
      return full;
    });
  }
  return out.replace(/\n{3,}/g,'\n\n').trim();
}
function baseSystemPrompt(agent) {
  const name = agent.name || agent.key || 'Personnage NyXia';
  const sub = agent.sub || 'Accompagnement NyXia';
  let role = `Tu incarnes ${name}, personnage numérique de l'univers NyXia. Ta fonction dans CE portail : ${sub}.`;
  if (agent.key === 'nyxia') role += ` Tu es la guide d'orientation et de technique du portail : tu aides à comprendre où aller, comment utiliser les fonctions et comment progresser sans inventer d'outil absent.`;
  if (agent.key === 'diane') role += ` Tu représentes la créatrice et formatrice. Tu enseignes à partir des ressources de Diane réellement retrouvées et tu accompagnes de manière concrète.`;
  if (agent.key === 'eric') role += ` Tu aides surtout avec communication, marketing relationnel et CashFlow lorsque les ressources du portail le permettent, sans inventer d'offre ou de prix.`;
  role += `\n\nPortail : ${PORTAL.title}. Mission : ${PORTAL.mission || 'Accompagner la personne dans la mission du portail.'}`;
  role += `\n\nRègles : tutoie la personne; reste fidèle aux documents réellement fournis; si l'information manque, dis-le clairement; n'invente ni prix, ni fonction, ni ressource, ni lien.`;
  role += `\n\nMÉDIAS : si le contexte contient une adresse HTTPS approuvée réellement pertinente, tu peux l'envoyer dans la conversation avec EXACTEMENT l'un des marqueurs [VIDEO: URL], [AUDIO: URL], [IMAGE: URL], [PDF: URL|Titre], [LINK: URL|Titre]. Ces marqueurs fonctionnent aussi HORS Formation Vivante. N'invente jamais une URL et n'utilise jamais une adresse absente du contexte ou du message de la personne. Les liens YouTube et Google Drive sont acceptés.`;
  return role;
}
async function callOpenRouter(env,messages,model) {
  const key = env.OPENROUTER_API_KEY || env.AI_API_KEY; if (!key) return null;
  return fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'HTTP-Referer':env.SITE_URL||'https://nyxia.top','X-Title':'NyXia — '+(PORTAL.title||'Portail')},body:JSON.stringify({model,messages,max_tokens:12000,reasoning:{enabled:false}})});
}
async function handleChat(request, env) {
  const body = await request.json().catch(()=>({})); const token=body.token, agent=agentKey(body.agent), message=safeString(body.message,20000);
  const session = await getSessionOrNull(token,env); if (!session) return json({error:'Session expirée. Reconnecte-toi.'},401);
  if (!ACTIVE_AGENTS.has(agent) || !getAgent(agent)) return json({error:'Personnage non disponible dans ce portail.'},403);
  try { const controlled=await runFormationControlTurn(env,session,agent,message); if(controlled&&controlled.content)return json(controlled); } catch (_) {}
  const meta=getAgent(agent); let system=baseSystemPrompt(meta).replace(/\{first_name\}/g,body.userName||session.firstname||'toi');
  let bank=''; if(env.CASHFLOW_KV){try{bank=await env.CASHFLOW_KV.get('prompts:'+portalSlug(env)+':'+agent)||await env.CASHFLOW_KV.get('prompts:'+agent)||''}catch(_){}}
  if(bank)system+='\n\nINSTRUCTIONS ET RESSOURCES CENTRALES DU PERSONNAGE :\n'+bank;
  const brain=await retrieveBrain(env,agent,message); if(brain)system+='\n\nMÉMOIRE VECTORISÉE DU PERSONNAGE — utilise-la fidèlement :\n'+brain;
  const forms=await listFormations(env,agent); if(forms.length)system+='\n\nFormation Vivante disponible : '+forms.map(f=>f.titre).filter(Boolean).join(' · ')+'. Si la personne veut la suivre, invite-la à dire « commence ma formation » ou « continue ma formation ».';
  const approved=collectUrls(bank+'\n'+brain+'\n'+message); const history=Array.isArray(body.history)?body.history.slice(-14):[];
  const messages=[{role:'system',content:system},...history.map(m=>({role:m.role==='assistant'?'assistant':'user',content:safeString(m.content,20000)}))];
  if(body.attachment&&body.attachment.dataUrl&&String(body.attachment.type||'').startsWith('image/')) messages.push({role:'user',content:[{type:'text',text:message||'Analyse cette image.'},{type:'image_url',image_url:{url:body.attachment.dataUrl}}]});
  else messages.push({role:'user',content:message});
  let resp=await callOpenRouter(env,messages,OPENROUTER_MODEL); if(!resp)return json({error:'OPENROUTER_API_KEY non configurée.'},500);
  if(!resp.ok)resp=await callOpenRouter(env,messages,OPENROUTER_FALLBACK_MODEL); if(!resp||!resp.ok)return json({error:'Le modèle IA est momentanément indisponible.'},502);
  const data=await resp.json().catch(()=>({})); let content=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content||'';
  content=sanitizeMediaMarkers(content,approved); if(!content)content='Petite interruption… réessaie dans un instant 💜'; return json({content});
}

// ───────────── VOIX ELEVENLABS ─────────────
function voiceIdForAgent(env,key) {
  const a=getAgent(key); if(!a)return''; const envName=a.voiceEnv || ('ELEVENLABS_'+String(key).toUpperCase().replace(/[^A-Z0-9]+/g,'_')+'_VOICE_ID');
  return String(a.voiceId || env[envName] || '').trim();
}
async function handleTTS(request,env) {
  const body=await request.json().catch(()=>({})); const session=await getSessionOrNull(body.token,env); if(!session)return json({error:'Session expirée.'},401);
  const key=agentKey(body.agent); if(!ACTIVE_AGENTS.has(key))return json({error:'Personnage non disponible.'},403);
  const voice=voiceIdForAgent(env,key); if(!voice)return json({error:'Voix ElevenLabs non configurée pour ce personnage.'},404);
  if(!env.ELEVENLABS_API_KEY)return json({error:'ELEVENLABS_API_KEY non configurée.'},500);
  const clean=String(body.text||'').replace(/\[(VIDEO|AUDIO|IMAGE|PDF|LINK)\s*:[^\]]+\]/gi,'').slice(0,4500); if(!clean)return json({error:'Texte requis.'},400);
  const cacheKey='tts_cache_elevenlabs:'+key+':'+await sha256Hex(clean); const cached=await env.CASHFLOW_KV.get(cacheKey,'arrayBuffer');
  if(cached)return json({success:true,proxyUrl:'/api/tts/cached-audio?key='+encodeURIComponent(cacheKey)+'&token='+encodeURIComponent(body.token),cached:true});
  const resp=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice),{method:'POST',headers:{'xi-api-key':env.ELEVENLABS_API_KEY,'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify({text:clean,model_id:'eleven_multilingual_v2',voice_settings:{stability:.5,similarity_boost:.75}})});
  if(!resp.ok)return json({error:'ElevenLabs indisponible pour cette voix.'},502); const audio=await resp.arrayBuffer(); await env.CASHFLOW_KV.put(cacheKey,audio,{expirationTtl:60*60*24*30});
  return json({success:true,proxyUrl:'/api/tts/cached-audio?key='+encodeURIComponent(cacheKey)+'&token='+encodeURIComponent(body.token)});
}
async function handleCachedAudio(request,env) {
  const u=new URL(request.url),token=u.searchParams.get('token'),key=u.searchParams.get('key'); const session=await getSessionOrNull(token,env); if(!session)return new Response('Unauthorized',{status:401}); if(!key||!key.startsWith('tts_cache_elevenlabs:'))return new Response('Not found',{status:404});
  const buf=await env.CASHFLOW_KV.get(key,'arrayBuffer'); if(!buf)return new Response('Not found',{status:404}); return new Response(buf,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'private, max-age=86400'}});
}

function staticRequest(request,path){return new Request(new URL(path,request.url),request);}

export default {
  async fetch(request,env) {
    const url=new URL(request.url),path=url.pathname;
    try {
      if(path==='/api/login'&&request.method==='POST')return handleLogin(request,env);
      if(path==='/api/check-auth'&&request.method==='POST')return handleCheckAuth(request,env);
      if(path==='/api/logout'&&request.method==='POST')return handleLogout(request,env);
      if(path==='/api/chat'&&request.method==='POST')return handleChat(request,env);
      if(path==='/api/formation/list'&&request.method==='GET')return handleFormationList(request,env);
      if(path==='/api/tts/nyxia'&&request.method==='POST')return handleTTS(request,env);
      if(path==='/api/tts/cached-audio'&&request.method==='GET')return handleCachedAudio(request,env);
    } catch(e) { console.error(e); return json({error:'Erreur serveur.',detail:String(e&&e.message||e)},500); }
    if(env.ASSETS){
      if(path==='/'||path==='')return env.ASSETS.fetch(staticRequest(request,'/index.html'));
      if(path==='/login')return env.ASSETS.fetch(staticRequest(request,'/login.html'));
      if(path==='/dashbord'||path==='/dashboard')return env.ASSETS.fetch(staticRequest(request,'/dashbord.html'));
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found',{status:404});
  }
};
