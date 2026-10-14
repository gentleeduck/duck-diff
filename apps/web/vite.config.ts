import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, DUCK_DIFF_URL is a running server's handshake url; /api is proxied to it with its token.
function apiProxy() {
  const raw = process.env.DUCK_DIFF_URL
  if (!raw) return undefined
  const url = new URL(raw)
  const token = url.searchParams.get('token') ?? ''
  return { '/api': { target: url.origin, ws: true, headers: { 'x-duck-diff-token': token } } }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: apiProxy() },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
})
