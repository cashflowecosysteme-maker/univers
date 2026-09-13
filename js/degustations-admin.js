/* NyXia — Super Admin — Gestionnaire de Dégustations & Accès
   Ce fichier est chargé PAR le vrai index.html du Super Admin.
   Il n'installe aucun second admin et lit les portails dynamiquement via /api/degustations/meta.
*/
(function(){
'use strict';

var DG_STATE={portals:[],campaigns:[],permanent:[],grants:[],ownerEmail:''};

function dgEsc(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});
}
function dgMsg(id,text,ok){
  if(typeof showMsg==='function'){showMsg(id,text,ok);return;}
  var el=document.getElementById(id);if(!el)return;el.textContent=text;el.style.display='block';el.style.color=ok?'#00E676':'#ff6b6b';
}
function dgLocalDate(value){
  if(!value)return '';
  var d=new Date(value);if(isNaN(d.getTime()))return String(value).slice(0,16);
  var local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}
function dgIsoFromInput(id){
  var el=document.getElementById(id);if(!el||!el.value)return '';
  var d=new Date(el.value);return isNaN(d.getTime())?'':d.toISOString();
}
function dgMoney(c){
  if(c.price==null||c.price==='')return '—';
  try{return Number(c.price).toLocaleString('fr-CA',{style:'currency',currency:c.currency||'CAD'});}catch(_){return c.price+' '+(c.currency||'CAD');}
}
function dgPortalName(id){
  var p=DG_STATE.portals.find(function(x){return x.id===id;});return p?p.name:id;
}
function dgPortalChecks(containerId,selected,className){
  var box=document.getElementById(containerId);if(!box)return;
  var chosen=Array.isArray(selected)?selected:[];
  var active=DG_STATE.portals.filter(function(p){return p.active!==false;});
  if(!active.length){box.innerHTML='<span class="hint">Aucun portail actif. Ajoute-le d’abord dans l’onglet Portails.</span>';return;}
  box.innerHTML=active.map(function(p){
    return '<label style="display:flex;align-items:center;gap:7px;color:var(--t2);font-size:13px;cursor:pointer;padding:7px 10px;border:1px solid rgba(123,92,255,.18);border-radius:10px;background:rgba(15,28,63,.35)">'
      +'<input type="checkbox" class="'+className+'" value="'+dgEsc(p.id)+'" '+(chosen.indexOf(p.id)>=0?'checked':'')+'> '+dgEsc(p.name)+'</label>';
  }).join('');
}
function dgChecked(className){
  var out=[];document.querySelectorAll('.'+className+':checked').forEach(function(el){out.push(el.value);});return out;
}

async function degustationsLoad(){
  var status=document.getElementById('dg-load-state');if(status)status.textContent='Chargement…';
  try{
    var r=await api('/api/degustations/meta','GET');
    if(!r.res.ok)throw new Error(r.data.error||'Chargement impossible.');
    DG_STATE.portals=r.data.portals||[];
    DG_STATE.campaigns=r.data.campaigns||[];
    DG_STATE.permanent=r.data.permanent||[];
    DG_STATE.ownerEmail=r.data.ownerEmail||'';
    dgPortalChecks('dg-campaign-portals',[], 'dg-campaign-portal');
    dgPortalChecks('dg-permanent-portals',[], 'dg-permanent-portal');
    dgRenderCampaigns();
    dgRenderPermanent();
    dgRenderCampaignSelect();
    await dgLoadGrants();
    if(status)status.textContent='';
  }catch(e){if(status)status.textContent=e.message||String(e);}
}

function dgDurationPresetChanged(){
  var preset=document.getElementById('dg-duration-preset').value;
  var wrap=document.getElementById('dg-duration-custom-wrap');
  if(wrap)wrap.style.display=preset==='custom'?'block':'none';
  if(preset!=='custom')document.getElementById('dg-duration-hours').value=preset;
}
function dgAfterTypeChanged(){
  var t=document.getElementById('dg-after-type').value;
  var hint=document.getElementById('dg-after-url-hint');
  if(hint)hint.textContent=t==='boutique'?'Le lien peut rester vide : la Boutique NyXia sera utilisée.':'Page affichée quand l’accès temporaire est terminé.';
}

