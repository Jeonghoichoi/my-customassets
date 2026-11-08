// 앱 설치(홈 화면 추가)를 위한 최소 서비스 워커.
// 화면 파일만 저장해 오프라인에서도 열리게 하고, 시세 API는 항상 네트워크에서 받습니다.
const SHELL = "shell-v3"; // 아이콘·이름이 바뀌면 올려요
const FILES = ["/", "/index.html", "/reader.html", "/travel.html", "/travel/japan.json", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html"))));
});
