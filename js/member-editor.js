(function(){
  var dialog=document.createElement('dialog');
  dialog.style.cssText='background:#0A1628;color:#fff;border:1px solid #7B5CFF;border-radius:16px;padding:24px;max-width:620px;width:92%';
  dialog.innerHTML='<form method="dialog"><button class="btn btn-ghost" style="float:right">Fermer</button></form><h3>Modifier le compte</h3><p id="member-name"></p><label class="f" for="member-paypal">Adresse PayPal</label><input class="f" type="email" id="member-paypal"><button class="btn" type="button" id="save-member-paypal">Enregistrer PayPal</button><section id="member-rates"><h3 style="margin-top:24px">Commission personnelle par produit</h3><label class="f" for="member-product">Produit</label><select class="f" id="member-product"></select><p>Un champ vide utilise le taux du produit. 0 désactive la commission de ce cercle pour cette personne.</p><div class="grid2">'+[1,2,3].map(function(n){return '<div><label class="f" for="member-n'+n+'">Cercle '+n+' (%)</label><input class="f" type="number" min="0" max="100" step="0.01" id="member-n'+n+'" placeholder="Taux du produit"></div>'}).join('')+'</div><button class="btn" type="button" id="save-member-rates">Enregistrer les commissions</button><button class="btn btn-ghost" type="button" id="reset-member-rates">Revenir aux taux du produit</button></section><p id="member-edit-message" role="status"></p>';
  document.body.appendChild(dialog);
  var member=null,products=[],overrides=[];
  function el(id){return document.getElementById(id)}
  function message(text){el('member-edit-message').textContent=text}
  async function call(path,method,body){var out=await api(path,method,body);var d=out.data||out;if(d.error||out.error)throw new Error(d.error||out.error);return d}
  function showRates(){
    var p=products.find(function(p){return p.id===el('member-product').value});
    var o=overrides.find(function(o){return o.product_id===el('member-product').value});
    [1,2,3].forEach(function(n){el('member-n'+n).value=o&&o['commission_n'+n]!=null?o['commission_n'+n]:'';el('member-n'+n).placeholder='Taux du produit : '+(p&&p['commission_n'+n]!=null?p['commission_n'+n]:0)+' %'});
  }
  window.editCommissionMember=async function(id,role){
    try{
      var d=await call('/api/members?role='+encodeURIComponent(role),'GET');
      member=(d.members||[]).find(function(m){return m.id===id});
      if(!member)throw new Error('Compte introuvable.');
      el('member-name').textContent=member.prenom+' — '+member.email;
      el('member-paypal').value=member.paypal||'';message('');
      el('member-rates').hidden=role!=='affiliate';
      if(role==='affiliate'){
        var data=await call('/api/products','GET');products=data.products||[];
        var ods=await call('/api/commission-overrides?beneficiary_id='+encodeURIComponent(id),'GET');overrides=ods.overrides||[];
        el('member-product').replaceChildren();products.forEach(function(p){var opt=document.createElement('option');opt.value=p.id;opt.textContent=p.title+' · '+(p.seller_name||p.seller_id||'Super Admin');el('member-product').appendChild(opt)});showRates();
      }
      dialog.showModal();
    }catch(e){alert(e.message)}
  };
  el('member-product').onchange=showRates;
  el('save-member-paypal').onclick=async function(){try{if(!el('member-paypal').reportValidity())return;await call('/api/members/paypal','POST',{id:member.id,paypal:el('member-paypal').value});message('Adresse PayPal enregistrée.');loadMembers(member.role,member.role==='admin'?'a-list':'p-list');}catch(e){message(e.message)}};
  async function saveRates(reset){try{
    var productId=el('member-product').value;if(!productId)throw new Error('Choisis un produit.');
    var b={beneficiary_id:member.id,product_id:productId};
    [1,2,3].forEach(function(n){var input=el('member-n'+n);if(!reset&&!input.reportValidity())throw new Error('Pourcentage invalide.');b['commission_n'+n]=reset||input.value===''?null:Number(input.value)});
    await call('/api/commission-overrides','POST',b);
    var ods=await call('/api/commission-overrides?beneficiary_id='+encodeURIComponent(member.id),'GET');overrides=ods.overrides||[];showRates();message(reset?'Les taux du produit sont rétablis.':'Commissions personnelles enregistrées.');
  }catch(e){message(e.message)}}
  el('save-member-rates').onclick=function(){saveRates(false)};el('reset-member-rates').onclick=function(){saveRates(true)};
})();
