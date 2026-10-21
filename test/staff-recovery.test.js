const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const {installAdmin} = require('../admin');
const {createStaffAccounts,hashPassword,verifyPassword,dashboardOrigin} = require('../staff-accounts');

// Persistent-store double shared by independent app instances. Expiry, issuance
// limits and the single conditional consume are modelled independently of HTTP.
function database() {
 const rows = new Map(); let now = Date.now(), failure;
 const copy = row => row ? {...row} : null;
 return {
  rows, advance: ms => {now += ms;}, fail: error => {failure = error;},
  async query(sql,args=[]) {
   if(failure)throw failure;
   assert(sql.includes('staff_credentials'), 'Recovery must not mutate bakery data');
   if(sql.startsWith('SELECT email, role'))return {rows:rows.has(args[0])?[copy(rows.get(args[0]))]:[]};
   if(sql.startsWith('INSERT INTO')) {
    const [email,role,hash]=args;let row=rows.get(email);
    if(row&&(row.role!==role||row.requested>now-60000||(row.window>now-3600000&&row.count>=3)))return {rows:[]};
    if(!row){row={email,role,password_hash:null,credential_version:0,count:0};rows.set(email,row);}
    row.count=!row.window||row.window<now-3600000?1:row.count+1;
    if(!row.window||row.window<now-3600000)row.window=now;
    Object.assign(row,{reset_token_hash:hash,reset_expires_at:now+1800000,requested:now});
    return {rows:[{email}]};
   }
   const row=[...rows.values()].find(r=>r.reset_token_hash===args[0]);
   if(sql.startsWith('UPDATE staff_credentials SET reset_token_hash=NULL')) {
    if(row)Object.assign(row,{reset_token_hash:null,reset_expires_at:null});
    return {rows:[]};
   }
   assert(sql.includes('reset_expires_at>now()'));
   assert(sql.includes("role='owner' AND email=$2"));
   const valid=row&&row.reset_expires_at>now&&((row.role==='owner'&&row.email===args[1])||(row.role==='developer'&&row.email===args[2]));
   if(sql.startsWith('SELECT email FROM'))return {rows:valid?[{email:row.email}]:[]};
   assert(sql.startsWith('UPDATE staff_credentials SET password_hash=$4'));
   assert(sql.includes('credential_version=credential_version+1,reset_token_hash=NULL,reset_expires_at=NULL'));
   if(!valid)return {rows:[]};
   Object.assign(row,{password_hash:args[3],credential_version:row.credential_version+1,reset_token_hash:null,reset_expires_at:null});
   return {rows:[copy(row)]};
  },
 };
}

