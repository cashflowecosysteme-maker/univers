;(function(){
'use strict'

const TEMPLATE_LOCAL='/superadmin4/portail-shell-template.zip'
const TEMPLATE_READONLY='https://raw.githubusercontent.com/cashflowecosysteme-maker/NyXiaLabo/main/portail-shell-template.zip'
const DRAFT_KEY='nyxia:superadmin4:draft:v2'

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
let loadedTemplate=null
let loadedTemplateSource=''

const $=id=>document.getElementById(id)
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const attr=esc
function slug(s,max=60){return String(s||'portail').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,max)||'portail'}
function setStatus(id,text,kind=''){const el=$(id);if(!el)return;el.textContent=text;el.className='status'+(kind?' '+kind:'')}
function jsonHeaders(){return {'Content-Type':'application/json','Accept':'application/json'}}

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
function showApp(){
  $('loginGate').classList.add('hidden')
  $('app').classList.remove('hidden')
}
async function checkAuth(){
  try{
    const data=await api('/api/check-auth',{method:'POST',body:'{}'})
    if(data.valid){showApp();await loadCatalog();restoreDraft();return true}
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
    $('loginPassword').value='';showApp();await loadCatalog();restoreDraft();setStatus('loginMsg','')
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
 for(const required of ['nyxia','diane'])if(!map.has(required))map.set(required,{key:required,...BASE_META[required],custom:false})
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
   box.innerHTML=`<div class="agent-head">${a.image?`<img src="${attr(a.image)}" alt="${attr(a.name)}">`:`<div style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#0a1024;border:1px solid rgba(167,139,250,.25);font-size:20px">${esc(a.icon)}</div>`}<div class="agent-title"><strong>${esc(a.name)}${a.custom?'<span class="custom-badge">Super Admin 1</span>':''}</strong><small>${esc(a.sub||'Personnage NyXia')}</small></div></div><label class="agent-toggle"><input type="checkbox" id="ag-${attr(a.key)}"> Activer dans ce portail</label><div class="field"><label>Image du personnage dans ce portail</label><input id="img-${attr(a.key)}" value="${attr(a.image||'')}" placeholder="/Personnage.png ou https://..."></div>`
   host.appendChild(box)
   const ck=$('ag-'+a.key);if(ck)ck.addEventListener('change',()=>{refreshTrainer();autoSaveDraft()})
   const im=$('img-'+a.key);if(im)im.addEventListener('input',autoSaveDraft)
 }
}
function activeAgents(){return catalog.filter(a=>$('ag-'+a.key)?.checked)}
function refreshTrainer(){
 const sel=$('trainer'),prev=sel.value
 sel.innerHTML='<option value="">Aucun formateur principal</option>'+activeAgents().map(a=>`<option value="${attr(a.key)}">${esc(a.name)}</option>`).join('')
 if([...sel.options].some(o=>o.value===prev))sel.value=prev
 else sel.value=''
}
function agentMeta(a){return{key:a.key,name:a.name,sub:a.sub||'Personnage NyXia',icon:a.icon||'✦',image:($('img-'+a.key)?.value||a.image||'').trim(),custom:!!a.custom,portail:a.portail||'',greeting:'Je suis là. Dis-moi ce que tu veux faire avancer dans ce portail.'}}
function navHtml(list){return list.map((a,i)=>`<div class="nav-item ${i===0?'active':''}" id="nav-${a.key}" onclick="openAgentTab('${a.key}')">${a.image?`<img class="nav-avatar" src="${attr(a.image)}" alt="${attr(a.name)}" onerror="this.style.display='none'">`:`<span class="nav-icon">${esc(a.icon)}</span>`}<span class="nav-text"><span class="nav-name">${esc(a.name)}</span><span class="nav-sub">${esc(a.sub)}</span></span><span class="nav-arrow">›</span></div>`).join('\n')}

function addTool(){
 if(tools.length>=2)return alert('Maximum 2 outils spécialisés par portail.')
 tools.push({id:crypto.randomUUID().slice(0,8),icon:'🧰',name:'',path:'/outil-'+(tools.length+1)+'.html',file:null});renderTools();autoSaveDraft()
}
function renderTools(){
 const host=$('tools');host.innerHTML=''
 for(const [i,t] of tools.entries()){
   const box=document.createElement('div');box.className='tool'
   box.innerHTML=`<div class="tool-head"><strong>Outil spécialisé ${i+1}</strong><button class="btn danger" type="button" data-remove="${attr(t.id)}">Retirer</button></div><div class="grid"><div class="field"><label>Icône</label><input data-k="icon" data-id="${attr(t.id)}" value="${attr(t.icon||'🧰')}"></div><div class="field"><label>Nom</label><input data-k="name" data-id="${attr(t.id)}" value="${attr(t.name||'')}" placeholder="Nom de l’outil"></div><div class="field"><label>Fichier HTML</label><input data-file="${attr(t.id)}" type="file" accept=".html,text/html"><span class="hint">Le fichier est incorporé dans le ZIP final.</span></div><div class="field"><label>Chemin final</label><input data-k="path" data-id="${attr(t.id)}" value="${attr(t.path||('/outil-'+(i+1)+'.html'))}"></div></div>`
   host.appendChild(box)
 }
 host.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{tools=tools.filter(t=>t.id!==b.dataset.remove);renderTools();autoSaveDraft()}))
 host.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',()=>{const t=tools.find(x=>x.id===el.dataset.id);if(t)t[el.dataset.k]=el.value;autoSaveDraft()}))
 host.querySelectorAll('[data-file]').forEach(el=>el.addEventListener('change',()=>{const t=tools.find(x=>x.id===el.dataset.file);if(t)t.file=el.files?.[0]||null}))
}
function cleanPath(v){v=String(v||'').trim();if(!/^\/[a-zA-Z0-9_.-]+\.html$/.test(v))throw new Error('Le chemin d’un outil doit ressembler à /mon-outil.html');return v}

