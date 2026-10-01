// ParkMate Service Worker
// 策略：App Shell 走 cache-first（安裝時預快取），API 一律 network-only。
// 帳務資料不做離線快取——顯示過期的餘額或收款狀態比顯示不出來更危險。

const VERSION = 'parkmate-v2';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API 不快取：寧可轉圈也不要拿舊帳務數字給使用者看
  if (url.pathname.startsWith('/api/')) return;

  // 導覽請求走 network-first，離線時退回快取的 App Shell（SPA 由前端路由接手）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((r) => r ?? Response.error())),
    );
    return;
  }

  // 靜態資源（帶 hash 的 JS/CSS/圖片）走 cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});

// 點收租鈴聲通知時，回到已開啟的視窗（沒有就開新視窗）到收租鈴聲頁
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/finance/bell';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => 'focus' in c);
      if (win) {
        win.focus();
        if ('navigate' in win) win.navigate(target).catch(() => {});
        return;
      }
      return self.clients.openWindow(target);
    }),
  );
});
