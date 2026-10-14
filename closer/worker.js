// Outil Closer — données partagées avec Promoteurs, accès Univers uniquement.
const schemaJobs = new WeakMap();
const TAX_MODE_DEFAULT = 'qc_included';
function taxMode(v){const mode=v??TAX_MODE_DEFAULT;if(!['qc_included','none'].includes(mode))fail('Choisis le traitement des taxes de cette offre.',422);return mode;}
function saleTaxBreakdown(gross,mode){
 mode=taxMode(mode);const grossCents=Math.round(gross*100);
 if(!Number.isSafeInteger(grossCents)||grossCents<0)fail('Montant du paiement invalide.',422);
 const netCents=mode==='qc_included'?Math.round(grossCents*100000/114975):grossCents;
 return {gross_amount:grossCents/100,amount:netCents/100,tax_amount:(grossCents-netCents)/100,tax_mode:mode};
}
const STATUSES = ['a_reserver','a_confirmer','programme','attribue','effectue','sans_suite','annule'];
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
const now = () => new Date().toISOString();
const txt = (v,max=5000) => String(v ?? '').trim().slice(0,max);
const fail = (message,status=400) => { const e=new Error(message);e.status=status;throw e; };
const email = v => {const e=txt(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail('Courriel valide requis.');return e;};
const bool = v => v===true || v===1;
function safeUrl(v,required=false){const s=txt(v,2000);if(!s){if(required)fail('Lien HTTPS requis.');return '';}let u;try{u=new URL(s);}catch(_){fail('Lien invalide.');}if(u.protocol!=='https:'||u.username||u.password)fail('Utilise un lien HTTPS sans identifiants.');return u.href;}
function stripePaymentUrl(v){const value=safeUrl(v);if(!value)return '';const u=new URL(value);if(u.hostname!=='buy.stripe.com'||!/^\/[a-zA-Z0-9_]+$/.test(u.pathname))fail('Colle le lien de paiement client Stripe (https://buy.stripe.com/…).');u.searchParams.delete('client_reference_id');u.searchParams.delete('prefilled_email');u.hash='';return u.href;}
function stripeLinkId(v){const id=txt(v,2000).match(/plink_[a-zA-Z0-9]+/);if(!id)fail('Colle l’adresse de la fiche du lien dans ton tableau de bord Stripe, contenant plink_… .');return id[0];}
function paymentUrl(v){const u=new URL(safeUrl(v,true));if(!u.pathname||u.pathname==='/')fail('Utilise le lien de la page de paiement, pas la page d’accueil.');u.searchParams.delete('nxdeal');u.searchParams.delete('ref');return u.href;}
async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function token(){return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function schema(env,helpers){if(!env.DB)fail('Base de données DB absente.',503);let job=schemaJobs.get(env.DB);if(!job){job=(async()=>{
 await helpers.ensureCommissionsTable(env);
 const ui=await env.DB.prepare('PRAGMA table_info(users)').all();if(!(ui.results||[]).some(c=>c.name==='paypal_email')){try{await env.DB.prepare('ALTER TABLE users ADD COLUMN paypal_email TEXT').run();}catch(e){const fresh=await env.DB.prepare('PRAGMA table_info(users)').all();if(!(fresh.results||[]).some(c=>c.name==='paypal_email'))throw e;}}
 const ci=await env.DB.prepare('PRAGMA table_info(commissions)').all();if(!(ci.results||[]).some(c=>c.name==='buyer_name')){try{await env.DB.prepare('ALTER TABLE commissions ADD COLUMN buyer_name TEXT').run();}catch(e){const fresh=await env.DB.prepare('PRAGMA table_info(commissions)').all();if(!(fresh.results||[]).some(c=>c.name==='buyer_name'))throw e;}}
 const sql=[
 `CREATE TABLE IF NOT EXISTS closer_booking_origins(offer_id TEXT NOT NULL,email_hash TEXT NOT NULL,referrer_id TEXT,expires_at TEXT NOT NULL,PRIMARY KEY(offer_id,email_hash))`,
 `CREATE TABLE IF NOT EXISTS closer_bookings(booking_id TEXT PRIMARY KEY,offer_id TEXT NOT NULL,deal_id TEXT NOT NULL UNIQUE,origin_status TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS closer_accounts(user_id TEXT PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS closer_offers(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,title TEXT NOT NULL,portal TEXT NOT NULL,payment_url TEXT NOT NULL,booking_url TEXT NOT NULL DEFAULT '',step_id TEXT NOT NULL,price_plan_id TEXT NOT NULL DEFAULT '',amount REAL NOT NULL,test_enabled INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS closer_deals(id TEXT PRIMARY KEY,offer_id TEXT NOT NULL,buyer_name TEXT NOT NULL,buyer_email TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',appointment_at TEXT,timezone TEXT NOT NULL DEFAULT 'America/Toronto',referrer_id TEXT,closer_id TEXT,status TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS closer_links(token_hash TEXT PRIMARY KEY,deal_id TEXT NOT NULL,snapshot TEXT NOT NULL,expires_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS closer_sales(id TEXT PRIMARY KEY,external_id TEXT NOT NULL UNIQUE,deal_id TEXT NOT NULL,product_id TEXT NOT NULL,closer_id TEXT NOT NULL,referrer_id TEXT,amount REAL NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL,attempt TEXT NOT NULL,created_at TEXT NOT NULL,cancelled_at TEXT)`,
 `CREATE TABLE IF NOT EXISTS commission_sales(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL,product_id TEXT NOT NULL,external_id TEXT NOT NULL,amount REAL NOT NULL,currency TEXT NOT NULL,attempt TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(seller_id,product_id,external_id))`,
 `CREATE TABLE IF NOT EXISTS closer_audit(id TEXT PRIMARY KEY,deal_id TEXT,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS idx_closer_sale_deal ON closer_sales(deal_id)`,
 `CREATE INDEX IF NOT EXISTS idx_closer_deals_date ON closer_deals(appointment_at)`,
 `CREATE INDEX IF NOT EXISTS idx_closer_links_deal ON closer_links(deal_id)`];
 for(const q of sql)await env.DB.prepare(q).run();
 // Les offres existantes utilisent les prix TPS/TVQ incluses confirmés par Diane.
 for(const [table,columns] of [['closer_offers',[['tax_mode',"TEXT NOT NULL DEFAULT 'qc_included'"],['stripe_payment_url',"TEXT NOT NULL DEFAULT ''"],['stripe_payment_link_id',"TEXT NOT NULL DEFAULT ''"]]],['closer_sales',[['gross_amount','REAL'],['tax_amount','REAL'],['tax_mode','TEXT'],['payment_provider','TEXT'],['stripe_payment_intent','TEXT']]]]){
  const info=await env.DB.prepare('PRAGMA table_info('+table+')').all();
  for(const [name,type] of columns)if(!(info.results||[]).some(c=>c.name===name)){
   try{await env.DB.prepare('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type).run()}catch(e){const fresh=await env.DB.prepare('PRAGMA table_info('+table+')').all();if(!(fresh.results||[]).some(c=>c.name===name))throw e}
  }
 }
 const meetingColumns=await env.DB.prepare('PRAGMA table_info(closer_deals)').all();if(!(meetingColumns.results||[]).some(c=>c.name==='meeting_url')){try{await env.DB.prepare("ALTER TABLE closer_deals ADD COLUMN meeting_url TEXT NOT NULL DEFAULT ''").run()}catch(e){const fresh=await env.DB.prepare('PRAGMA table_info(closer_deals)').all();if(!(fresh.results||[]).some(c=>c.name==='meeting_url'))throw e}}
 })();schemaJobs.set(env.DB,job);}try{await job;}catch(e){schemaJobs.delete(env.DB);throw e;}}
const query = async (env,q,...v)=>(await env.DB.prepare(q).bind(...v).all()).results||[];
const first = (env,q,...v)=>env.DB.prepare(q).bind(...v).first();
const audit = (env,deal,action,details)=>env.DB.prepare('INSERT INTO closer_audit(id,deal_id,action,details,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),deal||null,action,JSON.stringify(details),now());
async function affiliate(env,id){const u=await first(env,"SELECT id,full_name,email,affiliate_code,parent_id,paypal_email FROM users WHERE id=? AND role='affiliate'",id);if(!u||!u.affiliate_code)fail('Ce membre doit être inscrit comme Promoteur et posséder son code.',404);return u;}
async function offer(env,id){const o=await first(env,"SELECT o.*,p.seller_id,p.title AS product_title FROM closer_offers o JOIN marketplace_products p ON p.id=o.product_id WHERE o.id=?",id);if(!o)fail('Offre introuvable.',404);if(String(o.seller_id||'superadmin').toLowerCase()!=='superadmin')fail('L’offre doit appartenir au Super Admin.',403);return o;}
async function chain(env,id){const result=[],seen=new Set();for(let i=0;id&&i<3;i++){if(seen.has(id))fail('Une boucle a été trouvée dans l’équipe. Corrige le rattachement avant de générer le paiement.');seen.add(id);const u=await affiliate(env,id);result.push({id:u.id,code:u.affiliate_code,level:i+1,rate:[8,5,2][i]});id=u.parent_id;}return result;}
async function mutable(env,id){const d=await first(env,'SELECT * FROM closer_deals WHERE id=?',id);if(!d)fail('Dossier introuvable.',404);const sale=await first(env,'SELECT id FROM closer_sales WHERE deal_id=?',id);if(sale)fail('Ce dossier possède déjà une vente. Ses attributions sont conservées.',409);return d;}
function matchesPaymentPage(snapshot,data){
 const step=txt((data.funnelStep||data.funnel_step||{}).id);
 if(snapshot.step_id)return step===snapshot.step_id;
 try{const expected=new URL(snapshot.payment_url),received=new URL(data.customer?.sourceUrl||data.customer?.sourceURL||data.customer?.source_url||'');return received.origin===expected.origin&&received.pathname===expected.pathname&&[...expected.searchParams].every(([k,v])=>received.searchParams.get(k)===v);}catch(_){return false;}
}
async function deleteOffer(env,b){
 const id=txt(b.id,100);if(!id)fail('Sélectionne une offre à supprimer.',422);
 await offer(env,id);
 const result=await env.DB.prepare(`DELETE FROM closer_offers WHERE id=? AND NOT EXISTS(SELECT 1 FROM closer_deals WHERE offer_id=?) AND NOT EXISTS(SELECT 1 FROM closer_bookings WHERE offer_id=?)`).bind(id,id,id).run();
 if(!result.meta?.changes)fail('Cette offre est liée à un rendez-vous ou à une vente. Elle ne peut pas être supprimée ; tu peux la désactiver dans son formulaire.',409);
 return {success:true,id};
}
async function saveOffer(env,b){const id=txt(b.id,100)||crypto.randomUUID(),product=await first(env,"SELECT id,title FROM marketplace_products WHERE id=? AND (seller_id IS NULL OR seller_id='' OR lower(seller_id)='superadmin')",txt(b.product_id,100));if(!product)fail('Choisis un produit Super Admin existant.');const mode=taxMode(b.tax_mode);const stripeUrl=stripePaymentUrl(b.stripe_payment_url);const stripeId=stripeUrl?stripeLinkId(b.stripe_payment_link_id):'';const amount=Number(b.amount);if(!Number.isFinite(amount)||amount<=0||Math.abs(Math.round(amount*100)-amount*100)>0.000001)fail('Montant positif avec deux décimales maximum requis.');const step=txt(b.step_id,40);if(step&&!/^\d+$/.test(step))fail('Référence de page invalide.');const plan=txt(b.price_plan_id,40);if(plan&&!/^\d+$/.test(plan))fail('Identifiant du tarif invalide.');const title=txt(product.title,180);if(!title)fail('Le produit choisi doit posséder un nom dans le Répertoire.');const previous=b.id?await first(env,'SELECT product_id,portal FROM closer_offers WHERE id=?',id):null;const portal=previous?.product_id===product.id?previous.portal:title;
 await env.DB.prepare(`INSERT INTO closer_offers(id,product_id,title,portal,payment_url,booking_url,step_id,price_plan_id,amount,tax_mode,stripe_payment_url,stripe_payment_link_id,test_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id,title=excluded.title,portal=excluded.portal,payment_url=excluded.payment_url,booking_url=excluded.booking_url,step_id=excluded.step_id,price_plan_id=excluded.price_plan_id,amount=excluded.amount,tax_mode=excluded.tax_mode,stripe_payment_url=excluded.stripe_payment_url,stripe_payment_link_id=excluded.stripe_payment_link_id,test_enabled=excluded.test_enabled,active=excluded.active,updated_at=excluded.updated_at`).bind(id,product.id,title,portal,paymentUrl(b.payment_url),safeUrl(b.booking_url),step,plan,amount,mode,stripeUrl,stripeId,bool(b.test_enabled)?1:0,b.active===false?0:1,now(),now()).run();return {success:true,id};}
async function saveDeal(env,b){const previous=b.id?await mutable(env,txt(b.id,100)):null;const o=await offer(env,txt(b.offer_id,100));if(!o.active)fail('Cette offre est désactivée.');let referrer=null;if(b.referrer_id)referrer=await affiliate(env,txt(b.referrer_id,100));let closer=null;if(b.closer_id){closer=await affiliate(env,txt(b.closer_id,100));if(!await first(env,'SELECT user_id FROM closer_accounts WHERE user_id=? AND active=1',closer.id))fail('Closer non actif.');}const name=txt(b.buyer_name,180);if(!name)fail('Nom du client requis.');const mail=email(b.buyer_email);let at=null;if(b.appointment_at){const date=new Date(b.appointment_at);if(isNaN(date.getTime()))fail('Date de rendez-vous invalide.');at=date.toISOString();}if(b.timezone&&!['America/Toronto','Europe/Paris','UTC'].includes(b.timezone))fail('Fuseau horaire invalide.');const status=STATUSES.includes(b.status)?b.status:(at?'programme':'a_confirmer');const id=previous?.id||crypto.randomUUID();if(previous&&Number(b.version)!==previous.version)fail('Ce dossier a été modifié. Actualise avant d’enregistrer.',409);
 const meetingUrl=b.meeting_url===undefined?(previous?.meeting_url||''):safeUrl(b.meeting_url);
 const vals=[o.id,name,mail,txt(b.phone,80),at,txt(b.timezone,80)||'America/Toronto',referrer?.id||null,closer?.id||null,status,txt(b.notes),meetingUrl,now()];
 const statements=[];
 if(previous){statements.push(env.DB.prepare('UPDATE closer_deals SET offer_id=?,buyer_name=?,buyer_email=?,phone=?,appointment_at=?,timezone=?,referrer_id=?,closer_id=?,status=?,notes=?,meeting_url=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM closer_sales WHERE deal_id=?)').bind(...vals,id,previous.version,id));statements.push(env.DB.prepare('UPDATE closer_links SET revoked=1 WHERE deal_id=?').bind(id));}
 else statements.push(env.DB.prepare('INSERT INTO closer_deals(offer_id,buyer_name,buyer_email,phone,appointment_at,timezone,referrer_id,closer_id,status,notes,meeting_url,updated_at,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...vals,id,now()));
 if(previous)statements.push(env.DB.prepare("UPDATE closer_bookings SET origin_status='confirmed' WHERE deal_id=?").bind(id));
 statements.push(audit(env,id,previous?'dossier_modifie':'dossier_cree',{referrer_id:referrer?.id||null,closer_id:closer?.id||null}));const results=await env.DB.batch(statements);if(previous&&!results[0].meta?.changes)fail('Dossier modifié simultanément. Actualise.',409);return {success:true,id};}
async function assign(env,b){const ids=[...new Set((b.ids||[]).map(x=>txt(x,100)))];if(!ids.length||ids.length>100)fail('Sélectionne entre 1 et 100 rendez-vous.');const closer=await affiliate(env,txt(b.closer_id,100));if(!await first(env,'SELECT user_id FROM closer_accounts WHERE user_id=? AND active=1',closer.id))fail('Closer non actif.');const ds=[];for(const id of ids)ds.push(await mutable(env,id));const stm=[];for(const d of ds){stm.push(env.DB.prepare("UPDATE closer_deals SET closer_id=?,status=CASE WHEN status IN ('programme','a_confirmer','attribue') THEN 'attribue' ELSE status END,version=version+1,updated_at=? WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM closer_sales WHERE deal_id=?)").bind(closer.id,now(),d.id,d.version,d.id));stm.push(env.DB.prepare('UPDATE closer_links SET revoked=1 WHERE deal_id=?').bind(d.id));stm.push(audit(env,d.id,'attribution',{closer_id:closer.id}));}const result=await env.DB.batch(stm);if(ds.some((d,i)=>!result[i*3].meta?.changes))fail('Un dossier a changé pendant l’attribution. Actualise pour vérifier.',409);return {success:true,count:ids.length};}
async function generate(env,b,origin){const provider=b.provider||'systeme';if(!['stripe','systeme'].includes(provider))fail('Mode de paiement invalide.');if(!txt(provider==='stripe'?env.CLOSER_STRIPE_WEBHOOK_SECRET:env.CLOSER_WEBHOOK_SECRET))fail(provider==='stripe'?'Ajoute le secret CLOSER_STRIPE_WEBHOOK_SECRET au Worker Univers avant de générer le paiement Stripe.':'Ajoute le secret CLOSER_WEBHOOK_SECRET au Worker Univers avant de générer un paiement.',503);const d=await mutable(env,txt(b.id,100));if(['annule','sans_suite'].includes(d.status))fail('Ce dossier est fermé.');const o=await offer(env,d.offer_id);if(!o.active)fail('Offre désactivée.');if(!d.closer_id)fail('Attribue le rendez-vous à un closer avant de générer le paiement.');const closer=await affiliate(env,d.closer_id);if(!await first(env,'SELECT user_id FROM closer_accounts WHERE user_id=? AND active=1',closer.id))fail('Closer désactivé.');const originRecord=await first(env,"SELECT origin_status FROM closer_bookings WHERE deal_id=?",d.id);if(originRecord?.origin_status==='unknown')fail('L’origine du rendez-vous n’a pas été transmise. Confirme le promoteur ou le contact direct dans le dossier avant de générer le paiement.');const refs=d.referrer_id?await chain(env,d.referrer_id):[];if(provider==='stripe'&&(!o.stripe_payment_url||!o.stripe_payment_link_id))fail('Enregistre le lien Stripe et l’adresse de sa fiche dans cette offre.');const cacheKey='closer:link:'+d.id+(provider==='stripe'?':stripe':'');
 if(env.CASHFLOW_KV && !b.renew){const cached=await env.CASHFLOW_KV.get(cacheKey,'json');if(cached&&cached.expires_at>now()){const previous=await first(env,'SELECT * FROM closer_links WHERE token_hash=?',await digest(cached.token));if(previous&&!previous.revoked&&JSON.parse(previous.snapshot).version===d.version&&(JSON.parse(previous.snapshot).provider||'systeme')===provider)return {success:true,payment_link:origin+'/closer/payer/'+cached.token,expires_at:cached.expires_at};}}
 const snapshot={deal_id:d.id,version:d.version,buyer_email:d.buyer_email,buyer_name:d.buyer_name,product_id:o.product_id,offer_title:o.title,provider,payment_url:provider==='stripe'?o.stripe_payment_url:o.payment_url,stripe_payment_link_id:provider==='stripe'?o.stripe_payment_link_id:null,step_id:o.step_id,price_plan_id:o.price_plan_id,amount:o.amount,tax_mode:taxMode(o.tax_mode),test_enabled:!!o.test_enabled,closer:{id:closer.id,code:closer.affiliate_code,rate:25},chain:refs};const t=token(),hash=await digest(t);const expiry=new Date(Date.now()+30*86400000).toISOString();
 await env.DB.batch([env.DB.prepare("UPDATE closer_links SET revoked=1 WHERE deal_id=? AND COALESCE(json_extract(snapshot,'$.provider'),'systeme')=?").bind(d.id,provider),env.DB.prepare('INSERT INTO closer_links(token_hash,deal_id,snapshot,expires_at,revoked,created_at) VALUES(?,?,?,?,0,?)').bind(hash,d.id,JSON.stringify(snapshot),expiry,now()),audit(env,d.id,'lien_genere',{provider,expires_at:expiry})]);
 if(env.CASHFLOW_KV)await env.CASHFLOW_KV.put(cacheKey,JSON.stringify({token:t,expires_at:expiry}),{expirationTtl:30*86400});
 return {success:true,payment_link:origin+'/closer/payer/'+t,expires_at:expiry,snapshot:{offer_title:o.title,amount:o.amount,closer_rate:25,referral_rates:[8,5,2],referrer_name:refs[0]? (await affiliate(env,refs[0].id)).full_name:null}};}
async function linkRecord(env,t){if(!/^[a-f0-9]{64}$/.test(t))fail('Lien personnel invalide.',404);const l=await first(env,'SELECT * FROM closer_links WHERE token_hash=?',await digest(t));if(!l||l.revoked)fail('Ce lien a été remplacé. Demande le lien actuel.',410);return l;}
async function redirectPayment(env,t){const l=await linkRecord(env,t);if(l.expires_at<now())fail('Ce lien a expiré. Demande un nouveau lien.',410);const sale=await first(env,'SELECT id FROM closer_sales WHERE deal_id=?',l.deal_id);if(sale)fail('Une vente est déjà enregistrée pour ce dossier.',409);const snap=JSON.parse(l.snapshot);const d=await first(env,'SELECT version,status FROM closer_deals WHERE id=?',l.deal_id);if(!d||d.version!==snap.version||['annule','sans_suite'].includes(d.status))fail('Ce dossier a changé. Demande un nouveau lien.',410);const u=new URL(snap.payment_url);if(snap.provider==='stripe'){stripePaymentUrl(snap.payment_url);u.searchParams.set('client_reference_id','nyxia_'+t);u.searchParams.set('prefilled_email',snap.buyer_email);}else{u.searchParams.set('nxdeal',t);if(snap.chain[0])u.searchParams.set('ref',snap.chain[0].code);}return new Response(null,{status:302,headers:{Location:u.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
function fields(v){const f={};if(Array.isArray(v)){for(const row of v||[])if(row)f[row.slug||row.fieldName||row.name]=row.value;}else if(v&&typeof v==='object')Object.assign(f,v);return f;}
async function verifiedBody(request,env){const secret=txt(env.CLOSER_WEBHOOK_SECRET);if(!secret)fail('CLOSER_WEBHOOK_SECRET non configuré.',503);const raw=await request.text();let body;try{body=JSON.parse(raw);}catch(_){fail('JSON invalide.');}const signature=txt(request.headers.get('X-Webhook-Signature')).toLowerCase();if(!/^[a-f0-9]{64}$/.test(signature))fail('Signature Systeme.io absente.',401);const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const sig=new Uint8Array(signature.match(/../g).map(v=>parseInt(v,16)));const normalized=JSON.stringify(body).replace(/\//g,'\\/').replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));if(!await crypto.subtle.verify('HMAC',key,sig,encoder.encode(raw))&&!await crypto.subtle.verify('HMAC',key,sig,encoder.encode(normalized)))fail('Signature Systeme.io invalide.',401);return body;}
function paidSaleAmount(d,plan){
 const order=d.order||{},coupon=d.coupon||null;
 const toNumber=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')fail('Montant du paiement absent ou invalide.',422);const n=Number(v);if(!Number.isFinite(n)||n<0)fail('Montant du paiement invalide.',422);return n};
 // Les champs explicites en unités mineures sont convertis une seule fois.
 const unit=String(plan.amountUnit||plan.amount_unit||d.amountUnit||d.amount_unit||'major').toLowerCase();
 const divisor=['minor','cents','centimes'].includes(unit)?100:1;
 const base=toNumber(plan.amount??plan.direct_charge_amount)/divisor;
 let net=base;
 const orderDiscount=order.discountAmount??order.discount_amount;
 const hasOrderDiscount=orderDiscount!==undefined&&orderDiscount!==null&&orderDiscount!=='';
 const discount=hasOrderDiscount?orderDiscount:coupon?.discountAmount??coupon?.discount_amount;
 const type=String((hasOrderDiscount?(order.discountType??order.discount_type):null)||coupon?.discountType||coupon?.discount_type||'').toLowerCase();
 if(discount!==undefined&&discount!==null&&discount!==''){
  const value=toNumber(discount);
  if(['percent','percentage'].includes(type)){if(value>100)fail('Réduction en pourcentage invalide.',422);net=base*(1-value/100)}
  else if(['fixed','fixed_amount','amount'].includes(type)){net=base-value/divisor}
  else if(value!==0)fail('Type de réduction non transmis : le montant net ne peut pas être confirmé.',422);
 }else if(coupon)fail('Le coupon ne transmet pas son montant de réduction.',422);
 const amount=Math.round((net+Number.EPSILON)*100)/100;
 if(!Number.isFinite(amount)||amount<0)fail('Le montant après réduction est invalide.',422);
 return amount;
}
async function saleWebhook(request,env){const body=await verifiedBody(request,env);if(env.CASHFLOW_KV)await env.CASHFLOW_KV.put('closer:sale:payload:last',JSON.stringify({date:now(),payload:body}),{expirationTtl:604800});const event=txt(request.headers.get('X-Webhook-Event')||body.type);if(!['SALE_NEW','SALE_CANCELED'].includes(event))return json({success:true,ignored:true});const d=body.data||body,c=d.customer||{},f=fields(c.fields),item=d.orderItem||d.order_item||{},order=d.order||{},plan=d.pricePlan||d.offer_price_plan||{};const external=txt(item.id||d.transaction?.id||d.payment?.id||order.id,200);
 let t=txt(f.nxdeal||d.nxdeal);if(!t){try{t=new URL(c.sourceUrl||c.sourceURL||c.source_url||'').searchParams.get('nxdeal')||'';}catch(_){}}
 let l=null;
 if(t)l=await first(env,'SELECT * FROM closer_links WHERE token_hash=?',await digest(t));
 else if(txt(c.email)&&external){
   const existing=await first(env,'SELECT deal_id FROM closer_sales WHERE external_id=?',external);
   const candidates=await query(env,`SELECT l.* FROM closer_links l JOIN closer_deals d ON d.id=l.deal_id WHERE d.buyer_email=? AND l.revoked=0 AND ${existing?'d.id=?':event==='SALE_NEW'?"l.expires_at>=? AND NOT EXISTS(SELECT 1 FROM closer_sales s WHERE s.deal_id=d.id)":"EXISTS(SELECT 1 FROM closer_sales s WHERE s.deal_id=d.id)"}`,txt(c.email).toLowerCase(),...(existing?[existing.deal_id]:event==='SALE_NEW'?[now()]:[]));
   const matching=candidates.filter(row=>{const s=JSON.parse(row.snapshot);return s.provider!=='stripe'&&matchesPaymentPage(s,d);});
   if(matching.length>1)fail('Plusieurs dossiers correspondent à ce client et à cette offre : vérifie l’attribution avant de recevoir le paiement.',422);
   l=matching[0]||null;
 }
 if(!l){if(t)fail('Dossier de paiement introuvable.',422);return json({success:true,ignored:true,reason:'Vente sans dossier Closer.'});}
 const snap=JSON.parse(l.snapshot);if(snap.provider==='stripe')fail('Ce dossier attend une confirmation Stripe.',422);if(!external)fail('Identifiant stable de la vente absent.',422);const saleId='sale_'+await digest(JSON.stringify(['superadmin',snap.product_id,external]));
 if(email(c.email)!==snap.buyer_email)fail('Le courriel du paiement ne correspond pas au client du dossier.',422);
 if(event==='SALE_CANCELED'){const sale=await first(env,'SELECT * FROM closer_sales WHERE id=? AND deal_id=?',saleId,l.deal_id);if(!sale)return json({success:true,ignored:true,reason:'Vente non enregistrée dans cet outil.'});await env.DB.batch([env.DB.prepare("UPDATE commissions SET status=CASE WHEN status='paid' THEN 'refund_due' WHEN status='refund_due' THEN 'refund_due' ELSE 'cancelled' END WHERE sale_id=?").bind(saleId),env.DB.prepare("UPDATE closer_sales SET status='cancelled',cancelled_at=? WHERE id=?").bind(now(),saleId),audit(env,l.deal_id,'vente_annulee',{sale_id:saleId})]);return json({success:true,cancelled:true,sale_id:saleId});}
 const existing=await first(env,'SELECT id FROM closer_sales WHERE id=?',saleId);if(existing)return json({success:true,duplicate:true,sale_id:saleId});if(l.revoked||l.expires_at<now())fail('Lien de paiement expiré ou remplacé.',422);const deal=await first(env,'SELECT * FROM closer_deals WHERE id=?',l.deal_id);if(!deal||deal.version!==snap.version||['annule','sans_suite'].includes(deal.status))fail('Attribution modifiée après génération du lien.',422);
 if(email(c.email)!==snap.buyer_email)fail('Le courriel du paiement ne correspond pas au client du dossier.',422);const step=txt((d.funnelStep||d.funnel_step||{}).id);if(!matchesPaymentPage(snap,d))fail('La notification ne confirme pas la page de paiement enregistrée. Aucune commission attribuée.',422);if(txt(plan.currency||d.currency).toUpperCase()!=='CAD')fail('Ce dossier attend un paiement en CAD.',422);
 // Ancien lien : lire le traitement de l’offre ; nouveau lien : conserver son réglage figé.
 const mode=snap.tax_mode??(await offer(env,deal.offer_id)).tax_mode;
 const taxes=saleTaxBreakdown(paidSaleAmount(d,plan),mode);const amount=taxes.amount;
 const other=await first(env,'SELECT id FROM closer_sales WHERE deal_id=?',deal.id);if(other)fail('Un autre paiement existe déjà pour ce dossier.',409);const paidElsewhere=await first(env,'SELECT id FROM commission_sales WHERE id=?',saleId);if(paidElsewhere)fail('Cette vente possède déjà des commissions : vérifie son attribution avant de la réimporter.',409);
 const attempt=crypto.randomUUID(),date=now();const statements=[env.DB.prepare('INSERT OR IGNORE INTO commission_sales(id,seller_id,product_id,external_id,amount,currency,attempt,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(saleId,'superadmin',snap.product_id,external,amount,'CAD',attempt,date),env.DB.prepare("INSERT INTO closer_sales(id,external_id,deal_id,product_id,closer_id,referrer_id,amount,gross_amount,tax_amount,tax_mode,currency,status,attempt,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?, 'paid',?,? WHERE EXISTS(SELECT 1 FROM commission_sales WHERE id=? AND attempt=?)").bind(saleId,external,deal.id,snap.product_id,snap.closer.id,snap.chain[0]?.id||null,amount,taxes.gross_amount,taxes.tax_amount,taxes.tax_mode,'CAD',attempt,date,saleId,attempt)];const beneficiaries=[{...snap.closer,level:0},...snap.chain];
 for(const b of beneficiaries){const value=Math.round(amount*b.rate)/100;if(value<=0)continue;statements.push(env.DB.prepare(`INSERT INTO commissions(id,sale_id,product_id,seller_id,beneficiary_id,beneficiary_code,level,amount,currency,status,buyer_email,buyer_name,ref_code,source,created_at,paid_at,rate_percent,sale_amount,rate_source) SELECT ?,?,?,'superadmin',?,?,?,?,'CAD','pending',?,?,?,?,?,NULL,?,?,'closer_contract' WHERE EXISTS(SELECT 1 FROM commission_sales WHERE id=? AND attempt=?)`).bind(saleId+'_'+b.level,saleId,snap.product_id,b.id,b.code,b.level,value,snap.buyer_email,snap.buyer_name,snap.chain[0]?.code||null,b.level===0?'closer_conclusion':'closer_recommendation',date,b.rate,amount,saleId,attempt));}
 statements.push(audit(env,deal.id,'montant_vente_apres_reduction',{...taxes,coupon_code:d.coupon?.code||null,price_plan_id:plan.id||null}));
 statements.push(env.DB.prepare("UPDATE closer_deals SET status='effectue',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM commission_sales WHERE id=? AND attempt=?)").bind(date,deal.id,saleId,attempt));const results=await env.DB.batch(statements);const duplicate=!results[0].meta?.changes;return json({success:true,duplicate,sale_id:saleId,commission_total_rate:beneficiaries.reduce((sum,b)=>sum+b.rate,0)});}
async function bootstrap(env){return {success:true,booking_diagnostic_version:27,stripe_secret_configured:!!txt(env.CLOSER_STRIPE_WEBHOOK_SECRET),stripe_webhook_url:'https://univers.nyxia.top/api/closer/webhook/stripe',stripe_webhook_receipt:env.CASHFLOW_KV?await env.CASHFLOW_KV.get('closer:stripe:webhook:last','json'):null,webhook_receipt:env.CASHFLOW_KV?await env.CASHFLOW_KV.get('closer:webhook:last','json'):null,secret_configured:!!txt(env.CLOSER_WEBHOOK_SECRET),webhook_url:'https://univers.nyxia.top/api/closer/webhook/vente',booking_receipt:env.CASHFLOW_KV?await env.CASHFLOW_KV.get('closer:booking:last','json'):null,booking_payload:env.CASHFLOW_KV?await env.CASHFLOW_KV.get('closer:booking:payload:last','json'):null,offers:await bookingOffers(env),products:await query(env,"SELECT id,title,price,affiliate_link FROM marketplace_products WHERE seller_id IS NULL OR seller_id='' OR lower(seller_id)='superadmin' ORDER BY title"),members:await query(env,"SELECT id,full_name,email,affiliate_code,parent_id FROM users WHERE role='affiliate' ORDER BY full_name"),closers:await query(env,'SELECT c.*,u.full_name,u.email,u.affiliate_code,u.paypal_email FROM closer_accounts c JOIN users u ON u.id=c.user_id ORDER BY u.full_name')};}
async function adminRoute(request,env,url){const p=url.pathname,m=request.method;
 if(p==='/api/closer/bootstrap'&&m==='GET')return json(await bootstrap(env));
 if(p==='/api/closer/deals'&&m==='GET')return json({success:true,deals:await query(env,`SELECT d.*,o.title AS offer_title,o.portal,bk.origin_status,u.full_name AS referrer_name,u.affiliate_code AS referrer_code,c.full_name AS closer_name,s.id AS sale_id,s.status AS sale_status FROM closer_deals d JOIN closer_offers o ON o.id=d.offer_id LEFT JOIN closer_bookings bk ON bk.deal_id=d.id LEFT JOIN users u ON u.id=d.referrer_id LEFT JOIN users c ON c.id=d.closer_id LEFT JOIN closer_sales s ON s.deal_id=d.id ORDER BY COALESCE(d.appointment_at,d.created_at) DESC LIMIT 1000`)});
 if(p==='/api/closer/sales'&&m==='GET')return json({success:true,sales:await query(env,`SELECT s.*,d.buyer_name,d.buyer_email,o.title AS offer_title,u.full_name AS closer_name,r.full_name AS referrer_name,(SELECT COALESCE(SUM(amount),0) FROM commissions c WHERE c.sale_id=s.id AND c.status NOT IN ('cancelled')) AS commission_total FROM closer_sales s JOIN closer_deals d ON d.id=s.deal_id JOIN closer_offers o ON o.id=d.offer_id LEFT JOIN closer_bookings bk ON bk.deal_id=d.id LEFT JOIN users u ON u.id=s.closer_id LEFT JOIN users r ON r.id=s.referrer_id ORDER BY s.created_at DESC LIMIT 1000`),commissions:await query(env,`SELECT c.*,u.full_name AS beneficiary_name FROM commissions c JOIN closer_sales s ON s.id=c.sale_id LEFT JOIN users u ON u.id=c.beneficiary_id ORDER BY c.created_at DESC,c.level LIMIT 4000`)});
 if(m!=='POST')return json({error:'Route introuvable.'},404);const b=await request.json();
 if(p==='/api/closer/bookings/replay-last'){
  const captured=env.CASHFLOW_KV?await env.CASHFLOW_KV.get('closer:booking:payload:last','json'):null;
  if(!captured?.payload||!captured.offer_id)fail('Aucune notification capturée à importer.',422);
  const response=await importBookingPayload(env,captured.offer_id,captured.payload);await bookingReceipt(env,response);return response;
 }
 if(p==='/api/closer/offers/delete')return json(await deleteOffer(env,b));
 if(p==='/api/closer/offers')return json(await saveOffer(env,b));
 if(p==='/api/closer/accounts'){const u=await affiliate(env,txt(b.user_id,100));await env.DB.prepare('INSERT INTO closer_accounts(user_id,active,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET active=excluded.active,updated_at=excluded.updated_at').bind(u.id,b.active===false?0:1,now(),now()).run();return json({success:true,member:{name:u.full_name,email:u.email,code:u.affiliate_code}});}
 if(p==='/api/closer/deals')return json(await saveDeal(env,b));
 if(p==='/api/closer/assign')return json(await assign(env,b));
 if(p==='/api/closer/link')return json(await generate(env,b,url.origin));
 return json({error:'Route introuvable.'},404);
}
export default {async fetch(request,env,helpers){const url=new URL(request.url);let booking=false;try{
 const stripeWebhook=url.pathname==='/api/closer/webhook/stripe'&&request.method==='POST';const webhook=url.pathname==='/api/closer/webhook/vente'&&request.method==='POST';booking=url.pathname.startsWith('/api/closer/webhook/rendez-vous/');const intent=url.pathname==='/api/closer/booking-origin';const bookingTarget=url.pathname==='/api/closer/booking-target'&&request.method==='GET';const retired=['/api/closer/intake','/api/closer/public-offer'].includes(url.pathname);const pay=url.pathname.match(/^\/closer\/payer\/([a-f0-9]{64})$/);
 if(retired)return json({error:'Parcours retiré. Utilise la page index du portail.'},410);
 if(!webhook&&!stripeWebhook&&!booking&&!intent&&!bookingTarget&&!pay&&!await helpers.requireAdmin(request,env))return json({error:'Session Super Admin expirée. Reconnecte-toi dans Univers.'},401);
 if(request.method==='POST'&&!webhook&&!stripeWebhook&&!booking&&!intent&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origine de la requête non autorisée.'},403);
 await schema(env,helpers);
 if(bookingTarget){const rows=await query(env,"SELECT booking_url FROM closer_offers WHERE product_id=? AND active=1 AND booking_url<>''",txt(url.searchParams.get('product'),100));if(rows.length!==1)fail('Une seule page de réservation active doit être associée à ce produit.',422);return new Response(JSON.stringify({success:true,url:safeUrl(rows[0].booking_url,true)}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});}
 if(intent)return await bookingOrigin(request,env);
 if(booking){const result=await bookingWebhook(request,env,url);await bookingReceipt(env,result);return result;}
 if(stripeWebhook){const response=await stripeSaleWebhook(request,env);await stripeReceipt(env,response);return response;}
 if(webhook){const response=await saleWebhook(request,env);await receipt(env,response);return response;}
 if(pay)return await redirectPayment(env,pay[1]);
 return await adminRoute(request,env,url);
 }catch(e){console.error('CLOSER',e.status||500,e.message);const response=json({error:e.status?e.message:'Une erreur empêche cette opération. Réessaie ou consulte le journal Cloudflare.'},e.status||500);if(booking)await bookingReceipt(env,response);if(url.pathname==='/api/closer/webhook/vente')await receipt(env,response);if(url.pathname==='/api/closer/webhook/stripe')await stripeReceipt(env,response);return response;}}};

async function receipt(env,response){try{const d=await response.clone().json();if(d.ignored)return;const record={date:now(),status:response.status,success:d.success===true,message:d.error||(d.cancelled?'Vente annulée, commissions mises à jour.':d.duplicate?'Vente déjà enregistrée.':'Vente et commissions enregistrées.')};if(env.CASHFLOW_KV)await env.CASHFLOW_KV.put('closer:webhook:last',JSON.stringify(record),{expirationTtl:604800});}catch(_){}}

async function bookingKey(env,id){if(!txt(env.CLOSER_WEBHOOK_SECRET))return '';const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(txt(env.CLOSER_WEBHOOK_SECRET)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('booking:'+id)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function bookingOffers(env){const offers=await query(env,'SELECT * FROM closer_offers ORDER BY title');for(const o of offers){const key=await bookingKey(env,o.id);o.booking_webhook_url=key&&o.booking_url?'https://univers.nyxia.top/api/closer/webhook/rendez-vous/'+encodeURIComponent(o.id)+'?token='+key:'';}return offers;}
function samePage(a,b){try{const x=new URL(a),y=new URL(b);return x.origin===y.origin&&x.pathname===y.pathname&&[...x.searchParams].filter(([k])=>k!=='ref').every(([k,v])=>y.searchParams.get(k)===v);}catch(_){return false;}}
async function bookingOrigin(request,env){
 if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
 const body=await request.json(),source=safeUrl(body.booking_url,true),origin=request.headers.get('Origin');if(!origin||new URL(source).origin!==origin)fail('Origine non autorisée.',403);
 const offers=(await query(env,"SELECT * FROM closer_offers WHERE active=1 AND booking_url<>''")).filter(o=>samePage(o.booking_url,source));if(offers.length!==1)fail('La page de réservation doit correspondre à une seule offre active.',422);const o=offers[0],ref=txt(body.ref,64).toUpperCase();let member=null;if(ref){member=await first(env,"SELECT id FROM users WHERE affiliate_code=? AND role='affiliate'",ref);if(!member)fail('Référence Promoteur inconnue.',422);}
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';if(env.CASHFLOW_KV){const k='closer:origin-rate:'+await digest(ip);const count=Number(await env.CASHFLOW_KV.get(k)||0);if(count>=30)fail('Trop de tentatives.',429);await env.CASHFLOW_KV.put(k,String(count+1),{expirationTtl:60});}
 const buyerEmail=email(body.email),hash=await digest(buyerEmail),expires=new Date(Date.now()+2*3600000).toISOString();const existing=await first(env,'SELECT * FROM closer_booking_origins WHERE offer_id=? AND email_hash=?',o.id,hash);if(existing&&existing.expires_at>now()&&existing.referrer_id!==(member?.id||null))fail('Deux origines différentes ont été transmises pour cette réservation. Attribution à vérifier.',409);
 await env.DB.prepare('INSERT INTO closer_booking_origins(offer_id,email_hash,referrer_id,expires_at) VALUES(?,?,?,?) ON CONFLICT(offer_id,email_hash) DO UPDATE SET referrer_id=excluded.referrer_id,expires_at=excluded.expires_at').bind(o.id,hash,member?.id||null,expires).run();
 // Une notification peut arriver avant la transmission du navigateur. Ne rattacher qu’un dossier confirmé unique, récent et encore sans vente.
 const late=await query(env,"SELECT b.deal_id FROM closer_bookings b JOIN closer_deals d ON d.id=b.deal_id WHERE b.offer_id=? AND d.buyer_email=? AND b.origin_status='unknown' AND b.created_at>=? AND NOT EXISTS(SELECT 1 FROM closer_sales s WHERE s.deal_id=d.id)",o.id,buyerEmail,new Date(Date.now()-10*60000).toISOString());
 if(late.length===1)await env.DB.batch([env.DB.prepare("UPDATE closer_deals SET referrer_id=?,version=version+1,updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM closer_sales WHERE deal_id=?)").bind(member?.id||null,now(),late[0].deal_id,late[0].deal_id),env.DB.prepare("UPDATE closer_bookings SET origin_status='confirmed' WHERE deal_id=?").bind(late[0].deal_id),env.DB.prepare('UPDATE closer_links SET revoked=1 WHERE deal_id=?').bind(late[0].deal_id)]);
 return new Response(JSON.stringify({success:true}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,Vary:'Origin','Cache-Control':'no-store'}});
}
async function bookingWebhook(request,env,url){
 if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
 const id=decodeURIComponent(url.pathname.slice('/api/closer/webhook/rendez-vous/'.length)),expected=await bookingKey(env,id),provided=url.searchParams.get('token')||'';
 if(!expected||provided.length!==expected.length||![...provided].every((v,i)=>v===expected[i]))fail('Autorisation de réservation invalide.',401);
 // Les automatisations historiques n’ont pas de signature HMAC : vérifier leurs IP officielles.
 const ip=request.headers.get('CF-Connecting-IP');if(!['185.236.142.1','185.236.142.2','185.236.142.3'].includes(ip))fail('Émetteur du webhook de réservation non autorisé.',403);
 const body=await request.json();
 // Capture après authentification seulement ; accessible via bootstrap Super Admin.
 if(env.CASHFLOW_KV)await env.CASHFLOW_KV.put('closer:booking:payload:last',JSON.stringify({date:now(),offer_id:id,payload:body}),{expirationTtl:604800});
 return await importBookingPayload(env,id,body);
}
async function importBookingPayload(env,id,body){
 const d=body.data||body;let booking=d.booking||d.reservation||d.calendar_booking||d.calendarBooking;
 // Format réel de l’automatisation Systeme.io Réunion programmée.
 if(body.type==='contact.booking.created'&&!booking&&d.booking_event_id&&d.contact?.id&&d.scheduled_at){booking={id:'event:'+d.booking_event_id+':contact:'+d.contact.id+':at:'+d.scheduled_at,start_at:d.scheduled_at};}
 const contact=d.contact||booking?.contact||d.customer||{};
 if(!booking||typeof booking!=='object')fail('Notification reçue, mais objet de réservation absent. Le format réel doit être vérifié avant importation.',422);
 const rawId=txt(booking.id||booking.bookingId||booking.booking_id,100),at=txt(booking.date||booking.startAt||booking.start_at||booking.startsAt||booking.starts_at||booking.scheduled_at||d.scheduled_at,100);if(!rawId||!at||!/(Z|[+-]\d\d:\d\d)$/.test(at)||isNaN(Date.parse(at)))fail('La réservation doit transmettre un identifiant et un créneau avec fuseau horaire. Aucun dossier créé.',422);
 const mail=email(contact.email||booking.email),o=await offer(env,id);if(!o.active)fail('Offre de réservation inactive.',422);const bookingId=id+':'+rawId,existing=await first(env,'SELECT * FROM closer_bookings WHERE booking_id=?',bookingId);if(existing)return json({success:true,duplicate:true,deal_id:existing.deal_id});
 const f=fields(contact.fields),hash=await digest(mail),pending=await first(env,'SELECT * FROM closer_booking_origins WHERE offer_id=? AND email_hash=? AND expires_at>=?',id,hash,now());
 let referrer=pending?.referrer_id||null,originStatus=pending?'confirmed':'unknown';const ref=txt(f.ref||f.nyxia_ref||'',64).toUpperCase();if(ref){const u=await first(env,"SELECT id FROM users WHERE affiliate_code=? AND role='affiliate'",ref);if(!u)fail('Code Promoteur reçu inconnu.',422);if(pending&&referrer!==u.id)fail('La référence du contact diffère de celle de la réservation. Vérification requise.',422);referrer=u.id;originStatus='confirmed';}
 const name=txt(contact.full_name||contact.fullName||booking.contactName||[f.first_name,f.surname||f.last_name].filter(Boolean).join(' '),180)||mail,idDeal='booking_'+await digest(bookingId),time=new Date(at).toISOString();
 const result=await env.DB.batch([env.DB.prepare('INSERT INTO closer_bookings(booking_id,offer_id,deal_id,origin_status,created_at) VALUES(?,?,?,?,?) ON CONFLICT(booking_id) DO NOTHING').bind(bookingId,id,idDeal,originStatus,now()),env.DB.prepare("INSERT INTO closer_deals(id,offer_id,buyer_name,buyer_email,phone,appointment_at,timezone,referrer_id,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,'America/Toronto',?,'programme',?,?,?) ON CONFLICT(id) DO NOTHING").bind(idDeal,id,name,mail,txt(f.phone_number||contact.phone,80),time,referrer,originStatus==='unknown'?'Origine non transmise par le parcours de réservation : confirmer avant attribution.':'',now(),now()),audit(env,idDeal,'reservation_systeme_recue',{booking_id:bookingId,origin_status:originStatus})]);return json({success:true,deal_id:idDeal,duplicate:!result[0].meta?.changes,origin_status:originStatus});
}
async function bookingReceipt(env,response){try{const d=await response.clone().json();if(env.CASHFLOW_KV)await env.CASHFLOW_KV.put('closer:booking:last',JSON.stringify({date:now(),status:response.status,success:!!d.success,message:d.error||(d.duplicate?'Réservation déjà reçue.':d.origin_status==='unknown'?'Rendez-vous reçu; origine à confirmer.':'Rendez-vous et origine reçus.')}),{expirationTtl:604800});}catch(_){}}


// Stripe Payment Links : attribution locale, sans clé API ni accès au compte pour le closer.
async function verifiedStripeBody(request,env){
 const secret=txt(env.CLOSER_STRIPE_WEBHOOK_SECRET);if(!secret)fail('CLOSER_STRIPE_WEBHOOK_SECRET non configuré.',503);
 const raw=await request.text(),header=request.headers.get('Stripe-Signature')||'';
 const parts=header.split(',').map(p=>p.trim().split('='));const times=parts.filter(p=>p[0]==='t');const signatures=parts.filter(p=>p[0]==='v1').map(p=>p[1]);
 if(times.length!==1||!/^\d+$/.test(times[0][1]||'')||!signatures.length)fail('Signature Stripe absente ou invalide.',401);
 const timestamp=Number(times[0][1]);if(Math.abs(Date.now()/1000-timestamp)>300)fail('Signature Stripe expirée.',401);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);let valid=false;
 for(const signature of signatures){if(!/^[a-f0-9]{64}$/i.test(signature))continue;const bytes=new Uint8Array(signature.match(/../g).map(v=>parseInt(v,16)));if(await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(times[0][1]+'.'+raw))){valid=true;break}}
 if(!valid)fail('Signature Stripe invalide.',401);let body;try{body=JSON.parse(raw)}catch(_){fail('Notification Stripe illisible.',400)}return body;
}
function stripeSaleAmounts(session){
 const integer=(v,name)=>{if(!Number.isSafeInteger(v)||v<0)fail('Montant Stripe '+name+' absent ou invalide.',422);return v};
 const gross=integer(session.amount_total,'total'),tax=integer(session.total_details?.amount_tax,'taxes');
 const shipping=integer(session.total_details?.amount_shipping??0,'livraison');if(shipping!==0)fail('Le lien Stripe de ce portail doit être sans frais de livraison.',422);
 if(tax>gross)fail('Les taxes Stripe dépassent le total.',422);
 if(session.automatic_tax?.enabled&&session.automatic_tax.status!=='complete')fail('Le calcul des taxes Stripe n’est pas terminé.',422);
 return {amount:(gross-tax)/100,gross_amount:gross/100,tax_amount:tax/100,tax_mode:'stripe_actual'};
}
async function stripeSaleWebhook(request,env){
 const event=await verifiedStripeBody(request,env);
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return json({success:true,ignored:true});
 const session=event.data?.object;if(!session||session.object!=='checkout.session')fail('Session Stripe absente.',422);
 const reference=txt(session.client_reference_id,200);if(!reference.startsWith('nyxia_'))return json({success:true,ignored:true,reason:'Paiement sans dossier Closer NyXia.'});
 const t=reference.slice(6);if(!/^[a-f0-9]{64}$/.test(t))fail('Référence du dossier Stripe invalide.',422);
 const l=await first(env,'SELECT * FROM closer_links WHERE token_hash=?',await digest(t));if(!l)fail('Dossier Stripe introuvable.',422);
 const snap=JSON.parse(l.snapshot);if(snap.provider!=='stripe')fail('Ce lien personnel n’est pas un lien Stripe.',422);
 const external='stripe:'+txt(session.id,200);if(!/^cs_[a-zA-Z0-9_]+$/.test(session.id||''))fail('Identifiant Stripe invalide.',422);
 const saleId='sale_'+await digest(JSON.stringify(['superadmin',snap.product_id,external]));
 if(await first(env,'SELECT id FROM closer_sales WHERE id=?',saleId))return json({success:true,duplicate:true,sale_id:saleId});
 const paymentLink=typeof session.payment_link==='string'?session.payment_link:session.payment_link?.id;
 if(paymentLink!==snap.stripe_payment_link_id)fail('Le paiement Stripe ne correspond pas au lien produit enregistré.',422);
 if(session.mode!=='payment')fail('Ce dossier attend un paiement unique Stripe.',422);
 if(session.currency!=='cad')fail('Ce dossier attend un paiement Stripe en CAD.',422);
 if(session.livemode!==true&&!snap.test_enabled)fail('Paiement Stripe de test : active temporairement les tests sur cette offre.',422);
 if(email(session.customer_details?.email||session.customer_email)!==snap.buyer_email)fail('Le courriel Stripe ne correspond pas au client du dossier.',422);
 if(session.payment_status!=='paid')return json({success:true,awaiting_payment:true,message:'Stripe attend la confirmation du paiement. Aucune commission enregistrée.'});
 // Le paiement différé peut être confirmé après l’expiration du lien : vérifier la création de la session.
 const created=Number(session.created)*1000;
 if(!Number.isFinite(created)||created<Date.parse(l.created_at)-1000||created>Date.parse(l.expires_at))fail('La session Stripe n’a pas été ouverte pendant la validité du lien.',422);
 if(l.revoked)fail('Attribution remplacée : paiement Stripe à vérifier.',409);
 const deal=await first(env,'SELECT * FROM closer_deals WHERE id=?',l.deal_id);
 if(!deal||deal.version!==snap.version||['annule','sans_suite'].includes(deal.status))fail('Attribution modifiée : paiement Stripe à vérifier.',409);
 if(await first(env,'SELECT id FROM closer_sales WHERE deal_id=?',deal.id))fail('Un paiement est déjà enregistré pour ce dossier.',409);
 const taxes=stripeSaleAmounts(session),amount=taxes.amount,attempt=crypto.randomUUID(),date=now();
 const paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 if(!/^pi_[a-zA-Z0-9_]+$/.test(paymentIntent||''))fail('Confirmation Stripe sans identifiant de paiement.',422);
 const statements=[env.DB.prepare('INSERT OR IGNORE INTO commission_sales(id,seller_id,product_id,external_id,amount,currency,attempt,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(saleId,'superadmin',snap.product_id,external,amount,'CAD',attempt,date),
 env.DB.prepare("INSERT INTO closer_sales(id,external_id,deal_id,product_id,closer_id,referrer_id,amount,gross_amount,tax_amount,tax_mode,payment_provider,stripe_payment_intent,currency,status,attempt,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,'paid',?,? WHERE EXISTS(SELECT 1 FROM commission_sales WHERE id=? AND attempt=?)").bind(saleId,external,deal.id,snap.product_id,snap.closer.id,snap.chain[0]?.id||null,amount,taxes.gross_amount,taxes.tax_amount,taxes.tax_mode,'stripe',paymentIntent,'CAD',attempt,date,saleId,attempt)];
 const beneficiaries=[{...snap.closer,level:0},...snap.chain];
 for(const b of beneficiaries){const value=Math.round(amount*b.rate)/100;if(value<=0)continue;statements.push(env.DB.prepare(`INSERT INTO commissions(id,sale_id,product_id,seller_id,beneficiary_id,beneficiary_code,level,amount,currency,status,buyer_email,buyer_name,ref_code,source,created_at,paid_at,rate_percent,sale_amount,rate_source) SELECT ?,?,?,'superadmin',?,?,?,?,'CAD','pending',?,?,?,?,?,NULL,?,?,'closer_contract' WHERE EXISTS(SELECT 1 FROM commission_sales WHERE id=? AND attempt=?)`).bind(saleId+'_'+b.level,saleId,snap.product_id,b.id,b.code,b.level,value,snap.buyer_email,snap.buyer_name,snap.chain[0]?.code||null,b.level===0?'closer_conclusion':'closer_recommendation',date,b.rate,amount,saleId,attempt));}
 statements.push(audit(env,deal.id,'vente_stripe_confirmee',{session_id:session.id,payment_link:paymentLink,...taxes}));
 statements.push(env.DB.prepare("UPDATE closer_deals SET status='effectue',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM commission_sales WHERE id=? AND attempt=?)").bind(date,deal.id,saleId,attempt));
 const results=await env.DB.batch(statements);return json({success:true,duplicate:!results[0].meta?.changes,sale_id:saleId,commission_total_rate:beneficiaries.reduce((sum,b)=>sum+b.rate,0)});
}
async function stripeReceipt(env,response){try{const d=await response.clone().json();if(d.ignored)return;const record={date:now(),status:response.status,success:d.success===true,message:d.error||d.message||(d.duplicate?'Vente Stripe déjà enregistrée.':'Vente Stripe et commissions enregistrées.')};if(env.CASHFLOW_KV)await env.CASHFLOW_KV.put('closer:stripe:webhook:last',JSON.stringify(record),{expirationTtl:604800})}catch(_){}}
