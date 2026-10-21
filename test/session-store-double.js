const assert = require('node:assert/strict');
function sessionStoreDouble() {
 const rows = new Map();
 return { rows, query(sql,args=[]) {
  if (!sql.includes('staff_sessions')) return null;
  if (sql.startsWith('INSERT INTO staff_sessions')) {
   const [hash,email,role,name,version] = args;
   assert(!rows.has(hash));
   rows.set(hash,{email,role,display_name:name,credential_version:version,expires_at:new Date(Date.now()+30*86400000)});
   return {rows:[]};
  }
  if (sql.startsWith('SELECT email, role, display_name')) {
   const row=rows.get(args[0]);return {rows:row&&new Date(row.expires_at)>new Date()?[{...row}]:[]};
  }
  if (sql === 'DELETE FROM staff_sessions WHERE token_hash=$1') rows.delete(args[0]);
  else if (sql === 'DELETE FROM staff_sessions WHERE expires_at<=now()') {
   for (const [hash,row] of rows) if (new Date(row.expires_at)<=new Date()) rows.delete(hash);
  } else assert.fail('Unexpected session query');
  return {rows:[]};
 }};
}
module.exports = {sessionStoreDouble};
