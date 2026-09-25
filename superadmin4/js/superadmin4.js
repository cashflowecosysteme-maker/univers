;(function(){
'use strict'

const TEMPLATE_LOCAL='/superadmin4/portail-shell-template.zip'
// Même clé que V4 pour récupérer le travail déjà saisi au premier chargement.
const DRAFT_KEY='nyxia:superadmin4:draft:v2'
const API_PROJECTS='/api/superadmin4/projects'
const UI_VERSION='12.0-validation-stricte'

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

async function zipFromArrayBuffer(buf,source){
 if(!window.JSZip)throw new Error('JSZip n’est pas encore chargé.')
 const zip=await JSZip.loadAsync(buf)
 const required=['index.html','login.html','dashbord.html','chat-base.html','_worker.js','wrangler.toml','.assetsignore','css/index.css','css/login.css','css/dashbord.css','css/chat.css','js/starry-bg.js','js/login.js','js/dashbord.js','js/chat.js']
 const missing=required.filter(f=>!zip.file(f))
 if(missing.length)throw new Error('Coque incomplète : '+missing.join(', ')+' absent(s).')
 const auditFiles=['index.html','login.html','dashbord.html','chat-base.html','_worker.js']
 const forbidden=/(Portail Alex|Devenir Écrivain|Aimée|Alibi|Constance|Fripouille|Mélusine|Abîme)/i
 for(const f of auditFiles){const txt=await zip.file(f).async('string');if(forbidden.test(txt))throw new Error('Coque refusée : ancien contenu Alex détecté dans '+f+'. Utilise la coque NyXia propre.')}
 loadedTemplate=buf;loadedTemplateSource=source
 setStatus('templateStatus','Coque NyXia propre validée · '+required.length+' fichiers structurants.','ok')
 $('templateSource').textContent='Source : '+source
 return zip
}
async function loadTemplate(force=false){
 if(loadedTemplate&&!force)return zipFromArrayBuffer(loadedTemplate.slice(0),loadedTemplateSource)
 const manual=$('templateFile').files?.[0]
 if(manual){const buf=await manual.arrayBuffer();return zipFromArrayBuffer(buf,'fichier choisi : '+manual.name)}
 const candidates=[TEMPLATE_LOCAL]
 let last=''
 for(const url of candidates){
   try{
     setStatus('templateStatus','Chargement de la coque : '+url,'')
     const res=await fetch(url,{cache:'no-store',credentials:url.startsWith('/')?'same-origin':'omit'})
     if(!res.ok)throw new Error('HTTP '+res.status)
     const buf=await res.arrayBuffer();if(buf.byteLength<1000)throw new Error('fichier trop petit')
     return await zipFromArrayBuffer(buf,url)
   }catch(e){last=e.message}
 }
 throw new Error('Coque officielle introuvable dans /superadmin4/portail-shell-template.zip. Ajoute ce fichier dans Super Admin 4 ou choisis-le manuellement. Dernière erreur : '+last)
}
async function testTemplate(){$('testTemplateBtn').disabled=true;try{await loadTemplate(true)}catch(e){loadedTemplate=null;setStatus('templateStatus',e.message,'error');$('templateSource').textContent=''}finally{$('testTemplateBtn').disabled=false}}

function validatePortal(){
 const title=$('title').value.trim();if(!title)throw new Error('Nom du portail requis.')
 const short=$('short').value.trim()||title
 const id=slug($('portalId').value.trim()||short)
 const worker=slug($('workerName').value.trim()||short)
 const host=$('host').value.trim().toLowerCase();if(!/^[a-z0-9.-]+\.nyxia\.top$/.test(host))throw new Error('Entre un sous-domaine NyXia valide, ex. portailkael.nyxia.top')
 const icon=$('icon').value.trim()||'✦'
 const mission=$('mission').value.trim(),welcome=$('welcome').value.trim()||'Bienvenue dans ton portail NyXia.'
 const list=activeAgents().map(agentMeta)
 const trainer=$('trainer').value||'';if(trainer&&!list.some(x=>x.key===trainer))throw new Error('Le formateur principal doit être un personnage actif.')
 return{title,short,id,worker,host,icon,mission,welcome,list,trainer}
}
function b64Utf8(s){const bytes=new TextEncoder().encode(s);let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin)}

function replaceTomlStringLine(toml,key,value){
 const lines=String(toml||'').split(/\r?\n/)
 const re=new RegExp('^\\s*'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*=\\s*.*$')
 const line=key+' = '+JSON.stringify(String(value||''))
 const idx=lines.findIndex(x=>re.test(x))
 if(idx<0)throw new Error('Coque wrangler.toml invalide : ligne '+key+' introuvable.')
 lines[idx]=line
 return lines.join('\n')
}
function replaceTomlRoutePattern(toml,host){
 const lines=String(toml||'').split(/\r?\n/)
 let inRoutes=false,done=false
 for(let i=0;i<lines.length;i++){
   if(/^\s*\[\[routes\]\]\s*$/.test(lines[i])){inRoutes=true;continue}
   if(inRoutes&&/^\s*\[/.test(lines[i])&&!/^\s*\[\[routes\]\]\s*$/.test(lines[i]))inRoutes=false
   if(inRoutes&&/^\s*pattern\s*=/.test(lines[i])){lines[i]='pattern = '+JSON.stringify(String(host||''));done=true;break}
 }
 if(!done){
   if(lines.length&&lines[lines.length-1].trim()!=='')lines.push('')
   lines.push('[[routes]]','pattern = '+JSON.stringify(String(host||'')),'zone_name = "nyxia.top"','custom_domain = true')
 }
 return lines.join('\n')
}
async function assertNoTemplateMarkers(zip){
 const bad=[]
 const textExt=/\.(?:html?|js|mjs|css|toml|json|txt|md)$/i
 for(const [name,file] of Object.entries(zip.files)){
   if(file.dir||!textExt.test(name))continue
   const txt=await file.async('string')
   const hits=txt.match(/__[A-Z][A-Z0-9_]*__/g)
   if(hits&&hits.length)bad.push(name+' : '+[...new Set(hits)].join(', '))
 }
 if(bad.length)throw new Error('Compilation interrompue : marqueur(s) de coque non remplacé(s) → '+bad.join(' | '))
}
function injectVoiceVars(toml,agents){
 const vars=agents.filter(a=>a.voiceId).map(a=>({name:a.voiceEnv||voiceEnvName(a.key),value:a.voiceId}))
 if(!vars.length)return toml
 const lines=String(toml||'').split(/\r?\n/)
 const varLine=v=>v.name+' = '+JSON.stringify(v.value)
 const idx=lines.findIndex(line=>/^\s*\[vars\]\s*(?:#.*)?$/.test(line))
 if(idx<0){if(lines.length&&lines[lines.length-1].trim()!=='')lines.push('');lines.push('[vars]',...vars.map(varLine));return lines.join('\n')}
 let end=idx+1;while(end<lines.length&&!/^\s*\[[^]]+\]\s*(?:#.*)?$/.test(lines[end]))end++
 const existing=new Set(lines.slice(idx+1,end).map(line=>{const m=line.match(/^\s*([A-Z0-9_]+)\s*=/);return m&&m[1]}).filter(Boolean))
 const add=vars.filter(v=>!existing.has(v.name)).map(varLine)
 lines.splice(end,0,...add)
 return lines.join('\n')
}

async function compilePortal(){
 const btn=$('compileBtn');btn.disabled=true;setStatus('compileStatus','Sauvegarde du projet puis chargement de la coque propre…')
 try{
   if(!(await saveProjectNow(false)))throw new Error('Impossible de sauvegarder le projet avant la compilation.')
   const p=validatePortal();const zip=await loadTemplate()
   const voiceVariables=Object.fromEntries(p.list.filter(a=>a.voiceId).map(a=>[a.voiceEnv||voiceEnvName(a.key),a.voiceId]))
   const cfg={id:p.id,title:p.title,shortTitle:p.short,mission:p.mission,welcome:p.welcome,icon:p.icon,mode:'standard',formationAgent:p.trainer,activeAgents:p.list.map(x=>x.key),agents:p.list,voiceVariables,sourceCatalog:'univers:/api/personnages'}

   // Sécurité : même si quelqu'un fournit une ancienne coque avec des chats résiduels,
   // on retire tous les chat-*.html avant de générer uniquement les personnages actifs.
   for(const name of Object.keys(zip.files)){if(/^chat-(?!base\.html$).+\.html$/i.test(name))zip.remove(name)}

   const pages={};p.list.forEach(a=>pages[a.key]='/chat-'+a.key+'.html')
   const toolRows=[]
   for(const [i,t] of tools.entries()){
     if(!t.name.trim())throw new Error('Outil '+(i+1)+' : ajoute un nom.')
     if(typeof t.content!=='string'||!t.content.trim())throw new Error('Outil '+(i+1)+' : aucun fichier HTML n’est associé. Ajoute son fichier ou retire cet outil.')
     const path=cleanPath(t.path||('/outil-'+(i+1)+'.html'));const html=t.content
     if(!/<html[\s>]/i.test(html)&&!/<body[\s>]/i.test(html))throw new Error('Outil '+(i+1)+' : le fichier ne ressemble pas à une page HTML.')
     zip.file(path.replace(/^\//,''),html)
     const key='tool-'+t.id;pages[key]=path
     toolRows.push(`<div class="nav-item" id="nav-${attr(key)}" data-page-key="${attr(key)}"><span class="nav-icon">${esc(t.icon||'🧰')}</span><span class="nav-text"><span class="nav-name">${esc(t.name)}</span><span class="nav-sub">Outil spécialisé</span></span><span class="nav-arrow">›</span></div>`)
   }

   const preferred=['nyxia','diane','eric'].find(k=>pages[k])
   const defaultPage=preferred||p.list[0]?.key||Object.keys(pages)[0]||''
   const meta=Object.fromEntries(p.list.map(a=>[a.key,a]))
   const brandAgent=p.list.find(a=>a.key===p.trainer)||p.list.find(a=>a.key==='diane')||p.list.find(a=>a.key==='nyxia')||p.list.find(a=>a.key==='eric')||p.list[0]||null
   const portalBrandImage=(brandAgent&&brandAgent.image)||'https://univers.nyxia.top/NyXia.png'

   function fillPortalText(html){
     return html
       .replaceAll('__PORTAL_TITLE__',p.title)
       .replaceAll('__PORTAL_SHORT_TITLE__',p.short)
       .replaceAll('__PORTAL_ICON__',p.icon)
       .replaceAll('__PORTAL_WELCOME__',p.welcome)
       .replaceAll('__PORTAL_MISSION__',p.mission)
       .replaceAll('__PORTAL_TITLE_JSON__',JSON.stringify(p.title))
       .replaceAll('__PORTAL_SHORT_TITLE_JSON__',JSON.stringify(p.short))
       .replaceAll('__PORTAL_DEFAULT_AGENT_JSON__',JSON.stringify(defaultPage))
       .replaceAll('__PORTAL_LOGIN_IMAGE__',portalBrandImage)
       .replaceAll('__PORTAL_HEADER_IMAGE__',portalBrandImage)
   }

   let index=fillPortalText(await zip.file('index.html').async('string'));zip.file('index.html',index)
   let login=fillPortalText(await zip.file('login.html').async('string'));zip.file('login.html',login)

   let dash=fillPortalText(await zip.file('dashbord.html').async('string'))
   dash=dash
     .replace('__PORTAL_CORE_NAV__',coreNavHtml(p.list))
     .replace('__PORTAL_ATELIER_NAV__',atelierNavHtml(p.list))
     .replace('__PORTAL_SPECIAL_TOOLS__',toolsNavHtml(toolRows))
     .replace('__PORTAL_AGENT_PAGES__',JSON.stringify(pages))
     .replace('__PORTAL_AGENT_META__',JSON.stringify(meta))
   zip.file('dashbord.html',dash)

   const chatBase=await zip.file('chat-base.html').async('string')
   for(const a of p.list){
     let c=fillPortalText(chatBase)
       .replaceAll('__AGENT_NAME__',a.name)
       .replaceAll('__AGENT_SUB__',a.sub)
       .replaceAll('__AGENT_ICON__',a.icon||'✦')
       .replace('__AGENT_JSON__',JSON.stringify(a))
     zip.file('chat-'+a.key+'.html',c)
   }
   zip.remove('chat-base.html')

   let worker=await zip.file('_worker.js').async('string')
   if(!worker.includes('__PORTAL_CONFIG_B64__'))throw new Error('Coque Worker invalide : marqueur __PORTAL_CONFIG_B64__ absent.')
   worker=worker.replace('__PORTAL_CONFIG_B64__',b64Utf8(JSON.stringify(cfg)));zip.file('_worker.js',worker)

   let wr=await zip.file('wrangler.toml').async('string')
   // On n'utilise plus un placeholder pour le nom : on réécrit les lignes TOML complètes.
   wr=replaceTomlStringLine(wr,'name',p.worker)
   wr=replaceTomlRoutePattern(wr,p.host)
   wr=replaceTomlStringLine(wr,'SITE_URL','https://'+p.host)
   wr=replaceTomlStringLine(wr,'PORTAIL',p.id)
   wr=replaceTomlStringLine(wr,'PORTAL_SLUG',p.id)
   // Compatibilité avec d'anciennes coques : remplace aussi d'éventuels marqueurs restants.
   wr=wr.replaceAll('__WORKER_NAME__',p.worker).replaceAll('__HOST__',p.host).replaceAll('__PORTAL_ID__',p.id)
   wr=injectVoiceVars(wr,p.list)
   zip.file('wrangler.toml',wr)

   zip.file('portal-manifest.json',JSON.stringify({schemaVersion:6,projectRecordId:currentProjectId,createdBy:'NyXia Univers · Super Admin 4',...cfg,host:p.host,workerName:p.worker,compiledAt:new Date().toISOString(),sharedData:{kv:'CASHFLOW_KV',d1:'nyxia-cercles-db',vectorize:'univers-livres'},templateSource:loadedTemplateSource},null,2))

   // Contrôle final AVANT téléchargement : aucun marqueur de coque ne peut sortir du compilateur.
   await assertNoTemplateMarkers(zip)

   const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}})
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Portail-'+slug(p.short)+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
   setStatus('compileStatus','ZIP propre prêt · projet sauvegardé · '+p.list.length+' personnage(s) actif(s) · '+Object.keys(voiceVariables).length+' voix ElevenLabs · '+tools.length+' outil(s).','ok')
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
