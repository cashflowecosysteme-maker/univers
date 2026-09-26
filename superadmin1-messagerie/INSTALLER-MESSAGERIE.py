#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
INDEX=ROOT/'index.html'
WORKER=ROOT/'_worker.js'
if not INDEX.exists() or not WORKER.exists():
    raise SystemExit('Lance cet installateur depuis la racine du dépôt univers (index.html + _worker.js).')

HERE=Path(__file__).resolve().parent
shutil.copy2(INDEX, ROOT/'index.AVANT-MESSAGERIE.html')
shutil.copy2(WORKER, ROOT/'_worker.AVANT-MESSAGERIE.js')

for src_rel,dst_rel in [
    ('messagerie-admin.html','messagerie-admin.html'),
    ('css/messagerie-admin.css','css/messagerie-admin.css'),
    ('js/messagerie-admin.js','js/messagerie-admin.js')
]:
    src=HERE/src_rel
    dst=ROOT/dst_rel
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)

idx=INDEX.read_text(encoding='utf-8')
if 'data-module="messagerie"' not in idx:
    anchor='<button class="module-tab" data-module="clients" onclick="switchModule(\'clients\')">Clients portails</button>'
    if anchor not in idx:
        raise SystemExit('Ancre Clients portails introuvable dans index.html.')
    idx=idx.replace(anchor,anchor+'\n    <button class="module-tab" data-module="messagerie" onclick="switchModule(\'messagerie\')">💬 Messagerie</button>',1)

if 'id="module-messagerie"' not in idx:
    anchor='<div class="module-panel" id="module-degustations">'
    if anchor not in idx:
        raise SystemExit('Ancre Dégustations introuvable dans index.html.')
    idx=idx.replace(anchor,'<div class="module-panel" id="module-messagerie" style="height:calc(100vh - 150px);padding:0">\n      <iframe src="/messagerie-admin.html" title="Messagerie NyXia" style="width:100%;height:100%;border:0;border-radius:16px;background:#060a18"></iframe>\n    </div>\n\n    '+anchor,1)

INDEX.write_text(idx,encoding='utf-8')

w=WORKER.read_text(encoding='utf-8')
module=(HERE/'worker-module.txt').read_text(encoding='utf-8')
if 'NYXIA MESSAGERIE CENTRALE' not in w:
    pos=w.find('export default')
    if pos<0:
        raise SystemExit('export default introuvable dans _worker.js.')
    w=w[:pos]+module+'\n\n'+w[pos:]

route1="if (url.pathname === '/api/messaging/admin/messages' && request.method === 'GET') return nyxMsgAdminList(request, env);"
route2="if (url.pathname === '/api/messaging/admin/reply' && request.method === 'POST') return nyxMsgAdminReply(request, env);"
if '/api/messaging/admin/messages' not in w:
    for p in ['const url = new URL(request.url);','const url=new URL(request.url);']:
        if p in w:
            w=w.replace(p,p+'\n    '+route1+'\n    '+route2,1)
            break
    else:
        raise SystemExit('Création de URL introuvable dans _worker.js.')

WORKER.write_text(w,encoding='utf-8')
print('✅ Messagerie Premium ajoutée à Super Admin 1.')
print('✅ Sauvegardes créées : index.AVANT-MESSAGERIE.html et _worker.AVANT-MESSAGERIE.js')
