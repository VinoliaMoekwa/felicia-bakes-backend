const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../server');
const {createQuote}=require('../create-quote');
const {quoteStoreDouble}=require('./quote-store-double');
const payload=()=>({name:'Synthetic customer',email:'test@example.invalid',phoneNumber:'0000000000',cupcakeSelected:true,cupcakeTopping:'simpleSwirl',cupcakeQuantity:24,message:'Synthetic quote only',totalPrice:0});

async function fixture(pool,notifyOrder=async()=>({status:'sent'})){
 const {app,close}=createApp({pool,env:{},notifyOrder});
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const url='http://127.0.0.1:'+server.address().port+'/orders';
 return {submit:async body=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),close:async()=>{close();await new Promise(r=>server.close(r));}};
}

test('parallel identical requests across app instances create one order and one notification',async()=>{
 const pool=quoteStoreDouble(),sent=[];const notify=async order=>{sent.push(order.order_number);return {status:'sent'};};
 const a=await fixture(pool,notify),b=await fixture(pool,notify);
 try {
  const responses=await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).submit(payload())));
  assert(responses.every(r=>r.status===200));const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.equal(pool.rows.length,1);assert.deepEqual(sent,['FB001']);
  assert(bodies.every(b=>b.orderNumber==='FB001'));assert.equal(bodies.filter(b=>!b.duplicate).length,1);
  assert(bodies.filter(b=>b.duplicate).every(b=>b.emailNotification==='not-resent'));
 } finally {await a.close();await b.close();}
});

test('retry after app restart four minutes later reuses the stored order',async()=>{
 const pool=quoteStoreDouble();const first=await createQuote(pool,payload());pool.advance(257000);
 const retry=await createQuote(pool,payload());assert.equal(first.created,true);assert.equal(retry.created,false);
 assert.equal(retry.order.order_number,first.order.order_number);assert.equal(pool.rows.length,1);
});

test('different requests and identical requests after ten minutes remain separate',async()=>{
 const pool=quoteStoreDouble();await createQuote(pool,payload());
 for(const change of [{cupcakeQuantity:48},{message:'Different design'},{phoneNumber:'0000000001'},{eventDate:'2026-12-01'}])assert.equal((await createQuote(pool,{...payload(),...change})).created,true);
 pool.advance(600001);assert.equal((await createQuote(pool,payload())).created,true);assert.equal(pool.rows.length,6);
});

test('concurrent distinct requests get unique tracking numbers despite manual orders or gaps',async()=>{
 const pool=quoteStoreDouble([{id:1,order_number:'FB009'},{id:2,order_number:'FBM-synthetic'}]);
 const results=await Promise.all(Array.from({length:5},(_,i)=>createQuote(pool,{...payload(),message:'Request '+i})));
 assert.deepEqual(results.map(r=>r.order.order_number).sort(),['FB010','FB011','FB012','FB013','FB014']);
});

test('insert failure rolls back, releases the lock and never sends a notification',async()=>{
 const pool=quoteStoreDouble();pool.failInsert(Error('synthetic failure'));let sent=0;const f=await fixture(pool,async()=>{sent++;return {status:'sent'};});
 try {
  assert.equal((await f.submit(payload())).status,500);assert.equal(pool.rows.length,0);assert.equal(sent,0);
  pool.failInsert(null);assert.equal((await f.submit(payload())).status,200);assert.equal(pool.rows.length,1);
 } finally {await f.close();}
});

test('notification failure still returns the saved tracking number and retry does not resend',async()=>{
 const pool=quoteStoreDouble();let attempts=0;const f=await fixture(pool,async()=>{attempts++;throw Error('synthetic mail failure');});
 try {
  const response=await f.submit(payload());assert.equal(response.status,200);const first=await response.json();
  assert.equal(first.emailNotification,'failed');assert.equal(first.orderNumber,'FB001');
  const retry=await(await f.submit(payload())).json();assert.equal(retry.orderNumber,'FB001');
  assert.equal(retry.duplicate,true);assert.equal(attempts,1);assert.equal(pool.rows.length,1);
 } finally {await f.close();}
});
