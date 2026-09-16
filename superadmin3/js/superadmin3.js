(function(){
'use strict';
const API='/api/superadmin3';
const AUTH='/api';
const TOKEN_KEY='nyxia_univers_token';
let TOKEN=sessionStorage.getItem(TOKEN_KEY)||'';
const STATE={tags:[], include:new Set(), exclude:new Set()};

const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg,ok=true){const t=$('toast');t.textContent=msg;t.className='toast '+(ok?'ok':'err');t.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hidden'),4200)}

async function readJson(r){
  const text=await r.text();
  if(!text)return {};
  try{return JSON.parse(text)}catch(_){return {error:'Réponse invalide',detail:text.slice(0,400)}}
}
async function api(path,method='GET',body,base){
  const opts={method,credentials:'same-origin',headers:{Accept:'application/json','X-Univers-Token':TOKEN||''}};
  if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
  const r=await fetch((base||API)+path,opts);
  const d=await readJson(r);
  if(r.status===401){TOKEN='';sessionStorage.removeItem(TOKEN_KEY);showLogin();throw new Error(d.error||'Session expirée')}
  if(!r.ok)throw Object.assign(new Error(d.error||('Erreur '+r.status)),{detail:d});
  return d;
}

function showLogin(){$('login').classList.remove('hidden');$('app').classList.add('hidden')}
function showApp(){$('login').classList.add('hidden');$('app').classList.remove('hidden')}

async function checkAuth(){
  try{
    const d=await api('/check-auth','POST',{},AUTH);
    if(!d.valid){showLogin();return false}
    showApp();
    await boot();
    return true;
  }catch(_){
    if(TOKEN){showApp();try{await boot()}catch(e){toast(e.message,false)}return true}
    showLogin();return false;
  }
}
async function doLogin(){
  $('loginMsg').textContent='Connexion…';
  try{
    const r=await fetch(AUTH+'/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({password:$('loginPassword').value})});
    const d=await readJson(r);
    if(!r.ok)throw new Error(d.error||'Connexion refusée');
    TOKEN=d.token||TOKEN;
    if(TOKEN)sessionStorage.setItem(TOKEN_KEY,TOKEN);
    $('loginMsg').textContent='';
    showApp();
    await boot();
  }catch(e){$('loginMsg').textContent=e.message}
}
async function doLogout(){
  try{await api('/logout','POST',{},AUTH)}catch(_){}
  TOKEN='';sessionStorage.removeItem(TOKEN_KEY);showLogin();
}

function tagName(t){return t.name||t.title||t.label||('#'+t.id)}
function tagId(t){return t.id!=null?t.id:t.name}

function renderTagPickers(){
  const inc=$('includeTags');const exc=$('excludeTags');
  if(!STATE.tags.length){
    inc.innerHTML='<span class="subtle">Aucun tag chargé (clé API ou propagation).</span>';
    exc.innerHTML='';
    return;
  }
  inc.innerHTML=STATE.tags.map(t=>{
    const id=String(tagId(t));
    return '<button type="button" class="tag'+(STATE.include.has(id)?' on':'')+'" data-k="include" data-id="'+esc(id)+'">'+esc(tagName(t))+'</button>';
  }).join('');
  exc.innerHTML=STATE.tags.map(t=>{
    const id=String(tagId(t));
    return '<button type="button" class="tag'+(STATE.exclude.has(id)?' ex':'')+'" data-k="exclude" data-id="'+esc(id)+'">'+esc(tagName(t))+'</button>';
  }).join('');
  $('tagsFull').innerHTML=STATE.tags.map(t=>'<div class="journal-row"><strong>'+esc(tagName(t))+'</strong> <span class="subtle">id '+esc(tagId(t))+'</span></div>').join('')||'<span class="subtle">Liste vide.</span>';
}

async function loadStatus(){
  const d=await api('/status');
  const ok=d.systemeKeyConfigured;
  $('statusNote').innerHTML=
    '<strong>Expéditeur figé :</strong> '+esc(d.senderName)+' &lt;'+esc(d.senderEmail)+'&gt;<br>'+
    (ok
      ? '<span class="badge green">SYSTEME_API_KEY présente</span> '
      : '<span class="badge yellow">SYSTEME_API_KEY pas encore dans les secrets Cloudflare</span> ')+
    '<span class="subtle">'+esc(d.note||'')+'</span>';
  $('senderDisplay').value=d.senderName+' <'+d.senderEmail+'>';
}
async function loadTags(){
  try{
    const d=await api('/tags');
    STATE.tags=d.tags||[];
    renderTagPickers();
    if(d.error)toast(d.error,false);
  }catch(e){
    STATE.tags=[];
    renderTagPickers();
    toast(e.message,false);
  }
}
async function loadNews(){
  const box=$('newsList');
  box.innerHTML='<span class="subtle">Chargement…</span>';
  try{
    const d=await api('/newsletters');
    const list=d.newsletters||[];
    if(!list.length){box.innerHTML='<span class="subtle">'+(d.error||'Aucun brouillon lu pour l’instant.')+'</span>';if(d.error)toast(d.error,false);return}
    box.innerHTML=list.map(n=>{
      const subj=n.subject||n.title||'Sans sujet';
      const id=n.id!=null?n.id:'';
      return '<div class="journal-row"><strong>'+esc(subj)+'</strong><div class="subtle">id '+esc(id)+'</div></div>';
    }).join('');
  }catch(e){box.innerHTML='<span class="subtle">'+esc(e.message)+'</span>';toast(e.message,false)}
}
async function loadJournal(){
  const box=$('journalList');
  try{
    const d=await api('/journal');
    const list=d.journal||[];
    if(!list.length){box.innerHTML='<span class="subtle">Rien encore.</span>';return}
    box.innerHTML=list.map(j=>'<div class="journal-row"><strong>'+esc(j.action)+'</strong> — '+esc(j.subject||'')+'<div class="subtle">'+esc(j.at||'')+(j.error?(' · '+j.error):'')+'</div></div>').join('');
  }catch(e){box.innerHTML='<span class="subtle">'+esc(e.message)+'</span>'}
}

async function saveDraft(){
  const payload={
    subject:$('subject').value.trim(),
    theme:$('theme').value.trim(),
    preview:$('preview').value.trim(),
    content:$('content').value.trim(),
    includeTagIds:[...STATE.include],
    excludeTagIds:[...STATE.exclude]
  };
  $('draftOut').classList.add('hidden');
  try{
    const d=await api('/draft','POST',payload);
    toast('Brouillon créé dans Systeme.io');
    $('draftOut').classList.remove('hidden');
    $('draftOut').textContent=JSON.stringify(d,null,2);
    await loadJournal();
  }catch(e){
    toast(e.message,false);
    $('draftOut').classList.remove('hidden');
    $('draftOut').textContent=JSON.stringify(e.detail||{error:e.message},null,2);
  }
}

async function boot(){
  await loadStatus();
  await loadTags();
  await loadJournal();
}

document.querySelectorAll('.navbtn').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    const view=$('view-'+btn.dataset.view);
    if(view)view.classList.add('active');
    if(btn.dataset.view==='brouillons')loadNews();
    if(btn.dataset.view==='journal')loadJournal();
    if(btn.dataset.view==='tags')loadTags();
  };
});
document.addEventListener('click',e=>{
  const t=e.target.closest('.tag');
  if(!t)return;
  const id=t.dataset.id;
  const k=t.dataset.k;
  if(k==='include'){if(STATE.include.has(id))STATE.include.delete(id);else{STATE.include.add(id);STATE.exclude.delete(id)}}
  if(k==='exclude'){if(STATE.exclude.has(id))STATE.exclude.delete(id);else{STATE.exclude.add(id);STATE.include.delete(id)}}
  renderTagPickers();
});
$('loginBtn').onclick=doLogin;
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
$('logoutBtn').onclick=doLogout;
$('saveDraftBtn').onclick=saveDraft;
$('reloadTagsBtn').onclick=loadTags;
$('reloadNewsBtn').onclick=loadNews;
$('reloadJournalBtn').onclick=loadJournal;
checkAuth();
})();
