(function(){
'use strict';
const API='/api/superadmin2';
const TOKEN_KEY='nyxia_super2_token';
const CHAR_KEYS=['nyxia','diane','eric','lena','selena','kael','alex'];
const CHAR_NAMES={nyxia:'NyXia',diane:'Diane',eric:'Éric',lena:'Léna',selena:'Séléna',kael:'Kael',alex:'Alex'};
let TOKEN=sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||'';
const STATE={events:[],settings:null,bindings:{},plan:null,currentEvent:null,heartMedia:[],videoPost:null,videoScenes:[],activeScene:0};

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
    headers:{'Accept':'application/json','X-Univers-Token':TOKEN||''}
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
  try{
    const d=await api('/check-auth','POST',{});
    if(d.valid){
      showApp();
      await init();
      return true;
    }
  }catch(_){}
  TOKEN='';
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
  return false;
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
    if(TOKEN){
      sessionStorage.setItem(TOKEN_KEY,TOKEN);
      localStorage.setItem(TOKEN_KEY,TOKEN);
    }
    $('loginMsg').textContent='';
    showApp();
    await init();
  }catch(e){$('loginMsg').textContent=e.message}
}
async function doLogout(){
  try{await api('/logout','POST',{})}catch(_){}
  TOKEN='';
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

function switchView(name){
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
  if(name==='creator')refreshCreatorSelect();
  if(name==='resources')renderResourceTarget();
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
    brainModel:$('setBrainModel').value.trim(),controlModel:$('setControlModel').value.trim(),imageModel:$('setImageModel').value.trim(),imageFallbackModel:$('setImageFallback').value.trim(),
    strictControl:$('setStrictControl').checked,imageGenerationEnabled:$('setImageEnabled').checked,
    brand:{name:'NyXia',night:$('setNight').value.trim(),violet:$('setViolet').value.trim(),lavender:$('setLavender').value.trim(),gold:$('setGold').value.trim(),visualRule:$('setVisualRule').value.trim(),backgroundVideoUrl:$('setBackgroundVideo').value.trim(),characterReferences:refs}
  };
  try{const d=await api('/settings','POST',body);STATE.settings=d.settings;STATE.bindings=d.bindings||STATE.bindings;renderSettings();renderBindings();toast('Réglages NyXia enregistrés.')}catch(e){toast(e.message,false)}
}
function renderSettings(){
  const s=STATE.settings;if(!s)return;const b=s.brand||{};
  $('setBrainModel').value=s.brainModel||'';$('setControlModel').value=s.controlModel||'';$('setImageModel').value=s.imageModel||'';$('setImageFallback').value=s.imageFallbackModel||'';
  $('setStrictControl').checked=s.strictControl!==false;$('setImageEnabled').checked=s.imageGenerationEnabled!==false;
  $('setNight').value=b.night||'#060A18';$('setViolet').value=b.violet||'#7B5CFF';$('setLavender').value=b.lavender||'#A78BFA';$('setGold').value=b.gold||'#F4C86A';$('setVisualRule').value=b.visualRule||'';$('setBackgroundVideo').value=b.backgroundVideoUrl||'';
  renderPalette();
  const box=$('characterRefs');box.innerHTML=CHAR_KEYS.map(k=>`<div><label class="f">${CHAR_NAMES[k]}</label><img src="${esc((b.characterReferences||{})[k]||'')}" alt="${CHAR_NAMES[k]}" style="width:72px;height:72px;object-fit:cover;border-radius:12px;border:1px solid var(--line);display:block;margin-bottom:7px"><input class="f" id="char-${k}" value="${esc((b.characterReferences||{})[k]||'')}"></div>`).join('');
  renderBackgroundPreview();
}
function renderPalette(){const vals=[['Nuit',$('setNight').value],['Violet',$('setViolet').value],['Lavande',$('setLavender').value],['Doré',$('setGold').value]];$('palettePreview').innerHTML=vals.map(x=>`<div class="swatch" style="background:${esc(x[1])}">${esc(x[0])}<br>${esc(x[1])}</div>`).join('')}
function renderBackgroundPreview(){const url=$('setBackgroundVideo').value.trim();$('backgroundPreview').innerHTML=url?`<video src="${esc(url)}" muted loop autoplay playsinline style="width:min(220px,100%);aspect-ratio:9/16;object-fit:cover;border-radius:15px;border:1px solid var(--line)"></video>`:`<div class="strong-note">Aucun fond officiel configuré. L’export vidéo restera bloqué jusqu’à ce que ton ciel étoilé + étoiles filantes soit défini.</div>`}
function renderBindings(){
  const map={kv:'CASHFLOW_KV',mediaBucket:'R2 MEDIA_BUCKET',aimlapi:'AIMLAPI_CREATOR_KEY',pexels:'PEXELS_KEY',unsplash:'Unsplash'};
  $('bindingGrid').innerHTML=Object.keys(map).map(k=>`<div class="binding"><span class="badge ${STATE.bindings[k]?'green':'red'}">${STATE.bindings[k]?'✓ actif':'✕ absent'}</span><div style="margin-top:6px;font-weight:800">${map[k]}</div></div>`).join('')
}

