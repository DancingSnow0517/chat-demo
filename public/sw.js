/**
 * 离线壳 Service Worker：
 * - 静态资源（同源 GET，非 /api）走 stale-while-revalidate，断网时可用缓存打开界面
 * - 页面导航 network-first，失败回退到缓存的 index.html
 * - /api 请求不缓存，始终走网络
 * 资源文件名带 contenthash，更新后旧缓存会随新版本激活被清理。
 */

const CACHE = 'chat-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add('./'))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) {
    return
  }

  // 页面导航：网络优先，离线时回退缓存的应用壳
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put('./', copy))
          }
          return response
        })
        .catch(() => caches.match('./').then((cached) => cached ?? Response.error()))
    )
    return
  }

  // 静态资源：缓存优先返回，同时后台请求更新缓存（stale-while-revalidate）
  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached ?? Response.error())
      return cached ?? update
    })
  )
})
