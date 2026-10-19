const crypto=require('node:crypto');
function emailKey(value){const s=String(value||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:null;}
function phoneKey(value){let s=String(value||'').trim();if(!s||/[^+\d\s().-]/.test(s))return null;s=s.replace(/[\s().-]/g,'');if(s.startsWith('00'))s='+'+s.slice(2);if(/^0\d{9}$/.test(s))s='+27'+s.slice(1);return /^\+?[1-9]\d{7,14}$/.test(s)?s:null;}
function day(value){if(!value)return null;const s=value instanceof Date?value.toISOString():String(value);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null;}
function businessData(orders,{today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}={}){
 const evidence=new Map();
 for(const o of orders){const phone=phoneKey(o.phone_number);if(!phone)continue;const e=evidence.get(phone)||{emails:new Set(),names:new Set()};const email=emailKey(o.email);if(email)e.emails.add(email);else if(o.name?.trim())e.names.add(o.name.trim().toLowerCase().replace(/\s+/g,' '));evidence.set(phone,e);}
 const profiles=new Map();let unidentifiedOrders=0,ambiguousPhoneOrders=0;
 for(const o of orders){const email=emailKey(o.email),phone=phoneKey(o.phone_number);const ambiguous=phone&&(evidence.get(phone).emails.size>1||evidence.get(phone).names.size>1);const identity=email?'email:'+email:phone&&!ambiguous?'phone:'+phone:null;
  if(!identity){unidentifiedOrders++;if(phone&&ambiguous)ambiguousPhoneOrders++;continue;}
  const id=crypto.createHash('sha256').update(identity).digest('hex');let c=profiles.get(id);if(!c){c={id,matchBy:email?'email':'phone',name:o.name||'Name not supplied',email:email||'',phone:o.phone_number||'',orders:[],names:new Set()};profiles.set(id,c);}if(o.name?.trim())c.names.add(o.name.trim());c.orders.push(o);
 }
 const customers=[...profiles.values()].map(c=>{c.orders.sort((a,b)=>(new Date(b.created_at||0).getTime()||0)-(new Date(a.created_at||0).getTime()||0));const latest=c.orders[0];return {id:c.id,matchBy:c.matchBy,name:latest.name||c.name,email:c.email,phone:c.orders.find(o=>o.phone_number)?.phone_number||'',orderCount:c.orders.length,activeOrders:c.orders.filter(o=>o.status!=='Collected').length,firstOrder:c.orders[c.orders.length-1].created_at||null,lastOrder:latest.created_at||null,returning:c.orders.length>1,contactNote:c.names.size>1?'Different names use this contact. Review before assuming one person.':null,orders:c.orders};}).sort((a,b)=>(new Date(b.lastOrder||0).getTime()||0)-(new Date(a.lastOrder||0).getTime()||0));
 const stages={};for(const o of orders)stages[o.status||'Unknown']=(stages[o.status||'Unknown']||0)+1;
 const upcoming=orders.filter(o=>o.status!=='Collected'&&day(o.event_date)&&day(o.event_date)>=today).sort((a,b)=>day(a.event_date).localeCompare(day(b.event_date))||String(a.event_time||'').localeCompare(String(b.event_time||''))).slice(0,10);
 return {customers,summary:{totalOrders:orders.length,identifiedCustomers:customers.length,returningCustomers:customers.filter(c=>c.returning).length,singleOrderCustomers:customers.filter(c=>!c.returning).length,activeOrders:orders.filter(o=>o.status!=='Collected').length,completedOrders:orders.filter(o=>o.status==='Collected').length,undatedActiveOrders:orders.filter(o=>o.status!=='Collected'&&!day(o.event_date)).length,unidentifiedOrders,ambiguousPhoneOrders,stages,upcoming,asOf:today}};
}
module.exports={businessData,emailKey,phoneKey};
