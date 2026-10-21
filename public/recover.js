'use strict';
(() => {
 const byId = id => document.getElementById(id);
 let token = new URLSearchParams(window.location.hash.slice(1)).get('token');
 // Keep the token only in this page's memory, never in storage or subsequent URLs.
 if (window.location.hash) history.replaceState(null, '', window.location.pathname);
 const message = byId('recoveryMessage'), error = byId('recoveryError');
 const requestForm = byId('requestResetForm'), resetForm = byId('resetPasswordForm');
 async function request(path, data) {
  const response = await fetch('/admin/api/' + path, {
   method: data ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
   headers: {'Content-Type': 'application/json'}, ...(data ? {body: JSON.stringify(data)} : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(body.message || 'Could not connect. Please try again.');
  return body;
 }
 function busy(form, value) { for (const field of form.elements) field.disabled = value; }
 request('recovery-status').then(status => {
  if (!status.available) {
   message.textContent = 'Password recovery is not available yet. Contact your account administrator for help.';
   return;
  }
  if (token && /^[a-f0-9]{64}$/.test(token)) {
   message.textContent = 'Your reset link works once and expires after 30 minutes.';
   resetForm.hidden = false;
  } else {
   if (token) error.textContent = 'This reset link is invalid. Request a new link below.';
   token = null; message.textContent = ''; requestForm.hidden = false;
  }
 }).catch(() => { error.textContent = 'Could not connect. Check your connection and reload this page.'; message.textContent = ''; });
 requestForm.addEventListener('submit', async event => {
  event.preventDefault(); error.textContent = ''; busy(requestForm, true);
  try {
   const result = await request('request-password-reset', {email: byId('recoveryEmail').value});
   message.textContent = result.message;
  } catch (failure) { error.textContent = failure.message; }
  finally { busy(requestForm, false); }
 });
 resetForm.addEventListener('submit', async event => {
  event.preventDefault(); error.textContent = '';
  const password = byId('newPassword').value;
  if (password !== byId('confirmPassword').value) { error.textContent = 'Your passwords do not match.'; return; }
  busy(resetForm, true);
  try {
   const result = await request('reset-password', {token, password});
   token = null; resetForm.reset(); resetForm.hidden = true;
   message.textContent = result.message;
  } catch (failure) { error.textContent = failure.message; }
  finally { busy(resetForm, false); }
 });
})();