function dgResetCampaign(){
  document.getElementById('dg-c-id').value='';
  document.getElementById('dg-c-name').value='';
  document.getElementById('dg-c-status').value='draft';
  document.getElementById('dg-duration-preset').value='72';
  document.getElementById('dg-duration-hours').value='72';
  document.getElementById('dg-duration-custom-wrap').style.display='none';
  document.getElementById('dg-start-mode').value='first_login';
  document.getElementById('dg-available-from').value='';
  document.getElementById('dg-available-until').value='';
  document.getElementById('dg-price').value='';
  document.getElementById('dg-currency').value='CAD';
  document.getElementById('dg-checkout-url').value='';
  document.getElementById('dg-after-type').value='offer';
  document.getElementById('dg-after-url').value='';
  ['1','2'].forEach(function(n){document.getElementById('dg-cont-label-'+n).value='';document.getElementById('dg-cont-price-'+n).value='';document.getElementById('dg-cont-url-'+n).value='';});
  dgPortalChecks('dg-campaign-portals',[], 'dg-campaign-portal');
  document.getElementById('dg-editor-title').textContent='Créer une dégustation';
  document.getElementById('dg-cancel-edit').style.display='none';
}

function dgCampaignBody(){
  var preset=document.getElementById('dg-duration-preset').value;
  var duration=preset==='custom'?Number(document.getElementById('dg-duration-hours').value):Number(preset);
  var continuation=[];
  ['1','2'].forEach(function(n){
    var label=document.getElementById('dg-cont-label-'+n).value.trim();
    var price=document.getElementById('dg-cont-price-'+n).value;
    var url=document.getElementById('dg-cont-url-'+n).value.trim();
    if(label||price||url)continuation.push({label:label,price:price===''?null:Number(price),url:url});
  });
  return{
    id:document.getElementById('dg-c-id').value.trim(),
    name:document.getElementById('dg-c-name').value.trim(),
    status:document.getElementById('dg-c-status').value,
    portalIds:dgChecked('dg-campaign-portal'),
    durationHours:duration,
    startMode:document.getElementById('dg-start-mode').value,
    availableFrom:dgIsoFromInput('dg-available-from'),
    availableUntil:dgIsoFromInput('dg-available-until'),
    price:document.getElementById('dg-price').value===''?null:Number(document.getElementById('dg-price').value),
    currency:document.getElementById('dg-currency').value,
    checkoutUrl:document.getElementById('dg-checkout-url').value.trim(),
    afterExpiry:{type:document.getElementById('dg-after-type').value,url:document.getElementById('dg-after-url').value.trim()},
    continuation:continuation
  };
}

async function dgSaveCampaign(){
  var body=dgCampaignBody();
  if(!body.name){dgMsg('dg-c-msg','Donne un nom à la dégustation.',false);return;}
  if(!body.portalIds.length){dgMsg('dg-c-msg','Choisis au moins un portail.',false);return;}
  if(!body.durationHours||body.durationHours<1){dgMsg('dg-c-msg','La durée doit être d’au moins 1 heure.',false);return;}
  try{
    var r=await api('/api/degustations','POST',body);
    if(!r.res.ok)throw new Error(r.data.error||'Enregistrement impossible.');
    dgMsg('dg-c-msg','Dégustation enregistrée ✅',true);
    DG_STATE.campaigns=r.data.campaigns||[];
    dgRenderCampaigns();dgRenderCampaignSelect();dgResetCampaign();
  }catch(e){dgMsg('dg-c-msg',e.message||String(e),false);}
}

