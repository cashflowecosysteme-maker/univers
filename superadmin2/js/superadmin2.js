(function(){
'use strict';
const API='/api/superadmin2';
const TOKEN_KEY='nyxia_super2_token';
const REFRESH_KEY='nyxia_super2_refresh';
const CHAR_KEYS=['nyxia','diane','eric','lena','selena','kael','alex'];
const CHAR_NAMES={nyxia:'NyXia',diane:'Diane',eric:'Éric',lena:'Léna',selena:'Séléna',kael:'Kael',alex:'Alex'};
let TOKEN=sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||'';
let REFRESH=localStorage.getItem(REFRESH_KEY)||'';
const STATE={events:[],settings:null,bindings:{},plan:null,currentEvent:null,heartMedia:[],videoPost:null,videoScenes:[],activeScene:0,chatHistory:[],chatBrief:'',lastChatAnswer:'',radarItems:[],performance:[],performanceSummary:null,lastMedia:null,apiTools:[],apiEditing:null,apiRunTool:null};

const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg,ok=true){const t=$('toast');t.textContent=msg;t.className='toast '+(ok?'ok':'err');t.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hidden'),4200)}
function fmtDate(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('fr-CA')}catch(_){return v}}
function uid(prefix=''){return prefix+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2))}

async function readJsonResponse(r){
  const text=await r.text();
  if(!text)return {};
  try{return JSON.parse(text)}catch(_){return {error:'Réponse serveur invalide.',detail:text.slice(0,500)}}
}
async function api(path,method='GET',body){
  const opts={
    method,
    credentials:'same-origin',
    headers:{
      'Accept':'application/json',
      'X-Univers-Token':TOKEN||'',
      'X-Univers-Refresh':REFRESH||''
    }
  };
  if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
  const r=await fetch(API+path,opts);
  const d=await readJsonResponse(r);
  if(r.status===401){
    TOKEN='';
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    throw new Error(d.error||'Session expirée');
  }
  if(!r.ok)throw new Error(d.detail||d.error||('Erreur '+r.status));
  return d;
}
async function checkAuth(){
  let d;

  // Vérifie la connexion SEULEMENT.
  try{
    d=await api('/check-auth','POST',{});
  }catch(e){
    console.error('Vérification de session Super Admin 2 :',e);
    if(TOKEN||REFRESH){
      showApp();
      try{
        await init();
      }catch(initErr){
        console.error('Chargement Super Admin 2 :',initErr);
        showApp();
        try{toast('Connexion conservée. Un élément du tableau de bord n’a pas pu charger.',false)}catch(_){}
      }
      return true;
    }
    showLogin();
    return false;
  }

  if(!d||!d.valid){
    TOKEN='';
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    return false;
  }

  if(d.token){
    TOKEN=d.token;
    sessionStorage.setItem(TOKEN_KEY,TOKEN);
    localStorage.setItem(TOKEN_KEY,TOKEN);
  }
  if(d.refreshToken){
    REFRESH=d.refreshToken;
    localStorage.setItem(REFRESH_KEY,REFRESH);
  }

  // À partir d'ici la connexion EST valide.
  // Une erreur dans le chargement du dashboard ne doit jamais renvoyer au mot de passe.
  showApp();
  try{
    await init();
  }catch(e){
    console.error('Chargement Super Admin 2 :',e);
    showApp();
    try{toast('Tu es bien connectée. Un élément du tableau de bord n’a simplement pas pu charger.',false)}catch(_){}
  }
  return true;
}
function showLogin(){$('login').classList.remove('hidden');$('app').classList.add('hidden')}
function showApp(){$('login').classList.add('hidden');$('app').classList.remove('hidden')}
async function doLogin(){
  const pw=$('loginPassword').value;$('loginMsg').textContent='Connexion…';
  try{
    const r=await fetch(API+'/login',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Accept':'application/json','Content-Type':'application/json'},
      body:JSON.stringify({password:pw})
    });
    const d=await readJsonResponse(r);
    if(!r.ok)throw new Error(d.error||d.detail||('Connexion refusée ('+r.status+')'));
    TOKEN=d.token||'';
    REFRESH=d.refreshToken||REFRESH||'';
    if(TOKEN){
      sessionStorage.setItem(TOKEN_KEY,TOKEN);
      localStorage.setItem(TOKEN_KEY,TOKEN);
    }
    if(REFRESH){
      localStorage.setItem(REFRESH_KEY,REFRESH);
    }
    $('loginMsg').textContent='';
    showApp();
    await init();
  }catch(e){$('loginMsg').textContent=e.message}
}
async function doLogout(){
  try{await api('/logout','POST',{})}catch(_){}
  TOKEN='';
  REFRESH='';
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  showLogin();
}

function switchView(name){
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
  if(name==='creator')refreshCreatorSelect();
  if(name==='chat'){refreshContextSelects();loadChat()}
  if(name==='radar')refreshContextSelects();
  if(name==='resources')renderResourceTarget();
  if(name==='performance'){refreshContextSelects();loadPerformance()}
  if(name==='labo')loadApiTools();
}

async function init(){
  await Promise.all([loadSettings(),loadEvents()]);
  await loadSelectedPlan();
  renderAll();
}

async function loadSettings(){const d=await api('/settings');STATE.settings=d.settings;STATE.bindings=d.bindings||{};renderSettings();renderBindings()}
async function saveSettings(){
  const refs={};CHAR_KEYS.forEach(k=>refs[k]=$('char-'+k).value.trim());
  const body={
    brainModel:$('setBrainModel').value.trim(),controlModel:$('setControlModel').value.trim(),imageModel:$('setImageModel').value.trim(),imageFallbackModel:$('setImageFallback').value.trim(),videoModel:$('setVideoModel').value.trim(),
    strictControl:$('setStrictControl').checked,imageGenerationEnabled:$('setImageEnabled').checked,paidVideoGenerationEnabled:$('setPaidVideoEnabled').checked,
    brand:{name:'NyXia',night:$('setNight').value.trim(),violet:$('setViolet').value.trim(),lavender:$('setLavender').value.trim(),gold:$('setGold').value.trim(),visualRule:$('setVisualRule').value.trim(),backgroundVideoUrl:$('setBackgroundVideo').value.trim(),characterReferences:refs}
  };
  try{const d=await api('/settings','POST',body);STATE.settings=d.settings;STATE.bindings=d.bindings||STATE.bindings;renderSettings();renderBindings();toast('Réglages NyXia enregistrés.')}catch(e){toast(e.message,false)}
}
function renderSettings(){
  const s=STATE.settings;if(!s)return;const b=s.brand||{};
  $('setBrainModel').value=s.brainModel||'';$('setControlModel').value=s.controlModel||'';$('setImageModel').value=s.imageModel||'';$('setImageFallback').value=s.imageFallbackModel||'';$('setVideoModel').value=s.videoModel||'';
  $('setStrictControl').checked=s.strictControl!==false;$('setImageEnabled').checked=s.imageGenerationEnabled!==false;$('setPaidVideoEnabled').checked=s.paidVideoGenerationEnabled===true;
  if($('statPaidVideo')){$('statPaidVideo').textContent=s.paidVideoGenerationEnabled?'ON · manuel':'OFF';$('statPaidVideo').style.color=s.paidVideoGenerationEnabled?'var(--gold)':'var(--green)'}
  $('setNight').value=b.night||'#060A18';$('setViolet').value=b.violet||'#7B5CFF';$('setLavender').value=b.lavender||'#A78BFA';$('setGold').value=b.gold||'#F4C86A';$('setVisualRule').value=b.visualRule||'';$('setBackgroundVideo').value=b.backgroundVideoUrl||'';
  renderPalette();
  const box=$('characterRefs');box.innerHTML=CHAR_KEYS.map(k=>`<div><label class="f">${CHAR_NAMES[k]}</label><img src="${esc((b.characterReferences||{})[k]||'')}" alt="${CHAR_NAMES[k]}" style="width:72px;height:72px;object-fit:cover;border-radius:12px;border:1px solid var(--line);display:block;margin-bottom:7px"><input class="f" id="char-${k}" value="${esc((b.characterReferences||{})[k]||'')}"></div>`).join('');
  renderBackgroundPreview();
}
function renderPalette(){const vals=[['Nuit',$('setNight').value],['Violet',$('setViolet').value],['Lavande',$('setLavender').value],['Doré',$('setGold').value]];$('palettePreview').innerHTML=vals.map(x=>`<div class="swatch" style="background:${esc(x[1])}">${esc(x[0])}<br>${esc(x[1])}</div>`).join('')}
function renderBackgroundPreview(){const url=$('setBackgroundVideo').value.trim();$('backgroundPreview').innerHTML=url?`<video src="${esc(url)}" muted loop autoplay playsinline style="width:min(220px,100%);aspect-ratio:9/16;object-fit:cover;border-radius:15px;border:1px solid var(--line)"></video>`:`<div class="strong-note">Aucun fond officiel configuré. L’export vidéo restera bloqué jusqu’à ce que ton ciel étoilé + étoiles filantes soit défini.</div>`}
function renderBindings(){
  const map={kv:'CASHFLOW_KV',mediaBucket:'R2 MEDIA_BUCKET',aimlapi:'AIMLAPI_CREATOR_KEY',pexels:'PEXELS_KEY',pixabayImages:'PIXABAY images',pixabayVideo:'PIXABAY vidéo',unsplash:'Unsplash',openverse:'Openverse API (sans clé)',freesound:'FREESOUND_API_KEY',youtube:'YOUTUBE_API_KEY',browser:'Cloudflare BROWSER',images:'Cloudflare IMAGES'};
  $('bindingGrid').innerHTML=Object.keys(map).map(k=>`<div class="binding"><span class="badge ${STATE.bindings[k]?'green':'red'}">${STATE.bindings[k]?'✓ actif':'✕ absent'}</span><div style="margin-top:6px;font-weight:800">${map[k]}</div></div>`).join('')
}

