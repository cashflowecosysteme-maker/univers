(()=>{'use strict';const $=id=>document.getElementById(id),API='/api/superadmin4/projects';let catalog=[],profiles={},tools=[],current='',projectRows=[],portalAgents=new Map(),portalAgentCurrent='',indexPreviewTemplate='',indexPreviewCss='',indexActiveGroup='hero',indexAdvanced=false,indexPreviewTimer=null;const CORE={nyxia:{name:'NyXia',sub:'Orientation & technique',icon:'✦'},diane:{name:'Diane',sub:'Créatrice & accompagnement',icon:'👑'},eric:{name:'Éric',sub:'Communication & CashFlow',icon:'💼'},lena:{name:'Léna',sub:'Spiritualité & intuition',icon:'🔮'},selena:{name:'Séléna',sub:'A.M.I.E.',icon:'🪞'},alex:{name:'Alex',sub:'Écriture',icon:'✍️'},kael:{name:'Kael',sub:'Relations',icon:'💜'},sophia:{name:'Sophia',sub:'Numérologie · La Tisseuse des Nombres',icon:'🔢'},aletheia:{name:'Aletheia',sub:'Runes · La Scribe des Murmures Runiques',icon:'ᚱ'},cassandre:{name:'Cassandre',sub:'Tarot · La Voix du Reflet',icon:'🃏'},celeste:{name:'Céleste',sub:'Mancies & rituels · La Cartographe des Présages',icon:'🌙'}};const sections=[
['headerSocials','Réseaux sociaux (HTML)'],['headerCtaLabel','Texte du bouton'],['headerCtaUrl','URL du bouton'],
['heroEyebrow','Petit titre'],['heroTitle','Titre principal'],['heroSubtitle','Sous-titre'],['heroText','Texte principal'],['heroNote','Note'],['heroCtaLabel','Texte du bouton'],['heroCtaUrl','URL du bouton'],['heroMedia','Image / vidéo'],
['s2','Texte'],['s2Media','Image / vidéo'],['s3Media','Image 02 / vidéo'],
['s45','Texte du parcours'],['s45Media','Image / vidéo'],
['s67','Texte'],['s67Media','Image / vidéo'],
['s89','Texte Formation Vivante'],['s89Media','Image / vidéo'],
['s1011','Texte'],['s1011Media','Image / vidéo'],
['s1213','Texte Atelier'],['s1213Media','Image / vidéo'],
['s1415','Texte Résultats'],['s1415Media','Image / vidéo'],
['marquee','Bandeau défilant (HTML / texte)'],
['socialProof','Preuve sociale'],['socialProofMedia','Image / vidéo'],
['toolsText','Texte boîte à outils'],['toolsMedia','Image / vidéo'],
['transformText','Texte projection / transformation'],['transformMedia','Image / vidéo'],
['faq','FAQ'],
['ctaTitle','Titre'],['ctaText','Texte'],['ctaLabel','Texte du bouton'],['ctaUrl','URL du bouton'],
['footerSocials','Réseaux du footer (HTML)'],['footerSign','Signature']
];
const INDEX_GROUPS=[
 {id:'header',icon:'⌂',title:'Header',keys:['headerCtaLabel','headerCtaUrl','headerSocials'],advanced:['headerSocials']},
 {id:'hero',icon:'✦',title:'Hero',keys:['heroEyebrow','heroTitle','heroSubtitle','heroText','heroNote','heroCtaLabel','heroCtaUrl','heroMedia']},
 {id:'problem',icon:'01',title:'Problème / entrée',keys:['s2','s2Media','s3Media']},
 {id:'journey',icon:'02',title:'Parcours',keys:['s45','s45Media']},
 {id:'content',icon:'03',title:'Contenu',keys:['s67','s67Media']},
 {id:'formation',icon:'04',title:'Formation Vivante',keys:['s89','s89Media']},
 {id:'evolution',icon:'05',title:'Évolution',keys:['s1011','s1011Media']},
 {id:'atelier',icon:'06',title:'Atelier',keys:['s1213','s1213Media']},
 {id:'results',icon:'07',title:'Résultats',keys:['s1415','s1415Media']},
 {id:'proof',icon:'★',title:'Preuve sociale',keys:['socialProof','socialProofMedia']},
 {id:'tools',icon:'🧰',title:'Boîte à outils',keys:['toolsText','toolsMedia']},
 {id:'transform',icon:'↗',title:'Transformation',keys:['transformText','transformMedia']},
 {id:'faq',icon:'?',title:'FAQ',keys:['faq']},
 {id:'cta',icon:'◎',title:'Rendez-vous / CTA',keys:['ctaTitle','ctaText','ctaLabel','ctaUrl']},
 {id:'footer',icon:'⌄',title:'Footer',keys:['footerSign','footerSocials','marquee'],advanced:['footerSocials','marquee']}
];
const INDEX_MEDIA_KEYS=new Set(['heroMedia','s2Media','s3Media','s45Media','s67Media','s89Media','s1011Media','s1213Media','s1415Media','socialProofMedia','toolsMedia','transformMedia']);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);async function api(p,o={}){const r=await fetch(p,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'HTTP '+r.status);return d}

function idxFieldLabel(key){return (sections.find(x=>x[0]===key)||[key,key])[1]}
function idxIsLong(key){return key==='faq'||/Text$|^s\d|Proof$|marquee|footerSocials|headerSocials/.test(key)}
function idxMediaPreviewHtml(url){
 url=String(url||'').trim();if(!url)return''
 const yt=url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/)
 const gd=url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
 if(yt)return '<iframe src="https://www.youtube.com/embed/'+esc(yt[1])+'" loading="lazy"></iframe>'
 if(gd)return '<iframe src="https://drive.google.com/file/d/'+esc(gd[1])+'/preview" loading="lazy"></iframe>'
 if(/\.(mp4|webm)(?:\?|$)/i.test(url))return '<video src="'+esc(url)+'" controls></video>'
 return '<img src="'+esc(url)+'" alt="Aperçu média">'
}
function updateIdxMediaPreview(key){
 const el=$('idx-'+key),box=$('idx-media-'+key);if(!el||!box)return
 box.innerHTML=idxMediaPreviewHtml(el.value)
 box.style.display=el.value.trim()?'block':'none'
}
function indexUI(){
 const nav=$('indexSectionNav'),host=$('indexFields');if(!nav||!host)return
 nav.innerHTML='';host.innerHTML=''
 for(const g of INDEX_GROUPS){
   const b=document.createElement('button');b.type='button';b.className='index-nav-btn';b.dataset.group=g.id
   b.innerHTML='<span class="idx-dot"></span><span>'+esc(g.icon+'  '+g.title)+'</span>'
   b.onclick=()=>activateIndexGroup(g.id);nav.appendChild(b)

   const panel=document.createElement('div');panel.className='index-group';panel.dataset.group=g.id
   for(const key of g.keys){
     if(key==='faq'){
       const hidden=document.createElement('textarea');hidden.id='idx-faq';hidden.className='idx-hidden-source'
       hidden.addEventListener('input',()=>scheduleIndexPreview())
       panel.appendChild(hidden)
       const wrap=document.createElement('div')
       wrap.innerHTML='<div class="idx-faq-list" id="idxFaqList"></div><button class="btn secondary" type="button" id="idxFaqAddBtn">＋ Ajouter une question</button>'
       panel.appendChild(wrap)
       continue
     }
     const field=document.createElement('div')
     const isAdvanced=(g.advanced||[]).includes(key)
     field.className='field'+(isAdvanced?' idx-advanced':'')
     const control=idxIsLong(key)
       ? '<textarea id="idx-'+key+'"></textarea>'
       : '<input id="idx-'+key+'">'
     field.innerHTML='<label>'+esc(idxFieldLabel(key))+(isAdvanced?' · avancé':'')+'</label>'+control
     if(INDEX_MEDIA_KEYS.has(key))field.innerHTML+='<div class="idx-media-thumb" id="idx-media-'+key+'" style="display:none"></div>'
     if(/Socials|marquee/.test(key))field.innerHTML+='<div class="idx-field-note">HTML autorisé dans cette zone.</div>'
     panel.appendChild(field)
   }
   host.appendChild(panel)
 }
 for(const [key] of sections){
   const el=$('idx-'+key);if(!el)continue
   el.addEventListener('input',()=>{
     if(INDEX_MEDIA_KEYS.has(key))updateIdxMediaPreview(key)
     scheduleIndexPreview()
   })
 }
 if($('idxFaqAddBtn'))$('idxFaqAddBtn').onclick=()=>addFaqItem()
 activateIndexGroup(indexActiveGroup)
 loadIndexPreviewTemplate()
}
function activateIndexGroup(id){
 indexActiveGroup=id
 const g=INDEX_GROUPS.find(x=>x.id===id)||INDEX_GROUPS[0]
 document.querySelectorAll('.index-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.group===g.id))
 document.querySelectorAll('.index-group').forEach(p=>p.classList.toggle('active',p.dataset.group===g.id))
 if($('indexEditorTitle'))$('indexEditorTitle').textContent=g.title
 for(const key of g.keys)if(INDEX_MEDIA_KEYS.has(key))updateIdxMediaPreview(key)
 if(g.id==='faq')renderFaqBuilder()
 scrollIndexPreviewToGroup(g.id)
}
function currentIndexData(){
 const idx={}
 for(const [k] of sections)idx[k]=$('idx-'+k)?.value||''
 return idx
}
function faqData(){
 try{const v=JSON.parse($('idx-faq')?.value||'[]');return Array.isArray(v)?v:[]}catch(_){return[]}
}
function writeFaqData(list){
 if($('idx-faq'))$('idx-faq').value=JSON.stringify(list)
 renderFaqBuilder();scheduleIndexPreview()
}
function renderFaqBuilder(){
 const h=$('idxFaqList');if(!h)return
 const list=faqData();h.innerHTML=''
 if(!list.length){const e=document.createElement('div');e.className='idx-empty';e.textContent='Aucune question pour le moment.';h.appendChild(e)}
 list.forEach((item,i)=>{
   const row=document.createElement('div');row.className='idx-faq-row'
   row.innerHTML='<input data-faq-q="'+i+'" placeholder="Question" value="'+esc(item.q||'')+'"><textarea data-faq-a="'+i+'" placeholder="Réponse">'+esc(item.a||'')+'</textarea><div class="idx-faq-actions"><button class="btn danger" type="button" data-faq-del="'+i+'">Supprimer</button></div>'
   h.appendChild(row)
 })
 h.querySelectorAll('[data-faq-q]').forEach(el=>el.oninput=()=>{const l=faqData(),i=+el.dataset.faqQ;l[i]={...(l[i]||{}),q:el.value};$('idx-faq').value=JSON.stringify(l);scheduleIndexPreview()})
 h.querySelectorAll('[data-faq-a]').forEach(el=>el.oninput=()=>{const l=faqData(),i=+el.dataset.faqA;l[i]={...(l[i]||{}),a:el.value};$('idx-faq').value=JSON.stringify(l);scheduleIndexPreview()})
 h.querySelectorAll('[data-faq-del]').forEach(el=>el.onclick=()=>{const l=faqData();l.splice(+el.dataset.faqDel,1);writeFaqData(l)})
}
function addFaqItem(){const l=faqData();l.push({q:'',a:''});writeFaqData(l)}
async function loadIndexPreviewTemplate(){
 const status=$('indexPreviewStatus')
 try{
   if(status)status.textContent='Chargement de la vraie coque…'
   const r=await fetch('/superadmin4/portail-shell-template.zip',{cache:'no-store'})
   if(!r.ok)throw Error('Coque introuvable')
   const z=await JSZip.loadAsync(await r.arrayBuffer())
   const hf=z.file('index.html'),cf=z.file('css/index.css')
   if(!hf||!cf)throw Error('index.html ou css/index.css manque dans la coque')
   indexPreviewTemplate=await hf.async('string')
   indexPreviewCss=await cf.async('string')
   if(status)status.textContent='Aperçu réel de la coque ✓'
   refreshIndexPreview()
 }catch(e){
   if(status)status.textContent='⚠ '+e.message
 }
}
function buildPreviewHtml(){
 if(!indexPreviewTemplate)return''
 const p={title:$('title')?.value||'Portail NyXia',mission:$('mission')?.value||'',index:currentIndexData()}
 let doc=fillIndex(indexPreviewTemplate,p)
 doc=doc.replace(/<link[^>]+href=["']\/css\/index\.css["'][^>]*>/i,'<style>'+indexPreviewCss+'</style>')
 doc=doc.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 doc=doc.replace(/<script\b[^>]*\/?>/gi,'')
 doc=doc.replace('</head>','<style>html{scroll-behavior:smooth}body{min-width:0!important}a{cursor:default}</style></head>')
 return doc
}
function refreshIndexPreview(){
 const f=$('indexPreviewFrame');if(!f||!indexPreviewTemplate)return
 let oldScroll=0;try{oldScroll=f.contentWindow?.scrollY||0}catch(_){}
 f.srcdoc=buildPreviewHtml()
 f.onload=()=>{
   try{
     f.contentDocument?.addEventListener('click',e=>{const a=e.target.closest?.('a');if(a)e.preventDefault()})
     f.contentWindow?.scrollTo(0,oldScroll)
   }catch(_){}
 }
}
function scheduleIndexPreview(){
 clearTimeout(indexPreviewTimer)
 indexPreviewTimer=setTimeout(refreshIndexPreview,220)
}
function setIndexDevice(mode){
 const stage=$('indexPreviewStage');if(!stage)return
 stage.classList.toggle('mobile',mode==='mobile');stage.classList.toggle('desktop',mode!=='mobile')
 if($('indexPreviewDevice'))$('indexPreviewDevice').textContent=mode==='mobile'?'Mobile · 390 px':'Desktop'
}
function scrollIndexPreviewToGroup(id){
 const f=$('indexPreviewFrame');if(!f?.contentDocument)return
 const selectors={
  header:'.site-header',hero:'#top',problem:'#top',
  journey:'.section-wrap:nth-of-type(2)',content:'.section-wrap:nth-of-type(3)',
  formation:'.section-wrap:nth-of-type(4)',evolution:'.section-wrap:nth-of-type(5)',
  atelier:'.section-wrap:nth-of-type(6)',results:'.section-wrap:nth-of-type(7)',
  proof:'.section-wrap:nth-of-type(8)',tools:'.section-wrap:nth-of-type(9)',
  transform:'.section-wrap:nth-of-type(10)',faq:'.faq-section',cta:'.cta-section',footer:'footer'
 }
 try{const el=f.contentDocument.querySelector(selectors[id]||'body');el?.scrollIntoView({block:'start'})}catch(_){}
}
function resetIndexSection(){
 const g=INDEX_GROUPS.find(x=>x.id===indexActiveGroup);if(!g)return
 if(!confirm('Réinitialiser tous les champs de « '+g.title+' » ?'))return
 for(const key of g.keys){if($('idx-'+key))$('idx-'+key).value='';if(INDEX_MEDIA_KEYS.has(key))updateIdxMediaPreview(key)}
 if(g.id==='faq')renderFaqBuilder()
 scheduleIndexPreview()
}
async function load(){
  const map=new Map(Object.entries(CORE).map(([k,v])=>[k,{key:k,...v,portail:'',custom:false}]));
  profiles={};catalog=[...map.values()];renderAgents();
  try{const p=await api('/api/personnages');for(const x of (p.personnages||p.agents||[])){const k=slug(x.code||x.id||x.nom||x.name);if(!k)continue;const base=map.get(k)||{};map.set(k,{...base,key:k,name:x.nom||x.name||base.name||k,sub:base.sub||'Personnage NyXia',portail:x.portail||x.portal||'',custom:!!x.custom||!CORE[k]});}}catch(e){console.warn('Catalogue Super Admin 1 indisponible:',e)}
  try{const pr=await api('/api/superadmin4/personnages/profile');profiles=Object.fromEntries((pr.profiles||[]).map(x=>[x.code,x]));for(const [k,pf] of Object.entries(profiles)){const base=map.get(k)||{key:k,name:pf.name||k,sub:'Personnage NyXia',portail:'',custom:true};map.set(k,{...base,...pf,key:k,name:pf.name||base.name||k,sub:pf.sub||base.sub||'Personnage NyXia',portail:pf.portail||base.portail||'',custom:base.custom!==false});}}catch(e){console.warn('Profils Super Admin 4 indisponibles:',e)}
  catalog=[...map.values()].sort((a,b)=>{const rank=k=>k==='nyxia'?0:k==='diane'?1:k==='eric'?2:CORE[k]?3:4;return rank(a.key)-rank(b.key)||String(a.name||'').localeCompare(String(b.name||''),'fr')});
  renderAgents();try{await loadProjects()}catch(e){console.warn('Projets indisponibles:',e)}
}
function portalAgentBase(key){return catalog.find(a=>a.key===key)||profiles[key]||null}
function portalAgentValue(key){
 const base=portalAgentBase(key)
 if(!base)return null
 const saved=portalAgents.get(key)||{}
 return {...base,...saved,key,
  image:saved.image??base.image??'',
  welcomeVideo:saved.welcomeVideo??base.welcomeVideo??'',
  voiceId:saved.voiceId??base.voiceId??'',
  placement:saved.placement||'principal'}
}
function renderPortalAgentSelect(filterText=''){
 const s=$('portalAgentSelect');if(!s)return
 const keep=portalAgentCurrent||s.value||''
 const q=String(filterText||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 s.innerHTML='<option value="">— Choisir un personnage —</option>'
 for(const a of catalog){
   const hay=[a.name,a.sub,a.portail,a.key].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   if(q&&!hay.includes(q))continue
   const o=document.createElement('option');o.value=a.key
   o.textContent=a.name+(a.sub?' · '+a.sub:'')
   s.appendChild(o)
 }
 if([...s.options].some(o=>o.value===keep))s.value=keep
}
function renderPortalAgentChips(){
 const h=$('portalAgentChips');if(!h)return
 h.innerHTML=''
 const keys=[...portalAgents.keys()]
 if(!keys.length){
   const e=document.createElement('span');e.className='hint';e.textContent='Aucun personnage sélectionné pour ce portail.';h.appendChild(e);return
 }
 for(const key of keys){
   const a=portalAgentValue(key);if(!a)continue
   const b=document.createElement('button');b.type='button';b.className='btn secondary'
   b.style.padding='7px 10px';b.style.borderRadius='999px';b.style.display='inline-flex';b.style.alignItems='center';b.style.gap='7px'
   if(a.image){
     const img=document.createElement('img');img.src=a.image;img.alt='';img.style.width='22px';img.style.height='22px';img.style.borderRadius='50%';img.style.objectFit='cover';b.appendChild(img)
   }
   const t=document.createElement('span');t.textContent=a.name||key;b.appendChild(t)
   b.onclick=()=>selectPortalAgent(key)
   h.appendChild(b)
 }
}
function updatePortalAgentButtons(){
 const key=portalAgentCurrent,on=!!(key&&portalAgents.has(key))
 if($('portalAgentAddBtn'))$('portalAgentAddBtn').style.display=key&&!on?'inline-flex':'none'
 if($('portalAgentRemoveBtn'))$('portalAgentRemoveBtn').style.display=key&&on?'inline-flex':'none'
}
function selectPortalAgent(key){
 portalAgentCurrent=String(key||'')
 const card=$('portalAgentCard')
 if(!portalAgentCurrent){if(card)card.style.display='none';updatePortalAgentButtons();return}
 const a=portalAgentValue(portalAgentCurrent)
 if(!a){if(card)card.style.display='none';return}
 if(card)card.style.display='block'
 if($('portalAgentSelect'))$('portalAgentSelect').value=portalAgentCurrent
 $('portalAgentName').textContent=a.name||portalAgentCurrent
 $('portalAgentSub').textContent=a.sub||a.portail||''
 const av=$('portalAgentAvatar');av.innerHTML=''
 if(a.image){const img=document.createElement('img');img.src=a.image;img.alt=a.name||'';img.style.width='100%';img.style.height='100%';img.style.objectFit='cover';av.appendChild(img)}
 else av.textContent=a.icon||'✦'
 $('portalAgentPlacement').value=a.placement||'principal'
 $('portalAgentImage').value=a.image||''
 $('portalAgentVideo').value=a.welcomeVideo||''
 $('portalAgentVoice').value=a.voiceId||''
 $('portalAgentStatus').textContent=portalAgents.has(portalAgentCurrent)?'✓ Ce personnage est dans ce portail.':'Ce personnage n’est pas encore dans ce portail.'
 updatePortalAgentButtons()
}
function savePortalAgentEditor(){
 if(!portalAgentCurrent||!portalAgents.has(portalAgentCurrent))return
 const base=portalAgentBase(portalAgentCurrent)||{}
 portalAgents.set(portalAgentCurrent,{
   ...portalAgents.get(portalAgentCurrent),
   key:portalAgentCurrent,
   name:base.name||portalAgentCurrent,
   sub:base.sub||'',
   portail:base.portail||'',
   custom:!!base.custom,
   icon:base.icon||'✦',
   image:$('portalAgentImage')?.value||'',
   welcomeVideo:$('portalAgentVideo')?.value||'',
   voiceId:$('portalAgentVoice')?.value||'',
   placement:$('portalAgentPlacement')?.value||'principal'
 })
 renderPortalAgentChips()
}
function addPortalAgent(){
 const key=portalAgentCurrent;if(!key)return
 const base=portalAgentBase(key);if(!base)return
 portalAgents.set(key,{...base,key,
   image:$('portalAgentImage')?.value||base.image||'',
   welcomeVideo:$('portalAgentVideo')?.value||base.welcomeVideo||'',
   voiceId:$('portalAgentVoice')?.value||base.voiceId||'',
   placement:$('portalAgentPlacement')?.value||'principal'
 })
 renderPortalAgentChips();selectPortalAgent(key)
}
function removePortalAgent(){
 const key=portalAgentCurrent;if(!key||!portalAgents.has(key))return
 const a=portalAgentValue(key)
 if(!confirm('Retirer '+(a?.name||key)+' de ce portail ?'))return
 portalAgents.delete(key);renderPortalAgentChips();selectPortalAgent(key)
}
function renderAgents(){
 renderPortalAgentSelect($('portalAgentSearch')?.value||'')
 renderPortalAgentChips()
 if(portalAgentCurrent)selectPortalAgent(portalAgentCurrent)
}
function active(){
 savePortalAgentEditor()
 return [...portalAgents.keys()].map(k=>portalAgentValue(k)).filter(Boolean)
}
function draft(){const idx={};for(const [k] of sections)idx[k]=$('idx-'+k)?.value||'';return{title:$('title').value,short:$('short').value,portalId:$('portalId').value,workerName:$('workerName').value,host:$('host').value,mission:$('mission').value,loginImage:$('loginImage').value,agents:active(),index:idx,tools}}
function legacyFirst(){for(const v of arguments){if(v!==undefined&&v!==null&&v!=='')return v}return''}
function legacyObj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function legacyArray(v){return Array.isArray(v)?v:[]}
function legacyKey(v){if(v&&typeof v==='object')v=v.key||v.code||v.id||v.slug||v.nom||v.name;return slug(v||'')}
function legacyMapValue(map,key,envName){map=legacyObj(map);return legacyFirst(map[key],map[key.replace(/-/g,'_')],envName&&map[envName],envName&&map[envName.toLowerCase()])}
function legacyVoiceEnv(key){return 'ELEVENLABS_'+String(key||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'_VOICE_ID'}
function normalizeLegacyProject(raw={},project={}){const root=legacyObj(raw),cfg={...legacyObj(root.config),...legacyObj(root.portal),...legacyObj(root.settings),...root};const out={};out.title=legacyFirst(cfg.title,cfg.portalTitle,cfg.nom,cfg.name,project.title);out.short=legacyFirst(cfg.short,cfg.shortTitle,cfg.portalShortTitle,cfg.nomCourt,cfg.short_name,out.title);out.portalId=legacyFirst(cfg.portalId,cfg.portal_id,cfg.slug,cfg.id,cfg.identifier,cfg.identifiant);out.workerName=legacyFirst(cfg.workerName,cfg.worker,cfg.worker_name,cfg.cloudflareWorker,cfg.workerCloudflare);out.host=legacyFirst(cfg.host,cfg.hostname,cfg.domain,cfg.domaine,cfg.subdomain,cfg.sousDomaine,cfg.urlHost);out.mission=legacyFirst(cfg.mission,cfg.description,cfg.portalMission,cfg.purpose);out.loginImage=legacyFirst(cfg.loginImage,cfg.login_image,cfg.loginAvatar,cfg.loginMedia,cfg.imageLogin,cfg.coverImage);out.index={...legacyObj(cfg.index),...legacyObj(cfg.indexConfig),...legacyObj(cfg.indexData),...legacyObj(cfg.landingPage)};out.tools=legacyArray(legacyFirst(cfg.tools,cfg.specialTools,cfg.outils,cfg.portalTools));let source=[];for(const v of [cfg.agents,cfg.list,cfg.characters,cfg.personnages,cfg.selectedAgents,cfg.selectedCharacters]){if(Array.isArray(v)&&v.length){source=v;break}}let selected=[];for(const v of [cfg.activeAgents,cfg.active_agents,cfg.agentKeys,cfg.charactersActive,cfg.personnagesActifs]){if(Array.isArray(v)&&v.length){selected=v;break}}const sourceByKey=new Map();for(const item of source){const k=legacyKey(item);if(k)sourceByKey.set(k,item)}const wanted=new Set();for(const item of source){const k=legacyKey(item);if(k)wanted.add(k)}for(const item of selected){const k=legacyKey(item);if(k)wanted.add(k)}const trainer=legacyKey(legacyFirst(cfg.formationAgent,cfg.trainer,cfg.formateur,cfg.mainAgent));if(trainer)wanted.add(trainer);const imageMaps=[cfg.agentImages,cfg.images,cfg.characterImages,cfg.personnageImages,cfg.avatarUrls,cfg.avatars].map(legacyObj);const videoMaps=[cfg.agentVideos,cfg.welcomeVideos,cfg.videos,cfg.characterVideos,cfg.personnageVideos].map(legacyObj);const voiceMaps=[cfg.voiceIds,cfg.voices,cfg.agentVoices,cfg.characterVoices,cfg.voiceVariables,cfg.voice_variables].map(legacyObj);out.agents=[];for(const k of wanted){const saved=legacyObj(sourceByKey.get(k));const base=catalog.find(a=>a.key===k)||profiles[k]||{};const envName=legacyFirst(saved.voiceEnv,base.voiceEnv,legacyVoiceEnv(k));let image=legacyFirst(saved.image,saved.imageUrl,saved.avatar,saved.avatarUrl,saved.photo,saved.photoUrl);if(!image)for(const m of imageMaps){image=legacyMapValue(m,k,envName);if(image)break}let video=legacyFirst(saved.welcomeVideo,saved.video,saved.videoUrl,saved.welcome_video,saved.videoAccueil);if(!video)for(const m of videoMaps){video=legacyMapValue(m,k,envName);if(video)break}let voice=legacyFirst(saved.voiceId,saved.voice_id,saved.elevenlabsVoiceId,saved.elevenVoiceId);if(!voice)for(const m of voiceMaps){voice=legacyMapValue(m,k,envName);if(voice)break}out.agents.push({...base,...saved,key:k,name:legacyFirst(saved.name,saved.nom,base.name,k),sub:legacyFirst(saved.sub,saved.role,saved.subtitle,saved.description,base.sub,'Personnage NyXia'),icon:legacyFirst(saved.icon,base.icon,'✦'),image:legacyFirst(image,base.image,''),welcomeVideo:legacyFirst(video,base.welcomeVideo,''),voiceId:legacyFirst(voice,base.voiceId,''),voiceEnv:envName,placement:legacyFirst(saved.placement,saved.position,saved.emplacement,'principal'),greeting:legacyFirst(saved.greeting,saved.welcome,saved.accueil,base.greeting,'Je suis là. Dis-moi ce que tu veux faire avancer dans ce portail.'),portail:legacyFirst(saved.portail,saved.portal,base.portail,'')})}if(!out.agents.length){const keys=new Set();for(const m of [...imageMaps,...videoMaps,...voiceMaps])for(const mk of Object.keys(m)){let k=slug(mk.replace(/^ELEVENLABS_/i,'').replace(/_VOICE_ID$/i,'').replace(/_/g,'-'));if(catalog.some(a=>a.key===k))keys.add(k)}for(const k of keys){const b=catalog.find(a=>a.key===k)||{};out.agents.push({...b,key:k,name:b.name||k,image:legacyMapValue(imageMaps[0],k)||b.image||'',welcomeVideo:legacyMapValue(videoMaps[0],k)||b.welcomeVideo||'',voiceId:legacyMapValue(voiceMaps[0],k,legacyVoiceEnv(k))||b.voiceId||''})}}for(const [k] of sections)if(!out.index[k])out.index[k]=legacyFirst(cfg[k],cfg['index_'+k],cfg['idx_'+k]);return out}
function apply(d={}){
 for(const k of ['title','short','portalId','workerName','host','mission','loginImage'])$(k).value=d[k]||''
 portalAgents=new Map()
 for(const x of (d.agents||[])){
   if(!x||!x.key)continue
   portalAgents.set(x.key,{...x})
 }
 portalAgentCurrent=''
 renderPortalAgentSelect($('portalAgentSearch')?.value||'')
 renderPortalAgentChips()
 if($('portalAgentCard'))$('portalAgentCard').style.display='none'
 for(const [k] of sections)if($('idx-'+k))$('idx-'+k).value=d.index?.[k]||''
 tools=d.tools||[];renderTools()
 renderFaqBuilder()
 for(const key of INDEX_MEDIA_KEYS)updateIdxMediaPreview(key)
 scheduleIndexPreview()
}async function loadProjects(){const d=await api(API),s=$('projectSelect');projectRows=Array.isArray(d.projects)?d.projects.slice():[];s.innerHTML='<option value="">— Nouveau portail —</option>';for(const p of projectRows){const o=document.createElement('option');const pid=String(p&&p.id||'').trim();o.value=pid;o.dataset.projectId=pid;o.textContent=(p&&p.title)||'Nouveau portail';s.appendChild(o)}}
async function ensurePortalRegistered(show=true){const id=slug($('portalId').value||$('short').value||$('title').value),name=($('title').value||$('short').value||'').trim();if(!id||!name){if(show&&$('connectionStatus'))$('connectionStatus').textContent='⚠ Nom et ID du portail requis.';return false}try{const data=await api('/api/portals');const list=Array.isArray(data.portals)?data.portals:[];const existing=list.find(p=>p.id===id);if(existing){if(existing.name!==name||existing.active===false){const next=list.map(p=>p.id===id?{...p,name,active:true}:p);await api('/api/portals',{method:'POST',body:JSON.stringify({portals:next})})}if(show&&$('connectionStatus'))$('connectionStatus').textContent='✓ Portail connecté à la liste centrale et disponible pour Dégustation.';return true}await api('/api/portals/add',{method:'POST',body:JSON.stringify({id,name})});if(show&&$('connectionStatus'))$('connectionStatus').textContent='✓ Portail ajouté à la liste centrale et disponible pour Dégustation.';return true}catch(e){if(show&&$('connectionStatus'))$('connectionStatus').textContent='⚠ Connexion portail : '+e.message;return false}}
async function checkConnections(){const ps=$('portalRegistryStatus'),cs=$('charactersConnectionStatus'),msg=$('connectionStatus');if(ps)ps.textContent='Vérification…';if(cs)cs.textContent='Vérification…';if(msg)msg.textContent='';try{const [meta,chars]=await Promise.all([api('/api/degustations/meta'),api('/api/personnages')]);const id=slug($('portalId').value||$('short').value||$('title').value);const portals=meta.portals||[];const found=id&&portals.some(p=>p.id===id);if(ps)ps.textContent=(id?(found?'✓ '+id+' est relié à Dégustation.':'— '+id+' n’est pas encore enregistré.'):('✓ Dégustation répond · '+portals.length+' portail(s) central(aux).'));const people=chars.personnages||chars.agents||[];if(cs)cs.textContent='✓ Catalogue partagé connecté · '+people.length+' personnage(s).';return{meta,chars,found}}catch(e){if(ps)ps.textContent='⚠ '+e.message;if(cs)cs.textContent='⚠ Connexion non confirmée';if(msg)msg.textContent='Aucune donnée n’a été supprimée.';return null}}
function selectedProjectId(){
 const s=$('projectSelect');if(!s||s.selectedIndex<=0)return'';
 const o=s.options[s.selectedIndex];
 const byData=String(o?.dataset?.projectId||'').trim();
 const byValue=String(o?.value||'').trim();
 const byIndex=String(projectRows[s.selectedIndex-1]?.id||'').trim();
 return byData||byValue||byIndex
}
function syncDeleteButton(){
 const b=$('deleteProjectBtn'),s=$('projectSelect');
 if(!b)return;
 const hasRealSelection=!!(s&&s.selectedIndex>0&&selectedProjectId());
 b.disabled=!hasRealSelection
}
function hasPortalDraftContent(){const d=draft();return !!(String(d.title||'').trim()||String(d.short||'').trim()||String(d.portalId||'').trim()||String(d.workerName||'').trim()||String(d.host||'').trim()||String(d.mission||'').trim()||String(d.loginImage||'').trim()||(d.agents||[]).length||(d.tools||[]).length||Object.values(d.index||{}).some(v=>String(v||'').trim()))}
async function newProject(){if(hasPortalDraftContent()&&!confirm('Abandonner le formulaire actuel et préparer un nouveau portail ?'))return;current='';apply({});$('projectSelect').value='';syncDeleteButton();const st=$('projectSaveState');if(st)st.textContent='Nouveau portail non enregistré.';await checkConnections()}
async function deleteProject(){
 const s=$('projectSelect');
 if(!s||s.selectedIndex<=0)return;
 const row=projectRows[s.selectedIndex-1]||{};
 const option=s.options[s.selectedIndex];
 const id=String(row.id||option?.dataset?.projectId||option?.value||'').trim();
 if(!id){const cs=$('compileStatus');if(cs)cs.textContent='⚠ Impossible d’identifier ce brouillon.';return}
 let displayName=String(row.title||option?.textContent||'Nouveau portail').trim()||'Nouveau portail';
 let portalId='';
 try{
  const info=await api(API+'/'+encodeURIComponent(id));
  const project=info.project||{};
  displayName=String(project.title||displayName).trim()||displayName;
  const d=project.data||{};
  portalId=slug(d.portalId||'');
 }catch(e){
  console.warn('Projet ancien ou vide : suppression directe par ID technique.',e)
 }
 if(!confirm('Supprimer définitivement « '+displayName+' » de Création de Portail ?'))return;
 try{
  await api(API+'/'+encodeURIComponent(id),{method:'DELETE'});
  if(portalId){
   try{await api('/api/portals/remove',{method:'POST',body:JSON.stringify({id:portalId})})}
   catch(e){console.warn('Projet supprimé, mais retrait de la liste centrale non confirmé:',e)}
  }
  if(current===id){current='';apply({})}
  await loadProjects();
  $('projectSelect').selectedIndex=0;
  syncDeleteButton();
  const st=$('projectSaveState');if(st)st.textContent='Portail supprimé.';
  const cs=$('compileStatus');if(cs)cs.textContent='Portail supprimé ✓';
  await checkConnections()
 }catch(e){
  const cs=$('compileStatus');if(cs)cs.textContent='⚠ '+e.message
 }
}
async function save(){const title=String($('title').value||'').trim(),portalId=slug($('portalId').value||'');if(!title)throw Error('Le nom complet du portail est requis avant sauvegarde.');if(!portalId)throw Error('L’ID portail est requis avant sauvegarde.');$('title').value=title;$('portalId').value=portalId;const payload={title:title,data:draft()};const d=current?await api(API+'/'+current,{method:'PUT',body:JSON.stringify(payload)}):await api(API,{method:'POST',body:JSON.stringify(payload)});current=d.project.id;await loadProjects();$('projectSelect').value=current;syncDeleteButton();await ensurePortalRegistered(false);await checkConnections();return d.project}
async function open(){const id=$('projectSelect').value;if(!id)return;const d=await api(API+'/'+id);current=id;syncDeleteButton();const converted=normalizeLegacyProject(d.project.data||{},d.project||{});apply(converted);const st=$('projectSaveState');if(st)st.textContent='Projet chargé · anciennes données converties à l’écran si nécessaire. Clique Sauvegarder seulement après vérification.';await checkConnections()}
function addTool(){tools.push({id:crypto.randomUUID().replace(/-/g,'').slice(0,12),name:'',icon:'🧰',path:'/outil.html',content:''});renderTools()}
function renderTools(){const h=$('tools');h.innerHTML='';tools.forEach(t=>{const d=document.createElement('div');d.className='tool';d.innerHTML='<input data-k="name" value="'+esc(t.name||'')+'" placeholder="Nom"><input data-k="path" value="'+esc(t.path||'')+'" placeholder="/outil.html"><input type="file" accept=".html,text/html"><button class="btn danger">Retirer</button>';const ins=d.querySelectorAll('input[data-k]');ins.forEach(i=>i.oninput=()=>t[i.dataset.k]=i.value);d.querySelector('input[type=file]').onchange=async e=>{const f=e.target.files[0];if(f)t.content=await f.text()};d.querySelector('button').onclick=()=>{tools=tools.filter(x=>x!==t);renderTools()};h.appendChild(d)})}
function b64(s){const u=new TextEncoder().encode(s);let b='';u.forEach(x=>b+=String.fromCharCode(x));return btoa(b)}
function media(url){url=String(url||'').trim();if(!url)return'';if(/youtube\.com|youtu\.be|drive\.google\.com|\.mp4(?:\?|$)|\.webm(?:\?|$)/i.test(url)){let src=url,m=url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);if(m)src='https://www.youtube.com/embed/'+m[1];const g=url.match(/drive\.google\.com\/file\/d\/([^/]+)/);if(g)src='https://drive.google.com/file/d/'+g[1]+'/preview';return '<iframe src="'+esc(src)+'" allow="autoplay; fullscreen" loading="lazy"></iframe>'}return '<img src="'+esc(url)+'" alt="">'}
function faq(v){try{return JSON.parse(v||'[]').map(x=>'<div class="faq-item"><button class="faq-q">'+esc(x.q||'')+'</button><div class="faq-a"><p>'+esc(x.a||'')+'</p></div></div>').join('')}catch(_){return''}}
function fillIndex(s,p){const i=p.index||{},map={'__PORTAL_TITLE__':p.title||'Portail NyXia','__PORTAL_MISSION__':p.mission||'','__INDEX_HEADER_SOCIALS__':i.headerSocials||'','__INDEX_HEADER_CTA_LABEL__':i.headerCtaLabel||'Découvrir','__INDEX_HEADER_CTA_URL__':i.headerCtaUrl||'#','__INDEX_HERO_EYEBROW__':i.heroEyebrow||'Univers NyXia','__INDEX_HERO_TITLE__':i.heroTitle||p.title,'__INDEX_HERO_SUBTITLE__':i.heroSubtitle||'','__INDEX_HERO_TEXT__':i.heroText||p.mission,'__INDEX_HERO_NOTE__':i.heroNote||'','__INDEX_HERO_CTA_LABEL__':i.heroCtaLabel||'Entrer','__INDEX_HERO_CTA_URL__':i.heroCtaUrl||'/login.html','__INDEX_HERO_MEDIA__':media(i.heroMedia),'__INDEX_S2_KICKER__':'','__INDEX_S2_TITLE__':'','__INDEX_S2_TEXT__':i.s2||'','__INDEX_S2_MEDIA__':media(i.s2Media),'__INDEX_S3_MEDIA__':media(i.s3Media),'__INDEX_S45_KICKER__':'','__INDEX_S45_TITLE__':'','__INDEX_S45_TEXT__':i.s45||'','__INDEX_S45_MEDIA__':media(i.s45Media),'__INDEX_S67_KICKER__':'','__INDEX_S67_TITLE__':'','__INDEX_S67_TEXT__':i.s67||'','__INDEX_S67_MEDIA__':media(i.s67Media),'__INDEX_S89_KICKER__':'Formation Vivante','__INDEX_S89_TITLE__':'','__INDEX_S89_TEXT__':i.s89||'','__INDEX_S89_MEDIA__':media(i.s89Media),'__INDEX_S1011_KICKER__':'','__INDEX_S1011_TITLE__':'','__INDEX_S1011_TEXT__':i.s1011||'','__INDEX_S1011_MEDIA__':media(i.s1011Media),'__INDEX_S1213_KICKER__':'Atelier','__INDEX_S1213_TITLE__':'','__INDEX_S1213_TEXT__':i.s1213||'','__INDEX_S1213_MEDIA__':media(i.s1213Media),'__INDEX_S1415_KICKER__':'Résultats','__INDEX_S1415_TITLE__':'','__INDEX_S1415_TEXT__':i.s1415||'','__INDEX_S1415_MEDIA__':media(i.s1415Media),'__INDEX_MARQUEE__':i.marquee||'','__INDEX_SOCIAL_KICKER__':'La preuve sociale','__INDEX_SOCIAL_TITLE__':'','__INDEX_SOCIAL_TEXT__':i.socialProof||'','__INDEX_SOCIAL_MEDIA__':media(i.socialProofMedia),'__INDEX_TOOLS_KICKER__':'Boîte à outils','__INDEX_TOOLS_TITLE__':'','__INDEX_TOOLS_TEXT__':i.toolsText||'','__INDEX_TOOLS_MEDIA__':media(i.toolsMedia),'__INDEX_TRANS_KICKER__':'','__INDEX_TRANS_TITLE__':'','__INDEX_TRANS_TEXT__':i.transformText||'','__INDEX_TRANS_MEDIA__':media(i.transformMedia),'__INDEX_FAQ_TITLE__':'Questions fréquentes','__INDEX_FAQ_ITEMS__':faq(i.faq),'__INDEX_CTA_KICKER__':'','__INDEX_CTA_TITLE__':i.ctaTitle||'','__INDEX_CTA_TEXT__':i.ctaText||'','__INDEX_CTA_LABEL__':i.ctaLabel||'Prendre rendez-vous','__INDEX_CTA_URL__':i.ctaUrl||'#','__INDEX_FOOTER_SOCIALS__':i.footerSocials||'','__INDEX_FOOTER_SIGN__':i.footerSign||'✨ Univers NyXia ✨'};for(const [k,v] of Object.entries(map))s=s.split(k).join(String(v));return s}
async function compile(){try{const pr=await save(),p=pr.data;const registered=await ensurePortalRegistered(false);if(!registered)throw Error('Le portail n’a pas pu être relié à la liste centrale / Dégustation.');const r=await fetch('/superadmin4/portail-shell-template.zip',{cache:'no-store'});if(!r.ok)throw Error('Coque introuvable');const z=await JSZip.loadAsync(await r.arrayBuffer()),agents=p.agents||[];if(!agents.length)throw Error('Choisis au moins un personnage pour ce portail.');const cfg={id:p.portalId||slug(p.short||p.title),title:p.title,shortTitle:p.short||p.title,mission:p.mission,loginImage:p.loginImage,activeAgents:agents.map(a=>a.key),agents};let w=await z.file('_worker.js').async('string');w=w.replace("const PORTAL_CONFIG_B64='__PORTAL_CONFIG_B64__';","const PORTAL_CONFIG_B64='"+b64(JSON.stringify(cfg))+"';");z.file('_worker.js',w);let wr=await z.file('wrangler.toml').async('string');wr=wr.replaceAll('__WORKER_NAME__',p.workerName||slug(p.short||p.title)).replaceAll('__HOST__',p.host).replaceAll('__PORTAL_ID__',cfg.id);z.file('wrangler.toml',wr);let ind=await z.file('index.html').async('string');z.file('index.html',fillIndex(ind,p));let log=await z.file('login.html').async('string');log=log.replaceAll('__PORTAL_TITLE__',p.title).replaceAll('__PORTAL_SHORT_TITLE__',p.short||p.title).replaceAll('__PORTAL_LOGIN_IMAGE__',p.loginImage||'');z.file('login.html',log);const pages={},meta={};const principals=agents.filter(a=>(a.placement||'principal')==='principal');const atelierAgents=agents.filter(a=>a.placement==='atelier');const visibleAgents=agents.filter(a=>a.placement!=='hidden');let chat=await z.file('chat-base.html').async('string');for(const a of visibleAgents){pages[a.key]='/chat-'+a.key+'.html';meta[a.key]=a;let c=chat.replaceAll('__PORTAL_TITLE__',p.title).replaceAll('__PORTAL_TITLE_JSON__',JSON.stringify(p.title)).replaceAll('__AGENT_KEY__',a.key).replaceAll('__AGENT_NAME__',esc(a.name)).replaceAll('__AGENT_SUB__',esc(a.sub||'Personnage NyXia')).replaceAll('__AGENT_JSON__',JSON.stringify(a)).replaceAll('__AGENT_NAME_JSON__',JSON.stringify(a.name)).replaceAll('__AGENT_SUB_JSON__',JSON.stringify(a.sub||'Personnage NyXia')).replaceAll('__AGENT_GREETING_JSON__',JSON.stringify(a.greeting||'Je suis là. Dis-moi ce que tu veux faire avancer dans ce portail.')).replaceAll('__AGENT_IMAGE_JSON__',JSON.stringify(a.image||'')).replaceAll('__AGENT_VIDEO_JSON__',JSON.stringify(a.welcomeVideo||'')).replaceAll('__AGENT_AVATAR_HTML__',a.image?'<img src="'+esc(a.image)+'" alt="'+esc(a.name)+'">':'<span class="avatar-fallback">✦</span>');z.file('chat-'+a.key+'.html',c)}z.remove('chat-base.html');for(const t of p.tools||[]){if(t.content)z.file((t.path||'/outil.html').replace(/^\//,''),t.content);pages['tool-'+t.id]=t.path}let dash=await z.file('dashbord.html').async('string');const avatarHtml=a=>a.image?'<img class="nav-avatar" src="'+esc(a.image)+'" alt="'+esc(a.name)+'">':'<span class="nav-avatar" style="display:flex;align-items:center;justify-content:center">'+esc(a.icon||'✦')+'</span>';const nav=principals.map((a,i)=>'<div class="nav-item'+(i===0?' active':'')+'" id="nav-'+a.key+'" onclick="openAgentTab(\''+a.key+'\')">'+avatarHtml(a)+'<span class="nav-text"><span class="nav-name">'+esc(a.name)+'</span><span class="nav-sub">'+esc(a.sub||'')+'</span></span><span class="nav-arrow">›</span></div>').join('');const atelierNav=atelierAgents.map(a=>'<div class="nav-item" id="nav-'+a.key+'" onclick="openAgentTab(\''+a.key+'\')">'+avatarHtml(a)+'<span class="nav-text"><span class="nav-name">'+esc(a.name)+'</span><span class="nav-sub">'+esc(a.sub||'')+'</span></span><span class="nav-arrow">›</span></div>').join('');const toolnav=(p.tools||[]).map(t=>'<div class="nav-item" id="nav-tool-'+t.id+'" onclick="openAgentTab(\'tool-'+t.id+'\')"><span class="nav-icon">'+esc(t.icon||'🧰')+'</span><span class="nav-text"><span class="nav-name">'+esc(t.name||'Outil')+'</span></span><span class="nav-arrow">›</span></div>').join('');dash=dash.replaceAll('__PORTAL_SHORT_TITLE__',p.short||p.title).replaceAll('__PORTAL_AGENT_NAV__',nav).replaceAll('__PORTAL_ATELIER_NAV__',atelierNav).replaceAll('__PORTAL_SPECIAL_TOOLS__',toolnav).replaceAll('__PORTAL_AGENT_PAGES__','').replaceAll('__PORTAL_PAGES_JSON__',JSON.stringify(pages)).replaceAll('__PORTAL_AGENT_META_JSON__',JSON.stringify(meta)).replaceAll('__PORTAL_DEFAULT_AGENT_JSON__',JSON.stringify((principals[0]||visibleAgents[0]||agents[0]).key)).replaceAll('__PORTAL_ATELIER_KEYS_JSON__',JSON.stringify(atelierAgents.map(a=>a.key))).replaceAll('__PORTAL_TITLE__',p.title);
z.file('dashbord.html',dash);

/* Compile aussi les JS externes de la coque.
   Depuis que le CSS/JS sont classés dans /css et /js, les marqueurs ne sont plus
   tous dans le HTML : ils DOIVENT être remplacés ici avant génération du ZIP. */
const dashboardJsFile=z.file('js/dashboard.js');
if(!dashboardJsFile)throw Error('Coque incomplète : /js/dashboard.js manque.');
let dashboardJs=await dashboardJsFile.async('string');
dashboardJs=dashboardJs
  .replaceAll('__PORTAL_PAGES_JSON__',JSON.stringify(pages))
  .replaceAll('__PORTAL_AGENT_META_JSON__',JSON.stringify(meta))
  .replaceAll('__PORTAL_DEFAULT_AGENT_JSON__',JSON.stringify((principals[0]||visibleAgents[0]||agents[0]).key))
  .replaceAll('__PORTAL_ATELIER_KEYS_JSON__',JSON.stringify(atelierAgents.map(a=>a.key)))
  .replaceAll('__PORTAL_TITLE__',p.title||'Portail NyXia')
  .replaceAll('__PORTAL_SHORT_TITLE__',p.short||p.title||'Portail NyXia');
z.file('js/dashboard.js',dashboardJs);

/* Même principe pour chaque chat : les marqueurs d'identité sont maintenant
   dans /js/chat.js, pas seulement dans chat-base.html. On crée donc un JS
   propre à chaque personnage et le chat généré pointe vers ce fichier. */
const chatJsTemplateFile=z.file('js/chat.js');
if(!chatJsTemplateFile)throw Error('Coque incomplète : /js/chat.js manque.');
const chatJsTemplate=await chatJsTemplateFile.async('string');
for(const a of visibleAgents){
  const agentJsName='js/chat-'+a.key+'.js';
  let agentJs=chatJsTemplate
    .replaceAll('__PORTAL_TITLE__',p.title||'Portail NyXia')
    .replaceAll('__AGENT_KEY__',a.key)
    .replaceAll('__AGENT_NAME_JSON__',JSON.stringify(a.name||a.key))
    .replaceAll('__AGENT_SUB_JSON__',JSON.stringify(a.sub||'Personnage NyXia'))
    .replaceAll('__AGENT_GREETING_JSON__',JSON.stringify(a.greeting||'Je suis là. Dis-moi ce que tu veux faire avancer dans ce portail.'))
    .replaceAll('__AGENT_IMAGE_JSON__',JSON.stringify(a.image||''))
    .replaceAll('__AGENT_VIDEO_JSON__',JSON.stringify(a.welcomeVideo||''))
    .replaceAll('__AGENT_JSON__',JSON.stringify(a));
  z.file(agentJsName,agentJs);

  const chatName='chat-'+a.key+'.html';
  let chatHtml=await z.file(chatName).async('string');
  chatHtml=chatHtml.replace('/js/chat.js','/'+agentJsName);
  z.file(chatName,chatHtml);
}
z.remove('js/chat.js');

z.file('portal-manifest.json',JSON.stringify({...cfg,host:p.host,workerName:p.workerName,compiledAt:new Date().toISOString()},null,2));
/* Validation finale : aucun marqueur de compilation ne doit sortir dans le ZIP. */
for(const requiredPath of ['dashbord.html','js/dashboard.js']){
  const f=z.file(requiredPath);
  if(!f)throw Error('Coque incomplète : '+requiredPath+' manque.');
  const txt=await f.async('string');
  if(/__PORTAL_[A-Z0-9_]+__/.test(txt))throw Error('Compilation incomplète : marqueur non remplacé dans '+requiredPath);
}
for(const a of visibleAgents){
  for(const requiredPath of ['chat-'+a.key+'.html','js/chat-'+a.key+'.js']){
    const f=z.file(requiredPath);
    if(!f)throw Error('Chat incomplet pour '+a.name+' : '+requiredPath+' manque.');
    const txt=await f.async('string');
    if(/__(?:PORTAL|AGENT)_[A-Z0-9_]+__/.test(txt))throw Error('Compilation incomplète : marqueur non remplacé dans '+requiredPath);
  }
}
const blob=await z.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:9}}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='Portail-'+slug(p.short||p.title)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(u),20000);$('compileStatus').textContent='ZIP prêt ✓ · portail relié à Dégustation'}catch(e){$('compileStatus').textContent='⚠ '+e.message}}
function bind(){
 if($('indexDesktopBtn'))$('indexDesktopBtn').onclick=()=>setIndexDevice('desktop')
 if($('indexMobileBtn'))$('indexMobileBtn').onclick=()=>setIndexDevice('mobile')
 if($('indexRefreshBtn'))$('indexRefreshBtn').onclick=refreshIndexPreview
 if($('indexAdvancedBtn'))$('indexAdvancedBtn').onclick=()=>{
   indexAdvanced=!indexAdvanced
   document.querySelector('.index-builder-card')?.classList.toggle('advanced',indexAdvanced)
   $('indexAdvancedBtn').textContent=indexAdvanced?'✓ Mode avancé':'</> Mode avancé'
 }
 if($('indexResetSectionBtn'))$('indexResetSectionBtn').onclick=resetIndexSection

 if($('portalAgentSearch'))$('portalAgentSearch').oninput=e=>renderPortalAgentSelect(e.target.value)
 if($('portalAgentSelect'))$('portalAgentSelect').onchange=e=>selectPortalAgent(e.target.value)
 if($('portalAgentAddBtn'))$('portalAgentAddBtn').onclick=addPortalAgent
 if($('portalAgentRemoveBtn'))$('portalAgentRemoveBtn').onclick=removePortalAgent
 for(const id of ['portalAgentPlacement','portalAgentImage','portalAgentVideo','portalAgentVoice']){
   if($(id))$(id).addEventListener('change',savePortalAgentEditor)
 }
$('saveProjectBtn').onclick=async()=>{try{await save();const st=$('projectSaveState');if(st)st.textContent='Portail sauvegardé ✓'}catch(e){const st=$('projectSaveState');if(st)st.textContent='⚠ '+e.message;const cs=$('compileStatus');if(cs)cs.textContent='⚠ '+e.message}};$('openProjectBtn').onclick=open;$('newProjectBtn').onclick=newProject;if($('deleteProjectBtn'))$('deleteProjectBtn').onclick=deleteProject;$('compileBtn').onclick=compile;$('addToolBtn').onclick=addTool;if($('checkConnectionsBtn'))$('checkConnectionsBtn').onclick=checkConnections;if($('registerPortalBtn'))$('registerPortalBtn').onclick=async()=>{await ensurePortalRegistered(true);await checkConnections()};$('logoutBtn').onclick=()=>location.href='/';for(const id of ['portalId','short','title'])if($(id))$(id).addEventListener('change',checkConnections);
 for(const id of ['title','mission'])if($(id))$(id).addEventListener('input',scheduleIndexPreview);if($('projectSelect'))$('projectSelect').addEventListener('change',()=>{syncDeleteButton();const st=$('projectSaveState');if(st&&$('projectSelect').selectedIndex>0)st.textContent='Portail sélectionné · Ouvrir pour modifier, ou Supprimer directement.'})}document.addEventListener('DOMContentLoaded',async()=>{indexUI();bind();await load();syncDeleteButton();await checkConnections()})})();
