const CACHE_NAME = 'shifter-payroll-v3';
const APP_SHELL = [
  './shifter-payroll.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ===== استقبال مشاركة (Share Target) من واتساب — نص أو ملف JSON =====
  const isShareTarget = event.request.method === 'POST' && url.pathname.endsWith('/shifter-payroll.html');
  if (isShareTarget) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  if (event.request.method !== 'GET') return;

  const isHTML = event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    event.request.url.endsWith('.html');

  if (isHTML) {
    // Network-first for the app shell so button/logic fixes always show up.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const file = formData.get('shared_file');
    const text = formData.get('share_text') || formData.get('text') || '';
    const title = formData.get('share_title') || formData.get('title') || '';

    if (file && typeof file.text === 'function' && file.size > 0) {
      // ملف (زي ملف تصدير جدول القسم JSON) — نخزنه في Cache Storage
      // عشان صفحة التطبيق تقراه بعد ما تفتح
      const cache = await caches.open('shifter-share-cache');
      const fileText = await file.text();
      await cache.put('shared-file-data', new Response(fileText));
      return Response.redirect('./shifter-payroll.html?shared_kind=file', 303);
    }

    if (text || title) {
      // نص عادي (رسالة وردية/تبديل/إجازة من واتساب)
      const t = encodeURIComponent(text || title);
      return Response.redirect('./shifter-payroll.html?share_text=' + t, 303);
    }

    return Response.redirect('./shifter-payroll.html', 303);
  } catch (e) {
    return Response.redirect('./shifter-payroll.html', 303);
  }
}