async function loadEvents(){const d=await api('/events');STATE.events=d.events||[];renderEvents();refreshCreatorSelect();refreshContextSelects();renderStats()}
function renderStats(){
  $('statEvents').textContent=STATE.events.length;$('statLocked').textContent=STATE.events.filter(e=>e.locked).length;
  $('statPosts').textContent=STATE.plan&&STATE.plan.posts?STATE.plan.posts.length:0;
  if($('statPaidVideo')&&STATE.settings){$('statPaidVideo').textContent=STATE.settings.paidVideoGenerationEnabled?'ON · manuel':'OFF';$('statPaidVideo').style.color=STATE.settings.paidVideoGenerationEnabled?'var(--gold)':'var(--green)'}
}
function eventCard(e){
  const cls=e.locked?'green':'yellow';
  return `<div class="event-card"><h3>${esc(e.name)}</h3><p>${esc((e.exactTheme||'').slice(0,150))}</p><div class="meta"><span class="badge ${cls}">${e.locked?'🔒 verrouillée':'✏️ modifiable'}</span><span class="badge violet">${fmtDate(e.eventStart)} → ${fmtDate(e.eventEnd)}</span><span class="badge">${esc(e.publishTime||'')}</span></div><div class="actions"><button class="btn ghost small" data-edit-event="${esc(e.id)}">Modifier / voir</button>${e.locked?`<button class="btn gold small" data-use-event="${esc(e.id)}">Créer</button>`:''}<button class="btn ghost small" data-duplicate-event="${esc(e.id)}">Dupliquer</button></div></div>`
}
function renderEvents(){
  const html=STATE.events.length?STATE.events.map(eventCard).join(''):`<div class="strong-note">Aucun événement pour l’instant. Crée la première Fiche Maîtresse.</div>`;
  $('eventList').innerHTML=html;$('dashboardEvents').innerHTML=STATE.events.slice(0,4).map(eventCard).join('')||html;
  document.querySelectorAll('[data-edit-event]').forEach(b=>b.onclick=()=>openEvent(b.dataset.editEvent));
  document.querySelectorAll('[data-use-event]').forEach(b=>b.onclick=()=>{switchView('creator');$('creatorEvent').value=b.dataset.useEvent;loadPlan(b.dataset.useEvent)});
  document.querySelectorAll('[data-duplicate-event]').forEach(b=>b.onclick=()=>duplicateEvent(b.dataset.duplicateEvent));
}
function refreshCreatorSelect(){
  const sel=$('creatorEvent');const old=sel.value;const locked=STATE.events.filter(e=>e.locked);
  sel.innerHTML='<option value="">Choisir…</option>'+locked.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  if(locked.some(e=>e.id===old))sel.value=old;else if(locked.length)sel.value=locked[0].id;
}