function dgEditCampaign(id){
  var c=DG_STATE.campaigns.find(function(x){return x.id===id;});if(!c)return;
  document.getElementById('dg-c-id').value=c.id||'';
  document.getElementById('dg-c-name').value=c.name||'';
  document.getElementById('dg-c-status').value=c.status||'draft';
  var h=Number(c.durationHours)||72;
  var preset=[72,168,720].indexOf(h)>=0?String(h):'custom';
  document.getElementById('dg-duration-preset').value=preset;
  document.getElementById('dg-duration-hours').value=h;
  document.getElementById('dg-duration-custom-wrap').style.display=preset==='custom'?'block':'none';
  document.getElementById('dg-start-mode').value=c.startMode||'first_login';
  document.getElementById('dg-available-from').value=dgLocalDate(c.availableFrom);
  document.getElementById('dg-available-until').value=dgLocalDate(c.availableUntil);
  document.getElementById('dg-price').value=c.price==null?'':c.price;
  document.getElementById('dg-currency').value=c.currency||'CAD';
  document.getElementById('dg-checkout-url').value=c.checkoutUrl||'';
  document.getElementById('dg-after-type').value=(c.afterExpiry&&c.afterExpiry.type)||'offer';
  document.getElementById('dg-after-url').value=(c.afterExpiry&&c.afterExpiry.url)||'';
  var cont=Array.isArray(c.continuation)?c.continuation:[];
  ['1','2'].forEach(function(n,i){var x=cont[i]||{};document.getElementById('dg-cont-label-'+n).value=x.label||'';document.getElementById('dg-cont-price-'+n).value=x.price==null?'':x.price;document.getElementById('dg-cont-url-'+n).value=x.url||'';});
  dgPortalChecks('dg-campaign-portals',c.portalIds||[], 'dg-campaign-portal');
  document.getElementById('dg-editor-title').textContent='Modifier — '+(c.name||'Dégustation');
  document.getElementById('dg-cancel-edit').style.display='inline-flex';
  document.getElementById('module-degustations').scrollIntoView({behavior:'smooth',block:'start'});
}
async function dgDeleteCampaign(id){
  if(!confirm('Supprimer cette campagne du gestionnaire ? Les accès déjà accordés ne seront pas effacés automatiquement.'))return;
  try{var r=await api('/api/degustations/delete','POST',{id:id});if(!r.res.ok)throw new Error(r.data.error||'Erreur');DG_STATE.campaigns=r.data.campaigns||[];dgRenderCampaigns();dgRenderCampaignSelect();}catch(e){alert(e.message||e);}
}
function dgCopyWebhook(id){
  var c=DG_STATE.campaigns.find(function(x){return x.id===id;});if(!c)return;
  var url=location.origin+'/api/access/activate?campaign='+encodeURIComponent(c.id)+'&key='+encodeURIComponent(c.webhookKey||'');
  navigator.clipboard.writeText(url).then(function(){alert('Webhook copié.');}).catch(function(){prompt('Copie ce webhook :',url);});
}
function dgRenderCampaigns(){
  var box=document.getElementById('dg-campaigns-list');if(!box)return;
  if(!DG_STATE.campaigns.length){box.innerHTML='<p class="hint">Aucune dégustation créée pour l’instant.</p>';return;}
  box.innerHTML='<div class="table-scroll"><table><thead><tr><th>Campagne</th><th>Portails</th><th>Durée</th><th>Disponibilité</th><th>Prix</th><th>État</th><th></th></tr></thead><tbody>'
    +DG_STATE.campaigns.map(function(c){
      var portals=(c.portalIds||[]).map(dgPortalName).join(', ');
      var availability=(c.availableFrom?new Date(c.availableFrom).toLocaleDateString('fr-CA'):'—')+' → '+(c.availableUntil?new Date(c.availableUntil).toLocaleDateString('fr-CA'):'—');
      return '<tr><td><strong>'+dgEsc(c.name)+'</strong><div class="hint">'+dgEsc(c.startMode==='first_login'?'Départ à la première entrée':'Départ à l’activation')+'</div></td><td>'+dgEsc(portals)+'</td><td>'+dgEsc(c.durationHours)+' h</td><td>'+dgEsc(availability)+'</td><td>'+dgEsc(dgMoney(c))+'</td><td>'+dgEsc(c.status||'draft')+'</td><td style="white-space:nowrap"><button class="btn btn-ghost" type="button" onclick="dgEditCampaign(\''+dgEsc(c.id)+'\')">Modifier</button> <button class="btn btn-ghost" type="button" onclick="dgCopyWebhook(\''+dgEsc(c.id)+'\')">Webhook</button> <button class="btn btn-danger" type="button" onclick="dgDeleteCampaign(\''+dgEsc(c.id)+'\')">Supprimer</button></td></tr>';
    }).join('')+'</tbody></table></div>';
}