async function loadEvents(){const d=await api('/events');STATE.events=d.events||[];renderEvents();refreshCreatorSelect();renderStats()}
function renderStats(){
  $('statEvents').textContent=STATE.events.length;$('statLocked').textContent=STATE.events.filter(e=>e.locked).length;
  $('statPosts').textContent=STATE.plan&&STATE.plan.posts?STATE.plan.posts.length:0;
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
  $('planGrid').innerHTML=(p.posts||[]).map(post=>`<div class="post-card"><div class="actions"><span class="badge violet">${esc(post.platform)}</span><span class="badge">${esc(post.format)}</span><span class="badge">${esc(post.date||'')}</span><span class="badge ${Number(post.fidelityScore)>=90?'green':'yellow'}">fidélité ${esc(post.fidelityScore)}%</span></div><h3>${esc(post.hook||post.angle||'Contenu')}</h3><div class="subtle">${esc(post.angle||'')}</div><div class="caption">${esc(post.caption||'')}</div>${post.generatedImageUrl?`<img class="generated" src="${esc(post.generatedImageUrl)}" alt="Créatif">`:''}<div class="actions" style="margin-top:10px"><button class="btn ghost small" data-copy-caption="${esc(post.id)}">Copier texte</button>${post.format==='facebook-image'?`<button class="btn small" data-gen-image="${esc(post.id)}">Créer l’image</button>`:''}${post.format==='short-video'?`<button class="btn gold small" data-video="${esc(post.id)}">Studio vidéo</button>`:''}<select class="f" data-status="${esc(post.id)}" style="width:auto;padding:7px"><option value="draft" ${post.status==='draft'?'selected':''}>Brouillon</option><option value="approved" ${post.status==='approved'?'selected':''}>Approuvé</option><option value="scheduled" ${post.status==='scheduled'?'selected':''}>Programmé</option><option value="published" ${post.status==='published'?'selected':''}>Publié</option></select></div></div>`).join('')||'<div class="strong-note">Le plan ne contient aucun contenu.</div>';
  document.querySelectorAll('[data-copy-caption]').forEach(b=>b.onclick=()=>{const post=p.posts.find(x=>x.id===b.dataset.copyCaption);navigator.clipboard.writeText((post.caption||'')+'\n\n'+(post.hashtags||[]).join(' '));toast('Texte copié.')});
  document.querySelectorAll('[data-gen-image]').forEach(b=>b.onclick=()=>generateImage(b.dataset.genImage,b));
  document.querySelectorAll('[data-video]').forEach(b=>b.onclick=()=>openVideoStudio(b.dataset.video));
  document.querySelectorAll('[data-status]').forEach(s=>s.onchange=()=>{const post=p.posts.find(x=>x.id===s.dataset.status);if(post){post.status=s.value;savePlan();renderStats()}})
}
async function generateImage(postId,btn){btn.disabled=true;const old=btn.textContent;btn.textContent='Création…';try{const d=await api('/creator/image','POST',{eventId:STATE.plan.eventId,postId});const post=STATE.plan.posts.find(x=>x.id===postId);if(post){post.generatedImageUrl=d.post.generatedImageUrl;post.generatedImageStorageKey=d.post.generatedImageStorageKey}renderPlan();toast('Nouvelle image créée dans la charte NyXia.')}catch(e){toast(e.message,false)}finally{btn.disabled=false;btn.textContent=old}}

