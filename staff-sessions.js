'use strict';
const crypto = require('node:crypto');
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const digest = token => crypto.createHash('sha256').update(token).digest('hex');

function createStaffSessions(pool, { demo = false } = {}) {
 const memory = demo ? new Map() : null;
 async function load(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const key = digest(token);
  const row = demo ? memory.get(key) : (await pool.query(
   'SELECT email, role, display_name, credential_version, expires_at FROM staff_sessions WHERE token_hash=$1 AND expires_at>now()', [key])).rows[0];
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  return { token, credentialVersion: String(row.credential_version), user: { email: row.email, role: row.role, displayName: row.display_name } };
 }
 async function create(token, entry) {
  const key = digest(token), { user, credentialVersion } = entry;
  if (demo) {
   for (const [hash,row] of memory) if (row.expires_at <= Date.now()) memory.delete(hash);
   memory.set(key, { email: user.email, role: user.role, display_name: user.displayName, credential_version: credentialVersion, expires_at: Date.now()+SESSION_AGE });
   return;
  }
  await pool.query('DELETE FROM staff_sessions WHERE expires_at<=now()');
  await pool.query(`INSERT INTO staff_sessions(token_hash,email,role,display_name,credential_version,expires_at)
   VALUES($1,$2,$3,$4,$5,now()+interval '30 days')`, [key,user.email,user.role,user.displayName,credentialVersion]);
 }
 async function remove(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return;
  if (demo) memory.delete(digest(token));
  else await pool.query('DELETE FROM staff_sessions WHERE token_hash=$1', [digest(token)]);
 }
 return { load, create, remove };
}
module.exports = { createStaffSessions, SESSION_AGE };
