(()=>{'use strict';

const PANEL_ID='panel';
const TOOL_PDF='https://portail-prompts.nyxia.top/pdf-to-markdown.html';
const TOOL_INGEST='https://portail-prompts.nyxia.top/ingestion.html';
let brainTab='overview';
let enhancing=false;

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currentCode=()=>String($('characterSelect')?.value||'').trim();
const currentName=()=>{
  const sel=$('characterSelect');
  if(!sel||!sel.value)return '—';
  return String(sel.options[sel.selectedIndex]?.textContent||sel.value).split(' · ')[0].trim();
};

function setMainStatus(text,kind=''){
  const e=$('status'); if(!e)return;
  e.textContent=text; e.className='status '+kind;
}
async function api(path,opt={}){
  const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.href='/';throw Error('Session expirée.')}
  if(!r.ok)throw Error(d.error||d.message||('Erreur '+r.status));
  return d;
}

function addStyles(){
  if($('brain-premium-style'))return;
  const st=document.createElement('style');
  st.id='brain-premium-style';
  st.textContent=`
  .brain-premium-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
  .brain-target{padding:9px 12px;border:1px solid rgba(244,200,66,.25);background:rgba(244,200,66,.07);border-radius:11px;color:#f7e7a2;font-size:12px}
  .brain-target strong{color:#fff}
  .brain-subtabs{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}
  .brain-subtabs button{border:1px solid rgba(123,92,255,.22);background:rgba(6,10,24,.55);color:#aeb5d2;padding:9px 11px;border-radius:10px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
  .brain-subtabs button.active{color:#fff;border-color:rgba(167,139,250,.55);background:rgba(123,92,255,.20)}
  .brain-pane{display:none}.brain-pane.active{display:block}
  .brain-tool-card{border:1px solid rgba(123,92,255,.18);border-radius:14px;background:rgba(6,10,24,.38);padding:14px;margin-top:10px}
  .brain-tool-card h3{margin-top:0}
  .brain-iframe-wrap{margin-top:12px;border:1px solid rgba(123,92,255,.20);border-radius:14px;overflow:hidden;background:#060a18}
  .brain-iframe{display:block;width:100%;height:760px;border:0;background:#060a18}
  .brain-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .brain-copy{font-size:11px}
  .brain-source-list{display:grid;gap:8px}
  .brain-source-row{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:11px;background:rgba(6,10,24,.45);border:1px solid rgba(123,92,255,.14)}
  .brain-source-row strong{color:#fff}
  .brain-empty{padding:18px;text-align:center;color:#8891b8;border:1px dashed rgba(123,92,255,.2);border-radius:12px}
  @media(max-width:800px){.brain-iframe{height:640px}}
  `;
  document.head.appendChild(st);
}

async function loadBrain(){
  const code=currentCode();
  if(!code)return {vectors:0,sources:[],bindings:{}};
  const d=await api('/api/vectorize/stats?agent='+encodeURIComponent(code));
  return d.data||d.brain||{};
}

function toolFrame(title,description,url){
  return `<div class="brain-tool-card">
    <h3>${esc(title)}</h3>
    <div class="section-note">${description}</div>
    <div class="brain-toolbar">
      <a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">↗ Ouvrir séparément si nécessaire</a>
      <span class="hint">Le personnage cible reste affiché au-dessus pendant ton travail.</span>
    </div>
    <div class="brain-iframe-wrap">
      <iframe class="brain-iframe" src="${esc(url)}" title="${esc(title)}" loading="lazy"></iframe>
    </div>
  </div>`;
}

async function renderEnhancedBrain(){
  if(enhancing)return;
  const panel=$(PANEL_ID);
  if(!panel)return;
  const h2=panel.querySelector('h2');
  if(!h2 || h2.textContent.trim()!=='Cerveau & connaissances')return;
  if(panel.dataset.brainPremium==='1')return;

  enhancing=true;
  try{
    addStyles();
    const code=currentCode();
    const name=currentName();
    const oldNs=panel.querySelector('#vectorNamespace')?.value||code;
    let b={vectors:0,sources:[],bindings:{}};
    try{b=await loadBrain()}catch(e){setMainStatus(e.message,'err')}

    panel.dataset.brainPremium='1';
    panel.innerHTML=`<div class="card">
      <div class="brain-premium-head">
        <div>
          <h2>Cerveau & connaissances</h2>
          <div class="section-note">Tout ce qui nourrit ce personnage est regroupé ici : texte rapide, préparation de documents, ingestion et suivi des sources.</div>
        </div>
        <div class="brain-target">Personnage cible : <strong>${esc(name)}</strong> · code <strong id="brainCurrentCode">${esc(code||'—')}</strong> <button class="btn small brain-copy" id="brainCopyCode" type="button">📋 Copier</button></div>
      </div>

      <div class="grid">
        <div><label>Namespace</label><input id="vectorNamespace" value="${esc(oldNs)}"></div>
        <div><label>État</label><div class="hint">Vectorize : ${b.bindings?.vectorize?'actif':'non détecté'} · AI : ${b.bindings?.ai?'actif':'non détecté'}</div></div>
        <div class="full brain-stats">
          <div class="stat"><span>Fragments</span><b>${Number(b.vectors||0)}</b></div>
          <div class="stat"><span>Sources</span><b>${(b.sources||[]).length}</b></div>
          <div class="stat"><span>Personnage</span><b>${esc(code||'—')}</b></div>
        </div>
      </div>

      <div class="brain-subtabs" id="brainSubtabs">
        <button type="button" data-brain-tab="overview">Vue d’ensemble</button>
        <button type="button" data-brain-tab="quick">Ajouter du texte</button>
        <button type="button" data-brain-tab="document">Document / livre</button>
        <button type="button" data-brain-tab="ingestion">Ingestion</button>
        <button type="button" data-brain-tab="sources">Sources</button>
      </div>

      <div class="brain-pane" data-brain-pane="overview">
        <div class="brain-tool-card">
          <h3>Vue d’ensemble</h3>
          <p class="hint">Le cerveau vectoriel utilisé ici reste le cerveau central du personnage. Aucun deuxième cerveau ni nouvelle base n’est créé.</p>
          <div class="actions-row">
            <button class="btn" id="brainRefresh" type="button">↻ Actualiser</button>
            <button class="btn danger" id="brainWipePremium" type="button">Effacer le cerveau de ce personnage</button>
          </div>
        </div>
      </div>

      <div class="brain-pane" data-brain-pane="quick">
        <div class="brain-tool-card">
          <h3>Ajouter rapidement du texte</h3>
          <div class="grid">
            <div><label>Nom de la source</label><input id="brainSourcePremium" placeholder="Ex. Manuel chamanisme — Module 1"></div>
            <div class="full"><label>Texte à ingérer</label><textarea id="brainTextPremium" style="min-height:240px" placeholder="Colle ici une note, une consigne ou un passage de texte."></textarea></div>
          </div>
          <div class="actions-row"><button class="btn primary" id="brainIngestPremium" type="button">🧠 Ajouter au cerveau</button></div>
        </div>
      </div>

      <div class="brain-pane" data-brain-pane="document">
        ${toolFrame('Document / livre · PDF → Markdown','Outil existant du Super Admin pour préparer un PDF ou un document long avant son ingestion. Il est affiché ici sans recréer un autre système.',TOOL_PDF)}
      </div>

      <div class="brain-pane" data-brain-pane="ingestion">
        ${toolFrame('Ingestion','Outil Ingestion existant du Super Admin, affiché directement dans la fiche du personnage pour éviter les allers-retours.',TOOL_INGEST)}
      </div>

      <div class="brain-pane" data-brain-pane="sources">
        <div class="brain-tool-card">
          <h3>Sources déjà présentes</h3>
          <div id="brainSourcesPremium" class="brain-source-list">${sourcesHtml(b.sources||[])}</div>
          <div class="actions-row"><button class="btn" id="brainRefreshSources" type="button">↻ Actualiser les sources</button></div>
        </div>
      </div>
    </div>`;

    bindBrain();
    activateBrainTab(brainTab);
  } finally {
    enhancing=false;
  }
}

function sourcesHtml(sources){
  return sources.length
    ? sources.map(s=>`<div class="brain-source-row"><strong>${esc(s.source||s.id||'Source')}</strong><span class="badge">${Number(s.chunks||0)} fragments</span></div>`).join('')
    : '<div class="brain-empty">Aucune connaissance vectorisée.</div>';
}

function activateBrainTab(next){
  brainTab=next||'overview';
  document.querySelectorAll('[data-brain-tab]').forEach(b=>b.classList.toggle('active',b.dataset.brainTab===brainTab));
  document.querySelectorAll('[data-brain-pane]').forEach(p=>p.classList.toggle('active',p.dataset.brainPane===brainTab));
}

async function refreshPremiumBrain(){
  const b=await loadBrain();
  const stats=document.querySelectorAll('.brain-stats .stat b');
  if(stats[0])stats[0].textContent=Number(b.vectors||0);
  if(stats[1])stats[1].textContent=(b.sources||[]).length;
  if($('brainSourcesPremium'))$('brainSourcesPremium').innerHTML=sourcesHtml(b.sources||[]);
  setMainStatus('Cerveau actualisé.','ok');
}

async function quickIngest(){
  const code=currentCode();
  const text=$('brainTextPremium')?.value.trim()||'';
  const source=$('brainSourcePremium')?.value.trim()||'source';
  if(!code)return setMainStatus('Enregistre ou choisis d’abord le personnage.','err');
  if(!text)return setMainStatus('Ajoute du texte à ingérer.','err');
  setMainStatus('Vectorisation…');
  try{
    await api('/api/vectorize/ingest',{method:'POST',body:JSON.stringify({agent:code,source,text})});
    if($('brainTextPremium'))$('brainTextPremium').value='';
    if($('brainSourcePremium'))$('brainSourcePremium').value='';
    await refreshPremiumBrain();
    setMainStatus('Connaissances ajoutées au cerveau de '+currentName()+'.','ok');
  }catch(e){setMainStatus(e.message,'err')}
}

async function wipeBrainPremium(){
  const code=currentCode();
  if(!code)return;
  if(!confirm('ATTENTION : effacer tout le cerveau vectoriel de '+currentName()+' ?'))return;
  if(!confirm('Dernière confirmation : cette action supprime les fragments vectorisés de ce personnage.'))return;
  try{
    await api('/api/vectorize/wipe',{method:'POST',body:JSON.stringify({agent:code})});
    await refreshPremiumBrain();
    setMainStatus('Cerveau vectoriel vidé.','ok');
  }catch(e){setMainStatus(e.message,'err')}
}

function bindBrain(){
  document.querySelectorAll('[data-brain-tab]').forEach(b=>b.onclick=()=>activateBrainTab(b.dataset.brainTab));
  if($('brainRefresh'))$('brainRefresh').onclick=()=>refreshPremiumBrain().catch(e=>setMainStatus(e.message,'err'));
  if($('brainRefreshSources'))$('brainRefreshSources').onclick=()=>refreshPremiumBrain().catch(e=>setMainStatus(e.message,'err'));
  if($('brainIngestPremium'))$('brainIngestPremium').onclick=quickIngest;
  if($('brainWipePremium'))$('brainWipePremium').onclick=wipeBrainPremium;
  if($('brainCopyCode'))$('brainCopyCode').onclick=async()=>{
    const code=currentCode();
    if(!code)return;
    try{await navigator.clipboard.writeText(code);setMainStatus('Code personnage copié : '+code,'ok')}
    catch(_){setMainStatus('Code personnage : '+code)}
  };
}

function observe(){
  const panel=$(PANEL_ID);
  if(!panel)return;
  const obs=new MutationObserver(()=>{renderEnhancedBrain().catch(e=>setMainStatus(e.message,'err'))});
  obs.observe(panel,{childList:true,subtree:false});
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-tab="cerveau"]');
    if(btn)setTimeout(()=>renderEnhancedBrain().catch(err=>setMainStatus(err.message,'err')),0);
  });
  renderEnhancedBrain().catch(e=>setMainStatus(e.message,'err'));
}

document.addEventListener('DOMContentLoaded',()=>{addStyles();setTimeout(observe,0)});
})();
