;(function(){
'use strict'

const GAME_TEMPLATE_OFFICIAL='https://raw.githubusercontent.com/cashflowecosysteme-maker/NyXiaLabo/main/game-shell-template.zip'
const GAME_TEMPLATE_SIZE=14816619
const GAME_TEMPLATE_GIT_BLOB='d009812d9125eaf5a0c06624a579d24a7b9bcb5e'
const PORTAL_WORKER_TEMPLATE='/superadmin4/portal-worker-template.js'
const PORTAL_CHAT_RUNTIME='/superadmin4/portal-chat.js'
const PORTAL_DASH_RUNTIME='/superadmin4/portal-dashboard.js'
const PORTAL_CHAT_EXTRA_CSS='/superadmin4/portal-chat-extra.css'
// Même clé que V4 pour récupérer le travail déjà saisi au premier chargement.
const DRAFT_KEY='nyxia:superadmin4:draft:v2'
const API_PROJECTS='/api/superadmin4/projects'
const UI_VERSION='15.0-source-exacte-nyxialabo-game-shell'

const BASE_META={
 nyxia:{name:'NyXia',sub:'Orientation & technique',icon:'✦',image:'https://univers.nyxia.top/NyXia.png'},
 diane:{name:'Diane',sub:'Créatrice & accompagnement',icon:'👑',image:'https://univers.nyxia.top/Diane.png'},
 eric:{name:'Éric',sub:'Communication & CashFlow',icon:'💼',image:'https://univers.nyxia.top/Eric.png'},
 lena:{name:'Léna',sub:'Spiritualité & intuition',icon:'🔮',image:'https://univers.nyxia.top/Lena.png'},
 alex:{name:'Alex',sub:'Écriture & storytelling',icon:'✍️',image:'https://univers.nyxia.top/Alex.png'},
 selena:{name:'Séléna',sub:'A.M.I.E. & croissance personnelle',icon:'🪞',image:'https://univers.nyxia.top/Selena.png'},
 kael:{name:'Kael',sub:'Relations amoureuses',icon:'💜',image:'https://univers.nyxia.top/Kael.png'}
}

let catalog=[]
let tools=[]
let projects=[]
let currentProjectId=''
let loadedTemplate=null
let loadedTemplateSource=''
let saveTimer=null
let saveInFlight=null
let saveAgain=false
let applyingProject=false

const $=id=>document.getElementById(id)
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const attr=esc
function slug(s,max=60){return String(s||'portail').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,max)||'portail'}
function voiceEnvName(key){return 'ELEVENLABS_'+String(key||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'_VOICE_ID'}
function setStatus(id,text,kind=''){const el=$(id);if(!el)return;el.textContent=text;el.className='status'+(kind?' '+kind:'')}
function jsonHeaders(){return {'Content-Type':'application/json','Accept':'application/json'}}
function fmtDate(v){if(!v)return'';try{return new Date(v).toLocaleString('fr-CA',{dateStyle:'medium',timeStyle:'short'})}catch(_){return v}}

async function api(path,opts={}){
  const noAuto401=!!opts.noAuto401
  const fetchOpts={...opts};delete fetchOpts.noAuto401
  const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...fetchOpts,headers:{...jsonHeaders(),...(fetchOpts.headers||{})}})
  const data=await res.json().catch(()=>({}))
  if(res.status===401&&!noAuto401){showLogin('Ta session Univers est expirée.');throw new Error('Session expirée')}
  if(!res.ok)throw new Error(data.error||data.message||('HTTP '+res.status))
  return data
}

function showLogin(msg=''){
  $('app').classList.add('hidden')
  $('loginGate').classList.remove('hidden')
  setStatus('loginMsg',msg,msg?'error':'')
  setTimeout(()=>$('loginPassword')?.focus(),30)
}
function showApp(){$('loginGate').classList.add('hidden');$('app').classList.remove('hidden')}
async function afterAuth(){showApp();await loadCatalog();await loadProjects();restoreDraft()}
async function checkAuth(){
  try{
    const data=await api('/api/check-auth',{method:'POST',body:'{}'})
    if(data.valid){await afterAuth();return true}
  }catch(e){if(e.message==='Session expirée')return false}
  showLogin('Connexion Super Admin requise.')
  return false
}
async function login(){
  const password=$('loginPassword').value
  if(!password)return setStatus('loginMsg','Entre le mot de passe Super Admin.','error')
  $('loginBtn').disabled=true;setStatus('loginMsg','Vérification…')
  try{
    const data=await api('/api/login',{method:'POST',body:JSON.stringify({password}),noAuto401:true})
    if(!data.success)throw new Error(data.error||'Connexion refusée.')
    $('loginPassword').value='';setStatus('loginMsg','');await afterAuth()
  }catch(e){setStatus('loginMsg',e.message,'error')}
  finally{$('loginBtn').disabled=false}
}
async function logout(){
  try{await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:jsonHeaders(),body:'{}'})}catch(_){}
  location.href='/'
}

