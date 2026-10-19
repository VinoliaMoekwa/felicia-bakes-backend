// No Cache Storage, background sync or message persistence. Business data stays online.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // APIs, attachments, mutations and other resources are never intercepted or cached.
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin || !['/admin/', '/admin/dashboard.html'].includes(url.pathname)) return;
  event.respondWith(fetch(request, {cache: 'no-store'}).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><title>Felicia Bakes</title><h1>Felicia Bakes</h1><h2>Reconnect to open your bakery desk</h2><p>Orders, customers and business email need an internet connection. Business information is not saved for offline use.</p><p><a href="/admin/">Try again</a></p></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}}
  )));
});