function configuration(extra={}) {
 return {STAFF_RECOVERY_ENABLED:'true',STAFF_OWNER_PASSWORD:'original owner test password',STAFF_DEVELOPER_PASSWORD:'original developer test password',
  MAILBOX_PASSWORD:'untouched mailbox credential',MAIL_SEND_ENABLED:'true',MAIL_SEND_TRANSPORT:'brevo',BREVO_API_KEY:'synthetic-key',MAILBOX_ADDRESS:'info@feliciabakes.co.za',DASHBOARD_ORIGIN:'https://bakery.example',...extra};
}
async function fixture(pool=database(),extra={}) {
 const app=express();app.use(express.json());const env=configuration(extra),sent=[];
 const control=installAdmin(app,pool,{env,sendRecovery:async message=>{sent.push(message);return {accepted:true};}});
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 const origin='http://127.0.0.1:'+server.address().port;env.DASHBOARD_ORIGIN=origin;
 return {pool,env,sent,origin,
  request:(path,body,cookie,source=origin)=>fetch(origin+'/admin/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:source,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),
  close:async()=>{control.close();await new Promise(r=>server.close(r));},
 };
}
const tokenFrom = email => new URL(email.text.match(/https?:\/\/[^\s]+/)[0]).hash.slice('#token='.length);
async function waitForEmail(f,count=1) {
 for(let i=0;i<100&&f.sent.length<count;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(f.sent.length,count);
}
async function login(f,email='info@feliciabakes.co.za',password='original owner test password') {
 const response=await f.request('/login',{email,password});assert.equal(response.status,200);
 return response.headers.get('set-cookie').split(';')[0];
}

test('password hashing is salted, bounded, asynchronous and rejects damaged hashes',async()=>{
 const a=await hashPassword('a secure synthetic password'),b=await hashPassword('a secure synthetic password');
 assert.notEqual(a,b);assert(!a.includes('synthetic'));assert(await verifyPassword('a secure synthetic password',a));
 assert.equal(await verifyPassword('wrong',a),false);
 assert.equal(await verifyPassword('anything',a.replace('32768','1073741824')),false);
 assert.equal(await verifyPassword('anything','broken'),false);
});

test('recovery origin requires HTTPS in production and never trusts arbitrary paths or userinfo',()=>{
 for(const origin of ['http://bakery.example','https://name:secret@bakery.example','https://bakery.example/evil','https://bakery.example/?x=1','https://bakery.example/#x'])assert.equal(dashboardOrigin(configuration({NODE_ENV:'production',DASHBOARD_ORIGIN:origin})),null);
 assert.equal(dashboardOrigin(configuration()),'https://bakery.example');
 assert.equal(dashboardOrigin(configuration({DASHBOARD_ORIGIN:'http://localhost:4000'})),'http://localhost:4000');
 assert.equal(dashboardOrigin(configuration({RENDER:'true',DASHBOARD_ORIGIN:'http://localhost:4000'})),null);
});

test('real reset persists across apps, revokes all owner sessions, preserves developer access and mailbox credentials',async()=>{
 const pool=database(),a=await fixture(pool),b=await fixture(pool);
 try {
  const ownerA=await login(a),ownerB=await login(b),dev=await login(a,'dev@feliciabakes.co.za','original developer test password');
  const request=await a.request('/request-password-reset',{email:' INFO@feliciabakes.co.za '});assert.equal(request.status,202);
  await waitForEmail(a);const token=tokenFrom(a.sent[0]);
  assert.equal(a.sent[0].to,'info@feliciabakes.co.za');assert(a.sent[0].text.includes(a.origin+'/admin/recover.html#token='));
  const stored=pool.rows.get('info@feliciabakes.co.za');assert.equal(stored.reset_token_hash,crypto.createHash('sha256').update(token).digest('hex'));assert(!JSON.stringify(stored).includes(token));
  const changed=await b.request('/reset-password',{token,password:'new owner synthetic password'});assert.equal(changed.status,200);
  assert.equal((await(await a.request('/session',null,ownerA)).json()).authenticated,false);
  assert.equal((await(await b.request('/session',null,ownerB)).json()).authenticated,false);
  assert.equal((await a.request('/orders',null,ownerA)).status,401);
  const devState=await(await a.request('/session',null,dev)).json();assert.equal(devState.user.role,'developer');
  assert.equal((await a.request('/mail',null,dev)).status,403);
  assert.equal((await a.request('/login',{email:'info@feliciabakes.co.za',password:'original owner test password'})).status,401);
  const fresh=await login(a,'info@feliciabakes.co.za','new owner synthetic password');assert.equal((await(await a.request('/session',null,fresh)).json()).user.role,'owner');
  assert.equal((await a.request('/reset-password',{token,password:'another synthetic password'})).status,400);
  assert.equal(pool.rows.get('info@feliciabakes.co.za').reset_token_hash,null);
  assert.equal(a.env.MAILBOX_PASSWORD,'untouched mailbox credential');
  await waitForEmail(b);assert(b.sent[0].subject.includes('password changed'));assert(!b.sent[0].text.includes('new owner synthetic password'));
 } finally {await a.close();await b.close();}
});

test('parallel reset submissions consume a token exactly once',async()=>{
 const f=await fixture();try {
  await f.request('/request-password-reset',{email:'info@feliciabakes.co.za'});await waitForEmail(f);
  const token=tokenFrom(f.sent[0]);
  const responses=await Promise.all([f.request('/reset-password',{token,password:'first synthetic password'}),f.request('/reset-password',{token,password:'second synthetic password'})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);assert.equal(f.pool.rows.get('info@feliciabakes.co.za').credential_version,1);
 } finally {await f.close();}
});

test('unknown addresses get the same response, cannot select a recipient or create accounts',async()=>{
 const f=await fixture();try {
  const known=await f.request('/request-password-reset',{email:'info@feliciabakes.co.za',to:'attacker@example.invalid'});
  const unknown=await f.request('/request-password-reset',{email:'outsider@example.invalid'});
  assert.equal(known.status,unknown.status);assert.deepEqual(await known.json(),await unknown.json());await waitForEmail(f);
  assert.equal(f.pool.rows.size,1);assert.equal(f.sent[0].to,'info@feliciabakes.co.za');
 } finally {await f.close();}
});

test('reset links expire and newer requests invalidate older links; GET does not consume them',async()=>{
 const f=await fixture();try {
  await f.request('/request-password-reset',{email:'info@feliciabakes.co.za'});await waitForEmail(f);
  const old=tokenFrom(f.sent[0]);f.pool.advance(61000);
  await f.request('/request-password-reset',{email:'info@feliciabakes.co.za'});await waitForEmail(f,2);
  const token=tokenFrom(f.sent[1]);assert.notEqual(token,old);
  const page=await fetch(f.origin+'/admin/recover.html');assert.equal(page.status,200);assert.match(page.headers.get('referrer-policy'),/no-referrer/);assert.match(page.headers.get('cache-control'),/no-store/);
  assert.equal((await f.request('/reset-password',{token:old,password:'new synthetic password'})).status,400);
  assert.equal((await f.request('/reset-password',{token:'a'.repeat(64),password:'new synthetic password'})).status,400);
  f.pool.advance(1800001);assert.equal((await f.request('/reset-password',{token,password:'new synthetic password'})).status,400);
  assert.equal(f.pool.rows.get('info@feliciabakes.co.za').password_hash,null);
 } finally {await f.close();}
});

test('origin validation, request throttling and password policy protect public recovery routes',async()=>{
 const f=await fixture();try {
  assert.equal((await f.request('/request-password-reset',{email:'info@feliciabakes.co.za'},null,'https://attacker.invalid')).status,403);
  assert.equal((await f.request('/reset-password',{token:'a'.repeat(64),password:'too short'})).status,400);
  assert.equal((await f.request('/request-password-reset',{email:'bad\r\n@example.invalid'})).status,400);
  for(let i=0;i<4;i++)assert.equal((await f.request('/request-password-reset',{email:'nobody@example.invalid'})).status,202);
  assert.equal((await f.request('/request-password-reset',{email:'nobody@example.invalid'})).status,429);
  assert.equal(f.sent.length,0);
 } finally {await f.close();}
});

test('account cooldown and hourly cap persist independently of IP rate limits',async()=>{
 const pool=database(),sent=[],env=configuration();
 const service=createStaffAccounts(pool,{env,sendRecovery:async m=>{sent.push(m);return {accepted:true};}});
 await service.requestReset('info@feliciabakes.co.za');await service.requestReset('info@feliciabakes.co.za');assert.equal(sent.length,1);
 for(let i=0;i<3;i++){pool.advance(61000);await service.requestReset('info@feliciabakes.co.za');}assert.equal(sent.length,3);
 pool.advance(3600001);await service.requestReset('info@feliciabakes.co.za');assert.equal(sent.length,4);
});

test('failed email delivery removes its token and never exposes a provider error or secret',async()=>{
 const pool=database(),service=createStaffAccounts(pool,{env:configuration(),sendRecovery:async()=>{throw Error('private-provider-detail');}});
 await assert.rejects(service.requestReset('info@feliciabakes.co.za'),error=>error.message==='Password recovery delivery failed.');
 assert.equal(pool.rows.get('info@feliciabakes.co.za').reset_token_hash,null);
});

test('disabled recovery and demos never send; unprovisioned developer cannot bootstrap by reset',async()=>{
 const f=await fixture(database(),{STAFF_RECOVERY_ENABLED:'false'});try {
  assert.equal((await(await f.request('/recovery-status')).json()).available,false);
  assert.equal((await f.request('/request-password-reset',{email:'info@feliciabakes.co.za'})).status,503);assert.equal(f.sent.length,0);
 } finally {await f.close();}
 const pool=database(),env=configuration({STAFF_DEVELOPER_PASSWORD:''}),sent=[];
 const service=createStaffAccounts(pool,{env,sendRecovery:async m=>{sent.push(m);return {accepted:true};}});
 await service.requestReset('dev@feliciabakes.co.za');assert.equal(pool.rows.size,0);assert.equal(sent.length,0);
 const demo=createStaffAccounts(pool,{env,demo:true,sendRecovery:()=>assert.fail('Demo cannot send')});assert.equal(demo.configured(),false);
});

test('database outage fails closed and persisted passwords remain authoritative when sending is disabled',async()=>{
 const pool=database(),env=configuration(),service=createStaffAccounts(pool,{env,sendRecovery:async()=>({accepted:true})});
 pool.rows.set('info@feliciabakes.co.za',{email:'info@feliciabakes.co.za',role:'owner',password_hash:await hashPassword('stored synthetic password'),credential_version:2});
 env.STAFF_RECOVERY_ENABLED='false';assert.equal(await service.authenticate('info@feliciabakes.co.za','original owner test password'),null);
 assert.equal((await service.authenticate('info@feliciabakes.co.za','stored synthetic password')).credentialVersion,'2');
 pool.fail(Error('database unavailable'));await assert.rejects(service.authenticate('info@feliciabakes.co.za','original owner test password'));
 const missing={query:async()=>{throw Object.assign(Error('missing'),{code:'42P01'});}};
 assert(await createStaffAccounts(missing,{env}).authenticate('info@feliciabakes.co.za','original owner test password'));
 env.STAFF_RECOVERY_ENABLED='true';await assert.rejects(createStaffAccounts(missing,{env}).authenticate('info@feliciabakes.co.za','original owner test password'));
});
