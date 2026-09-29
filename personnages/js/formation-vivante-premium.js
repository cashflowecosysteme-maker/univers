(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let FO_STATE=null,FO_EDIT_ID=null,FO_PORTAIL='',enhancing=false;
const BASE_PORTALS=[
  {id:'lena',name:'Léna'},{id:'selena',name:'Séléna'},{id:'kael',name:'Kael'},{id:'alex',name:'Alex'},
  {id:'diane',name:'Diane'},{id:'nyxia',name:'NyXia'},{id:'eric',name:'Éric / Cercles'},{id:'studio',name:'Studio Prompt'}
];
const BLOCK_TYPES=[
  {v:'texte',label:'Texte'},{v:'image',label:'Image'},{v:'audio',label:'Audio MP3'},{v:'video',label:'Vidéo'},
  {v:'exercice',label:'Exercice'},{v:'intervention',label:'Intervention du personnage'},{v:'lien',label:'Lien (quiz, page, Google Forms…)'}
];

function currentAgent(){return String($('characterSelect')?.value||'').trim()}
function currentName(){
  const s=$('characterSelect');if(!s||!s.value)return'—';
  return String(s.options[s.selectedIndex]?.textContent||s.value).split(' · ')[0].trim();
}
function setStatus(t,k=''){const e=$('status');if(e){e.textContent=t;e.className='status '+k}}
async function api(path,opt={}){
  const r=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.href='/';throw Error('Session expirée.')}
  if(!r.ok)throw Error(d.error||d.message||('Erreur '+r.status));
  return d;
}

function addStyles(){
  if($('formation-premium-style'))return;
  const st=document.createElement('style');st.id='formation-premium-style';
  st.textContent=`
  .fo-premium-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
  .fo-target{padding:9px 12px;border:1px solid rgba(244,200,66,.25);background:rgba(244,200,66,.07);border-radius:11px;color:#f7e7a2;font-size:12px}
  .fo-target strong{color:#fff}.fo-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end;margin:14px 0}
  .fo-table{display:grid;gap:8px}.fo-row{display:grid;grid-template-columns:minmax(180px,1.4fr) 90px 80px auto;gap:10px;align-items:center;padding:10px 12px;border-radius:11px;background:rgba(6,10,24,.45);border:1px solid rgba(123,92,255,.14)}
  .fo-row strong{color:#fff}.fo-row .fo-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
  .fo-editor{margin-top:14px;padding:14px;border-radius:14px;background:rgba(6,10,24,.36);border:1px solid rgba(123,92,255,.18)}
  .fo-editor-head,.fo-module-head,.fo-block-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .fo-module{background:rgba(15,28,63,.55);border:1px solid rgba(123,92,255,.22);border-radius:14px;padding:14px;margin-top:12px}
  .fo-module-actions,.fo-block-actions,.fo-actions-bottom{display:flex;gap:6px;flex-wrap:wrap}
  .fo-block{background:rgba(6,10,24,.5);border:1px solid rgba(123,92,255,.16);border-radius:11px;padding:11px;margin-top:9px}
  .fo-block-type{max-width:240px}.fo-actions-bottom{margin-top:16px}
  .fo-empty{padding:16px;text-align:center;color:#8891b8;border:1px dashed rgba(123,92,255,.2);border-radius:12px}
  @media(max-width:850px){.fo-row,.fo-toolbar{grid-template-columns:1fr}.fo-row .fo-actions{justify-content:flex-start}}
  `;
  document.head.appendChild(st);
}

async function defaultPortal(agent){
  try{
    const d=await api('/api/superadmin4/personnages/profile?code='+encodeURIComponent(agent));
    const p=d.profile||{};
    return String(p.primaryPortal||p.portail||'').trim();
  }catch(_){return''}
}
async function portalOptions(current){
  let list=[...BASE_PORTALS];
  try{
    const d=await api('/api/superadmin4/projects');
    const rows=Array.isArray(d.projects)?d.projects:[];
    const map={};list.forEach(p=>map[p.id]={...p});
    rows.forEach(p=>{
      const data=p.data||{},id=String(data.portalId||p.id||'').trim();
      if(id)map[id]={id,name:String(data.title||p.title||id)};
    });
    list=Object.values(map);
  }catch(_){}
  return list.map(p=>`<option value="${esc(p.id)}" ${p.id===current?'selected':''}>${esc(p.name)}</option>`).join('');
}

