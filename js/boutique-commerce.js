(function(){
'use strict';
var API_BASE='https://boutique.nyxia.top';
var state={products:[],sellers:[],defaults:{n1:25,n2:10,n3:5},selected:null};
function el(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
async function api(path,opts){var r=await fetch(API_BASE+path,Object.assign({credentials:'include',headers:{'Content-Type':'application/json'}},opts||{}));var data=await r.json().catch(function(){return{}});if(r.status===401){el('auth-msg').classList.remove('hidden');throw new Error('Session Super Admin requise.')}if(!r.ok)throw new Error(data.error||'Erreur');return data}
function msg(id,text,ok){var n=el(id);n.textContent=text;n.className='msg '+(ok?'ok':'err')}
function blank(v){return v==null?'':String(v)}
function numOrNull(id){var v=el(id).value.trim();return v===''?null:Number(v)}
function copy(text){if(navigator.clipboard)return navigator.clipboard.writeText(text);var t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();return Promise.resolve()}
async function load(){
  try{
    var res=await Promise.all([api('/api/admin/commerce-products'),api('/api/admin/sellers'),api('/api/admin/superadmin-affiliate'),api('/api/admin/webhook-info')]);
    state.products=res[0].products||[];state.defaults=res[0].defaults||state.defaults;state.sellers=res[1].sellers||[];
    renderProducts();renderSellerOptions();renderSuper(res[2]);renderWebhook(res[3]);loadSales();
    if(state.selected){var again=state.products.find(function(p){return p.id===state.selected.id});if(again)selectProduct(again)}
  }catch(e){el('products').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function renderProducts(){
  var box=el('products');
  if(!state.products.length){box.innerHTML='<div class="empty">Aucun produit.</div>';return}
  box.innerHTML=state.products.map(function(p){return '<button class="product-item'+(state.selected&&state.selected.id===p.id?' active':'')+'" data-id="'+esc(p.id)+'"><strong>'+esc(p.title)+'</strong><small>'+esc(p.sellerId||'superadmin')+' · '+(p.price==null?'prix non défini':esc(p.price)+' $')+'</small><span class="source">'+esc(p.source)+'</span></button>'}).join('');
  box.querySelectorAll('[data-id]').forEach(function(b){b.addEventListener('click',function(){var p=state.products.find(function(x){return x.id===b.dataset.id});if(p)selectProduct(p)})})
}
function renderSellerOptions(){
  el('seller').innerHTML=state.sellers.map(function(s){return '<option value="'+esc(s.id)+'">'+esc((s.id==='superadmin'?'Super Admin — Diane':(s.full_name||s.email||s.id)))+'</option>'}).join('')
}
function selectProduct(p){
  state.selected=p;renderProducts();el('no-product').classList.add('hidden');el('form-wrap').classList.remove('hidden');
  el('product-title').textContent=p.title;el('product-meta').textContent=p.source+' · ID : '+p.id;
  el('seller').value=p.sellerId||'superadmin';el('commission-enabled').checked=p.commissionEnabled!==false;
  el('n1').value=blank(p.commissionN1);el('n2').value=blank(p.commissionN2);el('n3').value=blank(p.commissionN3);
  el('n1-hint').textContent='Vide → taux général actuel : '+state.defaults.n1+' %';el('n2-hint').textContent='Vide → taux général actuel : '+state.defaults.n2+' %';el('n3-hint').textContent='Vide → taux général actuel : '+state.defaults.n3+' %';
  el('checkout').value=p.systemeCheckoutUrl||'';el('plan-id').value=p.systemePricePlanId||'';el('plan-name').value=p.systemePricePlanName||'';
  var boutique=p.source.indexOf('boutique')>=0;el('media-section').classList.toggle('hidden',!boutique);el('media-na').classList.toggle('hidden',boutique);
  if(boutique){el('video-url').value=p.videoUrl||'';el('video-title').value=p.videoTitle||'';el('video-position').value=p.videoPosition||'gallery';el('testimonial-image').value=p.testimonialImageUrl||'';el('testimonial-mode').value=p.testimonialMode||'text'}
  el('save-msg').className='msg';el('save-msg').textContent='';
}
async function save(){
  if(!state.selected)return;
  var boutique=state.selected.source.indexOf('boutique')>=0;
  var body={id:state.selected.id,sellerId:el('seller').value,commissionEnabled:el('commission-enabled').checked,commissionN1:numOrNull('n1'),commissionN2:numOrNull('n2'),commissionN3:numOrNull('n3'),systemeCheckoutUrl:el('checkout').value.trim(),systemePricePlanId:el('plan-id').value.trim(),systemePricePlanName:el('plan-name').value.trim()};
  if(boutique){body.videoUrl=el('video-url').value.trim();body.videoTitle=el('video-title').value.trim();body.videoPosition=el('video-position').value;body.testimonialImageUrl=el('testimonial-image').value.trim();body.testimonialMode=el('testimonial-mode').value}
  try{await api('/api/admin/product-commerce',{method:'POST',body:JSON.stringify(body)});msg('save-msg','Enregistré. Le produit garde exactement les taux choisis, y compris 0 %.',true);await load()}catch(e){msg('save-msg',e.message,false)}
}
function renderSuper(data){var u=data.user||{};el('super-code').textContent=u.affiliate_code||'—';el('super-parent').value=data.parent&&data.parent.affiliate_code||'';el('super-parent-info').textContent=data.parent?('Parent actuel : '+(data.parent.full_name||data.parent.affiliate_code)):'Aucun parent actuellement.'}
async function saveParent(){try{var d=await api('/api/admin/superadmin-affiliate',{method:'POST',body:JSON.stringify({parentCode:el('super-parent').value.trim()})});renderSuper(d);msg('affiliate-msg','Position du Super Admin enregistrée.',true)}catch(e){msg('affiliate-msg',e.message,false)}}
async function regenCode(){if(!confirm('Régénérer ton code Super Admin ? Les anciens liens avec ton ancien code ne fonctionneront plus.'))return;try{var d=await api('/api/admin/superadmin-affiliate',{method:'POST',body:JSON.stringify({action:'regenerate'})});renderSuper(d);msg('affiliate-msg','Nouveau code créé.',true)}catch(e){msg('affiliate-msg',e.message,false)}}
function renderWebhook(data){el('webhook-url').textContent=data.webhookUrl||'—';el('webhook-secret').textContent=data.secret||'—'}
async function regenSecret(){if(!confirm('Régénérer le secret ? Il faudra remplacer l’URL du webhook dans Systeme.io.'))return;try{var d=await api('/api/admin/webhook-info',{method:'POST',body:JSON.stringify({action:'regenerate'})});renderWebhook(d);msg('webhook-msg','Nouveau secret créé. Mets la nouvelle URL dans Systeme.io.',true)}catch(e){msg('webhook-msg',e.message,false)}}
async function sync(){try{var d=await api('/api/admin/sync-boutique',{method:'POST',body:'{}'});alert(d.synced+' produit(s) Boutique synchronisé(s) avec le moteur financier.');load()}catch(e){alert(e.message)}}
async function loadSales(){try{var d=await api('/api/admin/recent-sales');var list=d.sales||[];if(!list.length){el('sales-box').innerHTML='<div class="empty">Aucune vente reçue pour le moment.</div>';return}el('sales-box').className='';el('sales-box').innerHTML='<table><thead><tr><th>État</th><th>Produit</th><th>Acheteur</th><th>Montant</th><th>Ref</th><th>Vendeur</th><th>Date</th><th></th></tr></thead><tbody>'+list.map(function(s){return '<tr><td><span class="status '+esc(s.status)+'">'+esc(s.status)+'</span></td><td>'+esc(s.product_id||'Non reconnu')+'</td><td>'+esc(s.buyer_email||'—')+'</td><td>'+esc(s.amount)+' '+esc(s.currency||'')+'</td><td>'+esc(s.ref_code||'—')+'</td><td>'+esc(s.seller_id||'—')+'</td><td>'+esc((s.updated_at||s.created_at||'').slice(0,19).replace('T',' '))+'</td><td>'+(s.status==='unmatched'?'<button class="btn" data-reprocess="'+esc(s.id)+'">Retraiter</button>':'')+'</td></tr>'}).join('')+'</tbody></table>';el('sales-box').querySelectorAll('[data-reprocess]').forEach(function(b){b.addEventListener('click',async function(){try{var r=await api('/api/admin/reprocess-sale',{method:'POST',body:JSON.stringify({id:b.dataset.reprocess})});alert(r.matched===false?'Toujours non reconnu : vérifie le plan Systeme.io du produit.':'Vente retraitée.');loadSales()}catch(e){alert(e.message)}})})}catch(e){el('sales-box').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
el('save').addEventListener('click',save);el('refresh').addEventListener('click',load);el('sync').addEventListener('click',sync);el('save-parent').addEventListener('click',saveParent);el('regen-code').addEventListener('click',regenCode);el('regen-secret').addEventListener('click',regenSecret);el('refresh-sales').addEventListener('click',loadSales);el('copy-code').addEventListener('click',function(){copy(el('super-code').textContent)});el('copy-webhook').addEventListener('click',function(){copy(el('webhook-url').textContent)});el('copy-secret').addEventListener('click',function(){copy(el('webhook-secret').textContent)});load();
})();
