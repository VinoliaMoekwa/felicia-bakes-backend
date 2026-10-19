const {businessData,emailKey,phoneKey}=require('./business');
function directoryData(orders,contacts=[],links=[],options={}){
 const base=businessData(orders,options);let profiles=base.customers.map(c=>({...c,orders:[...c.orders]}));
 for(const contact of contacts){const linkedIds=new Set(links.filter(l=>l.contact_id===contact.id).map(l=>String(l.order_id)));const email=emailKey(contact.email),phone=phoneKey(contact.phone);const matches=profiles.filter(p=>email&&p.email===email||!email&&phone&&phoneKey(p.phone)===phone&&p.matchBy==='phone'&&p.name.trim().toLowerCase()===contact.name.trim().toLowerCase());
  const joined=new Map();for(const p of matches)for(const o of p.orders)joined.set(String(o.id),o);for(const o of orders)if(linkedIds.has(String(o.id)))joined.set(String(o.id),o);
  // Explicit links override derived groups, preserving history when contact details change.
  profiles=profiles.filter(p=>!matches.includes(p)).map(p=>({...p,orders:p.orders.filter(o=>!linkedIds.has(String(o.id)))})).filter(p=>p.orders.length||p.contactId);
  const history=[...joined.values()].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  profiles.push({id:'contact-'+contact.id,contactId:contact.id,name:contact.name,email:contact.email||'',phone:contact.phone||'',notes:contact.notes||'',source:contact.source||'Manually recorded',matchBy:'saved contact / explicit order links',orderCount:history.length,activeOrders:history.filter(o=>o.status!=='Collected').length,firstOrder:history.at(-1)?.created_at||null,lastOrder:history[0]?.created_at||null,returning:history.length>1,contactNote:null,orders:history});
 }
 for(const p of profiles){p.orderCount=p.orders.length;p.activeOrders=p.orders.filter(o=>o.status!=='Collected').length;p.returning=p.orders.length>1;}
 profiles.sort((a,b)=>a.name.localeCompare(b.name));
 const assigned=new Set(profiles.flatMap(c=>c.orders.map(o=>String(o.id))));
 return {customers:profiles,summary:{...base.summary,unidentifiedOrders:orders.filter(o=>!assigned.has(String(o.id))).length,identifiedCustomers:profiles.length,returningCustomers:profiles.filter(c=>c.returning).length,singleOrderCustomers:profiles.filter(c=>c.orders.length===1).length,standaloneCustomers:profiles.filter(c=>!c.orders.length).length}};
}
module.exports={directoryData};