function dgResetPermanent(){
  document.getElementById('dg-p-email').value='';document.getElementById('dg-p-role').value='staff';document.getElementById('dg-p-all').checked=false;document.getElementById('dg-p-note').value='';dgPortalChecks('dg-permanent-portals',[], 'dg-permanent-portal');
}
function dgPermanentAllChanged(){
  var disabled=document.getElementById('dg-p-all').checked;document.querySelectorAll('.dg-permanent-portal').forEach(function(x){x.disabled=disabled;});
}
async function dgSavePermanent(){
  var body={email:document.getElementById('dg-p-email').value.trim(),role:document.getElementById('dg-p-role').value,allPortals:document.getElementById('dg-p-all').checked,portalIds:dgChecked('dg-permanent-portal'),note:document.getElementById('dg-p-note').value.trim()};
  if(!body.email){dgMsg('dg-p-msg','Courriel requis.',false);return;}
  if(!body.allPortals&&!body.portalIds.length){dgMsg('dg-p-msg','Choisis au moins un portail ou « Tous les portails ».',false);return;}
  try{var r=await api('/api/access/permanent','POST',body);if(!r.res.ok)throw new Error(r.data.error||'Erreur');DG_STATE.permanent=r.data.permanent||[];dgRenderPermanent();dgResetPermanent();dgMsg('dg-p-msg','Accès permanent enregistré ✅',true);}catch(e){dgMsg('dg-p-msg',e.message||e,false);}
}
function dgEditPermanent(email){
  var p=DG_STATE.permanent.find(function(x){return x.email===email;});if(!p||p.protected)return;
  document.getElementById('dg-p-email').value=p.email||'';document.getElementById('dg-p-role').value=p.role||'staff';document.getElementById('dg-p-all').checked=!!p.allPortals;document.getElementById('dg-p-note').value=p.note||'';dgPortalChecks('dg-permanent-portals',p.portalIds||[], 'dg-permanent-portal');dgPermanentAllChanged();
}
async function dgDeletePermanent(email){
  if(!confirm('Retirer cet accès permanent ?'))return;
  try{var r=await api('/api/access/permanent/delete','POST',{email:email});if(!r.res.ok)throw new Error(r.data.error||'Erreur');DG_STATE.permanent=r.data.permanent||[];dgRenderPermanent();}catch(e){alert(e.message||e);}
}
function dgRenderPermanent(){
  var box=document.getElementById('dg-permanent-list');if(!box)return;
  box.innerHTML='<div class="table-scroll"><table><thead><tr><th>Courriel</th><th>Rôle</th><th>Portails</th><th>Note</th><th></th></tr></thead><tbody>'+(DG_STATE.permanent||[]).map(function(p){
    var portals=p.allPortals?'Tous les portails — présents et futurs':(p.portalIds||[]).map(dgPortalName).join(', ');
    var actions=p.protected?'<span style="color:var(--green);font-weight:700">Protégé</span>':'<button class="btn btn-ghost" type="button" onclick="dgEditPermanent(\''+dgEsc(p.email)+'\')">Modifier</button> <button class="btn btn-danger" type="button" onclick="dgDeletePermanent(\''+dgEsc(p.email)+'\')">Retirer</button>';
    return '<tr><td><strong>'+dgEsc(p.email)+'</strong></td><td>'+dgEsc(String(p.role||'').toUpperCase())+'</td><td>'+dgEsc(portals)+'</td><td>'+dgEsc(p.note||'')+'</td><td>'+actions+'</td></tr>';
  }).join('')+'</tbody></table></div>';
}

