(function(){
  function $(id){return document.getElementById(id)}
  function message(id,text,ok){var el=$(id);if(!el)return;el.textContent=text;el.className='pw-msg '+(ok?'ok':'err')}
  function disabled(id,value){var el=$(id);if(el)el.disabled=!!value}
  function response(r){return r.json().then(function(data){return{ok:r.ok,data:data}}).catch(function(){return{ok:r.ok,data:{error:'Réponse invalide du serveur.'}}})}
  function clearSession(){sessionStorage.removeItem('nyxia_token');sessionStorage.removeItem('nyxia_username');sessionStorage.removeItem('nyxia_firstname');localStorage.removeItem('nyxia_user_context')}

  var forgot=$('forgot-form');
  if(forgot)forgot.addEventListener('submit',function(e){
    e.preventDefault();disabled('forgot-btn',true);
    fetch('https://univers.nyxia.top/api/access/password-forgot-universal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('forgot-email').value.trim(),portalHost:location.hostname})})
      .then(response).then(function(x){if(!x.ok)throw Error(x.data.error||'Envoi impossible.');message('forgot-msg',x.data.message||'Si un compte existe pour ce courriel, un lien a été envoyé.',true)})
      .catch(function(err){message('forgot-msg',err.message||'Envoi impossible.',false)})
      .finally(function(){disabled('forgot-btn',false)});
  });

  var reset=$('reset-form');
  if(reset){
    var resetToken=new URLSearchParams(location.search).get('token')||'';
    if(!resetToken)message('reset-msg','Ce lien de réinitialisation est invalide. Demande un nouveau lien.',false);
    reset.addEventListener('submit',function(e){
      e.preventDefault();var password=$('reset-password').value,confirm=$('reset-confirm').value;
      if(!resetToken){message('reset-msg','Ce lien de réinitialisation est invalide. Demande un nouveau lien.',false);return}
      if(password!==confirm){message('reset-msg','Les deux mots de passe ne correspondent pas.',false);return}
      disabled('reset-btn',true);
      fetch('https://univers.nyxia.top/api/access/password-reset-universal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:resetToken,password:password,confirm:confirm})})
        .then(response).then(function(x){if(!x.ok)throw Error(x.data.error||'Réinitialisation impossible.');clearSession();message('reset-msg',x.data.message||'Mot de passe modifié.',true);setTimeout(function(){location.href=x.data.loginUrl||'/login'},1200)})
        .catch(function(err){message('reset-msg',err.message||'Réinitialisation impossible.',false)})
        .finally(function(){disabled('reset-btn',false)});
    });
  }

  var change=$('change-form');
  if(change){
    var token=sessionStorage.getItem('nyxia_token')||'';
    if(!token){location.href='/login';return}
    fetch('/api/check-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token})})
      .then(response).then(function(x){if(!x.ok||!x.data.valid)location.href='/login'}).catch(function(){location.href='/login'});
    change.addEventListener('submit',function(e){
      e.preventDefault();var password=$('change-password').value,confirm=$('change-confirm').value;
      if(password!==confirm){message('change-msg','Les deux nouveaux mots de passe ne correspondent pas.',false);return}
      disabled('change-btn',true);
      fetch('/api/password/change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token,currentPassword:$('current-password').value,password:password,confirm:confirm})})
        .then(response).then(function(x){if(!x.ok)throw Error(x.data.error||'Changement impossible.');clearSession();message('change-msg',x.data.message||'Mot de passe modifié.',true);setTimeout(function(){location.href='/login'},1200)})
        .catch(function(err){message('change-msg',err.message||'Changement impossible.',false)})
        .finally(function(){disabled('change-btn',false)});
    });
  }
})();