function normalizeCatalog(rows){
 const map=new Map()
 for(const [key,m] of Object.entries(BASE_META))map.set(key,{key,name:m.name,portail:'',custom:false,...m})
 for(const p of Array.isArray(rows)?rows:[]){
   const key=slug(p.code||p.id||p.nom||p.name,40)
   if(!key)continue
   const base=BASE_META[key]||{}
   map.set(key,{key,name:p.nom||p.name||base.name||key,portail:p.portail||p.portal||'',custom:!!p.custom||!BASE_META[key],sub:base.sub||(p.portail?'Personnage · '+p.portail:'Personnage NyXia'),icon:base.icon||(p.custom?'✨':'✦'),image:base.image||''})
 }
 // NyXia et Diane restent disponibles, mais JAMAIS imposées.
 for(const k of ['nyxia','diane'])if(!map.has(k))map.set(k,{key:k,...BASE_META[k],custom:false})
 return [...map.values()].sort((a,b)=>{
   const rank=k=>k==='nyxia'?0:k==='diane'?1:BASE_META[k]?2:3
   return rank(a.key)-rank(b.key)||a.name.localeCompare(b.name,'fr')
 })
}
async function loadCatalog(){
 setStatus('catalogStatus','Lecture des personnages du Super Admin 1…')
 try{
   const data=await api('/api/personnages',{method:'GET'})
   catalog=normalizeCatalog(data.personnages||data.agents||[])
   renderAgents();refreshTrainer()
   const customs=catalog.filter(x=>x.custom).length
   setStatus('catalogStatus',catalog.length+' personnage(s) chargé(s) depuis Univers'+(customs?' · '+customs+' personnalisé(s)':'' )+'.','ok')
 }catch(e){
   catalog=normalizeCatalog([]);renderAgents();refreshTrainer()
   setStatus('catalogStatus','Catalogue central indisponible : affichage des personnages de base seulement. '+e.message,'warn')
 }
}

function renderAgents(){
 const host=$('agents');host.innerHTML=''
 for(const a of catalog){
   const box=document.createElement('div');box.className='agent'
   box.innerHTML=`<div class="agent-head">${a.image?`<img src="${attr(a.image)}" alt="${attr(a.name)}">`:`<div style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#0a1024;border:1px solid rgba(167,139,250,.25);font-size:20px">${esc(a.icon)}</div>`}<div class="agent-title"><strong>${esc(a.name)}${a.custom?'<span class="custom-badge">Super Admin 1</span>':''}</strong><small>${esc(a.sub||'Personnage NyXia')}</small></div></div><label class="agent-toggle"><input type="checkbox" id="ag-${attr(a.key)}"> Activer dans ce portail</label><div class="field"><label>Image du personnage dans ce portail</label><input id="img-${attr(a.key)}" value="${attr(a.image||'')}" placeholder="/Personnage.png ou https://..."></div><div class="field"><label>Voix ElevenLabs · <code>${esc(voiceEnvName(a.key))}</code></label><input id="voice-${attr(a.key)}" value="" placeholder="ID de voix ElevenLabs (optionnel)"><span class="hint">Ex. 4RsGOijU4NDnmihod21E · vide = aucune voix configurée</span></div>`
   host.appendChild(box)
   $('ag-'+a.key)?.addEventListener('change',()=>{refreshTrainer();markDirty()})
   $('img-'+a.key)?.addEventListener('input',markDirty)
   $('voice-'+a.key)?.addEventListener('input',markDirty)
 }
}
function activeAgents(){return catalog.filter(a=>$('ag-'+a.key)?.checked)}
function refreshTrainer(){
 const sel=$('trainer'),prev=sel.value
 sel.innerHTML='<option value="">Aucun formateur principal</option>'+activeAgents().map(a=>`<option value="${attr(a.key)}">${esc(a.name)}</option>`).join('')
 if([...sel.options].some(o=>o.value===prev))sel.value=prev
 else sel.value=''
}
function agentMeta(a){const voiceId=($('voice-'+a.key)?.value||'').trim();return{key:a.key,name:a.name,sub:a.sub||'Personnage NyXia',icon:a.icon||'✦',image:($('img-'+a.key)?.value||a.image||'').trim(),custom:!!a.custom,portail:a.portail||'',voiceEnv:voiceEnvName(a.key),voiceId,greeting:'Je suis là. Dis-moi ce que tu veux faire avancer dans ce portail.'}}
const CORE_AGENT_KEYS=['nyxia','diane','eric']
function navItemHtml(a){return `<div class="nav-item" id="nav-${attr(a.key)}" data-page-key="${attr(a.key)}">${a.image?`<img class="nav-avatar" src="${attr(a.image)}" alt="${attr(a.name)}" onerror="this.style.display='none'">`:`<span class="nav-icon">${esc(a.icon)}</span>`}<span class="nav-text"><span class="nav-name">${esc(a.name)}</span><span class="nav-sub">${esc(a.sub)}</span></span><span class="nav-arrow">›</span></div>`}
function coreNavHtml(list){const core=CORE_AGENT_KEYS.map(k=>list.find(a=>a.key===k)).filter(Boolean);return core.map(navItemHtml).join('\n')}
function atelierNavHtml(list){const extra=list.filter(a=>!CORE_AGENT_KEYS.includes(a.key));if(!extra.length)return'';return `<div class="nav-dropdown" id="atelier-group"><button type="button" class="nav-dropdown-trigger" id="atelier-toggle" aria-expanded="false"><span aria-hidden="true">🎭</span><span class="nav-dropdown-title">Atelier</span><span class="nav-dropdown-chevron" aria-hidden="true">⌄</span></button><div class="nav-dropdown-menu">${extra.map(navItemHtml).join('\n')}</div></div>`}
function toolsNavHtml(rows){if(!rows.length)return'';return `<div class="sidebar-divider"></div><div class="sidebar-section"><div class="sidebar-label">Outils</div>${rows.join('\n')}</div>`}

