const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const STAGES = ['Quote Requested','Deposit Paid','Design Confirmed','Baking','Decorating','Ready for Collection','Collected'];
function installAdmin(app, pool, { env = process.env, mail = null, updateOrder = null } = {}) {
 const sessions = new Map(), attempts = new Map();
 const demo = env.DASHBOARD_DEMO === 'true';
 if (demo && env.NODE_ENV === 'production') throw Error('Demo must not run in production');
 const demoOrders = [{id:1,order_number:'DEMO001',name:'Demo customer',email:'customer@example.invalid',phone_number:'',message:'Pink celebration cake, serves 12.',flavour:'Vanilla',cake_size:'Small',status:'Quote Requested',created_at:new Date().toISOString()}];
 demoOrders.push({id:2,order_number:'DEMO002',name:'Sample celebration',email:'celebration@example.invalid',message:'Buttercream flowers in soft pink.',flavour:'Chocolate',cake_size:'Medium',event_date:new Date(Date.now()+86400000).toISOString().slice(0,10),event_time:'14:00:00',status:'Decorating',created_at:new Date(Date.now()-86400000).toISOString()}, {id:3,order_number:'DEMO003',name:'Sample cupcake order',email:'cupcakes@example.invalid',message:'Two dozen cupcakes for a birthday.',cupcake_selected:true,cupcake_quantity:24,cupcake_topping:'Buttercream',event_date:new Date(Date.now()+2*86400000).toISOString().slice(0,10),event_time:'10:00:00',status:'Design Confirmed',created_at:new Date().toISOString()});
 demoOrders.push({id:4,order_number:'DEMO004',name:'Demo customer',email:' CUSTOMER@example.invalid ',message:'Previous celebration cake.',status:'Collected',created_at:new Date(Date.now()-30*86400000).toISOString()},{id:5,order_number:'DEMO005',name:'Sample walk-in enquiry',email:'',phone_number:'',message:'No contact details recorded in this sample.',status:'Quote Requested',created_at:new Date().toISOString()});
 const inbox = [{id:'demo-1',subject:'Inspiration for my celebration cake',from:'Customer <customer@example.invalid>',date:new Date().toISOString(),text:'Hello Felicia, could we discuss a pink cake for Saturday? This is a sample message, not a real email.'}];
 function session(req) {
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('fb_session='))?.slice(11);
  const entry=sessions.get(token);
  if (!entry || entry.expires<Date.now()) {sessions.delete(token);return null;} return {token,...entry};
 }
 const cleanup=setInterval(()=>{for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);for(const [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);},60000);cleanup.unref();
 app.use('/admin', (req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
   const origin=req.get('origin'); const expected=env.DASHBOARD_ORIGIN;
   if(!origin || (expected ? origin!==expected : !['http://127.0.0.1:'+req.socket.localPort,'http://localhost:'+req.socket.localPort].includes(origin)))return res.status(403).json({message:'Request origin is not allowed.'});
  }
  next();
 });
 app.get('/admin/api/session',(req,res)=>res.json({authenticated:!!session(req),demo,user:session(req)?.user||null,mailbox:env.MAILBOX_ADDRESS||'info@feliciabakes.co.za',mailConfigured:!!mail,mailSendingConfigured:!!mail?.sendingEnabled,stages:STAGES}));
 app.post('/admin/api/login',(req,res)=>{
  const key=req.ip;let state=attempts.get(key)||{count:0,until:Date.now()+900000};
  if(state.until<Date.now())state={count:0,until:Date.now()+900000};
  if(state.count>=10)return res.status(429).json({message:'Too many attempts. Try again in 15 minutes.'});
  const email=String(req.body.email||'').toLowerCase().trim();
  const role=email===(env.STAFF_OWNER_EMAIL||'info@feliciabakes.co.za')?'owner':email===(env.STAFF_DEVELOPER_EMAIL||'dev@feliciabakes.co.za')?'developer':null;
  const staffPassword=kind=>env['STAFF_'+kind+'_PASSWORD_B64']?Buffer.from(env['STAFF_'+kind+'_PASSWORD_B64'],'base64').toString('utf8'):(env['STAFF_'+kind+'_PASSWORD']||'');
  const expected=role==='owner'?staffPassword('OWNER'):role==='developer'?staffPassword('DEVELOPER'):''; const given=typeof req.body.password==='string'?req.body.password:'';
  if(!expected||!crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(),crypto.createHash('sha256').update(expected).digest())){state.count++;attempts.set(key,state);return res.status(401).json({message:'The admin password is incorrect.'});}
  if(sessions.size>=1000)return res.status(503).json({message:'Please try again later.'});
  const old=session(req);if(old)sessions.delete(old.token);
  const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{expires:Date.now()+8*3600000,user:{email,role}});attempts.delete(key);
  res.cookie('fb_session',token,{httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'strict',path:'/admin',maxAge:8*3600000});res.json({ok:true});
 });
 app.use('/admin/api',(req,res,next)=>{if(!session(req))return res.status(401).json({message:'Please sign in.'});next();});
 app.post('/admin/api/logout',(req,res)=>{sessions.delete(session(req)?.token);res.clearCookie('fb_session',{path:'/admin'});res.json({ok:true});});
 const safe=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(()=>res.status(502).json({message:'Could not complete this request. Please try again.'}));
 require('./content-planner').installPlanner(app,pool,{demo,showcase:env.DASHBOARD_DEMO_SHOWCASE==='true',authorize:session});
 const newsletter=require('./newsletter').installNewsletter(app,pool,{env,demo,authorize:session});
 const {directoryData}=require('./customer-directory');
 const {emailKey,phoneKey}=require('./business');
 const demoContacts=[],demoLinks=[];
 async function report(){
  const rows=demo?demoOrders:(await pool.query('SELECT * FROM orders ORDER BY created_at DESC,id DESC')).rows;
  let contacts=demoContacts,links=demoLinks;if(!demo){try{contacts=(await pool.query('SELECT * FROM customer_contacts')).rows;links=(await pool.query('SELECT * FROM customer_order_links')).rows;}catch(e){if(e.code!=='42P01')throw e;contacts=[];links=[];}}
  return directoryData(rows,contacts,links);
 }
 const {cents,validDate,period,financialSummary}=require('./finance');
 const demoPayments=[];
 if(demo&&env.DASHBOARD_DEMO_SHOWCASE==='true'){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());demoOrders[1].agreed_total_cents=80000;demoPayments.push({id:crypto.randomUUID(),order_id:2,amount_cents:20000,received_date:today,note:'Synthetic sample deposit, not a real payment'});demoContacts.push({id:crypto.randomUUID(),name:'Sample past customer',email:'past-customer@example.invalid',phone:'',notes:'Synthetic past customer from before online ordering. No order needed.',source:'Local demo fixture'});newsletter.subscriptions.set('past-customer@example.invalid',{email:'past-customer@example.invalid',status:'opted-in',consent_source:'Synthetic opt-in fixture for local demo only',consent_at:today,unsubscribe_token:crypto.randomBytes(32).toString('hex')});const id=crypto.randomUUID();newsletter.drafts.set(id,{id,subject:'A little thank-you from Felicia Bakes',body:'Thank you for supporting our home bakery. If a celebration is coming up, we would love to bake something special for you.\n\nWith love, Felicia Bakes',recipient_emails:['past-customer@example.invalid']});}
 app.get('/admin/api/overview',safe(async(req,res)=>{
  let range;try{range=period(req.query);}catch(e){return res.status(400).json({message:e.message});}
  const data=await report();let payments=[],financesAvailable=demo;
  if(!demo){try{payments=(await pool.query("SELECT id,order_id,amount_cents,to_char(received_date,'YYYY-MM-DD') AS received_date FROM order_payments")).rows;financesAvailable=true;}catch(e){if(e.code!=='42P01')throw e;}}
  else payments=demoPayments;
  const allOrders=demo?demoOrders:(await pool.query('SELECT * FROM orders')).rows;
  res.json({summary:data.summary,period:financialSummary(allOrders,payments,range),financesAvailable,demo});
 }));
 app.post('/admin/api/orders/manual',safe(async(req,res)=>{
  const body=req.body;if((body.email&& !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim()))||String(body.phoneNumber||'').length>40||String(body.message||'').length>5000)return res.status(400).json({message:'Check the email, phone and order notes.'});
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>150)return res.status(400).json({message:'Enter a customer name.'});
  if(body.eventDate&&!validDate(body.eventDate))return res.status(400).json({message:'Choose a valid collection date.'});
  if(body.eventTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.eventTime))return res.status(400).json({message:'Choose a valid collection time.'});
  let agreed=null;try{if(body.agreedTotal)agreed=cents(body.agreedTotal,{allowZero:true});}catch(e){return res.status(400).json({message:e.message});}
  const contact=body.customerId?(await report()).customers.find(c=>c.id===body.customerId):null;if(body.customerId&&!contact)return res.status(400).json({message:'Choose an existing customer.'});
  const number='FBM-'+crypto.randomUUID().slice(0,12).toUpperCase();let order;
  if(demo){order={id:demoOrders.length+1,order_number:number,name:body.name.trim(),email:String(body.email||'').trim(),phone_number:String(body.phoneNumber||'').trim(),message:String(body.message||''),event_date:body.eventDate||null,event_time:body.eventTime||null,status:'Quote Requested',agreed_total_cents:agreed,created_at:new Date().toISOString()};demoOrders.push(order);}
  else {
   try{order=(await pool.query("INSERT INTO orders (order_number,name,email,phone_number,message,event_date,event_time,status,agreed_total_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,'Quote Requested',$8) RETURNING *",[number,body.name.trim(),String(body.email||'').trim(),String(body.phoneNumber||'').trim()||null,String(body.message||''),body.eventDate||null,body.eventTime||null,agreed])).rows[0];}catch(e){if(e.code==='42703')return res.status(503).json({message:'The additive business database setup is required before manual orders can be added.'});throw e;}
  }
  if(contact?.contactId){if(demo)demoLinks.push({order_id:order.id,contact_id:contact.contactId});else await pool.query('INSERT INTO customer_order_links(order_id,contact_id) VALUES($1,$2)',[order.id,contact.contactId]);}
  res.status(201).json({order});
 }));
 app.patch('/admin/api/orders/:number/details',safe(async(req,res)=>{
  let agreed;try{agreed=req.body.agreedTotal===''?null:cents(req.body.agreedTotal,{allowZero:true});}catch(e){return res.status(400).json({message:e.message});}
  if(req.body.eventDate&&!validDate(req.body.eventDate))return res.status(400).json({message:'Choose a valid collection date.'});
  if(req.body.eventTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.eventTime))return res.status(400).json({message:'Choose a valid collection time.'});
  if(req.body.message!==undefined&&(typeof req.body.message!=='string'||req.body.message.length>5000))return res.status(400).json({message:'Order notes must be at most 5000 characters.'});
  let order;if(demo){order=demoOrders.find(o=>o.order_number===req.params.number);if(order)Object.assign(order,{agreed_total_cents:agreed,event_date:req.body.eventDate||null,event_time:req.body.eventTime||null,...(req.body.message!==undefined?{message:req.body.message}:{})});}
  else{try{order=(await pool.query('UPDATE orders SET agreed_total_cents=$1,event_date=$2,event_time=$3,message=COALESCE($4,message) WHERE order_number=$5 RETURNING *',[agreed,req.body.eventDate||null,req.body.eventTime||null,req.body.message??null,req.params.number])).rows[0];}catch(e){if(e.code==='42703')return res.status(503).json({message:'Business database setup is required before recording agreed totals.'});throw e;}}
  if(!order)return res.status(404).json({message:'Order not found.'});res.json({order});
 }));
 app.get('/admin/api/orders/:number/payments',safe(async(req,res)=>{
  const order=demo?demoOrders.find(o=>o.order_number===req.params.number):(await pool.query('SELECT * FROM orders WHERE order_number=$1',[req.params.number])).rows[0];if(!order)return res.status(404).json({message:'Order not found.'});
  let payments;if(demo)payments=demoPayments.filter(p=>p.order_id===order.id);else{try{payments=(await pool.query("SELECT id,order_id,amount_cents,to_char(received_date,'YYYY-MM-DD') AS received_date,note FROM order_payments WHERE order_id=$1 ORDER BY received_date DESC,created_at DESC",[order.id])).rows;}catch(e){if(e.code==='42P01')return res.status(503).json({message:'Business database setup is required before payments can be recorded.'});throw e;}}
  const receivedCents=payments.reduce((n,p)=>n+Number(p.amount_cents),0);res.json({payments,receivedCents,agreedTotalCents:order.agreed_total_cents??null,balanceCents:order.agreed_total_cents==null?null:Number(order.agreed_total_cents)-receivedCents});
 }));
 app.post('/admin/api/orders/:number/payments',safe(async(req,res)=>{
  let amount;try{amount=cents(req.body.amount);}catch(e){return res.status(400).json({message:e.message});}
  const received=req.body.receivedDate,id=req.body.id,note=String(req.body.note||'').slice(0,500);
  if(!validDate(received)||received>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))return res.status(400).json({message:'Choose a received date that is not in the future.'});
  if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({message:'A payment request identifier is required.'});
  const order=demo?demoOrders.find(o=>o.order_number===req.params.number):(await pool.query('SELECT * FROM orders WHERE order_number=$1',[req.params.number])).rows[0];if(!order)return res.status(404).json({message:'Order not found.'});
  let payment,duplicate=false;
  if(demo){payment=demoPayments.find(p=>p.id===id);duplicate=!!payment;if(!payment){payment={id,order_id:order.id,amount_cents:amount,received_date:received,note};demoPayments.push(payment);}}
  else{try{const inserted=await pool.query("INSERT INTO order_payments (id,order_id,amount_cents,received_date,note,recorded_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING *,to_char(received_date,'YYYY-MM-DD') AS received_date",[id,order.id,amount,received,note,session(req).user.email]);payment=inserted.rows[0];if(!payment){duplicate=true;payment=(await pool.query("SELECT *,to_char(received_date,'YYYY-MM-DD') AS received_date FROM order_payments WHERE id=$1",[id])).rows[0];}}catch(e){if(e.code==='42P01')return res.status(503).json({message:'Business database setup is required before payments can be recorded.'});throw e;}}
  if(String(payment.order_id)!==String(order.id)||Number(payment.amount_cents)!==amount||(payment.received_date instanceof Date?payment.received_date.toISOString().slice(0,10):String(payment.received_date).slice(0,10))!==received||payment.note!==note)return res.status(409).json({message:'This payment identifier was already used for different details. Refresh before recording another payment.'});
  res.status(duplicate?200:201).json({payment,duplicate});
 }));
 app.get('/admin/api/customers',safe(async(req,res)=>{
  const {customers,summary}=await report();const search=String(req.query.search||'').trim().toLowerCase().slice(0,120);const page=Math.max(1,Number.parseInt(req.query.page,10)||1);
  const matches=customers.filter(c=>!search||[c.name,c.email,c.phone].some(v=>v.toLowerCase().includes(search)));
  res.json({customers:matches.slice((page-1)*25,page*25).map(({orders,...customer})=>customer),page,hasMore:matches.length>page*25,total:matches.length,unidentifiedOrders:summary.unidentifiedOrders});
 }));
 async function saveCustomer(req,res,editing){
  const name=String(req.body.name||'').trim(),email=req.body.email?emailKey(req.body.email):null,phone=String(req.body.phone||'').trim(),notes=String(req.body.notes||'').trim();
  if(!name||name.length>150||(req.body.email&&!email)||phone.length>40||notes.length>3000)return res.status(400).json({message:'Enter a customer name and valid contact details.'});
  const data=await report(),current=editing?data.customers.find(c=>c.id===req.params.id):null;
  if(editing&&!current)return res.status(404).json({message:'Customer not found.'});
  const duplicate=data.customers.find(c=>c.id!==current?.id&&(email&&emailKey(c.email)===email||!email&&phoneKey(phone)&&!emailKey(c.email)&&phoneKey(c.phone)===phoneKey(phone)));
  if(duplicate)return res.status(409).json({message:'A profile already uses this contact. Open it and review before adding another.',customerId:duplicate.id});
  const id=current?.contactId||crypto.randomUUID(),record={id,name,email,phone,notes,source:current?.source||'Manually recorded'};
  if(demo){const idx=demoContacts.findIndex(c=>c.id===id);if(idx>=0)demoContacts[idx]=record;else demoContacts.push(record);for(const o of current?.orders||[]){const old=demoLinks.find(l=>l.order_id===o.id);if(old)old.contact_id=id;else demoLinks.push({order_id:o.id,contact_id:id});}}
  else{let client;try{client=await pool.connect();await client.query('BEGIN');await client.query('INSERT INTO customer_contacts(id,name,email,phone,notes,source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,notes=EXCLUDED.notes,updated_at=now()',[id,name,email,phone||null,notes,record.source]);for(const o of current?.orders||[])await client.query('INSERT INTO customer_order_links(order_id,contact_id) VALUES($1,$2) ON CONFLICT(order_id) DO UPDATE SET contact_id=EXCLUDED.contact_id',[o.id,id]);await client.query('COMMIT');}catch(e){if(client)await client.query('ROLLBACK');if(e.code==='42P01')return res.status(503).json({message:'Customer directory setup must be applied before saving contacts.'});if(e.code==='23505')return res.status(409).json({message:'A saved customer already uses that email address.'});throw e;}finally{client?.release();}}
  res.status(editing?200:201).json({customer:(await report()).customers.find(c=>c.contactId===id)});
 }
 app.post('/admin/api/customers',safe((req,res)=>saveCustomer(req,res,false)));
 app.patch('/admin/api/customers/:id',safe((req,res)=>saveCustomer(req,res,true)));
 app.get('/admin/api/customers/:id',safe(async(req,res)=>{
  const customer=(await report()).customers.find(c=>c.id===req.params.id);
  if(!customer)return res.status(404).json({message:'Customer profile not found.'});res.json({customer});
 }));
 app.get('/admin/api/orders',safe(async(req,res)=>{
  const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page,10)||1)),search=String(req.query.search||'').slice(0,120),status=STAGES.includes(req.query.status)?req.query.status:'';
  if(demo)return res.json({orders:[...demoOrders].sort((a,b)=>Number(a.status==='Collected')-Number(b.status==='Collected')||(a.event_date||'9999').localeCompare(b.event_date||'9999')||new Date(b.created_at||0)-new Date(a.created_at||0)).filter(o=>(!search||`${o.order_number} ${o.name}`.toLowerCase().includes(search.toLowerCase()))&&(!status||o.status===status)),page,hasMore:false});
  const result=await pool.query("SELECT * FROM orders WHERE ($1='' OR order_number ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%') AND ($2='' OR status=$2) ORDER BY CASE WHEN status='Collected' THEN 1 ELSE 0 END,event_date ASC NULLS LAST,created_at DESC,id DESC LIMIT 26 OFFSET $3",[search,status,(page-1)*25]);res.json({orders:result.rows.slice(0,25),page,hasMore:result.rows.length>25});
 }));
 app.patch('/admin/api/orders/:number/status',safe(async(req,res)=>{
  if(!STAGES.includes(req.body.status))return res.status(400).json({message:'Choose a valid order stage.'});
  let order;if(demo){order=demoOrders.find(o=>o.order_number===req.params.number);if(order){if(req.body.status==='Collected'&&order.status!=='Collected')order.completed_at=new Date().toISOString();else if(req.body.status!=='Collected')order.completed_at=null;order.status=req.body.status;}}else{order=updateOrder?await updateOrder(req.params.number,req.body.status):(await pool.query('UPDATE orders SET status=$1 WHERE LOWER(order_number)=LOWER($2) RETURNING *',[req.body.status,req.params.number])).rows[0];}
  if(!order)return res.status(404).json({message:'Order not found.'});res.json({order});
 }));
 app.use('/admin/api/mail',(req,res,next)=>{if(session(req)?.user.role!=='owner')return res.status(403).json({message:'The business inbox is available to the bakery owner. Developer maintenance access does not include mailbox contents.'});next();});
 app.get('/admin/api/mail',safe(async(req,res)=>{if(demo)return res.json({messages:req.query.folder==='sent'?[]:inbox,demo:true});if(!mail)return res.status(503).json({message:'Mailbox is not connected. Configure the business email provider first.'});res.json({messages:await mail.list({folder:req.query.folder==='sent'?'sent':'inbox',page:req.query.page})});}));
 app.get('/admin/api/mail/:id',safe(async(req,res)=>{if(demo){const message=inbox.find(m=>m.id===req.params.id);return message?res.json({message}):res.status(404).json({message:'Message not found.'});}if(!mail)return res.status(503).json({message:'Mailbox is not connected.'});res.json({message:await mail.read(req.params.id)});}));
 app.get('/admin/api/mail/:id/attachments/:index',safe(async(req,res)=>{if(demo||!mail)return res.status(503).json({message:'No real attachment is available in the local demo.'});const index=Number(req.params.index);const file=await mail.attachment(req.params.id,index);res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.send(file.content);}));
 app.post('/admin/api/mail/send',express.json({limit:'16mb'}),safe(async(req,res)=>{
  const {to,subject,text,replyId,attachments,requestId}=req.body;
  if(typeof to!=='string'||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)||/[\r\n]/.test(to)||typeof subject!=='string'||!subject.trim()||subject.length>250||/[\r\n]/.test(subject)||typeof text!=='string'||!text.trim()||text.length>20000)return res.status(400).json({message:'Enter one valid recipient, a subject, and a message.'});
  try{require('./mailbox').decodeAttachments(attachments);}catch(e){return res.status(400).json({message:e.message});}
  if(demo)return res.json({demo:true,message:'Demo only — no email was sent.'});
  if(!mail||!mail.sendingEnabled)return res.status(503).json({message:'Sending is not configured. Nothing was sent.'});
  let sent;try{sent=await mail.send({to,subject,text,replyId,attachments,requestId});}catch{return res.status(502).json({message:'Delivery could not be confirmed. Check the mailbox before retrying; no automatic resend was made.'});}res.json({message:sent.warning||'Email accepted for sending and saved in Sent.',sentCopySaved:sent.sentCopySaved});
 }));
 app.use('/admin',express.static(path.join(__dirname,'public'),{index:'dashboard.html'}));
 return {close:()=>clearInterval(cleanup)};
}
module.exports={installAdmin,STAGES};
