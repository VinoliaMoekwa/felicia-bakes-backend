'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
let hashing = 0;

async function derive(password, salt) {
 if (hashing >= 4) throw Error('Password service is busy.');
 hashing++;
 try { return await scrypt(password, salt, 64, SCRYPT); }
 finally { hashing--; }
}

async function hashPassword(password) {
 const salt = crypto.randomBytes(16).toString('hex');
 return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}

async function verifyPassword(password, encoded) {
 const parts = String(encoded).split('$');
 // Accept only our bounded format; stored values cannot choose expensive parameters.
 if (parts.length !== 6 || parts.slice(0,4).join('$') !== 'scrypt$32768$8$3' ||
     !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
 return crypto.timingSafeEqual(await derive(password, parts[4]), Buffer.from(parts[5], 'hex'));
}

const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const validPassword = value => typeof value === 'string' && value.length >= 16 && value.length <= 128;

function dashboardOrigin(env) {
 try {
  const url = new URL(env.DASHBOARD_ORIGIN);
  const local = env.NODE_ENV !== 'production' && !env.RENDER && url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  return url.origin;
 } catch { return null; }
}

function createStaffAccounts(pool, { env, demo = false, sendRecovery } = {}) {
 const ownerEmail = () => normalizeEmail(env.STAFF_OWNER_EMAIL || 'info@feliciabakes.co.za');
 const developerEmail = () => normalizeEmail(env.STAFF_DEVELOPER_EMAIL || 'dev@feliciabakes.co.za');
 const roleFor = email => email === ownerEmail() ? 'owner' : email === developerEmail() ? 'developer' : null;
 const bootstrapPassword = role => {
  const kind = role.toUpperCase();
  return env[`STAFF_${kind}_PASSWORD_B64`] ? Buffer.from(env[`STAFF_${kind}_PASSWORD_B64`], 'base64').toString('utf8') : env[`STAFF_${kind}_PASSWORD`] || '';
 };
 const deliver = message => sendRecovery ? sendRecovery(message) : require('./brevo').createBrevo(env).send(message);
 const configured = () => !demo && !!pool && env.STAFF_RECOVERY_ENABLED === 'true' &&
  env.MAIL_SEND_ENABLED === 'true' && env.MAIL_SEND_TRANSPORT === 'brevo' &&
  !!(env.BREVO_API_KEY || env.BREVO_API_KEY_B64) && validEmail(env.MAILBOX_ADDRESS) && !!dashboardOrigin(env);

 async function credential(email, role) {
  if (demo) return null;
  try {
   const row = (await pool.query('SELECT email, role, password_hash, credential_version FROM staff_credentials WHERE email=$1', [email])).rows[0];
   if (row && row.role !== role) throw Error('Staff configuration does not match.');
   return row || null;
  } catch (error) {
   // Before the additive schema is activated, the established login still works.
   // Once recovery is enabled, a missing table fails closed.
   if (error.code === '42P01' && env.STAFF_RECOVERY_ENABLED !== 'true') return null;
   throw error;
  }
 }

 async function authenticate(email, password) {
  const role = roleFor(email);
  if (!role || typeof password !== 'string' || password.length > 128) return null;
  const row = await credential(email, role);
  let valid;
  if (row?.password_hash != null) valid = await verifyPassword(password, row.password_hash);
  else {
   const expected = bootstrapPassword(role);
   valid = !!expected && crypto.timingSafeEqual(Buffer.from(digest(password), 'hex'), Buffer.from(digest(expected), 'hex'));
  }
  return valid ? { role, credentialVersion: String(row?.credential_version || 0) } : null;
 }

 async function sessionValid(entry) {
  const role = roleFor(entry.user.email);
  if (role !== entry.user.role) return false;
  const row = await credential(entry.user.email, role);
  return !!(row?.password_hash || bootstrapPassword(role)) && String(row?.credential_version || 0) === entry.credentialVersion;
 }

 async function requestReset(email) {
  if (!configured()) throw Error('Password recovery is not configured.');
  const role = roleFor(email);
  if (!role) return;
  const existing = await credential(email, role);
  // A reset cannot activate a previously disabled/unprovisioned staff account.
  if (!existing?.password_hash && !bootstrapPassword(role)) return;
  const token = crypto.randomBytes(32).toString('hex'), tokenHash = digest(token);
  const result = await pool.query(`INSERT INTO staff_credentials(email,role,reset_token_hash,reset_expires_at,reset_requested_at,reset_window_started_at,reset_request_count)
   VALUES($1,$2,$3,now()+interval '30 minutes',now(),now(),1)
   ON CONFLICT(email) DO UPDATE SET reset_token_hash=EXCLUDED.reset_token_hash,
    reset_expires_at=EXCLUDED.reset_expires_at,reset_requested_at=now(),updated_at=now(),
    reset_window_started_at=CASE WHEN staff_credentials.reset_window_started_at IS NULL OR staff_credentials.reset_window_started_at < now()-interval '1 hour' THEN now() ELSE staff_credentials.reset_window_started_at END,
    reset_request_count=CASE WHEN staff_credentials.reset_window_started_at IS NULL OR staff_credentials.reset_window_started_at < now()-interval '1 hour' THEN 1 ELSE staff_credentials.reset_request_count+1 END
   WHERE staff_credentials.role=EXCLUDED.role AND (staff_credentials.reset_requested_at IS NULL OR staff_credentials.reset_requested_at < now()-interval '60 seconds')
    AND (staff_credentials.reset_window_started_at IS NULL OR staff_credentials.reset_window_started_at < now()-interval '1 hour' OR staff_credentials.reset_request_count<3)
   RETURNING email`, [email,role,tokenHash]);
  if (!result.rows.length) return;
  // Fragment keeps the bearer token out of server access logs and referrers.
  const link = `${dashboardOrigin(env)}/admin/recover.html#token=${token}`;
  const message = {
   from: env.MAILBOX_ADDRESS, to: email, subject: 'Felicia Bakes: reset your bakery desk password',
   text: `A password reset was requested for your Felicia Bakes bakery desk.\n\nChoose a new dashboard password:\n${link}\n\nThis link expires in 30 minutes and works once. Opening it does not change your password. If you did not request this, ignore this email. Your business email mailbox password is unchanged.`,
   requestId: crypto.randomUUID(),
  };
  try {
   const sent = await deliver(message);
   if (!sent?.accepted) throw Error('Password recovery email was not accepted.');
  } catch (error) {
   await pool.query('UPDATE staff_credentials SET reset_token_hash=NULL,reset_expires_at=NULL WHERE reset_token_hash=$1', [tokenHash]);
   throw Error('Password recovery delivery failed.');
  }
 }
 async function notifyPasswordChanged(email) {
  if (!configured() || !roleFor(email)) return;
  const result = await deliver({from:env.MAILBOX_ADDRESS,to:email,subject:'Felicia Bakes: your bakery desk password changed',
   text:'Your Felicia Bakes bakery desk password was changed. Existing dashboard sessions have been signed out. If you did not make this change, contact Oatle Technologies through your usual support channel immediately. Your business email mailbox password has not changed.',requestId:crypto.randomUUID()});
  if (!result?.accepted) throw Error('Password change notification failed.');
 }

 async function resetPassword(token, password) {
  if (!configured()) throw Error('Password recovery is not configured.');
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !validPassword(password)) return null;
  const tokenHash = digest(token);
  const allowed = "((role='owner' AND email=$2) OR (role='developer' AND email=$3))";
  const current = await pool.query(`SELECT email FROM staff_credentials WHERE reset_token_hash=$1 AND reset_expires_at>now() AND ${allowed}`, [tokenHash,ownerEmail(),developerEmail()]);
  if (!current.rows.length) return null;
  const passwordHash = await hashPassword(password);
  // One atomic statement both consumes the token and changes the credential.
  // Concurrent submissions, expiry and newer reset requests are checked again here.
  const result = await pool.query(`UPDATE staff_credentials SET password_hash=$4,
   credential_version=credential_version+1,reset_token_hash=NULL,reset_expires_at=NULL,updated_at=now()
   WHERE reset_token_hash=$1 AND reset_expires_at>now() AND ${allowed} RETURNING email,role,credential_version`,
   [tokenHash,ownerEmail(),developerEmail(),passwordHash]);
  return result.rows[0] || null;
 }
 return { configured, authenticate, sessionValid, requestReset, resetPassword, notifyPasswordChanged };
}

module.exports = { createStaffAccounts, hashPassword, verifyPassword, normalizeEmail, validEmail, validPassword, dashboardOrigin };