function addTool(){
 tools.push({id:crypto.randomUUID().replace(/-/g,'').slice(0,16),icon:'🧰',name:'',path:'/outil-'+(tools.length+1)+'.html',fileName:'',content:''})
 renderTools();markDirty()
}
function renderTools(){
 const host=$('tools');host.innerHTML=''
 for(const [i,t] of tools.entries()){
   const box=document.createElement('div');box.className='tool'
   const saved=t.content||t.fileName
   box.innerHTML=`<div class="tool-head"><strong>Outil spécialisé ${i+1}</strong><button class="btn danger" type="button" data-remove="${attr(t.id)}">Retirer</button></div><div class="grid"><div class="field"><label>Icône</label><input data-k="icon" data-id="${attr(t.id)}" value="${attr(t.icon||'🧰')}"></div><div class="field"><label>Nom</label><input data-k="name" data-id="${attr(t.id)}" value="${attr(t.name||'')}" placeholder="Nom de l’outil"></div><div class="field"><label>Fichier HTML</label><input data-file="${attr(t.id)}" type="file" accept=".html,text/html"><span class="hint" data-file-state="${attr(t.id)}">${saved?'✓ Sauvegardé avec le projet'+(t.fileName?' · '+esc(t.fileName):''):'Choisis un fichier HTML. Son contenu sera sauvegardé avec le projet.'}</span></div><div class="field"><label>Chemin final</label><input data-k="path" data-id="${attr(t.id)}" value="${attr(t.path||('/outil-'+(i+1)+'.html'))}"></div></div>`
   host.appendChild(box)
 }
 host.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{tools=tools.filter(t=>t.id!==b.dataset.remove);renderTools();markDirty()}))
 host.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',()=>{const t=tools.find(x=>x.id===el.dataset.id);if(t)t[el.dataset.k]=el.value;markDirty()}))
 host.querySelectorAll('[data-file]').forEach(el=>el.addEventListener('change',async()=>{
   const t=tools.find(x=>x.id===el.dataset.file);const f=el.files?.[0]
   if(!t||!f)return
   try{
     t.content=await f.text();t.fileName=f.name
     const state=host.querySelector('[data-file-state="'+t.id+'"]');if(state)state.textContent='✓ Chargé · '+f.name+' · sera sauvegardé avec le projet'
     markDirty()
   }catch(e){alert('Lecture du fichier impossible : '+e.message)}
 }))
}
function cleanPath(v){v=String(v||'').trim();if(!/^\/[a-zA-Z0-9_.-]+\.html$/.test(v))throw new Error('Le chemin d’un outil doit ressembler à /mon-outil.html');return v}