function b64Utf8(s){const bytes=new TextEncoder().encode(s);let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin)}
function currentDraft(){return{title:$('title').value,short:$('short').value,portalId:$('portalId').value,workerName:$('workerName').value,host:$('host').value,icon:$('icon').value,welcome:$('welcome').value,mission:$('mission').value,trainer:$('trainer').value,agents:catalog.map(a=>({key:a.key,active:!!$('ag-'+a.key)?.checked,image:$('img-'+a.key)?.value||''})),tools:tools.map(t=>({id:t.id,icon:t.icon,name:t.name,path:t.path}))}}
function saveDraft(show=true){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(currentDraft()));if(show)setStatus('compileStatus','Brouillon sauvegardé dans ce navigateur.','ok')}catch(e){if(show)setStatus('compileStatus','Sauvegarde locale impossible : '+e.message,'error')}}
function autoSaveDraft(){saveDraft(false)}
function restoreDraft(){
 let d;try{d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null')}catch(_){return}
 if(!d)return
 for(const [id,key] of [['title','title'],['short','short'],['portalId','portalId'],['workerName','workerName'],['host','host'],['icon','icon'],['welcome','welcome'],['mission','mission']])if(d[key]!=null)$(id).value=d[key]
 for(const a of d.agents||[]){if($('ag-'+a.key))$('ag-'+a.key).checked=!!a.active;if($('img-'+a.key)&&a.image!=null)$('img-'+a.key).value=a.image}
 tools=(d.tools||[]).slice(0,2).map((t,i)=>({id:t.id||crypto.randomUUID().slice(0,8),icon:t.icon||'🧰',name:t.name||'',path:t.path||('/outil-'+(i+1)+'.html'),file:null}));renderTools();refreshTrainer();if(d.trainer&&[...$('trainer').options].some(o=>o.value===d.trainer))$('trainer').value=d.trainer
}
function resetDraft(){
 if(!confirm('Effacer ce brouillon et recommencer un nouveau portail ?'))return
 localStorage.removeItem(DRAFT_KEY);location.reload()
}

async function zipFromArrayBuffer(buf,source){
 if(!window.JSZip)throw new Error('JSZip n’est pas encore chargé.')
 const zip=await JSZip.loadAsync(buf)
 const required=['dashbord.html','chat-base.html','_worker.js','wrangler.toml']
 const missing=required.filter(f=>!zip.file(f))
 if(missing.length)throw new Error('Coque incomplète : '+missing.join(', ')+' absent(s).')
 loadedTemplate=buf;loadedTemplateSource=source
 setStatus('templateStatus','Coque validée : '+required.length+' fichiers structurants présents.','ok')
 $('templateSource').textContent='Source : '+source
 return zip
}
async function loadTemplate(force=false){
 if(loadedTemplate&&!force)return zipFromArrayBuffer(loadedTemplate.slice(0),loadedTemplateSource)
 const manual=$('templateFile').files?.[0]
 if(manual){const buf=await manual.arrayBuffer();return zipFromArrayBuffer(buf,'fichier choisi : '+manual.name)}
 const candidates=[TEMPLATE_LOCAL,TEMPLATE_READONLY]
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
 throw new Error('Coque officielle introuvable. Choisis portail-shell-template.zip manuellement. Dernière erreur : '+last)
}
async function testTemplate(){
 $('testTemplateBtn').disabled=true
 try{await loadTemplate(true)}catch(e){loadedTemplate=null;setStatus('templateStatus',e.message,'error');$('templateSource').textContent=''}finally{$('testTemplateBtn').disabled=false}
}

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

async function compilePortal(){
 const btn=$('compileBtn');btn.disabled=true;setStatus('compileStatus','Validation et chargement de la coque…')
 try{
   const p=validatePortal();const zip=await loadTemplate()
   const cfg={id:p.id,title:p.title,shortTitle:p.short,mission:p.mission,welcome:p.welcome,icon:p.icon,mode:p.id==='alex'?'alex-writing':'standard',formationAgent:p.trainer,activeAgents:p.list.map(x=>x.key),agents:p.list,sourceCatalog:'univers:/api/personnages'}

   let dash=await zip.file('dashbord.html').async('string')
   dash=dash.replaceAll('__PORTAL_TITLE__',p.title).replaceAll('__PORTAL_SHORT_TITLE__',p.short).replaceAll('__PORTAL_ICON__',p.icon).replaceAll('__PORTAL_DEFAULT_AGENT__',p.list[0]?.key||'').replaceAll('__PORTAL_WELCOME__',p.welcome).replaceAll('__PORTAL_MISSION__',p.mission)
   dash=dash.replace('__PORTAL_AGENT_NAV__',navHtml(p.list))
   const pages={};p.list.forEach(a=>pages[a.key]='/chat-'+a.key+'.html')
   let special=''
   for(const [i,t] of tools.entries()){
     if(!t.file||!t.name.trim())throw new Error('Outil '+(i+1)+' : ajoute un nom et un fichier HTML.')
     const path=cleanPath(t.path||('/outil-'+(i+1)+'.html'));const html=await t.file.text();if(!/<html[\s>]/i.test(html)&&!/<body[\s>]/i.test(html))throw new Error('Outil '+(i+1)+' : le fichier ne ressemble pas à une page HTML.')
     zip.file(path.replace(/^\//,''),html)
     const key='tool-'+t.id;pages[key]=path
     special+=`<div class="nav-item" id="nav-${key}" onclick="openAgentTab('${key}')"><span class="nav-icon">${esc(t.icon||'🧰')}</span><span class="nav-text"><span class="nav-name">${esc(t.name)}</span><span class="nav-sub">Outil spécialisé</span></span><span class="nav-arrow">›</span></div>\n`
   }
   dash=dash.replace('__PORTAL_SPECIAL_TOOLS__',special).replace('__PORTAL_AGENT_PAGES__',JSON.stringify(pages))
   zip.file('dashbord.html',dash)

   const chatBase=await zip.file('chat-base.html').async('string')
   for(const a of p.list){
     let c=chatBase.replaceAll('__AGENT_NAME__',a.name).replaceAll('__AGENT_SUB__',a.sub).replaceAll('__PORTAL_TITLE__',p.title).replace('__AGENT_JSON__',JSON.stringify(a))
     zip.file('chat-'+a.key+'.html',c)
   }
   zip.remove('chat-base.html')

   let worker=await zip.file('_worker.js').async('string')
   if(!worker.includes('__PORTAL_CONFIG_B64__'))throw new Error('Coque Worker invalide : marqueur __PORTAL_CONFIG_B64__ absent.')
   worker=worker.replace('__PORTAL_CONFIG_B64__',b64Utf8(JSON.stringify(cfg)))
   zip.file('_worker.js',worker)

   let wr=await zip.file('wrangler.toml').async('string')
   wr=wr.replaceAll('__WORKER_NAME__',p.worker).replaceAll('__HOST__',p.host).replaceAll('__PORTAL_ID__',p.id)
   zip.file('wrangler.toml',wr)

   zip.file('portal-manifest.json',JSON.stringify({schemaVersion:2,createdBy:'NyXia Univers · Super Admin 4',...cfg,host:p.host,workerName:p.worker,compiledAt:new Date().toISOString(),sharedData:{kv:'CASHFLOW_KV',d1:'nyxia-cercles-db',vectorize:'univers-livres'},templateSource:loadedTemplateSource},null,2))
   const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}})
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Portail-'+slug(p.short)+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
   saveDraft(false);setStatus('compileStatus','ZIP prêt · '+p.list.length+' personnage(s) actif(s) · '+tools.length+' outil(s) spécialisé(s).','ok')
 }catch(e){setStatus('compileStatus','⚠ '+e.message,'error');alert(e.message)}finally{btn.disabled=false}
}

function bind(){
 $('loginBtn').addEventListener('click',login);$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('logoutBtn').addEventListener('click',logout)
 $('addToolBtn').addEventListener('click',addTool);$('compileBtn').addEventListener('click',compilePortal);$('testTemplateBtn').addEventListener('click',testTemplate);$('saveDraftBtn').addEventListener('click',()=>saveDraft(true));$('resetBtn').addEventListener('click',resetDraft)
 ;['title','short','portalId','workerName','host','icon','welcome','mission','trainer'].forEach(id=>$(id).addEventListener('input',autoSaveDraft))
 $('short').addEventListener('blur',()=>{if(!$('portalId').value)$('portalId').value=slug($('short').value);if(!$('workerName').value)$('workerName').value=slug($('short').value);autoSaveDraft()})
 $('templateFile').addEventListener('change',()=>{loadedTemplate=null;loadedTemplateSource='';if($('templateFile').files?.[0])setStatus('templateStatus','Coque manuelle sélectionnée : '+$('templateFile').files[0].name,'warn')})
 renderTools()
 checkAuth()
}

document.addEventListener('DOMContentLoaded',bind)
})()
