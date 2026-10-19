// Shared by the original status route and staff dashboard, using the same pool.
async function updateOrderStatus(pool, orderNumber, status) {
 let result;
 try {
  result=await pool.query("UPDATE orders SET completed_at=CASE WHEN $1='Collected' AND status<>'Collected' THEN now() WHEN $1<>'Collected' THEN NULL ELSE completed_at END,status=$1 WHERE LOWER(order_number)=LOWER($2) RETURNING *",[status,orderNumber]);
 } catch(error) {
  // Preserve current order updates until the additive business migration is applied.
  if(error.code!=='42703')throw error;
  result=await pool.query('UPDATE orders SET status=$1 WHERE LOWER(order_number)=LOWER($2) RETURNING *',[status,orderNumber]);
 }
 return result.rows[0]||null;
}
module.exports={updateOrderStatus};
