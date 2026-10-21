const test=require('node:test');const assert=require('node:assert/strict');const {createApp}=require('../server');
const {sessionStoreDouble}=require('./session-store-double');
const {quoteStoreDouble}=require('./quote-store-double');
test('original create → dashboard read/update → original customer tracking share one order store',async()=>{
 const sessionStore=sessionStoreDouble();
 const rows=[];const quotes=quoteStoreDouble(rows);const pool={connect:quotes.connect,async query(sql,args=[]){
  const sessionResult=sessionStore.query(sql,args);if(sessionResult)return sessionResult;
  if(sql.includes('FROM staff_credentials'))return {rows:[]};
  if(sql.includes('COUNT(*)'))return {rows:[{count:String(rows.length)}]};
  if(sql.includes('INSERT INTO orders')){const columns=sql.match(/INSERT INTO orders\s*\(([\s\S]+?)\)\s*VALUES/)[1].split(',').map(x=>x.trim());const order={id:rows.length+1,created_at:new Date().toISOString()};columns.forEach((k,i)=>order[k]=args[i]);rows.push(order);return {rows:[{...order}]};}
  if(sql.startsWith('UPDATE orders')){const order=rows.find(o=>o.order_number.toLowerCase()===args[1].toLowerCase());if(order)order.status=args[0];return {rows:order?[{...order}]:[]};}
  if(sql.includes('WHERE LOWER(order_number)'))return {rows:rows.filter(o=>o.order_number.toLowerCase()===args[0].toLowerCase()).map(o=>({...o}))};
  return {rows:rows.map(o=>({...o}))};
 }};
 const env={ADMIN_TOKEN:'legacy-admin-test',STAFF_OWNER_PASSWORD:'owner-test',STAFF_DEVELOPER_PASSWORD:'dev-test'};
 const {app,close}=createApp({pool,env});const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const base='http://127.0.0.1:'+server.address().port;env.DASHBOARD_ORIGIN=base;
 async function req(path,method='GET',body,headers={}){return fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});}
 try{
 const payload={name:'Contract test customer',email:'customer@example.invalid',phoneNumber:'0000000000',cakeSelected:true,flavour:'Vanilla',cakeSize:'Small',designType:'Buttercream',message:'Pink flowers',totalPrice:0};
 const created=await(await req('/orders','POST',payload)).json();assert.equal(created.orderNumber,'FB001');assert.equal(created.phoneNumber,payload.phoneNumber);
 const login=await req('/admin/api/login','POST',{email:'info@feliciabakes.co.za',password:'owner-test'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const list=await(await req('/admin/api/orders','GET',null,{Cookie:cookie})).json();assert.equal(list.orders[0].order_number,created.orderNumber);assert.equal(list.orders[0].message,payload.message);
 const update=await req('/admin/api/orders/FB001/status','PATCH',{status:'Baking'},{Cookie:cookie});assert.equal(update.status,200);
 const tracked=await(await req('/track/fb001')).json();assert.deepEqual(tracked,{orderNumber:'FB001',status:'Baking'});
 assert.equal((await req('/orders/FB001/status','PATCH',{status:'Collected'})).status,401);
 assert.equal((await req('/orders/FB001/status','PATCH',{status:'Ready for Collection'},{'x-admin-token':'legacy-admin-test'})).status,200);
 assert.equal((await(await req('/track/FB001')).json()).status,'Ready for Collection');
 assert.equal(rows.length,1);
 }finally{close();await new Promise(r=>server.close(r));}
});
