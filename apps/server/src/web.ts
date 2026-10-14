const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  woff: 'font/woff',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
}

function contentType(path: string): string {
  return TYPES[path.slice(path.lastIndexOf('.') + 1)] ?? 'application/octet-stream'
}

// `assets` maps URL paths to files embedded in the binary; Vite's hashed names make them safe to cache forever.
export function createWebHandler(assets: Record<string, string>) {
  return (pathname: string): Response => {
    const key = pathname === '/' ? '/index.html' : pathname
    const file = assets[key]
    if (file) {
      const immutable = key.startsWith('/assets/')
      return new Response(Bun.file(file), {
        headers: {
          'content-type': contentType(key),
          'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        },
      })
    }
    if (key.startsWith('/assets/')) return new Response('not found', { status: 404 })
    const index = assets['/index.html']
    if (!index) return new Response('not found', { status: 404 })
    return new Response(Bun.file(index), {
      headers: { 'content-type': TYPES.html as string, 'cache-control': 'no-cache' },
    })
  }
}
