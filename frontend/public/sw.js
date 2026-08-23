// Минимальный service worker — существует только ради критерия устанавливаемости
// Chrome/Edge (без него браузер не покажет автоматическую иконку установки в адресной
// строке, см. developer.chrome.com/blog/update-install-criteria). Офлайн-режим GhostLine
// сознательно не поддерживает (см. /install) — поэтому здесь нет кеша, просто честный
// проброс каждого запроса в сеть, ничего не меняется в поведении сайта.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
