// 아주 작은 서비스 워커: 빌드 산출물을 캐시해 오프라인에서도 실행되게 한다.
// FILES와 VERSION은 빌드 후 scripts/sw-manifest.mjs가 채운다.
const VERSION = /*VERSION*/ 'dev';
const FILES = /*FILES*/ [];
const CACHE = `park-builder-${VERSION}`;
const scope = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', ...FILES].map((f) => new URL(f, scope).href))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('park-builder-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 페이지(index.html)는 네트워크 우선: 새 버전이 배포되면 다음 실행에 반영. 오프라인이면 캐시.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(new URL('./', scope).href, copy));
          return res;
        })
        .catch(() => caches.match(new URL('./', scope).href)),
    );
    return;
  }

  // 나머지(해시가 붙은 에셋, 아이콘)는 캐시 우선
  event.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
