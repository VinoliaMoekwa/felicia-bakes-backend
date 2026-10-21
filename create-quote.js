'use strict';

// Static column/type pairs; customer data is always passed as query parameters.
const FIELDS = [
 ['name','text'], ['email','text'], ['phone_number','text'],
 ['cake_selected','boolean'], ['cupcake_selected','boolean'],
 ['flavour','text'], ['filling','text'], ['cake_size','text'], ['design_type','text'],
 ['cupcake_topping','text'], ['cupcake_quantity','integer'], ['color_scheme','text'],
 ['message','text'], ['dietary','text'], ['occasion','text'],
 ['event_date','date'], ['event_time','time'], ['total_price','numeric']
];
const columns = FIELDS.map(([name])=>name).join(',');
const matchingValues = FIELDS.map(([,type],i)=>`$${i+1}::${type}`).join(',');

async function createQuote(pool, body) {
 const values = [body.name,body.email,body.phoneNumber||null,!!body.cakeSelected,!!body.cupcakeSelected,
  body.flavour||null,body.filling||null,body.cakeSize||null,body.designType||null,
  body.cupcakeTopping||null,Number(body.cupcakeQuantity||0),body.colorScheme||null,
  body.message||null,body.dietary||null,body.occasion||null,body.eventDate||null,body.eventTime||null,body.totalPrice||0];
 const client = await pool.connect();
 let broken = false;
 try {
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await client.query("SET LOCAL lock_timeout='5s'");
  // Shared by all app instances, including after restarts. Hold only while saving;
  // WhatsApp and notification delivery never run inside this transaction.
  await client.query('SELECT pg_advisory_xact_lock(177705,1)');
  const existing = await client.query(`SELECT * FROM orders
   WHERE created_at>=now()-interval '10 minutes' AND order_number ~ '^FB[0-9]+$'
    AND ROW(${columns}) IS NOT DISTINCT FROM ROW(${matchingValues})
   ORDER BY created_at ASC,id ASC LIMIT 1`,values);
  if (existing.rows[0]) {
   await client.query('COMMIT');
   return {order:existing.rows[0],created:false};
  }
  const next = await client.query(`SELECT COALESCE(MAX(SUBSTRING(order_number FROM '^FB([0-9]+)$')::bigint),0)+1 AS next_number
   FROM orders WHERE order_number ~ '^FB[0-9]+$'`);
  const number = 'FB'+String(next.rows[0].next_number).padStart(3,'0');
  const placeholders = FIELDS.map((_,i)=>`$${i+2}`).join(',');
  const inserted = await client.query(`INSERT INTO orders (order_number,${columns},status)
   VALUES ($1,${placeholders},'Quote Requested') RETURNING *`,[number,...values]);
  await client.query('COMMIT');
  return {order:inserted.rows[0],created:true};
 } catch (error) {
  await client.query('ROLLBACK').catch(()=>{broken=true;});
  throw error;
 } finally {
  client.release(broken ? new Error('Could not roll back quote transaction.') : undefined);
 }
}

module.exports = {createQuote};