async function renderFullFormation(){
  if(enhancing)return;
  const panel=$('panel');if(!panel)return;
  const h2=panel.querySelector('h2');
  if(!h2||!/^Formation Vivante de /.test(h2.textContent.trim()))return;
  if(panel.dataset.formationPremium==='1')return;
  const agent=currentAgent();if(!agent)return;

  enhancing=true;
  try{
    addStyles();
    if(!FO_PORTAIL)FO_PORTAIL=await defaultPortal(agent)||'diane';
    panel.dataset.formationPremium='1';
    panel.innerHTML=`<div class="card">
      <div class="fo-premium-head">
        <div>
          <h2>Formation Vivante de ${esc(currentName())}</h2>
          <div class="section-note">Constructeur complet Formation Vivante du Super Admin : mêmes routes centrales et mêmes clés portail + personnage.</div>
        </div>
        <div class="fo-target">Personnage cible : <strong>${esc(currentName())}</strong> · code <strong>${esc(agent)}</strong></div>
      </div>

      <div class="fo-toolbar">
        <div>
          <label>Portail</label>
          <select id="fo-premium-portail"></select>
          <div class="hint">La formation n’apparaît que sur ce portail, pour ce personnage.</div>
        </div>
        <button class="btn primary" id="fo-premium-new" type="button">＋ Nouvelle formation</button>
      </div>

      <div id="fo-premium-list"></div>

      <div class="fo-editor" id="fo-premium-editor" style="display:none">
        <div class="fo-editor-head">
          <h3 id="fo-premium-editor-title" style="margin:0">Nouvelle formation</h3>
          <button class="btn" id="fo-premium-cancel" type="button">Fermer l’éditeur</button>
        </div>
        <div class="grid">
          <div><label>Titre *</label><input id="fo-titre" placeholder="Ex. Écrire ton roman"></div>
          <div><label>Identifiant</label><input id="fo-id" placeholder="auto d’après le titre"></div>
          <div class="full"><label>Description</label><input id="fo-desc" placeholder="De l’idée au manuscrit"></div>
          <div><label>Ordre d’affichage</label><input type="number" id="fo-ordre" value="0" step="1"></div>
        </div>
        <div class="actions-row"><button class="btn" id="fo-premium-add-module" type="button">➕ Ajouter un module</button></div>
        <div id="fo-modules"></div>
        <div class="fo-actions-bottom">
          <button class="btn primary" id="fo-premium-save" type="button">💾 Enregistrer la formation</button>
          <button class="btn" id="fo-premium-cancel-bottom" type="button">Annuler</button>
        </div>
      </div>
    </div>`;

    const sel=$('fo-premium-portail');
    sel.innerHTML=await portalOptions(FO_PORTAIL);
    if([...sel.options].some(o=>o.value===FO_PORTAIL))sel.value=FO_PORTAIL;
    else if(sel.options.length){FO_PORTAIL=sel.options[0].value;sel.value=FO_PORTAIL}
    sel.onchange=()=>{FO_PORTAIL=sel.value;FO_STATE=null;FO_EDIT_ID=null;hideEditor();loadList()};
    $('fo-premium-new').onclick=newFormation;
    $('fo-premium-add-module').onclick=()=>{collect();addModule()};
    $('fo-premium-save').onclick=saveFormation;
    $('fo-premium-cancel').onclick=cancelEdit;
    $('fo-premium-cancel-bottom').onclick=cancelEdit;
    await loadList();
  }finally{enhancing=false}
}

async function loadList(){
  const box=$('fo-premium-list');if(!box)return;
  box.innerHTML='<div class="fo-empty">Chargement…</div>';
  try{
    const d=await api('/api/formations?agent='+encodeURIComponent(currentAgent())+'&portail='+encodeURIComponent(FO_PORTAIL));
    const list=Array.isArray(d.formations)?d.formations:[];
    if(!list.length){box.innerHTML='<div class="fo-empty">Aucune formation pour ce personnage dans ce portail.</div>';return}
    box.innerHTML='<div class="fo-table">'+list.map(f=>`
      <div class="fo-row">
        <div><strong>${esc(f.titre||f.title||f.id)}</strong><div class="hint">${esc(f.id||'')}</div></div>
        <div><span class="badge">${(f.modules||[]).length} module(s)</span></div>
        <div class="hint">Ordre ${Number(f.ordre||0)}</div>
        <div class="fo-actions">
          <button class="btn small" type="button" data-fo-edit="${esc(f.id)}">Modifier</button>
          <button class="btn danger small" type="button" data-fo-delete="${esc(f.id)}">Supprimer</button>
        </div>
      </div>`).join('')+'</div>';
    box.querySelectorAll('[data-fo-edit]').forEach(b=>b.onclick=()=>editFormation(b.dataset.foEdit));
    box.querySelectorAll('[data-fo-delete]').forEach(b=>b.onclick=()=>deleteFormation(b.dataset.foDelete));
  }catch(e){box.innerHTML='<div class="fo-empty">'+esc(e.message)+'</div>'}
}

