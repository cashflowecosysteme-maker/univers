(function(){
  var dialog=document.createElement('dialog');
  var style=document.createElement('style');
  style.textContent=`
  .nyxia-member-popup{position:fixed;inset:0;margin:auto;width:min(650px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;padding:30px;background:linear-gradient(145deg,#111d38,#0A1628);color:#D6D9F0;border:1px solid rgba(242,198,109,.5);border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.65),0 0 36px rgba(123,92,255,.15);font-family:'Outfit',sans-serif;text-align:left;scrollbar-width:thin;scrollbar-color:#7B5CFF #0A1628}
  .nyxia-member-popup::backdrop{background:rgba(3,7,18,.8);backdrop-filter:blur(7px)}
  .nyxia-member-popup .member-close{position:absolute;top:14px;right:14px;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;border:1px solid rgba(167,139,250,.3);background:rgba(123,92,255,.12);color:#D6D9F0;font:22px 'Outfit',sans-serif;cursor:pointer}
  .nyxia-member-popup .member-close:hover{background:rgba(123,92,255,.25)}
  .nyxia-member-popup .member-kicker{font-size:11px;letter-spacing:1.3px;color:#a78bfa;margin:0 0 10px}
  .nyxia-member-popup h2{margin:0 28px 10px 0;font:500 25px 'Space Grotesk',sans-serif;color:#f2c66d;line-height:1.25}
  .nyxia-member-popup #member-name{margin:0 0 22px;font-size:14px;line-height:1.6;color:#aeb6d4;overflow-wrap:anywhere}
  .nyxia-member-popup .member-section{padding:20px;margin-top:16px;border-radius:17px;border:1px solid rgba(167,139,250,.2);background:rgba(123,92,255,.045)}
  .nyxia-member-popup h3{font:500 16px 'Space Grotesk',sans-serif;color:#D6D9F0;margin:0 0 18px;line-height:1.4}
  .nyxia-member-popup label.f{font:500 13px 'Outfit',sans-serif;color:#D6D9F0;text-transform:none;letter-spacing:0;display:block;margin:0 0 9px}
  .nyxia-member-popup input.f,.nyxia-member-popup select.f{box-sizing:border-box;display:block;width:100%;min-width:0;border-radius:12px;border:1px solid rgba(167,139,250,.3);background:#0b1429;color:#fff;padding:13px 14px;font:14px 'Outfit',sans-serif;outline:none;margin:0}
  .nyxia-member-popup select.f option{background:#0A1628;color:#D6D9F0}
  .nyxia-member-popup input.f::placeholder{color:#7f8bad;font-size:12px}
  .nyxia-member-popup input.f:focus,.nyxia-member-popup select.f:focus{border-color:#a78bfa;box-shadow:0 0 0 3px rgba(123,92,255,.12)}
  .nyxia-member-popup .member-hint{font-size:13px;line-height:1.6;color:#a0acca;margin:14px 0 18px}
  .nyxia-member-popup .member-hint strong{font-weight:500;color:#d1c4ff}
  .nyxia-member-popup .grid2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .nyxia-member-popup .member-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
  .nyxia-member-popup .btn{border-radius:50px;padding:11px 18px;border:1px solid #ffe5a4;background:#f2c66d;color:#160f25;font:600 13px 'Outfit',sans-serif;cursor:pointer;line-height:1.4;white-space:normal}
  .nyxia-member-popup .btn:hover{background:#ffe5a4;box-shadow:0 0 18px rgba(242,198,109,.16)}
  .nyxia-member-popup .btn-ghost{border:1px solid rgba(167,139,250,.35);background:rgba(123,92,255,.08);color:#c4b5fd}
  .nyxia-member-popup .btn-ghost:hover{background:rgba(123,92,255,.2)}
  .nyxia-member-popup #member-edit-message{margin:16px 0 0;min-height:20px;font-size:13px;line-height:1.5;color:#a78bfa}
  @media(max-width:560px){.nyxia-member-popup{padding:26px 18px}.nyxia-member-popup .member-section{padding:16px}.nyxia-member-popup .grid2{grid-template-columns:1fr}.nyxia-member-popup .member-actions .btn{width:100%}.nyxia-member-popup h2{font-size:22px}}
  `;
  document.head.appendChild(style);
  dialog.className='nyxia-member-popup';dialog.setAttribute('aria-labelledby','member-edit-title');
  dialog.innerHTML='<form method="dialog"><button class="member-close" aria-label="Fermer" title="Fermer">×</button></form><p class="member-kicker">✦ COMPTE PERSONNEL</p><h2 id="member-edit-title">Modifier le compte</h2><p id="member-name"></p><section class="member-section"><h3>Adresse de paiement</h3><label class="f" for="member-paypal">Adresse courriel PayPal</label><input class="f" type="email" autocomplete="email" id="member-paypal" placeholder="adresse@exemple.com"><div class="member-actions"><button class="btn" type="button" id="save-member-paypal">Enregistrer PayPal</button></div></section><section class="member-section" id="member-rates"><h3>Commission personnelle par produit</h3><div class="member-actions" style="margin:0 0 16px"><button class="btn btn-ghost" type="button" id="select-all-member-products">Sélectionner tous les portails et produits</button></div><label class="f" for="member-product">Portails et produits concernés</label><select class="f" id="member-product"></select><p class="member-hint">Un champ vide reprend <strong>le taux du produit</strong>. La valeur <strong>0 %</strong> désactive la commission de ce cercle pour cette personne.</p><div class="grid2">'+[1,2,3].map(function(n){return '<div><label class="f" for="member-n'+n+'">Cercle '+n+' (%)</label><input class="f" type="number" min="0" max="100" step="0.01" id="member-n'+n+'" placeholder="Taux du produit"></div>'}).join('')+'</div><div class="member-actions"><button class="btn" type="button" id="save-member-rates">Enregistrer les commissions</button><button class="btn btn-ghost" type="button" id="reset-member-rates">Revenir aux taux du produit</button></div></section><p id="member-edit-message" role="status" aria-live="polite"></p>';
  document.body.appendChild(dialog);
  var member=null,products=[],overrides=[];
  function el(id){return document.getElementById(id)}
  function message(text){el('member-edit-message').textContent=text}
  async function call(path,method,body){var out=await api(path,method,body);var d=out.data||out;if(d.error||out.error)throw new Error(d.error||out.error);return d}
  function showRates(){
    var p=products.find(function(p){return p.id===el('member-product').value});
    var o=overrides.find(function(o){return o.product_id===el('member-product').value});
    if(el('member-product').value==='__all__'){
      [1,2,3].forEach(function(n){var values=products.map(function(p){var rate=overrides.find(function(r){return r.product_id===p.id});return rate&&rate['commission_n'+n]!=null?rate['commission_n'+n]:null});var same=values.length&&values.every(function(v){return v===values[0]});el('member-n'+n).value=same&&values[0]!=null?values[0]:'';el('member-n'+n).placeholder=same?'Taux de chaque produit':'Taux différents — saisir le taux commun'});return;
    }
    [1,2,3].forEach(function(n){el('member-n'+n).value=o&&o['commission_n'+n]!=null?o['commission_n'+n]:'';el('member-n'+n).placeholder='Taux du produit : '+(p&&p['commission_n'+n]!=null?p['commission_n'+n]:0)+' %'});
  }
  window.editCommissionMember=async function(id,role){
    try{
      var d=await call('/api/members?role='+encodeURIComponent(role),'GET');
      member=(d.members||[]).find(function(m){return m.id===id});
      if(!member)throw new Error('Compte introuvable.');
      el('member-name').textContent=member.prenom+' — '+member.email+(member.closer?(member.closer_active?' · Closer actif — tous les portails':' · Closer désactivé'):'');
      el('member-paypal').value=member.paypal||'';message('');
      el('member-rates').hidden=role!=='affiliate';
      if(role==='affiliate'){
        var data=await call('/api/products','GET');products=data.products||[];
        var ods=await call('/api/commission-overrides?beneficiary_id='+encodeURIComponent(id),'GET');overrides=ods.overrides||[];
        el('member-product').replaceChildren();var all=document.createElement('option');all.value='__all__';all.textContent='Tous les portails et produits ('+products.length+')';el('member-product').appendChild(all);products.forEach(function(p){var opt=document.createElement('option');opt.value=p.id;opt.textContent=p.title+' · '+(p.seller_name||p.seller_id||'Super Admin');el('member-product').appendChild(opt)});showRates();
      }
      dialog.showModal();
    }catch(e){alert(e.message)}
  };
  el('member-product').onchange=showRates;
  el('select-all-member-products').onclick=function(){el('member-product').value='__all__';showRates();message('Tous les portails et produits sont sélectionnés. Saisis les pourcentages, puis clique sur Enregistrer les commissions.');};
  el('save-member-paypal').onclick=async function(){try{if(!el('member-paypal').reportValidity())return;await call('/api/members/paypal','POST',{id:member.id,paypal:el('member-paypal').value});message('Adresse PayPal enregistrée.');loadMembers(member.role,member.role==='admin'?'a-list':'p-list');}catch(e){message(e.message)}};
  async function saveRates(reset){try{
    var productId=el('member-product').value;if(!productId)throw new Error('Choisis un produit.');
    var b={beneficiary_id:member.id,product_id:productId};
    [1,2,3].forEach(function(n){var input=el('member-n'+n);if(!reset&&!input.reportValidity())throw new Error('Pourcentage invalide.');b['commission_n'+n]=reset||input.value===''?null:Number(input.value)});
    await call('/api/commission-overrides','POST',b);
    var ods=await call('/api/commission-overrides?beneficiary_id='+encodeURIComponent(member.id),'GET');overrides=ods.overrides||[];showRates();message(productId==='__all__'?(reset?'Les taux de tous les produits sont rétablis.':'Commissions enregistrées pour les '+products.length+' produits.'):(reset?'Les taux du produit sont rétablis.':'Commissions personnelles enregistrées.'));
  }catch(e){message(e.message)}}
  el('save-member-rates').onclick=function(){saveRates(false)};el('reset-member-rates').onclick=function(){saveRates(true)};
window.loadMembers=async function(role,listId){
  var box=document.getElementById(listId);if(!box)return;
  box.textContent='Chargement…';
  try{
    var out=await api('/api/members?role='+encodeURIComponent(role),'GET');
    var list=(out.data&&out.data.members)||out.members||[];
    if(!list.length){box.textContent='Aucun compte.';return;}
    box.innerHTML='<table><tr><th>Prénom</th><th>Courriel</th><th>Code unique</th><th>Lien /r/</th><th>PayPal</th><th></th></tr>'+list.map(function(m){
      var code=(m.code||m.affiliate_code||'').toString().trim().toUpperCase();
      var codeCell=code
        ? ('<code style="color:#c4b5fd;font-size:13px;font-weight:700;letter-spacing:.04em">'+esc(code)+'</code>')
        : '<span style="color:#F4C842">sans code</span>';
      var lien=code?('https://nyxia.top/r/'+code):'—';
      var lienCell=code
        ? ('<button type="button" class="btn btn-ghost" style="font-size:11px;padding:6px 10px" onclick="navigator.clipboard.writeText(\''+esc(lien)+'\')">Copier lien</button>')
        : '—';
      return '<tr><td><strong>'+esc(m.prenom)+'</strong>'+(m.closer?'<br><span style="color:#f2c66d;font-size:12px">'+(m.closer_active?'Closer · tous les portails':'Closer désactivé')+'</span>':'')+'</td><td>'+esc(m.email)+'</td><td>'+codeCell+'</td><td>'+lienCell+'</td><td>'+esc(m.paypal||'—')+'</td><td style="white-space:nowrap"><button class="btn btn-ghost" type="button" onclick="editCommissionMember(\''+esc(m.id)+'\',\''+role+'\')">Modifier</button> <button class="btn btn-ghost" type="button" onclick="regenCode(\''+esc(m.id)+'\',\''+role+'\',\''+esc(listId)+'\')">Nouveau code</button> <button class="btn btn-danger" type="button" onclick="delMember(\''+esc(m.id)+'\',\''+role+'\')">Supprimer</button></td></tr>';
    }).join('')+'</table>';
  }catch(e){box.textContent=e.message;}
};
})();
