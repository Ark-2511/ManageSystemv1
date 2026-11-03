/* Lưu sẵn giao diện và ảnh trong máy để màn hình quầy vẫn mở được khi mất mạng. Không đụng tới dữ liệu Supabase. */
var CACHE = 'menu-cafe-v3';
self.addEventListener('install', function (e) { self.skipWaiting() });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE }).map(function (k) { return caches.delete(k) })) }).then(function () { return self.clients.claim() }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.pathname.indexOf('/admin/') >= 0) return;                 /* trang quản lý: luôn lấy mới */
  if (/supabase\.co$/.test(u.hostname) && u.pathname.indexOf('/storage/v1/object/public/') < 0) return; /* dữ liệu: không lưu */
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(r, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(r).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res }).catch(function () { return hit });
      return hit || net;
    });
  }));
});