function blankBlock(type='texte'){return{type,contenu:'',url:'',legende:'',titre:'',intro:'',objectif:'',consigne:''}}
function newFormation(){
  FO_EDIT_ID=null;FO_STATE={id:'',titre:'',description:'',ordre:0,modules:[]};
  $('fo-premium-editor-title').textContent='Nouvelle formation';renderEditor();
}
async function editFormation(id){
  try{
    const d=await api('/api/formations?agent='+encodeURIComponent(currentAgent())+'&portail='+encodeURIComponent(FO_PORTAIL));
    const f=(d.formations||[]).find(x=>x.id===id);if(!f)throw Error('Formation introuvable.');
    FO_EDIT_ID=f.id;
    FO_STATE={id:f.id||'',titre:f.titre||'',description:f.description||'',ordre:f.ordre||0,
      modules:(f.modules||[]).map((m,i)=>({id:m.id||('m'+(i+1)),numero:m.numero!=null?m.numero:(i+1),titre:m.titre||('Module '+(i+1)),blocs:(m.blocs||[]).map(b=>({...blankBlock(b.type),...b}))}))
    };
    $('fo-premium-editor-title').textContent='Modifier : '+(f.titre||f.id);renderEditor();
  }catch(e){setStatus(e.message,'err')}
}
function cancelEdit(){FO_STATE=null;FO_EDIT_ID=null;hideEditor()}
function hideEditor(){if($('fo-premium-editor'))$('fo-premium-editor').style.display='none'}
async function deleteFormation(id){
  if(!confirm('Supprimer cette formation ? Cette action est définitive.'))return;
  try{
    await api('/api/formations/delete',{method:'POST',body:JSON.stringify({agent:currentAgent(),portail:FO_PORTAIL,id})});
    if(FO_EDIT_ID===id)cancelEdit();await loadList();setStatus('Formation supprimée.','ok');
  }catch(e){setStatus(e.message,'err')}
}
function addModule(){if(!FO_STATE)return;const n=FO_STATE.modules.length+1;FO_STATE.modules.push({id:'m'+n,numero:n,titre:'Module '+n,blocs:[]});renderEditor()}
function removeModule(mi){FO_STATE.modules.splice(mi,1);renumberModules();renderEditor()}
function moveModule(mi,dir){const j=mi+dir;if(j<0||j>=FO_STATE.modules.length)return;[FO_STATE.modules[mi],FO_STATE.modules[j]]=[FO_STATE.modules[j],FO_STATE.modules[mi]];renumberModules();renderEditor()}
function renumberModules(){FO_STATE.modules.forEach((m,i)=>{m.numero=i+1;if(!m.id)m.id='m'+(i+1)})}
function addBlock(mi){FO_STATE.modules[mi].blocs.push(blankBlock('texte'));renderEditor()}
function removeBlock(mi,bi){FO_STATE.modules[mi].blocs.splice(bi,1);renderEditor()}
function moveBlock(mi,bi,dir){const arr=FO_STATE.modules[mi].blocs,j=bi+dir;if(j<0||j>=arr.length)return;[arr[bi],arr[j]]=[arr[j],arr[bi]];renderEditor()}

