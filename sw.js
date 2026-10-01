/* Service worker — network-first CÓ HẠN GIỜ: online lấy bản MỚI nhất (thấy cập nhật ngay); mạng chập
   chờn (công trình sóng yếu) thì chờ tối đa NET_WAIT rồi mở bằng cache, không treo màn trắng.
   Mất mạng hẳn thì fetch lỗi ngay -> cache. Chỉ cache phản hồi OK (không lưu trang lỗi 404/500).
   GitHub Pages gửi Cache-Control max-age=600: fetch thường sẽ lấy bản CŨ trong bộ nhớ trình duyệt tới 10 phút
   (28/09 Khoa deploy xong mở app vẫn thấy cũ) -> file cùng nhà luôn hỏi lại máy chủ (no-cache / reload). */
var CACHE = 'khao-sat-v0-26';
var NET_WAIT = 3000;
var ASSETS = ['./', './index.html', './js/geometry.js', './js/danh-muc.js', './js/dxf.js', './manifest.json', './icon.svg',
  './fonts/bvp-400-latin.woff2', './fonts/bvp-400-vietnamese.woff2', './fonts/bvp-500-latin.woff2', './fonts/bvp-500-vietnamese.woff2', './fonts/bvp-600-latin.woff2', './fonts/bvp-600-vietnamese.woff2', './fonts/bvp-700-latin.woff2', './fonts/bvp-700-vietnamese.woff2'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    function finish(resp) { if (!done && resp) { done = true; resolve(resp); } }
    var timer = setTimeout(function () { caches.match(e.request).then(finish); }, NET_WAIT);
    var same = new URL(e.request.url).origin === self.location.origin;
    fetch(same ? new Request(e.request, { cache: 'no-cache' }) : e.request).then(function (resp) {
      clearTimeout(timer);
      if (resp.ok) { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      finish(resp);
    }).catch(function () {
      clearTimeout(timer);
      caches.match(e.request).then(function (hit) { finish(hit || Response.error()); });
    });
  }));
});