async function searchAssets(){const provider=$('assetProvider').value,type=$('assetType').value,q=$('assetQuery').value.trim();if(!q)return toast('Écris une recherche.',false);$('assetResults').innerHTML='<div class="subtle">Recherche…</div>';try{const d=await api(`/assets/search?provider=${encodeURIComponent(provider)}&type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);renderAssetResults(d.results||[])}catch(e){$('assetResults').innerHTML='';toast(e.message,false)}}
function renderResourceTarget(){/* réservé pour une future sélection de campagne; la copie URL fonctionne déjà */}
function renderAssetResults(items){$('assetResults').innerHTML=items.map((a,i)=>`<div class="asset-card"><img src="${esc(a.preview||a.url)}"><div class="p"><small>${esc(a.author||a.provider)}</small><div class="actions"><button class="btn ghost small" data-copy-asset="${i}">Copier URL</button><button class="btn small" data-import-asset="${i}">Importer R2</button></div></div></div>`).join('')||'<div class="subtle">Aucun résultat.</div>';$('assetResults')._items=items;document.querySelectorAll('[data-copy-asset]').forEach(b=>b.onclick=()=>{const a=items[Number(b.dataset.copyAsset)];navigator.clipboard.writeText(a.url);toast('URL copiée.')});document.querySelectorAll('[data-import-asset]').forEach(b=>b.onclick=()=>importAsset(items[Number(b.dataset.importAsset)]))}
async function importAsset(a){try{const eventId=$('creatorEvent').value||'resources';const d=await api('/media/import','POST',{url:a.url,eventId,label:a.author||a.provider});navigator.clipboard.writeText(d.media.url);toast('Média importé dans R2. Son URL NyXia est copiée.')}catch(e){toast(e.message,false)}}

function openVideoStudio(postId){
  if(!STATE.settings||!STATE.settings.brand||!STATE.settings.brand.backgroundVideoUrl)return toast('Configure d’abord le fond vidéo officiel NyXia dans Charte & moteurs.',false);
  const post=STATE.plan&&STATE.plan.posts.find(x=>x.id===postId);if(!post)return;
  STATE.videoPost=post;STATE.videoScenes=(post.video&&post.video.scenes&&post.video.scenes.length?JSON.parse(JSON.stringify(post.video.scenes)):[{id:'scene-1',seconds:Math.min(10,post.video&&post.video.duration||5),text:post.hook||'',visualType:'text-only',mediaHeartIds:[]}]);STATE.activeScene=0;
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
    const prepared=[];for(const s of STATE.videoScenes){let media=null;if(s.mediaUrl){try{media=s.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i)||s.visualType==='pexels-video'||s.visualType==='heart-media'&&s.mediaUrl.includes('video')?await loadVideo(s.mediaUrl):await loadImage(s.mediaUrl);if(media instanceof HTMLVideoElement)await media.play()}catch(_){media=null}}prepared.push({...s,media})}
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

function renderAssetTypeRule(){if($('assetProvider').value==='unsplash'){$('assetType').value='image';$('assetType').querySelector('option[value="video"]').disabled=true}else $('assetType').querySelector('option[value="video"]').disabled=false}

function drawAdminStars(){const c=$('stars'),ctx=c.getContext('2d');function size(){c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}size();addEventListener('resize',size);const pts=Array.from({length:90},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.2+.2,a:Math.random()*.7+.15,s:Math.random()*.015+.002}));let t=0;function f(){t+=.01;ctx.clearRect(0,0,innerWidth,innerHeight);for(const p of pts){ctx.beginPath();ctx.fillStyle=`rgba(220,215,255,${Math.max(.08,p.a+Math.sin(t+p.x*20)*.12)})`;ctx.arc(p.x*innerWidth,p.y*innerHeight,p.r,0,Math.PI*2);ctx.fill()}requestAnimationFrame(f)}f()}

function wire(){
  $('loginBtn').onclick=doLogin;$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});$('logoutBtn').onclick=doLogout;
  document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));document.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>openEvent());
  $('closeEventModal').onclick=closeEvent;$('cancelEventBtn').onclick=closeEvent;$('saveEventBtn').onclick=saveOrUnlockEvent;$('addHeartMediaBtn').onclick=()=>{collectMediaFromDom();STATE.heartMedia.push(blankMedia());renderHeartMedia()};
  $('uploadHeartMediaBtn').onclick=()=>$('heartMediaFile').click();$('heartMediaFile').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)uploadHeartMedia(f);e.target.value=''};
  $('generatePlanBtn').onclick=generatePlan;$('creatorEvent').onchange=e=>loadPlan(e.target.value);
  $('assetSearchBtn').onclick=searchAssets;$('assetQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchAssets()});$('assetProvider').onchange=renderAssetTypeRule;
  $('saveSettingsBtn').onclick=saveSettings;['setNight','setViolet','setLavender','setGold'].forEach(id=>$(id).oninput=renderPalette);$('setBackgroundVideo').oninput=renderBackgroundPreview;
  $('uploadBackgroundBtn').onclick=()=>$('backgroundFile').click();$('backgroundFile').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)uploadBackground(f);e.target.value=''};
  $('closeVideoModal').onclick=closeVideoStudio;$('saveSceneBtn').onclick=saveScene;$('exportVideoBtn').onclick=exportVideo;
}

drawAdminStars();wire();checkAuth();
})();
