const assert = require('node:assert/strict');
const fields = ['name','email','phone_number','cake_selected','cupcake_selected','flavour','filling','cake_size','design_type','cupcake_topping','cupcake_quantity','color_scheme','message','dietary','occasion','event_date','event_time','total_price'];

// Model committed rows and an independent connection per transaction. The lock
// queues connections; inserts are invisible until commit and discarded on rollback.
function quoteStoreDouble(rows=[]) {
 let tail=Promise.resolve(),now=Date.now(),insertError=null;
 const pool={rows,advance:ms=>{now+=ms;},failInsert:error=>{insertError=error;},async connect(){
  let pending=[],unlock,active=false;
  return {async query(sql,args=[]){
   if(sql==='BEGIN ISOLATION LEVEL READ COMMITTED'){active=true;return {rows:[]};}
   if(sql.startsWith('SET LOCAL'))return {rows:[]};
   if(sql==='SELECT pg_advisory_xact_lock(177705,1)'){
    const before=tail;tail=new Promise(resolve=>{unlock=resolve;});await before;return {rows:[]};
   }
   if(sql==='COMMIT'||sql==='ROLLBACK'){
    if(sql==='COMMIT')rows.push(...pending);
    pending=[];active=false;if(unlock){unlock();unlock=null;}return {rows:[]};
   }
   assert(active&&unlock,'Quote queries require the transaction lock');
   if(sql.startsWith('SELECT * FROM orders')){
    const matches=rows.filter(r=>new Date(r.created_at).getTime()>=now-600000&&/^FB[0-9]+$/.test(r.order_number)&&fields.every((key,i)=>{
     if(key==='total_price'||key==='cupcake_quantity')return Number(r[key])===Number(args[i]);
     if(key==='event_time'){const time=v=>v?.length===5?v+':00':v??null;return time(r[key])===time(args[i]);}
     return (r[key]??null)===(args[i]??null);
    })).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    return {rows:matches[0]?[{...matches[0]}]:[]};
   }
   if(sql.startsWith('SELECT COALESCE(MAX('))return {rows:[{next_number:Math.max(0,...rows.filter(r=>/^FB[0-9]+$/.test(r.order_number)).map(r=>Number(r.order_number.slice(2))))+1}]};
   if(sql.startsWith('INSERT INTO orders')){
    if(insertError)throw insertError;
    const row={id:Math.max(0,...rows.map(r=>r.id))+1,order_number:args[0],status:'Quote Requested',created_at:new Date(now).toISOString()};
    fields.forEach((key,i)=>{row[key]=args[i+1];});pending.push(row);return {rows:[{...row}]};
   }
   assert.fail('Unexpected quote SQL');
  },release(){assert(!active,'Connections must commit or roll back before release');}};
 }};
 return pool;
}
module.exports={quoteStoreDouble};
