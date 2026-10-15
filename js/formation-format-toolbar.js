/* NyXia — mise en forme non destructive des blocs texte et intervention.
   Enregistre les balises Markdown standards dans les champs existants. */
(function(){
  'use strict';
  function eligible(t){
    if(!t || t.tagName!=='TEXTAREA')return false;
    if(/^fo-b-contenu-\d+-\d+$/.test(t.id))return true;
    if(t.dataset.b==='contenu' && t.closest('[data-block]'))return true;
    return false;
  }
  function apply(t,marker){
    var a=t.selectionStart,b=t.selectionEnd,src=t.value;
    if(typeof a!=='number'||typeof b!=='number')return;
    var selected=src.slice(a,b);
    // Lorsque la sélection est déjà encadrée, le bouton la retire.
    var wrap=marker+selected+marker, start=a+marker.length, end=b+marker.length;
    if(selected.startsWith(marker)&&selected.endsWith(marker)&&selected.length>=marker.length*2){
      wrap=selected.slice(marker.length,-marker.length);start=a;end=a+wrap.length;
    }else if(a>=marker.length && src.slice(a-marker.length,a)===marker && src.slice(b,b+marker.length)===marker){
      t.value=src.slice(0,a-marker.length)+selected+src.slice(b+marker.length);
      t.focus();t.setSelectionRange(a-marker.length,a-marker.length+selected.length);
      t.dispatchEvent(new Event('input',{bubbles:true}));return;
    }
    t.value=src.slice(0,a)+wrap+src.slice(b);
    t.focus();t.setSelectionRange(start,end);
    t.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function decorate(t){
    if(!eligible(t)||t.dataset.nyxiaFormatReady)return;
    t.dataset.nyxiaFormatReady='1';
    var bar=document.createElement('div');
    bar.className='nyxia-format-bar';
    bar.setAttribute('role','group');bar.setAttribute('aria-label','Mise en forme du texte');
    [['**','B','Gras'],['*','I','Italique']].forEach(function(spec){
      var btn=document.createElement('button');btn.type='button';
      btn.textContent=spec[1];btn.title=spec[2]+' — sélectionne ton texte';
      btn.setAttribute('aria-label',spec[2]);
      if(spec[1]==='B')btn.style.fontWeight='800';else btn.style.fontStyle='italic';
      btn.addEventListener('mousedown',function(e){e.preventDefault();});
      btn.addEventListener('click',function(){apply(t,spec[0]);});bar.appendChild(btn);
    });
    t.parentNode.insertBefore(bar,t);
  }
  function scan(root){
    if(root.nodeType!==1 && root.nodeType!==9)return;
    if(root.matches && root.matches('textarea'))decorate(root);
    if(root.querySelectorAll)root.querySelectorAll('textarea').forEach(decorate);
  }
  function start(){
    var style=document.createElement('style');
    style.textContent='.nyxia-format-bar{display:flex;gap:7px;align-items:center;margin:8px 0 5px}.nyxia-format-bar button{width:36px;height:31px;border-radius:9px;border:1px solid rgba(167,139,250,.45);background:#16132f;color:#eee7ff;cursor:pointer;font-size:15px}.nyxia-format-bar button:hover,.nyxia-format-bar button:focus-visible{border-color:#a78bfa;background:#30235e;outline:none}';
    document.head.appendChild(style);
    scan(document);
    var observer=new MutationObserver(function(records){records.forEach(function(r){r.addedNodes.forEach(scan);});});
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