function dgRenderCampaignSelect(){
  var sel=document.getElementById('dg-manual-campaign');if(!sel)return;
  sel.innerHTML='<option value="">Choisir…</option>'+DG_STATE.campaigns.map(function(c){return '<option value="'+dgEsc(c.id)+'">'+dgEsc(c.name)+'</option>';}).join('');
}
async function dgGrantManual(){
  var email=document.getElementById('dg-manual-email').value.trim(),campaignId=document.getElementById('dg-manual-campaign').value;
  if(!email||!campaignId){dgMsg('dg-manual-msg','Courriel et campagne requis.',false);return;}
  try{var r=await api('/api/access/grant','POST',{email:email,campaignId:campaignId});if(!r.res.ok)throw new Error(r.data.error||'Erreur');dgMsg('dg-manual-msg','Dégustation activée ✅',true);document.getElementById('dg-manual-email').value='';await dgLoadGrants();}catch(e){dgMsg('dg-manual-msg',e.message||e,false);}
}
async function dgLoadGrants(){
  var box=document.getElementById('dg-grants-list');if(box)box.textContent='Chargement…';
  try{var r=await api('/api/access/grants','GET');if(!r.res.ok)throw new Error(r.data.error||'Erreur');DG_STATE.grants=r.data.grants||[];dgRenderGrants();}catch(e){if(box)box.textContent=e.message||e;}
}
async function dgDeleteGrant(key){
  if(!confirm('Retirer cet accès temporaire ?'))return;
  try{var r=await api('/api/access/grants/delete','POST',{key:key});if(!r.res.ok)throw new Error(r.data.error||'Erreur');await dgLoadGrants();}catch(e){alert(e.message||e);}
}
function dgRenderGrants(){
  var box=document.getElementById('dg-grants-list');if(!box)return;
  if(!DG_STATE.grants.length){box.innerHTML='<p class="hint">Aucun accès temporaire.</p>';return;}
  var now=Date.now();
  box.innerHTML='<div class="table-scroll"><table><thead><tr><th>Courriel</th><th>Campagne</th><th>Portail</th><th>Départ</th><th>Expiration</th><th>État</th><th></th></tr></thead><tbody>'+DG_STATE.grants.map(function(g){
    var exp=g.expiresAt?Date.parse(g.expiresAt):NaN;var status=g.pending?'En attente de première entrée':(Number.isFinite(exp)&&exp<now?'Expiré':'Actif');
    return '<tr><td><strong>'+dgEsc(g.email)+'</strong></td><td>'+dgEsc(g.campaignName||g.campaignId)+'</td><td>'+dgEsc(dgPortalName(g.portalId))+'</td><td>'+dgEsc(g.startedAt?new Date(g.startedAt).toLocaleString('fr-CA'):'—')+'</td><td>'+dgEsc(g.expiresAt?new Date(g.expiresAt).toLocaleString('fr-CA'):'—')+'</td><td>'+dgEsc(status)+'</td><td><button class="btn btn-danger" type="button" onclick="dgDeleteGrant(\''+dgEsc(g.key)+'\')">Retirer</button></td></tr>';
  }).join('')+'</tbody></table></div>';
}

// Expose uniquement les fonctions utilisées par le HTML / switchModule.
window.degustationsLoad=degustationsLoad;
window.dgDurationPresetChanged=dgDurationPresetChanged;
window.dgAfterTypeChanged=dgAfterTypeChanged;
window.dgResetCampaign=dgResetCampaign;
window.dgSaveCampaign=dgSaveCampaign;
window.dgEditCampaign=dgEditCampaign;
window.dgDeleteCampaign=dgDeleteCampaign;
window.dgCopyWebhook=dgCopyWebhook;
window.dgPermanentAllChanged=dgPermanentAllChanged;
window.dgSavePermanent=dgSavePermanent;
window.dgEditPermanent=dgEditPermanent;
window.dgDeletePermanent=dgDeletePermanent;
window.dgGrantManual=dgGrantManual;
window.dgDeleteGrant=dgDeleteGrant;
})();