function currentDraft(){
 return{
   projectRecordId:currentProjectId,
   title:$('title').value,short:$('short').value,portalId:$('portalId').value,workerName:$('workerName').value,host:$('host').value,icon:$('icon').value,welcome:$('welcome').value,mission:$('mission').value,trainer:$('trainer').value,
   agents:catalog.map(a=>({key:a.key,active:!!$('ag-'+a.key)?.checked,image:$('img-'+a.key)?.value||'',voiceId:($('voice-'+a.key)?.value||'').trim(),voiceEnv:voiceEnvName(a.key)})),
   tools:tools.map(t=>({id:t.id,icon:t.icon,name:t.name,path:t.path,fileName:t.fileName||'',content:typeof t.content==='string'?t.content:''}))
 }
}
function saveDraft(show=false){
 try{
   localStorage.setItem(DRAFT_KEY,JSON.stringify(currentDraft()))
   if(show)setStatus('projectSaveState','Brouillon local de récupération sauvegardé.','ok')
   return true
 }catch(e){
   if(show)setStatus('projectSaveState','Brouillon local trop volumineux ou indisponible : '+e.message,'warn')
   return false
 }
}
function hasDraftContent(d){return !!(d&&(d.title||d.short||d.portalId||d.host||d.mission||(d.tools&&d.tools.length)||(d.agents&&d.agents.some(a=>a.active))))}
function applyData(d,{fromServer=false}={}){
 applyingProject=true
 try{
   for(const [id,key] of [['title','title'],['short','short'],['portalId','portalId'],['workerName','workerName'],['host','host'],['icon','icon'],['welcome','welcome'],['mission','mission']])$(id).value=d&&d[key]!=null?d[key]:(id==='icon'?'✦':'')
   for(const a of catalog){if($('ag-'+a.key))$('ag-'+a.key).checked=false;if($('img-'+a.key))$('img-'+a.key).value=a.image||'';if($('voice-'+a.key))$('voice-'+a.key).value=''}
   for(const a of d?.agents||[]){if($('ag-'+a.key))$('ag-'+a.key).checked=!!a.active;if($('img-'+a.key)&&a.image!=null)$('img-'+a.key).value=a.image;if($('voice-'+a.key)&&a.voiceId!=null)$('voice-'+a.key).value=a.voiceId}
   tools=(d?.tools||[]).map((t,i)=>({id:t.id||crypto.randomUUID().replace(/-/g,'').slice(0,16),icon:t.icon||'🧰',name:t.name||'',path:t.path||('/outil-'+(i+1)+'.html'),fileName:t.fileName||'',content:typeof t.content==='string'?t.content:''}))
   renderTools();refreshTrainer();if(d?.trainer&&[...$('trainer').options].some(o=>o.value===d.trainer))$('trainer').value=d.trainer
   if(!fromServer)saveDraft(false)
 } finally {applyingProject=false}
}
function restoreDraft(){
 let d;try{d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null')}catch(_){return false}
 if(!hasDraftContent(d))return false
 currentProjectId=(d.projectRecordId&&projects.some(p=>p.id===d.projectRecordId))?d.projectRecordId:''
 applyData(d,{fromServer:false})
 renderProjectSelect()
 setStatus('projectSaveState',currentProjectId?'Travail local restauré · autosauvegarde active.':'Brouillon local restauré · clique « Sauvegarder le portail » pour le conserver dans Univers.','warn')
 return true
}
function clearForm(){currentProjectId='';tools=[];applyData({}, {fromServer:true});localStorage.removeItem(DRAFT_KEY);renderProjectSelect();setStatus('projectSaveState','Nouveau brouillon local.','');setStatus('projectInfo','')}

async function loadProjects(){
 try{
   const data=await api(API_PROJECTS,{method:'GET'})
   projects=Array.isArray(data.projects)?data.projects:[]
   renderProjectSelect()
   return true
 }catch(e){projects=[];renderProjectSelect();setStatus('projectInfo','Sauvegarde centrale indisponible : '+e.message,'error');return false}
}
function renderProjectSelect(){
 const sel=$('projectSelect');if(!sel)return
 const prev=currentProjectId||sel.value
 sel.innerHTML='<option value="">— Aucun projet ouvert —</option>'+projects.map(p=>`<option value="${attr(p.id)}">${esc(p.title||'Sans titre')}${p.updatedAt?' · '+esc(fmtDate(p.updatedAt)):''}</option>`).join('')
 if(prev&&projects.some(p=>p.id===prev))sel.value=prev;else sel.value=''
 const meta=projects.find(p=>p.id===currentProjectId)
 if(meta)setStatus('projectInfo','Dernière sauvegarde : '+fmtDate(meta.updatedAt)+' · '+(meta.toolCount||0)+' outil(s).','')
}
function projectPayload(){
 const d=currentDraft();delete d.projectRecordId
 return{kind:'nyxia-portal',title:(d.title||d.short||'Nouveau portail').trim(),status:'brouillon',data:d}
}
function markDirty(){
 if(applyingProject)return
 saveDraft(false)
 clearTimeout(saveTimer)
 if(currentProjectId){
   setStatus('projectSaveState','Modification…','warn')
   saveTimer=setTimeout(()=>saveProjectNow(false),650)
 }else setStatus('projectSaveState','Brouillon local · clique « Sauvegarder le portail » pour le conserver dans Univers.','warn')
}
async function saveProjectNow(show=true){
 clearTimeout(saveTimer);saveTimer=null
 if(saveInFlight){saveAgain=true;return saveInFlight}
 const payload=projectPayload()
 saveInFlight=(async()=>{
   try{
     setStatus('projectSaveState','Sauvegarde dans CASHFLOW_KV…','')
     const data=currentProjectId
       ? await api(API_PROJECTS+'/'+encodeURIComponent(currentProjectId),{method:'PUT',body:JSON.stringify(payload)})
       : await api(API_PROJECTS,{method:'POST',body:JSON.stringify(payload)})
     currentProjectId=data.project.id
     saveDraft(false)
     await loadProjects()
     renderProjectSelect()
     setStatus('projectSaveState','Enregistré ✓','ok')
     if(show)setStatus('compileStatus','Projet sauvegardé. Tu peux le rouvrir et le modifier plus tard.','ok')
     return true
   }catch(e){setStatus('projectSaveState','Erreur sauvegarde : '+e.message,'error');if(show)alert('Sauvegarde impossible : '+e.message);return false}
   finally{saveInFlight=null}
 })()
 const ok=await saveInFlight
 if(saveAgain){saveAgain=false;if(currentProjectId)return saveProjectNow(false)}
 return ok
}
async function openSelectedProject(){const id=$('projectSelect').value;if(!id)return alert('Choisis un portail sauvegardé.');await openProject(id)}
async function openProject(id){
 try{
   if(currentProjectId&&currentProjectId!==id&&saveTimer){clearTimeout(saveTimer);saveTimer=null;await saveProjectNow(false)}
   const data=await api(API_PROJECTS+'/'+encodeURIComponent(id),{method:'GET'})
   currentProjectId=data.project.id
   applyData(data.project.data||{}, {fromServer:true})
   saveDraft(false);renderProjectSelect()
   setStatus('projectSaveState','Enregistré ✓','ok')
   setStatus('compileStatus','Projet « '+(data.project.title||'')+' » ouvert. Tu peux le modifier et tester.','ok')
 }catch(e){alert('Ouverture impossible : '+e.message)}
}
async function newProject(){
 if(currentProjectId&&saveTimer){clearTimeout(saveTimer);saveTimer=null;await saveProjectNow(false)}
 else if(!currentProjectId){let d=null;try{d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null')}catch(_){};if(hasDraftContent(d)&&!confirm('Commencer un nouveau portail ? Le brouillon actuel sera effacé.'))return}
 clearForm()
}
async function duplicateProject(){
 if(!currentProjectId){if(!(await saveProjectNow(true)))return}
 try{
   if(saveTimer){clearTimeout(saveTimer);saveTimer=null;await saveProjectNow(false)}
   const data=await api(API_PROJECTS+'/'+encodeURIComponent(currentProjectId)+'/duplicate',{method:'POST',body:'{}'})
   currentProjectId=data.project.id;applyData(data.project.data||{}, {fromServer:true});saveDraft(false);await loadProjects();renderProjectSelect();setStatus('projectSaveState','Copie enregistrée ✓','ok');setStatus('compileStatus','Copie créée. L’original est conservé.','ok')
 }catch(e){alert('Duplication impossible : '+e.message)}
}
async function deleteProject(){
 if(!currentProjectId)return alert('Aucun portail sauvegardé n’est ouvert.')
 const meta=projects.find(p=>p.id===currentProjectId);const name=meta?.title||$('title').value||'ce portail'
 if(!confirm('Supprimer définitivement le projet « '+name+' » ? Le ZIP déjà installé ailleurs n’est pas touché.'))return
 try{
   await api(API_PROJECTS+'/'+encodeURIComponent(currentProjectId),{method:'DELETE'})
   clearForm();await loadProjects();setStatus('compileStatus','Projet supprimé de Mes portails.','ok')
 }catch(e){alert('Suppression impossible : '+e.message)}
}

async function gitBlobSha1(buf){
 const prefix=new TextEncoder().encode('blob '+buf.byteLength+'\0')
 const body=new Uint8Array(buf),all=new Uint8Array(prefix.length+body.length);all.set(prefix,0);all.set(body,prefix.length)
 const dig=await crypto.subtle.digest('SHA-1',all)
 return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
async function helperText(url){const r=await fetch(url,{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw new Error('Fichier interne Super Admin 4 introuvable : '+url+' (HTTP '+r.status+')');return r.text()}
function htmlDoc(source){return new DOMParser().parseFromString(String(source||''),'text/html')}
function htmlOut(doc){return '<!DOCTYPE html>\n'+doc.documentElement.outerHTML}
async function zipFromArrayBuffer(buf,source){
 if(!window.JSZip)throw new Error('JSZip n’est pas encore chargé.')
 if(buf.byteLength!==GAME_TEMPLATE_SIZE)throw new Error('Coque refusée : ce fichier ne correspond pas au game-shell-template.zip officiel de NyXiaLabo (taille '+buf.byteLength+' au lieu de '+GAME_TEMPLATE_SIZE+').')
 const sha=await gitBlobSha1(buf)
 if(sha!==GAME_TEMPLATE_GIT_BLOB)throw new Error('Coque refusée : empreinte différente du game-shell-template.zip officiel de NyXiaLabo. Reçu '+sha+'.')
 const zip=await JSZip.loadAsync(buf)
 const required=['index.html','login.html','dashbord.html','chat-diane.html','chat-nyxia.html','chat-eric.html','chat-pnj.html','_worker.js','wrangler.toml','.assetsignore','css/index.css','css/login.css','css/dashbord.css','css/chat-diane.css','js/starry-bg.js']
 const missing=required.filter(f=>!zip.file(f));if(missing.length)throw new Error('Coque Game officielle incomplète : '+missing.join(', ')+' absent(s).')
 const shellWorker=await zip.file('_worker.js').async('string'),shellNpc=await zip.file('chat-pnj.html').async('string'),shellDash=await zip.file('dashbord.html').async('string')
 if(!shellWorker.includes('NYXIA_MJ_SCOPED_BRAIN_V1')||!shellWorker.includes('NYXIA_GAME_NPC_SCOPED_BRAIN_V1')||!shellNpc.includes('loadNpcIdentity')||!shellDash.includes('npcMeta'))throw new Error('Coque refusée : le ZIP a la bonne empreinte mais les marqueurs NyXia Game attendus sont absents.')
 loadedTemplate=buf;loadedTemplateSource=source+' · blob '+sha
 setStatus('templateStatus','Coque OFFICIELLE NyXiaLabo vérifiée · game-shell-template.zip · '+GAME_TEMPLATE_SIZE.toLocaleString('fr-CA')+' octets.','ok')
 $('templateSource').textContent='Source : '+loadedTemplateSource
 return zip
}
async function loadTemplate(force=false){
 if(loadedTemplate&&!force)return zipFromArrayBuffer(loadedTemplate.slice(0),loadedTemplateSource.split(' · blob ')[0])
 const manual=$('templateFile').files?.[0]
 if(manual){const buf=await manual.arrayBuffer();return zipFromArrayBuffer(buf,'fichier choisi : '+manual.name)}
 try{
   setStatus('templateStatus','Chargement DIRECT du game-shell-template.zip officiel de NyXiaLabo…','')
   const res=await fetch(GAME_TEMPLATE_OFFICIAL,{cache:'no-store',credentials:'omit',mode:'cors'})
   if(!res.ok)throw new Error('HTTP '+res.status)
   return await zipFromArrayBuffer(await res.arrayBuffer(),GAME_TEMPLATE_OFFICIAL)
 }catch(e){throw new Error('Impossible de charger la coque officielle NyXiaLabo directement : '+e.message+'. Tu peux sélectionner manuellement CE MÊME game-shell-template.zip comme secours.')}
}
async function testTemplate(){$('testTemplateBtn').disabled=true;try{await loadTemplate(true)}catch(e){loadedTemplate=null;setStatus('templateStatus',e.message,'error');$('templateSource').textContent=''}finally{$('testTemplateBtn').disabled=false}}

function validatePortal(){
 const title=$('title').value.trim();if(!title)throw new Error('Nom du portail requis.')
 const short=$('short').value.trim()||title,id=slug($('portalId').value.trim()||short),worker=slug($('workerName').value.trim()||short)
 const host=$('host').value.trim().toLowerCase();if(!/^[a-z0-9.-]+\.nyxia\.top$/.test(host))throw new Error('Entre un sous-domaine NyXia valide, ex. portailkael.nyxia.top')
 const icon=$('icon').value.trim()||'✦',mission=$('mission').value.trim(),welcome=$('welcome').value.trim()||'Bienvenue dans ton portail NyXia.'
 const list=activeAgents().map(agentMeta),trainer=$('trainer').value||'';if(trainer&&!list.some(x=>x.key===trainer))throw new Error('Le formateur principal doit être un personnage actif.')
 return{title,short,id,worker,host,icon,mission,welcome,list,trainer}
}
function b64Utf8(s){const bytes=new TextEncoder().encode(s);let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin)}
function reEscape(v){return String(v||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function replaceTomlStringLine(toml,key,value,required=true){
 const lines=String(toml||'').split(/\r?\n/),re=new RegExp('^\\s*'+reEscape(key)+'\\s*=\\s*.*$'),line=key+' = '+JSON.stringify(String(value||'')),idx=lines.findIndex(x=>re.test(x))
 if(idx<0){if(required)throw new Error('Coque Game wrangler.toml invalide : ligne '+key+' introuvable.');return toml}lines[idx]=line;return lines.join('\n')
}
function replaceTomlRoutePattern(toml,host){
 const lines=String(toml||'').split(/\r?\n/);let inRoutes=false,done=false
 for(let i=0;i<lines.length;i++){if(/^\s*\[\[routes\]\]\s*$/.test(lines[i])){inRoutes=true;continue}if(inRoutes&&/^\s*\[/.test(lines[i])&&!/^\s*\[\[routes\]\]\s*$/.test(lines[i]))inRoutes=false;if(inRoutes&&/^\s*pattern\s*=/.test(lines[i])){lines[i]='pattern = '+JSON.stringify(String(host||''));done=true;break}}
 if(!done)throw new Error('Coque Game wrangler.toml invalide : [[routes]] / pattern introuvable.')
 return lines.join('\n')
}
function stripGameFiles(zip){
 for(const name of Object.keys(zip.files)){
   if(/^chat-.*\.html$/i.test(name))zip.remove(name)
   else if(/^(?:jeu\.html|game-tools\.json|game-manifest\.json)$/i.test(name))zip.remove(name)
   else if(/^(?:data|documents)\//i.test(name))zip.remove(name)
   else if(/^js\/(?:nyxia-game|game-portal)\.js$/i.test(name))zip.remove(name)
   else if(/^css\/(?:jeu|game-portal|chat-nyxia|chat-eric|chat-pnj)\.css$/i.test(name))zip.remove(name)
   else if(/^images\/PNJ-avatar\.png$/i.test(name))zip.remove(name)
 }
}
function buildIndexFromGame(source,p){
 const d=htmlDoc(source);d.title='NyXia — '+p.title
 d.body.innerHTML=`<canvas id="starry-canvas"></canvas><div class="aura"></div><header class="site-header"><a class="brand" href="/"><img src="/images/NyXia.png" alt="NyXia"><span class="brand-name"><b>NyXia</b><span>${esc(p.short)}</span></span></a><div class="header-right"><a class="btn-primary" href="/login">Mon espace</a></div></header><section class="hero" id="top"><span class="hero-eyebrow">${esc(p.icon)} Portail NyXia</span><h1 class="display">${esc(p.title)}</h1>${p.mission?`<p class="hero-lead">${esc(p.mission)}</p>`:''}<div class="hero-cta"><a class="btn-primary" href="/login">Accéder à mon portail</a></div></section><script src="/js/starry-bg.js" defer></script>`
 return htmlOut(d)
}
function buildLoginFromGame(source,p,brandImage){
 const d=htmlDoc(source);d.title=p.title+' — Connexion'
 const av=d.querySelector('.login-avatar');if(av){av.src=brandImage;av.alt=p.short}
 const ti=d.querySelector('.login-title');if(ti){ti.id='portal-login-title';ti.textContent=p.short}
 const sub=d.querySelector('.login-subtitle');if(sub)sub.textContent=p.welcome||'Connecte-toi pour retrouver ton portail.'
 const foot=d.querySelector('.login-footer');if(foot)foot.innerHTML='<a href="/">Découvrir '+esc(p.short)+'</a><br><span style="opacity:0.5">© 2026 NyXia — '+esc(p.short)+'</span>'
 d.querySelectorAll('script').forEach(sc=>{if((sc.textContent||'').includes('/api/game/public'))sc.remove()})
 return htmlOut(d)
}
function dashboardAside(p,toolRows){
 const core=coreNavHtml(p.list),atelier=atelierNavHtml(p.list),toolsHtml=toolRows.length?`<div class="sidebar-section"><div class="sidebar-label">Outils</div>${toolRows.join('')}</div>`:''
 return `<div class="sidebar-section"><div class="sidebar-label">Mes Conversations</div>${core}${atelier}</div>${toolsHtml}<div class="sidebar-bottom"><div class="user-card"><div class="user-avatar" id="sidebar-avatar">N</div><div class="user-info"><div class="user-name" id="sidebar-username">Chargement...</div><div class="user-plan">✦ ${esc(p.short)}</div></div></div></div>`
}
function buildDashboardFromGame(source,p,pages,meta,toolRows,defaultPage){
 const d=htmlDoc(source);d.title='NyXia — '+p.title
 const welcome=d.querySelector('.welcome-text');if(welcome)welcome.innerHTML='Bienvenue dans '+esc(p.short)+' ✦ <strong id="header-username"></strong>'
 const badge=d.querySelector('.btn-pro');if(badge)badge.textContent=p.icon+' '+p.short
 const aside=d.querySelector('aside');if(!aside)throw new Error('Coque Game : sidebar introuvable dans dashbord.html.');aside.innerHTML=dashboardAside(p,toolRows)
 const main=d.querySelector('.main-content');if(!main)throw new Error('Coque Game : .main-content introuvable.');main.innerHTML='<div class="panel active" id="panel-chat" style="flex-direction:column"><iframe id="agent-iframe" src="about:blank" style="width:100%;height:100%;border:none;display:block" title="Conversation"></iframe></div>'
 d.querySelectorAll('script').forEach(x=>x.remove())
 const s1=d.createElement('script');s1.src='/js/starry-bg.js';s1.defer=true;d.body.appendChild(s1)
 const cfg=d.createElement('script');cfg.textContent='window.NYXIA_PORTAL_CONFIG='+JSON.stringify({pages,meta,defaultPage,title:p.title,shortTitle:p.short})+';';d.body.appendChild(cfg)
 const s2=d.createElement('script');s2.src='/js/portal-dashboard.js';d.body.appendChild(s2)
 return htmlOut(d)
}
function buildAgentChatFromGame(source,a){
 const d=htmlDoc(source);d.title=a.name+' — NyXia'
 const css=d.querySelector('link[href*="chat-"]');if(css)css.href='/css/chat-diane.css';const extra=d.createElement('link');extra.rel='stylesheet';extra.href='/css/portal-chat-extra.css';d.head.appendChild(extra)
 const av=d.querySelector('#chat-header-avatar');if(av){av.id='agent-avatar';av.innerHTML=a.image?'<img src="'+attr(a.image)+'" alt="'+attr(a.name)+'">':'<span class="chat-header-badge">'+esc(a.icon||'✦')+'</span>'}
 const nm=d.querySelector('#chat-header-name');if(nm)nm.textContent=a.name;const sub=d.querySelector('#chat-header-sub');if(sub)sub.textContent=a.sub||'Personnage NyXia'
 const video=d.querySelector('#btn-welcome-video');if(video)video.remove();const newBtn=[...d.querySelectorAll('.btn-new-chat')].find(x=>(x.textContent||'').includes('Nouveau chat'));if(newBtn){newBtn.id='new-chat-btn';newBtn.removeAttribute('onclick')}
 const msgs=d.querySelector('.chat-messages');if(msgs)msgs.id='messages'
 const fw=d.querySelector('#formation-launch-wrap');if(fw){fw.style.removeProperty('display');fw.hidden=true;const fb=fw.querySelector('button');if(fb){fb.id='formation-btn';fb.removeAttribute('onclick');fb.textContent='🎓 Formation Vivante'}}
 const sug=d.querySelector('#suggestions');if(sug)sug.innerHTML='<button type="button" class="sug-chip" data-suggestion="Aide-moi à avancer aujourd’hui">Aide-moi à avancer aujourd’hui</button><button type="button" class="sug-chip" data-suggestion="Explique-moi simplement la prochaine étape">Explique-moi simplement la prochaine étape</button><button type="button" class="sug-chip" data-suggestion="Que peux-tu faire dans ce portail ?">Que peux-tu faire dans ce portail ?</button>'
 const oldAttach=d.querySelector('#attach-bar');if(oldAttach){oldAttach.id='attachment-state';oldAttach.hidden=true;oldAttach.style.display='';oldAttach.innerHTML=''}
 const file=d.querySelector('#chat-file');if(file){file.id='file-input';file.accept='image/*'}
 const mic=d.querySelector('#btn-mic');if(mic){mic.id='mic-btn';mic.removeAttribute('onclick')}
 const inp=d.querySelector('#chat-input');if(inp){inp.id='message-input';inp.placeholder='Écris ou parle à '+a.name+'...'}
 const send=d.querySelector('#btn-send');if(send){send.id='send-btn';send.removeAttribute('onclick')}
 d.querySelectorAll('script').forEach(x=>x.remove())
 const s1=d.createElement('script');s1.src='/js/starry-bg.js';s1.defer=true;d.body.appendChild(s1)
 const cfg=d.createElement('script');cfg.textContent='window.NYXIA_AGENT='+JSON.stringify(a)+';';d.body.appendChild(cfg)
 const s2=d.createElement('script');s2.src='/js/portal-chat.js';d.body.appendChild(s2)
 return htmlOut(d)
}
async function assertFinalPortal(zip,p){
 const required=['index.html','login.html','dashbord.html','_worker.js','wrangler.toml','.assetsignore','css/index.css','css/login.css','css/dashbord.css','css/chat-diane.css','css/portal-chat-extra.css','js/starry-bg.js','js/portal-chat.js','js/portal-dashboard.js']
 const missing=required.filter(f=>!zip.file(f));if(missing.length)throw new Error('Compilation interrompue : fichier final manquant → '+missing.join(', '))
 for(const a of p.list)if(!zip.file('chat-'+a.key+'.html'))throw new Error('Compilation interrompue : chat-'+a.key+'.html manquant.')
 const ai=await zip.file('.assetsignore').async('string');if(!/^_worker\.js$/m.test(ai))throw new Error('Compilation interrompue : .assetsignore ne protège pas _worker.js.')
 const wr=await zip.file('wrangler.toml').async('string');if(/ELEVENLABS_[A-Z0-9_]+_VOICE_ID\s*=/.test(wr))throw new Error('Compilation interrompue : les Voice IDs ne doivent plus être injectés dans wrangler.toml.')
 if(!new RegExp('^name\\s*=\\s*"'+reEscape(p.worker)+'"','m').test(wr))throw new Error('Compilation interrompue : nom Worker non appliqué.')
 if(!wr.includes('pattern = '+JSON.stringify(p.host)))throw new Error('Compilation interrompue : domaine non appliqué dans [[routes]].')
}
async function compilePortal(){
 const btn=$('compileBtn');btn.disabled=true;setStatus('compileStatus','Sauvegarde puis lecture DIRECTE du game-shell-template.zip officiel…')
 try{
   if(!(await saveProjectNow(false)))throw new Error('Impossible de sauvegarder le projet avant la compilation.')
   const p=validatePortal(),zip=await loadTemplate(),voiceVariables=Object.fromEntries(p.list.filter(a=>a.voiceId).map(a=>[a.voiceEnv||voiceEnvName(a.key),a.voiceId]))
   const cfg={id:p.id,title:p.title,shortTitle:p.short,mission:p.mission,welcome:p.welcome,icon:p.icon,mode:'standard',formationAgent:p.trainer,activeAgents:p.list.map(x=>x.key),agents:p.list,voiceVariables,sourceCatalog:'univers:/api/personnages'}
   const brandAgent=p.list.find(a=>a.key===p.trainer)||p.list.find(a=>a.key==='diane')||p.list.find(a=>a.key==='nyxia')||p.list.find(a=>a.key==='eric')||p.list[0]||null,brandImage=(brandAgent&&brandAgent.image)||'/images/NyXia.png'
   const gameIndex=await zip.file('index.html').async('string'),gameLogin=await zip.file('login.html').async('string'),gameDash=await zip.file('dashbord.html').async('string'),gameChat=await zip.file('chat-diane.html').async('string')
   stripGameFiles(zip)
   const pages={},toolRows=[]
   for(const [i,t] of tools.entries()){
     if(!t.name.trim())throw new Error('Outil '+(i+1)+' : ajoute un nom.')
     if(typeof t.content!=='string'||!t.content.trim())throw new Error('Outil '+(i+1)+' : aucun fichier HTML n’est associé. Ajoute son fichier ou retire cet outil.')
     const path=cleanPath(t.path||('/outil-'+(i+1)+'.html'));if(!/<html[\s>]/i.test(t.content)&&!/<body[\s>]/i.test(t.content))throw new Error('Outil '+(i+1)+' : le fichier ne ressemble pas à une page HTML.')
     zip.file(path.replace(/^\//,''),t.content);const key='tool-'+t.id;pages[key]=path;toolRows.push(`<div class="nav-item" id="nav-${attr(key)}" data-page-key="${attr(key)}"><span class="nav-icon">${esc(t.icon||'🧰')}</span><span class="nav-text"><span class="nav-name">${esc(t.name)}</span><span class="nav-sub">Outil spécialisé</span></span><span class="nav-arrow">›</span></div>`)
   }
   for(const a of p.list){pages[a.key]='/chat-'+a.key+'.html';zip.file('chat-'+a.key+'.html',buildAgentChatFromGame(gameChat,a))}
   const preferred=['nyxia','diane','eric'].find(k=>pages[k]),defaultPage=preferred||p.list[0]?.key||Object.keys(pages)[0]||'',meta=Object.fromEntries(p.list.map(a=>[a.key,a]))
   zip.file('index.html',buildIndexFromGame(gameIndex,p));zip.file('login.html',buildLoginFromGame(gameLogin,p,brandImage));zip.file('dashbord.html',buildDashboardFromGame(gameDash,p,pages,meta,toolRows,defaultPage))
   zip.file('js/portal-chat.js',await helperText(PORTAL_CHAT_RUNTIME));zip.file('js/portal-dashboard.js',await helperText(PORTAL_DASH_RUNTIME));zip.file('css/portal-chat-extra.css',await helperText(PORTAL_CHAT_EXTRA_CSS))
   let worker=await helperText(PORTAL_WORKER_TEMPLATE);if(!worker.includes('__PORTAL_CONFIG_B64__'))throw new Error('Worker portail interne invalide : marqueur de configuration absent.');worker=worker.replace('__PORTAL_CONFIG_B64__',b64Utf8(JSON.stringify(cfg)));zip.file('_worker.js',worker)
   let wr=await zip.file('wrangler.toml').async('string');wr=replaceTomlStringLine(wr,'name',p.worker);wr=replaceTomlRoutePattern(wr,p.host);wr=replaceTomlStringLine(wr,'SITE_URL','https://'+p.host+'/',true);wr=replaceTomlStringLine(wr,'PORTAIL',p.id,true);wr=replaceTomlStringLine(wr,'GAME_ID','',false);zip.file('wrangler.toml',wr)
   zip.file('portal-manifest.json',JSON.stringify({schemaVersion:7,projectRecordId:currentProjectId,createdBy:'NyXia Univers · Super Admin 4',...cfg,host:p.host,workerName:p.worker,compiledAt:new Date().toISOString(),sharedData:{kv:'CASHFLOW_KV',d1:'nyxia-cercles-db',vectorize:'univers-livres'},templateSource:loadedTemplateSource,templateGitBlob:GAME_TEMPLATE_GIT_BLOB},null,2))
   await assertFinalPortal(zip,p)
   const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Portail-'+slug(p.short)+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
   setStatus('compileStatus','ZIP prêt depuis la coque OFFICIELLE NyXiaLabo · '+p.list.length+' personnage(s) · '+Object.keys(voiceVariables).length+' voix intégrées à la configuration · '+tools.length+' outil(s).','ok')
 }catch(e){setStatus('compileStatus','⚠ '+e.message,'error');alert(e.message)}finally{btn.disabled=false}
}

function bind(){
 $('loginBtn').addEventListener('click',login);$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('logoutBtn').addEventListener('click',logout)
 $('addToolBtn').addEventListener('click',addTool);$('compileBtn').addEventListener('click',compilePortal);$('testTemplateBtn').addEventListener('click',testTemplate)
 $('saveProjectBtn').addEventListener('click',()=>saveProjectNow(true));$('openProjectBtn').addEventListener('click',openSelectedProject);$('newProjectBtn').addEventListener('click',newProject);$('duplicateProjectBtn').addEventListener('click',duplicateProject);$('deleteProjectBtn').addEventListener('click',deleteProject)
 $('projectSelect').addEventListener('change',()=>{const p=projects.find(x=>x.id===$('projectSelect').value);setStatus('projectInfo',p?('Dernière sauvegarde : '+fmtDate(p.updatedAt)+' · '+(p.toolCount||0)+' outil(s).'):'','')})
 ;['title','short','portalId','workerName','host','icon','welcome','mission','trainer'].forEach(id=>$(id).addEventListener('input',markDirty))
 $('short').addEventListener('blur',()=>{if(!$('portalId').value)$('portalId').value=slug($('short').value);if(!$('workerName').value)$('workerName').value=slug($('short').value);markDirty()})
 $('templateFile').addEventListener('change',()=>{loadedTemplate=null;loadedTemplateSource='';if($('templateFile').files?.[0])setStatus('templateStatus','Coque manuelle sélectionnée : '+$('templateFile').files[0].name,'warn')})
 window.addEventListener('beforeunload',()=>saveDraft(false))
 renderTools();checkAuth()
}

document.addEventListener('DOMContentLoaded',bind)
})()