function refreshContextSelects(){
  const fill=(id,allowGeneral=true)=>{const el=$(id);if(!el)return;const old=el.value;let h=allowGeneral?'<option value="general">Général — aucune campagne</option>':'';h+=STATE.events.map(e=>`<option value="${esc(e.id)}">${e.locked?'🔒 ':''}${esc(e.name)}</option>`).join('');el.innerHTML=h;if([...el.options].some(o=>o.value===old))el.value=old;else if(!allowGeneral&&STATE.events.length)el.value=STATE.events[0].id};
  fill('chatEvent',true);fill('perfEvent',true);
}
async function duplicateEvent(id){try{await api('/event/duplicate','POST',{id});await loadEvents();toast('Événement dupliqué.')}catch(e){toast(e.message,false)}}
function blankMedia(type='image'){return{id:uid('media-'),type,url:'',storageKey:'',originalName:'',source:'manual',role:'secondaire',label:'',priority:STATE.heartMedia.length+1,frequency:'relevant',position:'free',canCrop:true,canCut:true,canOverlayText:true,audio:'free',note:''}}
function openEvent(id){
  let e=STATE.events.find(x=>x.id===id)||null;STATE.currentEvent=e;STATE.heartMedia=e?JSON.parse(JSON.stringify(e.mediaHeart||[])):[];
  $('eventModalTitle').textContent=e?(e.locked?'🔒 '+e.name:'Modifier — '+e.name):'Nouvel événement';
  $('eventId').value=e?e.id:'';$('evName').value=e?e.name:'';$('evStart').value=e?e.eventStart:'';$('evEnd').value=e?e.eventEnd:'';$('evContentStart').value=e?e.contentStart:'';$('evContentEnd').value=e?e.contentEnd:'';$('evTime').value=e&&e.publishTime?e.publishTime:'19:30';
  $('evFacebook').checked=e?!!e.platforms.facebook:true;$('evTikTok').checked=e?!!e.platforms.tiktok:true;$('evFacebookImage').checked=e?e.formats.facebookImage!==false:true;$('evShortVideo').checked=e?e.formats.shortVideo!==false:true;
  $('evTheme').value=e?e.exactTheme:'';$('evAudience').value=e?e.audience:'';$('evPromise').value=e?e.promise:'';$('evReality').value=e?e.eventReality:'';$('evDay1').value=e?e.day1:'';$('evDay2').value=e?e.day2:'';$('evDay3').value=e?e.day3:'';$('evCta').value=e?e.cta:'';$('evMandatory').value=e?e.mandatory:'';$('evForbidden').value=e?e.forbidden:'';$('evStudioRole').value=e?e.studioPromptRole:'';$('evVip').value=e?e.vip:'';$('evNotes').value=e?e.notes:'';
  setEventLockedUI(e&&e.locked);renderHeartMedia();$('eventModal').classList.remove('hidden')
}
function closeEvent(){$('eventModal').classList.add('hidden');STATE.currentEvent=null;STATE.heartMedia=[]}
function setEventLockedUI(locked){
  $('saveEventBtn').textContent=locked?'🔓 Déverrouiller pour modifier':'Enregistrer';$('saveEventBtn').className='btn '+(locked?'gold':'');
  $('saveEventBtn').dataset.locked=locked?'1':'0';
  $('eventModal').querySelectorAll('input,textarea,select').forEach(el=>{if(el.id!=='eventId')el.disabled=!!locked});
  $('addHeartMediaBtn').disabled=!!locked;$('uploadHeartMediaBtn').disabled=!!locked;
}
function collectMediaFromDom(){
  document.querySelectorAll('.media-row').forEach(row=>{const i=Number(row.dataset.index),m=STATE.heartMedia[i];if(!m)return;const get=k=>row.querySelector('[data-k="'+k+'"]');m.type=get('type').value;m.url=get('url').value.trim();m.role=get('role').value;m.label=get('label').value.trim();m.priority=Number(get('priority').value)||i+1;m.frequency=get('frequency').value;m.position=get('position').value;m.canCrop=get('canCrop').checked;m.canCut=get('canCut').checked;m.canOverlayText=get('canOverlayText').checked;m.audio=get('audio').value;m.note=get('note').value.trim()})
}
function renderHeartMedia(){
  const box=$('heartMediaEditor');if(!STATE.heartMedia.length){box.innerHTML='<div class="subtle">Aucun média cœur. Tu peux en ajouter plusieurs.</div>';return}
  const locked=STATE.currentEvent&&STATE.currentEvent.locked;
  box.innerHTML=STATE.heartMedia.map((m,i)=>`<div class="media-row" data-index="${i}"><div class="media-row-head"><div style="display:flex;gap:10px;align-items:center"><span class="drag-handle">☰</span>${m.url?(m.type==='video'?`<video class="media-preview" src="${esc(m.url)}" muted></video>`:`<img class="media-preview" src="${esc(m.url)}">`):'<div class="media-preview"></div>'}<div><strong>${esc(m.label||('Média '+(i+1)))}</strong><div class="subtle">Priorité ${esc(m.priority||i+1)} · ${esc(m.source||'manual')}</div></div></div>${locked?'':`<button class="btn red small" data-remove-media="${i}">Retirer</button>`}</div><div class="grid4"><div><label class="f">Type</label><select class="f" data-k="type"><option value="image" ${m.type==='image'?'selected':''}>Image</option><option value="video" ${m.type==='video'?'selected':''}>Vidéo</option></select></div><div><label class="f">Rôle</label><select class="f" data-k="role">${[['principal','Principal'],['secondaire','Secondaire'],['cta','CTA'],['demonstration','Démonstration'],['temoignage','Témoignage'],['ambiance','Ambiance'],['character-reference','Référence personnage']].map(x=>`<option value="${x[0]}" ${m.role===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div><div><label class="f">Priorité</label><input class="f" data-k="priority" type="number" min="1" value="${esc(m.priority||i+1)}"></div><div><label class="f">Fréquence</label><select class="f" data-k="frequency">${[['always','Toujours'],['often','Souvent'],['sometimes','Parfois'],['relevant','Si pertinent']].map(x=>`<option value="${x[0]}" ${m.frequency===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div><div style="grid-column:1/-1"><label class="f">URL</label><input class="f" data-k="url" value="${esc(m.url||'')}"></div><div><label class="f">Nom / étiquette</label><input class="f" data-k="label" value="${esc(m.label||'')}"></div><div><label class="f">Position</label><select class="f" data-k="position">${[['start','Début'],['middle','Milieu'],['end','Fin'],['free','Libre']].map(x=>`<option value="${x[0]}" ${m.position===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div><div><label class="f">Audio</label><select class="f" data-k="audio">${[['keep','Garder'],['mute','Couper'],['free','Libre']].map(x=>`<option value="${x[0]}" ${m.audio===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div><div><label class="f">Transformations</label><div class="subtle"><label><input data-k="canCrop" type="checkbox" ${m.canCrop!==false?'checked':''}> recadrer</label> · <label><input data-k="canCut" type="checkbox" ${m.canCut!==false?'checked':''}> couper</label> · <label><input data-k="canOverlayText" type="checkbox" ${m.canOverlayText!==false?'checked':''}> texte</label></div></div><div style="grid-column:1/-1"><label class="f">Note pour NyXia</label><textarea class="f" data-k="note">${esc(m.note||'')}</textarea></div></div></div>`).join('');
  if(locked)box.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=true);
  box.querySelectorAll('[data-remove-media]').forEach(b=>b.onclick=()=>{collectMediaFromDom();STATE.heartMedia.splice(Number(b.dataset.removeMedia),1);renderHeartMedia()})
}
function eventBody(){collectMediaFromDom();return{id:$('eventId').value.trim(),name:$('evName').value.trim(),status:'draft',eventStart:$('evStart').value,eventEnd:$('evEnd').value,contentStart:$('evContentStart').value,contentEnd:$('evContentEnd').value,publishTime:$('evTime').value,timezone:'America/Toronto',frequency:'daily',platforms:{facebook:$('evFacebook').checked,tiktok:$('evTikTok').checked},formats:{facebookImage:$('evFacebookImage').checked,shortVideo:$('evShortVideo').checked},exactTheme:$('evTheme').value.trim(),audience:$('evAudience').value.trim(),promise:$('evPromise').value.trim(),eventReality:$('evReality').value.trim(),day1:$('evDay1').value.trim(),day2:$('evDay2').value.trim(),day3:$('evDay3').value.trim(),cta:$('evCta').value.trim(),mandatory:$('evMandatory').value.trim(),forbidden:$('evForbidden').value.trim(),studioPromptRole:$('evStudioRole').value.trim(),vip:$('evVip').value.trim(),notes:$('evNotes').value.trim(),mediaHeart:STATE.heartMedia}}
async function saveOrUnlockEvent(){
  if($('saveEventBtn').dataset.locked==='1'){
    if(!confirm('Déverrouiller cette campagne ? NyXia Créatrice ne pourra plus l’utiliser jusqu’à ce que tu la reverrouilles.'))return;
    try{const d=await api('/event/unlock','POST',{id:$('eventId').value});STATE.currentEvent=d.event;setEventLockedUI(false);await loadEvents();toast('Campagne déverrouillée.')}catch(e){toast(e.message,false)}return;
  }
  try{const d=await api('/events','POST',eventBody());STATE.currentEvent=d.event;$('eventId').value=d.event.id;await loadEvents();toast('Événement enregistré.');if(confirm('Veux-tu verrouiller maintenant la Fiche Maîtresse pour autoriser NyXia Créatrice ?')){const x=await api('/event/lock','POST',{id:d.event.id});STATE.currentEvent=x.event;setEventLockedUI(true);await loadEvents();toast('Fiche Maîtresse verrouillée.')}}catch(e){toast(e.message,false)}
}
async function uploadMedia(file,eventId){
  const fd=new FormData();fd.append('file',file);fd.append('eventId',eventId||'general');
  const r=await fetch(API+'/media/upload',{method:'POST',headers:{'X-Univers-Token':TOKEN||''},body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'Téléversement impossible');return d.media
}
async function uploadHeartMedia(file){
  try{const m=await uploadMedia(file,$('eventId').value||'draft');STATE.heartMedia.push({...blankMedia(m.type),url:m.url,storageKey:m.key,originalName:m.originalName,label:m.originalName,source:'upload'});renderHeartMedia();toast('Média ajouté.')}catch(e){toast(e.message,false)}
}
async function uploadBackground(file){
  try{const m=await uploadMedia(file,'brand');$('setBackgroundVideo').value=m.url;renderBackgroundPreview();toast('Fond vidéo téléversé. Clique maintenant Enregistrer les réglages.')}catch(e){toast(e.message,false)}
}

async function generatePlan(){const eventId=$('creatorEvent').value;if(!eventId)return toast('Choisis une campagne verrouillée.',false);$('generatePlanBtn').disabled=true;$('generatePlanBtn').textContent='NyXia travaille…';try{const d=await api('/creator/plan','POST',{eventId,count:Number($('creatorCount').value)||14});STATE.plan=d.plan;renderPlan();renderStats();toast('Campagne préparée et contrôlée.')}catch(e){toast(e.message,false)}finally{$('generatePlanBtn').disabled=false;$('generatePlanBtn').textContent='✨ Préparer la campagne'}}
async function loadPlan(eventId){if(!eventId){STATE.plan=null;renderPlan();return}try{const d=await api('/creator/plan?eventId='+encodeURIComponent(eventId));STATE.plan=d.plan;renderPlan();renderStats()}catch(e){toast(e.message,false)}}
async function loadSelectedPlan(){const locked=STATE.events.find(e=>e.locked);if(locked)await loadPlan(locked.id)}
async function savePlan(){if(!STATE.plan||!STATE.plan.eventId)return;try{await api('/creator/plan/save','POST',{eventId:STATE.plan.eventId,plan:STATE.plan})}catch(e){toast(e.message,false)}}
function renderPlan(){
  const p=STATE.plan;if(!p){$('controlResult').innerHTML='Aucun plan chargé.';$('planGrid').innerHTML='<div class="strong-note">Choisis une campagne verrouillée puis demande à NyXia de préparer les contenus.</div>';return}
  const c=p.control||{pass:true,issues:[]};$('controlCard').classList.toggle('control-ok',c.pass!==false);$('controlCard').classList.toggle('control-bad',c.pass===false);$('controlResult').innerHTML=`<span class="badge ${c.pass!==false?'green':'red'}">${c.pass!==false?'✓ fidèle':'⚠ à revoir'}</span>${(c.issues||[]).length?`<div style="margin-top:8px">${c.issues.map(x=>'• '+esc(typeof x==='string'?x:JSON.stringify(x))).join('<br>')}</div>`:'<div class="subtle" style="margin-top:7px">Aucun dérapage signalé par le contrôle.</div>'}`;
  $('planGrid').innerHTML=(p.posts||[]).map(post=>`<div class="post-card"><div class="actions"><span class="badge violet">${esc(post.platform)}</span><span class="badge">${esc(post.format)}</span><span class="badge">${esc(post.date||'')}</span><span class="badge ${Number(post.fidelityScore)>=90?'green':'yellow'}">fidélité ${esc(post.fidelityScore)}%</span></div><h3>${esc(post.hook||post.angle||'Contenu')}</h3><div class="subtle">${esc(post.angle||'')}</div><div class="caption">${esc(post.caption||'')}</div>${post.generatedImageUrl?`<img class="generated" src="${esc(post.generatedImageUrl)}" alt="Créatif">${post.generatedImageStorageKey?`<div class="actions format-actions"><button class="btn ghost small" data-transform-key="${esc(post.generatedImageStorageKey)}" data-preset="square">1:1</button><button class="btn ghost small" data-transform-key="${esc(post.generatedImageStorageKey)}" data-preset="feed">4:5</button><button class="btn ghost small" data-transform-key="${esc(post.generatedImageStorageKey)}" data-preset="story">9:16</button><button class="btn ghost small" data-transform-key="${esc(post.generatedImageStorageKey)}" data-preset="landscape">Pub large</button></div>`:''}`:''}${post.generatedVideoUrl?`<video class="generated" src="${esc(post.generatedVideoUrl)}" controls playsinline style="width:100%;max-height:480px;object-fit:contain"></video>`:''}<div class="actions" style="margin-top:10px"><button class="btn ghost small" data-copy-caption="${esc(post.id)}">Copier texte</button>${post.format==='facebook-image'?`<button class="btn small" data-gen-image="${esc(post.id)}">Créer l’image</button>`:''}${post.format==='short-video'?`<button class="btn gold small" data-video="${esc(post.id)}">Studio vidéo</button>${STATE.settings&&STATE.settings.paidVideoGenerationEnabled?`<button class="btn small" data-gen-paid-video="${esc(post.id)}">✨ Clip IA premium</button>`:''}`:''}<select class="f" data-status="${esc(post.id)}" style="width:auto;padding:7px"><option value="draft" ${post.status==='draft'?'selected':''}>Brouillon</option><option value="approved" ${post.status==='approved'?'selected':''}>Approuvé</option><option value="scheduled" ${post.status==='scheduled'?'selected':''}>Programmé</option><option value="published" ${post.status==='published'?'selected':''}>Publié</option></select></div></div>`).join('')||'<div class="strong-note">Le plan ne contient aucun contenu.</div>';
  document.querySelectorAll('[data-copy-caption]').forEach(b=>b.onclick=()=>{const post=p.posts.find(x=>x.id===b.dataset.copyCaption);navigator.clipboard.writeText((post.caption||'')+'\n\n'+(post.hashtags||[]).join(' '));toast('Texte copié.')});
  document.querySelectorAll('[data-gen-image]').forEach(b=>b.onclick=()=>generateImage(b.dataset.genImage,b));
  document.querySelectorAll('[data-video]').forEach(b=>b.onclick=()=>openVideoStudio(b.dataset.video));
  document.querySelectorAll('[data-gen-paid-video]').forEach(b=>b.onclick=()=>generatePaidVideo(b.dataset.genPaidVideo,b));
  document.querySelectorAll('[data-transform-key]').forEach(b=>b.onclick=()=>downloadTransform(b.dataset.transformKey,b.dataset.preset));
  document.querySelectorAll('[data-status]').forEach(s=>s.onchange=()=>{const post=p.posts.find(x=>x.id===s.dataset.status);if(post){post.status=s.value;savePlan();renderStats()}})
}
async function generateImage(postId,btn){btn.disabled=true;const old=btn.textContent;btn.textContent='Création…';try{const d=await api('/creator/image','POST',{eventId:STATE.plan.eventId,postId});const post=STATE.plan.posts.find(x=>x.id===postId);if(post){post.generatedImageUrl=d.post.generatedImageUrl;post.generatedImageStorageKey=d.post.generatedImageStorageKey}renderPlan();toast('Nouvelle image créée dans la charte NyXia.')}catch(e){toast(e.message,false)}finally{btn.disabled=false;btn.textContent=old}}

async function generatePaidVideo(postId,btn){
  if(!STATE.settings||!STATE.settings.paidVideoGenerationEnabled)return toast('Active d’abord la vidéo IA premium dans Charte & moteurs.',false);
  const model=STATE.settings.videoModel||'';
  if(!model)return toast('Choisis d’abord un moteur vidéo AIMLAPI.',false);
  if(!confirm(`Cette action utilise tes crédits AIMLAPI avec le moteur ${model}. NyXia ne lancera qu’UN clip parce que tu viens de le demander. Continuer ?`))return;

  const old=btn.textContent;
  btn.disabled=true;
  btn.textContent='Envoi AIMLAPI…';
  try{
    const start=await api('/creator/video/start','POST',{eventId:STATE.plan.eventId,postId});
    const generationId=start.generationId;
    if(!generationId)throw new Error('Aucun identifiant de génération reçu.');
    btn.textContent='Vidéo en création…';

    let finished=false;
    for(let i=0;i<90;i++){
      await new Promise(r=>setTimeout(r,5000));
      const d=await api(`/creator/video/status?eventId=${encodeURIComponent(STATE.plan.eventId)}&postId=${encodeURIComponent(postId)}&generationId=${encodeURIComponent(generationId)}`);
      const post=STATE.plan.posts.find(x=>x.id===postId);
      if(post&&d.post)Object.assign(post,d.post);

      if(d.status==='completed'){
        finished=true;
        renderPlan();
        toast('Clip IA premium terminé et conservé dans R2.');
        break;
      }
      if(d.status==='error'||d.status==='failed'||d.status==='cancelled'){
        throw new Error((d.error&&typeof d.error==='string')?d.error:'La génération vidéo a échoué.');
      }
      btn.textContent=`Vidéo ${d.status||'en cours'}…`;
    }
    if(!finished)toast('La vidéo travaille encore chez AIMLAPI. Tu peux revenir plus tard; son identifiant est conservé.',false);
  }catch(e){
    toast(e.message,false);
  }finally{
    btn.disabled=false;
    btn.textContent=old;
  }
}

async function searchAssets(){const provider=$('assetProvider').value,type=$('assetType').value,q=$('assetQuery').value.trim();if(!q)return toast('Écris une recherche.',false);$('assetResults').innerHTML='<div class="subtle">Recherche…</div>';try{const d=await api(`/assets/search?provider=${encodeURIComponent(provider)}&type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);renderAssetResults(d.results||[])}catch(e){$('assetResults').innerHTML='';toast(e.message,false)}}
function renderResourceTarget(){/* réservé pour une future sélection de campagne; la copie URL fonctionne déjà */}
function renderAssetResults(items){
  $('assetResults').innerHTML=items.map((a,i)=>{
    const preview=a.type==='audio'
      ? `<div style="padding:14px"><div style="font-weight:800;margin-bottom:8px">🎵 ${esc(a.name||'Son Freesound')}</div><audio controls preload="none" src="${esc(a.preview||a.url)}" style="width:100%"></audio>${a.duration?`<div class="subtle" style="margin-top:6px">${Math.round(Number(a.duration))} sec · ${esc(a.license||'')}</div>`:''}</div>`
      : `<img src="${esc(a.preview||a.url)}">`;
    return `<div class="asset-card">${preview}<div class="p"><small>${esc(a.name||a.author||a.provider)}</small>${a.author?`<small>${esc(a.author)}</small>`:''}${a.license?`<small>${esc(a.license)}</small>`:''}<div class="actions"><button class="btn ghost small" data-copy-asset="${i}">Copier URL</button><button class="btn small" data-import-asset="${i}">Importer R2</button>${a.sourcePage?`<button class="btn ghost small" data-source-asset="${i}">Source</button>`:''}</div></div></div>`;
  }).join('')||'<div class="subtle">Aucun résultat.</div>';
  $('assetResults')._items=items;
  document.querySelectorAll('[data-copy-asset]').forEach(b=>b.onclick=()=>{const a=items[Number(b.dataset.copyAsset)];navigator.clipboard.writeText(a.url);toast('URL copiée.')});
  document.querySelectorAll('[data-import-asset]').forEach(b=>b.onclick=()=>importAsset(items[Number(b.dataset.importAsset)]));
  document.querySelectorAll('[data-source-asset]').forEach(b=>b.onclick=()=>{const a=items[Number(b.dataset.sourceAsset)];if(a.sourcePage)window.open(a.sourcePage,'_blank','noopener')})
}
async function importAsset(a){try{const eventId=$('creatorEvent').value||'resources';const d=await api('/media/import','POST',{url:a.url,eventId,label:a.name||a.author||a.provider});STATE.lastMedia=d.media;renderLastMediaTools();navigator.clipboard.writeText(d.media.url);toast('Média importé dans R2. Son URL NyXia est copiée.')}catch(e){toast(e.message,false)}}


function downloadTransform(key,preset){window.open(`${API}/media/transform?key=${encodeURIComponent(key)}&preset=${encodeURIComponent(preset)}&download=1`,'_blank','noopener')}
function renderLastMediaTools(){
  const box=$('lastMediaTools');if(!box)return;const m=STATE.lastMedia;if(!m){box.classList.add('hidden');return}box.classList.remove('hidden');
  const preview=m.type==='image'?`<img src="${esc(m.url)}" style="width:min(280px,100%);border-radius:14px;border:1px solid var(--line)">`:m.type==='video'?`<video src="${esc(m.url)}" controls style="width:min(280px,100%);border-radius:14px"></video>`:`<audio src="${esc(m.url)}" controls style="width:100%"></audio>`;
  box.innerHTML=`<h2>Dernier média conservé dans R2</h2><div class="grid2"><div>${preview}</div><div><div class="subtle" style="word-break:break-all">${esc(m.url)}</div><div class="actions" style="margin-top:10px"><button class="btn ghost small" id="copyLastMedia">Copier URL</button>${m.type==='image'&&m.key?`<button class="btn small" data-last-preset="square">1:1</button><button class="btn small" data-last-preset="feed">4:5</button><button class="btn small" data-last-preset="story">9:16</button><button class="btn small" data-last-preset="landscape">Pub large</button>`:''}</div></div></div>`;
  $('copyLastMedia').onclick=()=>{navigator.clipboard.writeText(m.url);toast('URL copiée.')};box.querySelectorAll('[data-last-preset]').forEach(b=>b.onclick=()=>downloadTransform(m.key,b.dataset.lastPreset));
}

async function loadChat(){
  const eventId=$('chatEvent')?$('chatEvent').value||'general':'general';
  try{const d=await api('/chat?eventId='+encodeURIComponent(eventId));STATE.chatHistory=d.history||[];STATE.chatBrief=d.brief||'';$('creativeBrief').value=STATE.chatBrief;renderChat()}catch(e){toast(e.message,false)}
}
function renderChat(){
  const box=$('chatLog');if(!box)return;if(!STATE.chatHistory.length){box.innerHTML='<div class="subtle">Je suis là. Donne-moi ton idée, même si elle est encore toute croche 😄</div>';return}
  box.innerHTML=STATE.chatHistory.map(m=>`<div class="chat-row ${m.role==='user'?'user':'assistant'}"><div class="chat-bubble"><strong>${m.role==='user'?'Diane':'NyXia'}</strong><div>${esc(m.content).replace(/\n/g,'<br>')}</div></div></div>`).join('');box.scrollTop=box.scrollHeight;
}
async function sendChat(){
  const input=$('chatInput'),message=input.value.trim();if(!message)return;const eventId=$('chatEvent').value||'general';$('chatSendBtn').disabled=true;$('chatSendBtn').textContent='NyXia réfléchit…';
  STATE.chatHistory.push({role:'user',content:message});renderChat();input.value='';
  try{const d=await api('/chat','POST',{eventId,message});STATE.chatHistory=d.history||STATE.chatHistory;STATE.lastChatAnswer=d.answer||'';renderChat();if($('chatSpeak').checked)speakNyxia(d.answer||'')}
  catch(e){STATE.chatHistory.pop();renderChat();toast(e.message,false)}finally{$('chatSendBtn').disabled=false;$('chatSendBtn').textContent='Envoyer à NyXia'}
}
async function clearChat(){if(!confirm('Effacer cette conversation avec NyXia ? Le brief créatif restera intact.'))return;try{await api('/chat/clear','POST',{eventId:$('chatEvent').value||'general'});STATE.chatHistory=[];STATE.lastChatAnswer='';renderChat();toast('Conversation effacée.')}catch(e){toast(e.message,false)}}
async function saveBrief(){try{const eventId=$('chatEvent').value||'general',brief=$('creativeBrief').value.trim();const d=await api('/chat/brief','POST',{eventId,brief});STATE.chatBrief=d.brief||'';toast('Brief créatif enregistré.')}catch(e){toast(e.message,false)}}
function appendLastToBrief(){if(!STATE.lastChatAnswer)return toast('NyXia n’a pas encore répondu dans cette conversation.',false);const t=$('creativeBrief'),sep=t.value.trim()?'\n\n':'';t.value=t.value.trim()+sep+STATE.lastChatAnswer;saveBrief()}
function speakNyxia(text){
  if(!('speechSynthesis' in window)||!text)return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text).replace(/[*#_`]/g,''));u.lang='fr-CA';u.rate=1.02;const voices=speechSynthesis.getVoices();u.voice=voices.find(v=>/fr[-_]CA/i.test(v.lang))||voices.find(v=>/^fr/i.test(v.lang))||null;speechSynthesis.speak(u)
}
function startVoiceInput(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return toast('La dictée vocale n’est pas disponible dans ce navigateur. Tu peux toujours écrire à NyXia.',false);const r=new SR();r.lang='fr-CA';r.interimResults=false;r.maxAlternatives=1;$('chatMicBtn').disabled=true;$('chatMicBtn').textContent='🎙️ J’écoute…';r.onresult=e=>{const t=e.results&&e.results[0]&&e.results[0][0]&&e.results[0][0].transcript;if(t)$('chatInput').value=($('chatInput').value+' '+t).trim()};r.onerror=()=>toast('Je n’ai pas bien capté. Réessaie ou écris-moi.',false);r.onend=()=>{$('chatMicBtn').disabled=false;$('chatMicBtn').textContent='🎙️ Parler'};r.start()
}

async function searchYouTube(){const q=$('ytQuery').value.trim();if(!q)return toast('Écris un sujet à observer.',false);$('ytSearchBtn').disabled=true;$('ytResults').innerHTML='<div class="subtle">NyXia regarde ce qui circule…</div>';$('ytAnalyzeBtn').disabled=true;try{const d=await api(`/radar/youtube?q=${encodeURIComponent(q)}&days=${encodeURIComponent($('ytDays').value)}&region=${encodeURIComponent($('ytRegion').value)}`);STATE.radarItems=d.results||[];renderYouTube();$('ytAnalyzeBtn').disabled=!STATE.radarItems.length}catch(e){$('ytResults').innerHTML='';toast(e.message,false)}finally{$('ytSearchBtn').disabled=false}}
function nfmt(n){try{return new Intl.NumberFormat('fr-CA',{notation:Number(n)>=100000?'compact':'standard',maximumFractionDigits:1}).format(Number(n)||0)}catch(_){return String(n||0)}}
function renderYouTube(){const box=$('ytResults');box.innerHTML=STATE.radarItems.map((x,i)=>`<div class="radar-card"><img src="${esc(x.thumbnail)}"><div class="p"><strong>${esc(x.title)}</strong><small>${esc(x.channel)} · ${nfmt(x.views)} vues</small><small>${new Date(x.publishedAt).toLocaleDateString('fr-CA')}</small><button class="btn ghost small" data-yt-open="${i}">Voir</button></div></div>`).join('')||'<div class="subtle">Aucun résultat dans cette période.</div>';box.querySelectorAll('[data-yt-open]').forEach(b=>b.onclick=()=>window.open(STATE.radarItems[Number(b.dataset.ytOpen)].url,'_blank','noopener'))}
async function analyzeYouTube(){if(!STATE.radarItems.length)return;$('ytAnalyzeBtn').disabled=true;$('ytAnalyzeBtn').textContent='NyXia analyse…';try{const d=await api('/radar/youtube/analyze','POST',{query:$('ytQuery').value.trim(),items:STATE.radarItems});$('ytAnalysis').textContent=d.answer||'';$('ytAnalysis').classList.remove('hidden')}catch(e){toast(e.message,false)}finally{$('ytAnalyzeBtn').disabled=false;$('ytAnalyzeBtn').textContent='✨ NyXia analyse les mécanismes'}}

async function capturePage(){const url=$('captureUrl').value.trim();if(!url)return toast('Colle une URL à capturer.',false);$('captureBtn').disabled=true;$('captureBtn').textContent='Browser Run capture…';try{const d=await api('/capture/page','POST',{url,preset:$('capturePreset').value,fullPage:$('captureFullPage').checked,eventId:$('creatorEvent').value||'screenshots'});STATE.lastMedia=d.media;renderCapture(d.media,d.sourceUrl);renderLastMediaTools();toast('Capture réelle enregistrée dans R2.')}catch(e){toast(e.message,false)}finally{$('captureBtn').disabled=false;$('captureBtn').textContent='Capturer et conserver dans R2'}}
function renderCapture(m,source){const box=$('captureResult');if(!m){box.innerHTML='';return}box.innerHTML=`<div class="grid2"><div><img src="${esc(m.url)}" style="width:100%;max-height:520px;object-fit:contain;border-radius:14px;border:1px solid var(--line)"></div><div><div class="subtle">Capture de<br>${esc(source||'')}</div><div class="actions" style="margin-top:12px"><button class="btn ghost small" id="copyCapture">Copier URL</button><button class="btn small" data-cap-preset="square">1:1</button><button class="btn small" data-cap-preset="feed">4:5</button><button class="btn small" data-cap-preset="story">9:16</button><button class="btn small" data-cap-preset="landscape">Pub large</button></div></div></div>`;$('copyCapture').onclick=()=>{navigator.clipboard.writeText(m.url);toast('URL copiée.')};box.querySelectorAll('[data-cap-preset]').forEach(b=>b.onclick=()=>downloadTransform(m.key,b.dataset.capPreset))}

async function loadPerformance(){try{const d=await api('/performance');STATE.performance=d.rows||[];STATE.performanceSummary=d.summary||null;renderPerformance()}catch(e){toast(e.message,false)}}
function perfMetrics(r){const spend=Number(r.spend||0),imp=Number(r.impressions||0),clicks=Number(r.clicks||0),leads=Number(r.leads||0),sales=Number(r.sales||0),rev=Number(r.revenue||0);return{ctr:imp?clicks/imp*100:0,cpl:leads?spend/leads:0,cpa:sales?spend/sales:0,roas:spend?rev/spend:0}}
function money(n){return new Intl.NumberFormat('fr-CA',{style:'currency',currency:'CAD',maximumFractionDigits:2}).format(Number(n)||0)}
function renderPerformance(){
  const s=STATE.performanceSummary,box=$('perfSummary');if(!s||!s.records)box.innerHTML='Pas encore assez de données. Entre tes premiers résultats et NyXia commencera à comparer les angles.';else box.innerHTML=`${s.records} résultats · CTR moyen <strong>${(Number(s.averages.ctr||0)*100).toFixed(2)}%</strong> · CPL <strong>${money(s.averages.cpl)}</strong> · CPA <strong>${money(s.averages.cpa)}</strong> · ROAS <strong>${Number(s.averages.roas||0).toFixed(2)}×</strong>`;
  $('perfList').innerHTML=STATE.performance.map(r=>{const m=perfMetrics(r),ev=STATE.events.find(e=>e.id===r.eventId);return `<div class="perf-card"><div class="actions"><span class="badge violet">${esc(r.platform||'')}</span><span class="badge">${esc(r.format||'')}</span><span class="badge">${esc(r.date||'')}</span></div><h3>${esc(r.angle||r.hook||'Résultat')}</h3><div class="subtle">${ev?esc(ev.name):'Général'}</div><div class="metric-row"><span>CTR <b>${m.ctr.toFixed(2)}%</b></span><span>CPL <b>${money(m.cpl)}</b></span><span>CPA <b>${money(m.cpa)}</b></span><span>ROAS <b>${m.roas.toFixed(2)}×</b></span><span>Ventes <b>${nfmt(r.sales)}</b></span></div>${r.notes?`<div class="subtle" style="margin-top:8px">${esc(r.notes)}</div>`:''}<div class="actions" style="margin-top:9px"><button class="btn red small" data-perf-delete="${esc(r.id)}">Supprimer</button></div></div>`}).join('')||'<div class="strong-note">La mémoire est vide pour l’instant.</div>';$('perfList').querySelectorAll('[data-perf-delete]').forEach(b=>b.onclick=()=>deletePerformance(b.dataset.perfDelete));
}
async function savePerformance(){const num=id=>Number($(id).value)||0;const body={eventId:$('perfEvent').value==='general'?'':$('perfEvent').value,date:$('perfDate').value,platform:$('perfPlatform').value,format:$('perfFormat').value.trim(),angle:$('perfAngle').value.trim(),hook:$('perfHook').value.trim(),spend:num('perfSpend'),impressions:num('perfImpressions'),clicks:num('perfClicks'),leads:num('perfLeads'),sales:num('perfSales'),revenue:num('perfRevenue'),notes:$('perfNotes').value.trim()};try{const d=await api('/performance','POST',body);STATE.performance=d.rows||[];STATE.performanceSummary=d.summary;renderPerformance();toast('Résultat ajouté à la mémoire de NyXia.')}catch(e){toast(e.message,false)}}
async function deletePerformance(id){if(!confirm('Retirer ce résultat de la mémoire ?'))return;try{const d=await api('/performance/delete','POST',{id});STATE.performance=d.rows||[];STATE.performanceSummary=d.summary;renderPerformance()}catch(e){toast(e.message,false)}}


function safeJsonInput(id){const v=$(id).value.trim();if(!v)return{};try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch(e){throw new Error(`JSON invalide dans ${id==='apiFixedHeaders'?'Headers fixes':'Query fixe'}.`)}}
function shellSplitCurl(s){const out=[];let cur='',quote='',escp=false;for(let i=0;i<String(s||'').length;i++){const c=s[i];if(escp){cur+=c;escp=false;continue}if(c==='\\'&&quote!=="'"){escp=true;continue}if(quote){if(c===quote)quote='';else cur+=c;continue}if(c==='"'||c==="'"){quote=c;continue}if(/\s/.test(c)){if(cur){out.push(cur);cur=''}}else cur+=c}if(cur)out.push(cur);return out}
function parseCurlIntoEditor(){const raw=$('apiCurlPaste').value.trim();if(!raw)return toast('Colle d’abord un cURL.',false);try{const t=shellSplitCurl(raw);let method='GET',url='',body='',headers={};for(let i=0;i<t.length;i++){const x=t[i];if(x==='curl')continue;if(x==='-X'||x==='--request'){method=(t[++i]||'GET').toUpperCase();continue}if(x==='-H'||x==='--header'){const h=t[++i]||'',p=h.indexOf(':');if(p>0)headers[h.slice(0,p).trim()]=h.slice(p+1).trim();continue}if(['-d','--data','--data-raw','--data-binary'].includes(x)){body=t[++i]||'';if(method==='GET')method='POST';continue}if(/^https:\/\//i.test(x))url=x}if(!url)throw new Error('Je ne trouve aucune URL https:// dans ce cURL.');const u=new URL(url);$('apiToolMethod').value=['GET','POST','PUT','PATCH','DELETE'].includes(method)?method:'GET';$('apiToolHost').value=u.host;$('apiToolPath').value=u.pathname||'/';const fixedQ={};let authMode='none',authName='',authPrefix='';u.searchParams.forEach((v,k)=>{if(/^(key|api[_-]?key|token|access[_-]?token|client[_-]?secret)$/i.test(k)){authMode='query';authName=k}else fixedQ[k]=v});const fixedH={};Object.entries(headers).forEach(([k,v])=>{const lk=k.toLowerCase();if(['authorization','x-api-key','api-key','x-goog-api-key'].includes(lk)){authMode='header';authName=k;const m=v.match(/^([A-Za-z]+\s+)(.+)$/);authPrefix=m?m[1]:''}else if(lk!=='content-length'&&lk!=='host')fixedH[k]=v});$('apiAuthMode').value=authMode;$('apiAuthName').value=authName;$('apiAuthPrefix').value=authPrefix;$('apiFixedHeaders').value=Object.keys(fixedH).length?JSON.stringify(fixedH,null,2):'';$('apiFixedQuery').value=Object.keys(fixedQ).length?JSON.stringify(fixedQ,null,2):'';if(body){$('apiBodyTemplate').value=body;try{JSON.parse(body);$('apiBodyType').value='json'}catch(_){$('apiBodyType').value='text'}}const guessed=(u.hostname.split('.')[0]||'API').replace(/[-_]/g,' ');if(!$('apiToolName').value.trim())$('apiToolName').value='API '+guessed.charAt(0).toUpperCase()+guessed.slice(1);toast('cURL décortiqué. Vérifie surtout le nom du Secret Cloudflare avant d’enregistrer.')}catch(e){toast(e.message,false)}}
function blankApiField(){return{id:'f-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),name:'',label:'',location:'query',defaultValue:'',required:false}}
function collectApiFields(){const rows=[];document.querySelectorAll('.api-field-row').forEach(r=>rows.push({id:r.dataset.id||'',name:r.querySelector('[data-af="name"]').value.trim(),label:r.querySelector('[data-af="label"]').value.trim(),location:r.querySelector('[data-af="location"]').value,defaultValue:r.querySelector('[data-af="default"]').value,required:r.querySelector('[data-af="required"]').checked}));return rows.filter(x=>x.name)}
function renderApiFields(fields){$('apiFieldEditor').innerHTML=(fields||[]).map((f,i)=>`<div class="api-field-row" data-id="${esc(f.id||'f-'+i)}"><input class="f" data-af="name" value="${esc(f.name||'')}" placeholder="nomTechnique"><input class="f" data-af="label" value="${esc(f.label||'')}" placeholder="Étiquette"><select class="f" data-af="location"><option value="query" ${f.location==='query'?'selected':''}>URL query</option><option value="path" ${f.location==='path'?'selected':''}>Path</option><option value="body" ${f.location==='body'?'selected':''}>Body</option><option value="header" ${f.location==='header'?'selected':''}>Header</option></select><input class="f" data-af="default" value="${esc(f.defaultValue||'')}" placeholder="Défaut"><label class="api-check"><input type="checkbox" data-af="required" ${f.required?'checked':''}> requis</label><button class="btn red small" data-af-remove="${i}">Retirer</button></div>`).join('')||'<div class="subtle">Aucun champ dynamique. Tu peux quand même appeler une API entièrement fixe.</div>';$('apiFieldEditor').querySelectorAll('[data-af-remove]').forEach(b=>b.onclick=()=>{const x=collectApiFields();x.splice(Number(b.dataset.afRemove),1);renderApiFields(x)})}
function resetApiToolEditor(){STATE.apiEditing=null;$('apiToolId').value='';$('apiCurlPaste').value='';$('apiToolIcon').value='🧩';$('apiToolName').value='';$('apiToolCategory').value='utilitaires';$('apiToolMethod').value='GET';$('apiToolHost').value='';$('apiToolPath').value='/';$('apiToolEnabled').value='1';$('apiAuthMode').value='none';$('apiAuthName').value='';$('apiAuthPrefix').value='';$('apiAuthSecret').value='';$('apiFixedHeaders').value='';$('apiFixedQuery').value='';$('apiBodyType').value='none';$('apiBodyTemplate').value='';renderApiFields([]);$('apiToolEditorTitle').textContent='Créer depuis un cURL'}
async function loadApiTools(){try{const d=await api('/labo/tools');STATE.apiTools=d.tools||[];renderApiToolList()}catch(e){toast(e.message,false)}}
function renderApiToolList(){const box=$('apiToolList');box.innerHTML=STATE.apiTools.map(t=>`<div class="api-tool-card"><div><strong>${esc(t.icon||'🧩')} ${esc(t.name)}</strong><small>${esc(t.method)} · ${esc(t.host)}</small><small>${esc(t.category||'')}</small>${t.authSecretName?`<small>🔐 ${esc(t.authSecretName)}</small>`:''}</div><div class="actions"><button class="btn gold small" data-api-run="${esc(t.id)}">Ouvrir</button><button class="btn ghost small" data-api-edit="${esc(t.id)}">Modifier</button><button class="btn red small" data-api-del="${esc(t.id)}">Supprimer</button></div></div>`).join('')||'<div class="strong-note">Aucun outil API personnalisé pour l’instant. Colle ton premier cURL à droite.</div>';box.querySelectorAll('[data-api-run]').forEach(b=>b.onclick=()=>openApiRunner(b.dataset.apiRun));box.querySelectorAll('[data-api-edit]').forEach(b=>b.onclick=()=>editApiTool(b.dataset.apiEdit));box.querySelectorAll('[data-api-del]').forEach(b=>b.onclick=()=>deleteApiTool(b.dataset.apiDel))}
function editApiTool(id){const t=STATE.apiTools.find(x=>x.id===id);if(!t)return;STATE.apiEditing=t;$('apiToolId').value=t.id;$('apiToolIcon').value=t.icon||'🧩';$('apiToolName').value=t.name||'';$('apiToolCategory').value=t.category||'utilitaires';$('apiToolMethod').value=t.method||'GET';$('apiToolHost').value=t.host||'';$('apiToolPath').value=t.pathTemplate||'/';$('apiToolEnabled').value=t.enabled===false?'0':'1';$('apiAuthMode').value=t.authMode||'none';$('apiAuthName').value=t.authName||'';$('apiAuthPrefix').value=t.authPrefix||'';$('apiAuthSecret').value=t.authSecretName||'';$('apiFixedHeaders').value=Object.keys(t.fixedHeaders||{}).length?JSON.stringify(t.fixedHeaders,null,2):'';$('apiFixedQuery').value=Object.keys(t.fixedQuery||{}).length?JSON.stringify(t.fixedQuery,null,2):'';$('apiBodyType').value=t.bodyType||'none';$('apiBodyTemplate').value=t.bodyTemplate||'';renderApiFields(t.fields||[]);$('apiToolEditorTitle').textContent='Modifier · '+t.name;window.scrollTo({top:0,behavior:'smooth'})}
async function saveApiTool(){try{const payload={id:$('apiToolId').value||undefined,icon:$('apiToolIcon').value.trim(),name:$('apiToolName').value.trim(),category:$('apiToolCategory').value.trim(),method:$('apiToolMethod').value,host:$('apiToolHost').value.trim(),pathTemplate:$('apiToolPath').value.trim(),enabled:$('apiToolEnabled').value==='1',authMode:$('apiAuthMode').value,authName:$('apiAuthName').value.trim(),authPrefix:$('apiAuthPrefix').value,authSecretName:$('apiAuthSecret').value.trim(),fixedHeaders:safeJsonInput('apiFixedHeaders'),fixedQuery:safeJsonInput('apiFixedQuery'),bodyType:$('apiBodyType').value,bodyTemplate:$('apiBodyTemplate').value,fields:collectApiFields()};if(!payload.name||!payload.host)return toast('Nom et hôte sont requis.',false);const id=$('apiToolId').value;const d=await api(id?'/labo/tools/'+encodeURIComponent(id):'/labo/tools',id?'PUT':'POST',payload);STATE.apiTools=d.tools||STATE.apiTools;renderApiToolList();resetApiToolEditor();toast('Outil API enregistré.')}catch(e){toast(e.message,false)}}
async function deleteApiTool(id){if(!confirm('Supprimer cet outil API ?'))return;try{const d=await api('/labo/tools/'+encodeURIComponent(id),'DELETE');STATE.apiTools=d.tools||[];renderApiToolList();if(STATE.apiEditing&&STATE.apiEditing.id===id)resetApiToolEditor()}catch(e){toast(e.message,false)}}
function openApiRunner(id){const t=STATE.apiTools.find(x=>x.id===id);if(!t)return;STATE.apiRunTool=t;$('apiRunnerCard').classList.remove('hidden');$('apiRunnerTitle').textContent=(t.icon||'🧩')+' '+t.name;$('apiRunnerSub').textContent=t.method+' · https://'+t.host+(t.pathTemplate||'/')+(t.authSecretName?' · secret '+t.authSecretName:'');$('apiRunnerFields').innerHTML=(t.fields||[]).map(f=>`<div><label class="f">${esc(f.label||f.name)}${f.required?' *':''}</label><textarea class="f" rows="2" data-run-field="${esc(f.name)}">${esc(f.defaultValue||'')}</textarea></div>`).join('')||'<div class="subtle">Cet outil n’a aucun champ dynamique. Clique simplement sur Appeler l’API.</div>';$('apiRunnerOutput').textContent='Aucun appel.';$('apiRunnerMeta').textContent='';$('apiRunnerCard').scrollIntoView({behavior:'smooth',block:'start'})}
async function runApiTool(){const t=STATE.apiRunTool;if(!t)return;const values={};document.querySelectorAll('[data-run-field]').forEach(x=>values[x.dataset.runField]=x.value);$('runApiToolBtn').disabled=true;$('runApiToolBtn').textContent='Appel…';try{const d=await api('/labo/call','POST',{id:t.id,values});$('apiRunnerMeta').textContent=`HTTP ${d.status||''} · ${d.durationMs||0} ms · ${d.url||''}`;$('apiRunnerOutput').textContent=typeof d.data==='string'?d.data:JSON.stringify(d.data,null,2)}catch(e){$('apiRunnerOutput').textContent=e.message;toast(e.message,false)}finally{$('runApiToolBtn').disabled=false;$('runApiToolBtn').textContent='▶ Appeler l’API'}}

function openVideoStudio(postId){
  if(!STATE.settings||!STATE.settings.brand||!STATE.settings.brand.backgroundVideoUrl)return toast('Configure d’abord le fond vidéo officiel NyXia dans Charte & moteurs.',false);
  const post=STATE.plan&&STATE.plan.posts.find(x=>x.id===postId);if(!post)return;
  STATE.videoPost=post;STATE.videoScenes=(post.video&&post.video.scenes&&post.video.scenes.length?JSON.parse(JSON.stringify(post.video.scenes)):[{id:'scene-1',seconds:Math.min(10,post.video&&post.video.duration||5),text:post.hook||'',visualType:'text-only',mediaHeartIds:[]}]);STATE.activeScene=0;
  if(post.generatedVideoUrl&&STATE.videoScenes.length&&!STATE.videoScenes[0].mediaUrl){STATE.videoScenes[0].mediaUrl=post.generatedVideoUrl;STATE.videoScenes[0].visualType='generated-video'}
  const ev=STATE.events.find(e=>e.id===STATE.plan.eventId);STATE.videoScenes.forEach(sc=>{if(!sc.mediaUrl){const ids=sc.mediaHeartIds||[];const m=(ev&&ev.mediaHeart||[]).find(x=>ids.includes(x.id));sc.mediaUrl=m&&m.url||''}});
  $('videoBg').src=STATE.settings.brand.backgroundVideoUrl;$('videoBg').play().catch(()=>{});renderScenes();updateVideoPreview();$('videoModal').classList.remove('hidden')
}
function closeVideoStudio(){$('videoModal').classList.add('hidden');$('videoBg').pause();STATE.videoPost=null;STATE.videoScenes=[]}
function renderScenes(){const box=$('sceneList');box.innerHTML=STATE.videoScenes.map((s,i)=>`<div class="scene ${i===STATE.activeScene?'active':''}" data-scene="${i}"><div class="actions"><span class="badge">${i+1}</span><span class="badge">${esc(s.seconds)} sec</span><span class="badge violet">${esc(s.visualType||'text-only')}</span></div><div style="margin-top:7px;font-size:12px">${esc((s.text||'').slice(0,130))}</div></div>`).join('');box.querySelectorAll('[data-scene]').forEach(x=>x.onclick=()=>{STATE.activeScene=Number(x.dataset.scene);renderScenes();updateVideoPreview()})}
function updateVideoPreview(){const s=STATE.videoScenes[STATE.activeScene]||{};$('previewText').textContent=s.text||'';$('sceneText').value=s.text||'';$('sceneSeconds').value=s.seconds||5;$('sceneMediaUrl').value=s.mediaUrl||''}
function saveScene(){const s=STATE.videoScenes[STATE.activeScene];if(!s)return;s.text=$('sceneText').value;s.seconds=Math.max(2,Math.min(15,Number($('sceneSeconds').value)||5));s.mediaUrl=$('sceneMediaUrl').value.trim();renderScenes();updateVideoPreview()}

function pickMime(){const types=['video/mp4;codecs=h264','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];return types.find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||''}
function coverRect(sw,sh,dw,dh){const sr=sw/sh,dr=dw/dh;if(sr>dr){const h=dh,w=h*sr;return{x:(dw-w)/2,y:0,w,h}}const w=dw,h=w/sr;return{x:0,y:(dh-h)/2,w,h}}
async function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=url})}
async function loadVideo(url){return new Promise((resolve,reject)=>{const v=document.createElement('video');v.crossOrigin='anonymous';v.muted=true;v.loop=true;v.playsInline=true;v.onloadeddata=()=>resolve(v);v.onerror=reject;v.src=url;v.load()})}
function drawWrapped(ctx,text,x,y,maxWidth,lineHeight,maxLines=7){const words=String(text||'').split(/\s+/);let line='',lines=[];for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);lines=lines.slice(0,maxLines);const total=lines.length*lineHeight;lines.forEach((l,i)=>ctx.fillText(l,x,y-total/2+i*lineHeight));}
async function exportVideo(){
  if(!STATE.settings.brand.backgroundVideoUrl)return toast('Fond vidéo officiel manquant.',false);
  const btn=$('exportVideoBtn');btn.disabled=true;$('exportStatus').textContent='Préparation des médias…';
  try{
    const W=1080,H=1920,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
    const bg=await loadVideo(STATE.settings.brand.backgroundVideoUrl);await bg.play();
    const prepared=[];for(const s of STATE.videoScenes){let media=null;if(s.mediaUrl){try{media=s.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i)||s.visualType==='pexels-video'||s.visualType==='generated-video'||s.visualType==='heart-media'&&s.mediaUrl.includes('video')?await loadVideo(s.mediaUrl):await loadImage(s.mediaUrl);if(media instanceof HTMLVideoElement)await media.play()}catch(_){media=null}}prepared.push({...s,media})}
    const stream=canvas.captureStream(30);const mime=pickMime();const rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:7000000}:{videoBitsPerSecond:7000000});const chunks=[];rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
    const done=new Promise(resolve=>rec.onstop=resolve);rec.start(500);
    let globalStart=performance.now();let sceneStart=globalStart;let idx=0;let current=prepared[0];const total=prepared.reduce((s,x)=>s+(Number(x.seconds)||5),0);$('exportStatus').textContent=`Rendu ${total} sec… garde cette fenêtre ouverte.`;
    await new Promise(resolve=>{
      function frame(now){
        const elapsed=(now-sceneStart)/1000;if(elapsed>=(Number(current.seconds)||5)&&idx<prepared.length-1){idx++;current=prepared[idx];sceneStart=now}
        const totalElapsed=(now-globalStart)/1000;
        ctx.fillStyle=STATE.settings.brand.night;ctx.fillRect(0,0,W,H);
        if(bg.readyState>=2){const r=coverRect(bg.videoWidth||W,bg.videoHeight||H,W,H);ctx.drawImage(bg,r.x,r.y,r.w,r.h)}
        if(current.media&&current.visualType!=='text-only'){
          ctx.save();ctx.globalAlpha=.78;const mw=W*.76,mh=H*.45;let sw=current.media.videoWidth||current.media.naturalWidth||mw,sh=current.media.videoHeight||current.media.naturalHeight||mh;const rr=coverRect(sw,sh,mw,mh);const dx=(W-mw)/2,dy=H*.24;ctx.shadowColor=STATE.settings.brand.violet;ctx.shadowBlur=42;ctx.drawImage(current.media,dx+rr.x,dy+rr.y,rr.w,rr.h);ctx.restore();
        }
        const local=Math.min(1,elapsed/.55);ctx.save();ctx.globalAlpha=Math.min(1,local);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 64px Inter,Arial';ctx.fillStyle='#ffffff';ctx.shadowColor=STATE.settings.brand.lavender;ctx.shadowBlur=30;drawWrapped(ctx,current.text||'',W/2,H*.72,W*.82,76,6);ctx.restore();
        ctx.save();ctx.textAlign='center';ctx.font='800 30px Inter,Arial';ctx.fillStyle=STATE.settings.brand.gold;ctx.shadowColor=STATE.settings.brand.violet;ctx.shadowBlur=16;ctx.fillText('NyXia',W/2,H-105);ctx.restore();
        if(totalElapsed>=total){resolve();return}requestAnimationFrame(frame)
      }requestAnimationFrame(frame)
    });
    rec.stop();await done;bg.pause();prepared.forEach(x=>{if(x.media instanceof HTMLVideoElement)x.media.pause()});const ext=mime.includes('mp4')?'mp4':'webm';const blob=new Blob(chunks,{type:mime||'video/webm'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nyxia-${(STATE.videoPost&&STATE.videoPost.id)||Date.now()}.${ext}`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);$('exportStatus').textContent=`Vidéo prête (${ext.toUpperCase()}).`;
  }catch(e){console.error(e);$('exportStatus').textContent='Échec du rendu.';toast('Export vidéo impossible : '+e.message,false)}finally{btn.disabled=false}
}

function renderAssetTypeRule(){
  const provider=$('assetProvider').value,sel=$('assetType');
  const image=sel.querySelector('option[value="image"]'),video=sel.querySelector('option[value="video"]'),audio=sel.querySelector('option[value="audio"]');
  image.disabled=false;video.disabled=false;audio.disabled=false;
  if(provider==='unsplash'){sel.value='image';video.disabled=true;audio.disabled=true}
  else if(provider==='freesound'){sel.value='audio';image.disabled=true;video.disabled=true}
  else if(provider==='openverse'){if(!['image','audio'].includes(sel.value))sel.value='image';video.disabled=true}
  else if(provider==='pexels'||provider==='pixabay'){if(sel.value==='audio')sel.value='image';audio.disabled=true}
}

function drawAdminStars(){const c=$('stars'),ctx=c.getContext('2d');function size(){c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}size();addEventListener('resize',size);const pts=Array.from({length:90},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.2+.2,a:Math.random()*.7+.15,s:Math.random()*.015+.002}));let t=0;function f(){t+=.01;ctx.clearRect(0,0,innerWidth,innerHeight);for(const p of pts){ctx.beginPath();ctx.fillStyle=`rgba(220,215,255,${Math.max(.08,p.a+Math.sin(t+p.x*20)*.12)})`;ctx.arc(p.x*innerWidth,p.y*innerHeight,p.r,0,Math.PI*2);ctx.fill()}requestAnimationFrame(f)}f()}

function wire(){
  $('loginBtn').onclick=doLogin;$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});$('logoutBtn').onclick=doLogout;
  document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));document.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>openEvent());
  $('closeEventModal').onclick=closeEvent;$('cancelEventBtn').onclick=closeEvent;$('saveEventBtn').onclick=saveOrUnlockEvent;$('addHeartMediaBtn').onclick=()=>{collectMediaFromDom();STATE.heartMedia.push(blankMedia());renderHeartMedia()};
  $('uploadHeartMediaBtn').onclick=()=>$('heartMediaFile').click();$('heartMediaFile').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)uploadHeartMedia(f);e.target.value=''};
  $('generatePlanBtn').onclick=generatePlan;$('creatorEvent').onchange=e=>loadPlan(e.target.value);
  $('assetSearchBtn').onclick=searchAssets;$('assetQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchAssets()});$('assetProvider').onchange=renderAssetTypeRule;
  $('chatEvent').onchange=loadChat;$('chatSendBtn').onclick=sendChat;$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))sendChat()});$('chatClearBtn').onclick=clearChat;$('saveBriefBtn').onclick=saveBrief;$('appendLastChatBtn').onclick=appendLastToBrief;$('chatMicBtn').onclick=startVoiceInput;
  $('ytSearchBtn').onclick=searchYouTube;$('ytQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchYouTube()});$('ytAnalyzeBtn').onclick=analyzeYouTube;$('captureBtn').onclick=capturePage;
  $('savePerfBtn').onclick=savePerformance;
  $('newApiToolBtn').onclick=resetApiToolEditor;$('parseCurlBtn').onclick=parseCurlIntoEditor;$('resetApiToolBtn').onclick=resetApiToolEditor;$('addApiFieldBtn').onclick=()=>{const f=collectApiFields();f.push(blankApiField());renderApiFields(f)};$('saveApiToolBtn').onclick=saveApiTool;$('closeApiRunnerBtn').onclick=()=>{$('apiRunnerCard').classList.add('hidden');STATE.apiRunTool=null};$('runApiToolBtn').onclick=runApiTool;
  $('saveSettingsBtn').onclick=saveSettings;['setNight','setViolet','setLavender','setGold'].forEach(id=>$(id).oninput=renderPalette);$('setBackgroundVideo').oninput=renderBackgroundPreview;
  $('uploadBackgroundBtn').onclick=()=>$('backgroundFile').click();$('backgroundFile').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)uploadBackground(f);e.target.value=''};
  $('closeVideoModal').onclick=closeVideoStudio;$('saveSceneBtn').onclick=saveScene;$('exportVideoBtn').onclick=exportVideo;
}

drawAdminStars();wire();renderAssetTypeRule();if($('perfDate'))$('perfDate').value=new Date().toISOString().slice(0,10);checkAuth();
})();
