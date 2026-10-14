/* Liaison invisible : index existant → calendrier Systeme.io existant. Aucune page ajoutée. */
(()=>{'use strict';
 const key='nyxia_ref',url=new URL(location.href),incoming=url.searchParams.get('ref');let ref='';
 try{if(incoming!==null){if(/^[a-z0-9_-]{1,64}$/i.test(incoming)){ref=incoming.toUpperCase();sessionStorage.setItem(key,ref);}else sessionStorage.removeItem(key);}else ref=sessionStorage.getItem(key)||'';}catch(_){ref=incoming||'';}
 const allowed=u=>u.protocol==='https:'&&(u.hostname==='www.publication-web.com'||u.hostname==='publication-web.com'||u.hostname==='www.universnyxia.top'||u.hostname==='universnyxia.top'||u.hostname==='systeme.io'||u.hostname.endsWith('.systeme.io'));
 function decorate(a){try{const u=new URL(a.getAttribute('href'),location.href);if(ref&&allowed(u)){u.searchParams.set('ref',ref);a.href=u.href;}}catch(_){}}
 document.querySelectorAll('a[href]').forEach(decorate);document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(a)decorate(a);},true);
 // Le produit est fixé dans l’index; la destination vient de son offre enregistrée, sans parcourir les tunnels.
 const product=document.currentScript?.dataset?.nyxiaProduct;
 if(product){const links=[...document.querySelectorAll('a[href]')].filter(a=>{try{return /\/(rdv|rendez-vous|booking|calendar)/i.test(new URL(a.href,location.href).pathname);}catch(_){return false;}});const target=fetch('https://univers.nyxia.top/api/closer/booking-target?product='+encodeURIComponent(product),{cache:'no-store',credentials:'omit'}).then(async r=>{const d=await r.json();if(!r.ok||!d.success)throw Error('Réservation non raccordée.');const u=new URL(d.url);if(u.protocol!=='https:')throw Error('Lien de réservation invalide.');if(ref)u.searchParams.set('ref',ref);links.forEach(a=>a.href=u.href);return u.href;});target.catch(()=>console.warn('NyXia : vérifier le lien de rendez-vous enregistré pour ce produit.'));document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!links.includes(a))return;e.preventDefault();target.then(href=>location.assign(href)).catch(()=>{});},true);}
 // Sur la page Systeme.io seulement, transmettre l’origine à la soumission du formulaire existant.
 if(!allowed(url))return;
 let last='',timer,pending=Promise.resolve();
 function capture(){const inputs=[...document.querySelectorAll('input')],field=inputs.find(i=>i.type==='email'||/email/i.test(i.name||''));const email=String(field?.value||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return;const signature=email+'|'+ref;if(last===signature)return;last=signature;
 pending=fetch('https://univers.nyxia.top/api/closer/booking-origin',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({email,ref,booking_url:location.href}),credentials:'omit',keepalive:true}).then(r=>{if(!r.ok){last='';console.warn('NyXia : origine de réservation non enregistrée (HTTP '+r.status+').');}}).catch(()=>{last='';console.warn('NyXia : transmission de l’origine indisponible.');});}
 document.addEventListener('input',e=>{if(e.target.matches?.('input[type=email],input[name*=email]')){clearTimeout(timer);timer=setTimeout(capture,300);}},true);
 document.addEventListener('submit',capture,true);document.addEventListener('click',e=>{if(e.target.closest?.('button,[role=button],input[type=submit]'))capture();},true);
})();
