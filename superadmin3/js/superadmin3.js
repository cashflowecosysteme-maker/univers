(function(){
'use strict';
const API='/api/superadmin3';
const AUTH='/api';
const TOKEN_KEY='nyxia_univers_token';
let TOKEN=sessionStorage.getItem(TOKEN_KEY)||'';
const STATE={tags:[], include:new Set(), exclude:new Set(), plan:null, tagQ:''};

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
    showApp();await boot();return true;
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
    showApp();await boot();
  }catch(e){$('loginMsg').textContent=e.message}
}
async function doLogout(){
  try{await api('/logout','POST',{},AUTH)}catch(_){}
  TOKEN='';sessionStorage.removeItem(TOKEN_KEY);showLogin();
}
function tagName(t){return t.name||t.title||t.label||('#'+t.id)}
function tagId(t){return t.id!=null?t.id:t.name}
function visibleTags(){
  const q=STATE.tagQ.trim().toLowerCase();
  if(q.length<2) return STATE.tags;
  return STATE.tags.filter(t=>tagName(t).toLowerCase().includes(q)||String(tagId(t)).includes(q));
}
function renderTagPickers(){
  const list=visibleTags();
  const draw=(el,set,cls)=>{
    if(!STATE.tags.length){el.innerHTML='<span class="subtle">Aucun tag chargé.</span>';return}
    if(!list.length){el.innerHTML='<span class="subtle">Aucun tag pour ce filtre.</span>';return}
    el.innerHTML=list.map(t=>{
      const id=String(tagId(t));
      return '<button type="button" class="tag'+(set.has(id)?' '+cls:'')+'" data-k="'+(cls==='on'?'include':'exclude')+'" data-id="'+esc(id)+'">'+esc(tagName(t))+'</button>';
    }).join('');
  };
  draw($('includeTags'),STATE.include,'on');
  draw($('excludeTags'),STATE.exclude,'ex');
  $('tagsFull').innerHTML=STATE.tags.map(t=>'<div class="journal-row"><strong>'+esc(tagName(t))+'</strong> <span class="subtle">id '+esc(tagId(t))+'</span></div>').join('')||'<span class="subtle">Liste vide.</span>';
}
function collectBrief(){
  return {
    eventStart:$('eventStart').value,
    eventEnd:$('eventEnd').value,
    theme:$('theme').value.trim(),
    topic:$('topic').value.trim(),
    materials:$('materials').value.trim(),
    signature:$('signature').value.trim(),
    eventLink:$('eventLink').value.trim(),
    sendStart:$('sendStart').value,
    sendEnd:$('sendEnd').value,
    frequency:$('frequency').value,
    quantity:Number($('quantity').value)||1,
    includeTagIds:[...STATE.include],
    excludeTagIds:[...STATE.exclude]
  };
}
function renderPlan(plan){
  STATE.plan=plan||null;
  $('pushSeriesBtn').disabled=!plan||!plan.emails||!plan.emails.length;
  if(!plan){$('planMeta').textContent='Aucun brief encore.';$('planList').innerHTML='';return}
  const b=plan.brief||{};
  $('planMeta').innerHTML=esc(plan.emails.length)+' envois · '+esc(b.sendStart)+' → '+esc(b.sendEnd)+' · '+esc(b.frequency)+' × '+esc(b.quantity)+
    '<div class="subtle" style="margin-top:6px">Expéditeur : '+esc(plan.senderName)+' &lt;'+esc(plan.senderEmail)+'&gt;</div>';
  $('planList').innerHTML=plan.emails.map((m,i)=>'<article class="mail-card">'+
    '<header><b>#'+(i+1)+' · '+esc(m.date)+(m.slot&&m.slot!=='jour'?' · '+esc(m.slot):'')+'</b></header>'+
    '<label class="f">Objet</label><input class="f mail-subject" data-i="'+i+'" value="'+esc(m.subject)+'">'+
    '<label class="f">Preview</label><input class="f mail-preview" data-i="'+i+'" value="'+esc(m.preview||'')+'">'+
    '<label class="f">Corps</label><textarea class="f mail-body" data-i="'+i+'">'+esc(m.body||'')+'</textarea>'+
    '</article>').join('');
}
function syncPlanEdits(){
  if(!STATE.plan)return;
  STATE.plan.emails.forEach((m,i)=>{
    const s=document.querySelector('.mail-subject[data-i="'+i+'"]');
    const p=document.querySelector('.mail-preview[data-i="'+i+'"]');
    const b=document.querySelector('.mail-body[data-i="'+i+'"]');
    if(s)m.subject=s.value;
    if(p)m.preview=p.value;
    if(b)m.body=b.value;
  });
}
async function loadStatus(){
  const d=await api('/status');
  $('statusNote').innerHTML=
    '<strong>Expéditeur figé :</strong> '+esc(d.senderName)+' &lt;'+esc(d.senderEmail)+'&gt;<br>'+
    (d.systemeKeyConfigured?'<span class="badge green">Systeme.io branché</span> ':'<span class="badge yellow">SYSTEME_API_KEY manquante</span> ')+
    (d.aiConfigured?'<span class="badge green">IA Workers active</span>':'<span class="badge yellow">IA Workers absente — textes de secours</span>');
  $('senderDisplay').value=d.senderName+' <'+d.senderEmail+'>';
}
async function loadTags(){
  try{
    const d=await api('/tags');
    STATE.tags=d.tags||[];
    renderTagPickers();
    if(d.error)toast(d.error,false);
  }catch(e){STATE.tags=[];renderTagPickers();toast(e.message,false)}
}
async function loadNews(){
  const box=$('newsList');
  box.innerHTML='<span class="subtle">Chargement…</span>';
  try{
    const d=await api('/newsletters');
    const list=d.newsletters||[];
    if(!list.length){box.innerHTML='<span class="subtle">'+(d.error||'Aucun brouillon lu pour l’instant.')+'</span>';return}
    box.innerHTML=list.map(n=>'<div class="journal-row"><strong>'+esc(n.subject||n.title||'Sans sujet')+'</strong><div class="subtle">id '+esc(n.id||'')+'</div></div>').join('');
  }catch(e){box.innerHTML='<span class="subtle">'+esc(e.message)+'</span>'}
}
async function loadJournal(){
  const box=$('journalList');
  try{
    const d=await api('/journal');
    const list=d.journal||[];
    box.innerHTML=list.length?list.map(j=>'<div class="journal-row"><strong>'+esc(j.action)+'</strong> — '+esc(j.subject||'')+'<div class="subtle">'+esc(j.at||'')+(j.error?(' · '+j.error):'')+(j.count!=null?(' · '+j.count+' mails'):'')+'</div></div>').join(''):'<span class="subtle">Rien encore.</span>';
  }catch(e){box.innerHTML='<span class="subtle">'+esc(e.message)+'</span>'}
}
async function makePlan(){
  const brief=collectBrief();
  $('planBtn').disabled=true;
  $('planMeta').textContent='L’IA écrit la série…';
  try{
    const d=await api('/plan','POST',brief);
    renderPlan(d.plan);
    toast(d.plan.emails.length+' infolettres prêtes à relire');
  }catch(e){
    toast(e.message,false);
    $('draftOut').classList.remove('hidden');
    $('draftOut').textContent=JSON.stringify(e.detail||{error:e.message},null,2);
  }
  $('planBtn').disabled=false;
}
async function pushSeries(){
  if(!STATE.plan)return;
  syncPlanEdits();
  $('pushSeriesBtn').disabled=true;
  try{
    const d=await api('/draft-series','POST',{brief:STATE.plan.brief,emails:STATE.plan.emails});
    const ok=(d.results||[]).filter(r=>r.ok).length;
    const fail=(d.results||[]).filter(r=>!r.ok).length;
    toast(ok+' brouillon(s) créés'+(fail?(' · '+fail+' erreur(s)'):''),!fail);
    $('draftOut').classList.remove('hidden');
    $('draftOut').textContent=JSON.stringify(d,null,2);
    await loadJournal();
  }catch(e){
    toast(e.message,false);
    $('draftOut').classList.remove('hidden');
    $('draftOut').textContent=JSON.stringify(e.detail||{error:e.message},null,2);
  }
  $('pushSeriesBtn').disabled=false;
}
async function boot(){
  await loadStatus();
  await loadTags();
  try{
    const d=await api('/plan');
    if(d.plan)renderPlan(d.plan);
  }catch(_){}
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
  const id=t.dataset.id,k=t.dataset.k;
  if(k==='include'){if(STATE.include.has(id))STATE.include.delete(id);else{STATE.include.add(id);STATE.exclude.delete(id)}}
  if(k==='exclude'){if(STATE.exclude.has(id))STATE.exclude.delete(id);else{STATE.exclude.add(id);STATE.include.delete(id)}}
  renderTagPickers();
});
$('tagFilter').addEventListener('input',e=>{STATE.tagQ=e.target.value;renderTagPickers()});
$('loginBtn').onclick=doLogin;
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
$('logoutBtn').onclick=doLogout;
$('planBtn').onclick=makePlan;
$('pushSeriesBtn').onclick=pushSeries;
$('reloadTagsBtn').onclick=loadTags;
$('reloadNewsBtn').onclick=loadNews;
$('reloadJournalBtn').onclick=loadJournal;
checkAuth();
})();