function collect(){
  if(!FO_STATE)return;
  FO_STATE.titre=$('fo-titre')?.value||'';FO_STATE.description=$('fo-desc')?.value||'';FO_STATE.ordre=parseInt($('fo-ordre')?.value||'0',10)||0;
  const id=($('fo-id')?.value||'').trim();if(id)FO_STATE.id=id;
  FO_STATE.modules.forEach((m,mi)=>{
    const t=$('fo-m-titre-'+mi);if(t)m.titre=t.value;
    m.blocs.forEach((b,bi)=>{
      const type=$('fo-b-type-'+mi+'-'+bi);if(type)b.type=type.value;
      ['contenu','url','legende','titre','intro','objectif','consigne'].forEach(f=>{const el=$('fo-b-'+f+'-'+mi+'-'+bi);if(el)b[f]=el.value});
    });
  });
}
function inputField(mi,bi,f,l,v,p=''){return`<div style="margin-top:8px"><label>${esc(l)}</label><input id="fo-b-${f}-${mi}-${bi}" value="${esc(v||'')}" placeholder="${esc(p)}"></div>`}
function textField(mi,bi,f,l,v,p=''){return`<div style="margin-top:8px"><label>${esc(l)}</label><textarea id="fo-b-${f}-${mi}-${bi}" rows="3" placeholder="${esc(p)}">${esc(v||'')}</textarea></div>`}
function blockFields(mi,bi,b){
  if(b.type==='texte')return textField(mi,bi,'contenu','Contenu de la leçon',b.contenu,'Le texte que la personne lit');
  if(b.type==='intervention')return textField(mi,bi,'contenu','Ce que le personnage dit / fait — tu peux écrire {prenom}',b.contenu,'Ex. {prenom}, écoute bien cette partie, puis reviens me voir.');
  if(b.type==='image')return inputField(mi,bi,'url','Adresse de l’image (https)',b.url,'https://…')+inputField(mi,bi,'legende','Légende (optionnel)',b.legende);
  if(b.type==='audio')return inputField(mi,bi,'url','Adresse du MP3 (https)',b.url,'https://…/audio.mp3')+inputField(mi,bi,'titre','Titre (optionnel)',b.titre)+inputField(mi,bi,'intro','Intro suggérée (optionnel)',b.intro,'Ex. Écoute et reviens me voir.');
  if(b.type==='video')return inputField(mi,bi,'url','Adresse de la vidéo (https)',b.url,'https://… (YouTube, Vimeo, MP4…)')+inputField(mi,bi,'titre','Titre (optionnel)',b.titre)+inputField(mi,bi,'intro','Intro suggérée (optionnel)',b.intro);
  if(b.type==='exercice')return inputField(mi,bi,'objectif','Objectif (optionnel)',b.objectif,'Ce que l’exercice fait travailler')+textField(mi,bi,'consigne','Consigne',b.consigne,'Ce que la personne doit faire');
  if(b.type==='lien')return inputField(mi,bi,'url','Adresse du lien (https)',b.url,'https://docs.google.com/forms/…')+inputField(mi,bi,'titre','Texte du bouton / titre',b.titre,'Ex. Quiz du module 2')+inputField(mi,bi,'intro','Phrase que le personnage dit',b.intro,'Ex. Voici ton quiz, ouvre-le puis reviens me voir.');
  return''
}
function renderEditor(){
  if(!FO_STATE)return;const ed=$('fo-premium-editor');ed.style.display='block';
  $('fo-titre').value=FO_STATE.titre||'';$('fo-id').value=FO_STATE.id||'';$('fo-desc').value=FO_STATE.description||'';$('fo-ordre').value=FO_STATE.ordre||0;
  const wrap=$('fo-modules');
  if(!FO_STATE.modules.length){wrap.innerHTML='<div class="fo-empty">Aucun module. Ajoute ton premier module.</div>';return}
  wrap.innerHTML=FO_STATE.modules.map((m,mi)=>`
    <div class="fo-module">
      <div class="fo-module-head"><strong>Module ${mi+1}</strong><div class="fo-module-actions">
        <button class="btn small" type="button" data-mod-up="${mi}">↑</button>
        <button class="btn small" type="button" data-mod-down="${mi}">↓</button>
        <button class="btn danger small" type="button" data-mod-del="${mi}">Retirer le module</button>
      </div></div>
      <div style="margin-top:8px"><label>Titre du module</label><input id="fo-m-titre-${mi}" value="${esc(m.titre||'')}" placeholder="Ex. Construire ton personnage"></div>
      <div style="margin-top:12px;font-size:12px;color:#8891b8;font-weight:600">Blocs</div>
      ${m.blocs.length?m.blocs.map((b,bi)=>`
        <div class="fo-block">
          <div class="fo-block-head">
            <select class="fo-block-type" id="fo-b-type-${mi}-${bi}" data-type-mi="${mi}" data-type-bi="${bi}">
              ${BLOCK_TYPES.map(o=>`<option value="${o.v}" ${b.type===o.v?'selected':''}>${esc(o.label)}</option>`).join('')}
            </select>
            <div class="fo-block-actions">
              <button class="btn small" type="button" data-block-up="${mi}:${bi}">↑</button>
              <button class="btn small" type="button" data-block-down="${mi}:${bi}">↓</button>
              <button class="btn danger small" type="button" data-block-del="${mi}:${bi}">✕</button>
            </div>
          </div>
          <div>${blockFields(mi,bi,b)}</div>
        </div>`).join(''):'<div class="hint" style="margin:8px 0">Aucun bloc. Ajoute du texte, un audio, une vidéo, une image, un exercice, une intervention ou un lien.</div>'}
      <button class="btn small" type="button" data-block-add="${mi}" style="margin-top:10px">➕ Ajouter un bloc</button>
    </div>`).join('');

  wrap.querySelectorAll('[data-mod-up]').forEach(b=>b.onclick=()=>{collect();moveModule(Number(b.dataset.modUp),-1)});
  wrap.querySelectorAll('[data-mod-down]').forEach(b=>b.onclick=()=>{collect();moveModule(Number(b.dataset.modDown),1)});
  wrap.querySelectorAll('[data-mod-del]').forEach(b=>b.onclick=()=>{collect();const i=Number(b.dataset.modDel);if(confirm('Retirer ce module ?'))removeModule(i)});
  wrap.querySelectorAll('[data-block-add]').forEach(b=>b.onclick=()=>{collect();addBlock(Number(b.dataset.blockAdd))});
  wrap.querySelectorAll('[data-block-up]').forEach(b=>b.onclick=()=>{collect();const [mi,bi]=b.dataset.blockUp.split(':').map(Number);moveBlock(mi,bi,-1)});
  wrap.querySelectorAll('[data-block-down]').forEach(b=>b.onclick=()=>{collect();const [mi,bi]=b.dataset.blockDown.split(':').map(Number);moveBlock(mi,bi,1)});
  wrap.querySelectorAll('[data-block-del]').forEach(b=>b.onclick=()=>{collect();const [mi,bi]=b.dataset.blockDel.split(':').map(Number);removeBlock(mi,bi)});
  wrap.querySelectorAll('[data-type-mi]').forEach(sel=>sel.onchange=()=>{collect();const mi=Number(sel.dataset.typeMi),bi=Number(sel.dataset.typeBi);FO_STATE.modules[mi].blocs[bi].type=sel.value;renderEditor()});
}
async function saveFormation(){
  collect();if(!FO_STATE?.titre?.trim())return setStatus('Donne un titre à la formation.','err');
  try{
    const d=await api('/api/formations/save',{method:'POST',body:JSON.stringify({agent:currentAgent(),portail:FO_PORTAIL,formation:FO_STATE})});
    const saved=d.formation||FO_STATE;
    if(FO_EDIT_ID&&saved.id&&FO_EDIT_ID!==saved.id){
      try{await api('/api/formations/delete',{method:'POST',body:JSON.stringify({agent:currentAgent(),portail:FO_PORTAIL,id:FO_EDIT_ID})})}catch(_){}
    }
    FO_EDIT_ID=saved.id||FO_STATE.id;FO_STATE.id=FO_EDIT_ID||FO_STATE.id;if($('fo-id'))$('fo-id').value=FO_STATE.id||'';
    await loadList();setStatus('Formation enregistrée.','ok');
  }catch(e){setStatus(e.message,'err')}
}
function watch(){
  const panel=$('panel');if(!panel)return;
  new MutationObserver(()=>{renderFullFormation().catch(e=>setStatus(e.message,'err'))}).observe(panel,{childList:true,subtree:false});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-tab="formation"]')){FO_STATE=null;FO_EDIT_ID=null;FO_PORTAIL='';setTimeout(()=>renderFullFormation().catch(err=>setStatus(err.message,'err')),0)}});
  $('characterSelect')?.addEventListener('change',()=>{FO_STATE=null;FO_EDIT_ID=null;FO_PORTAIL=''});
  renderFullFormation().catch(e=>setStatus(e.message,'err'));
}
document.addEventListener('DOMContentLoaded',()=>{addStyles();setTimeout(watch,0)});
})();
