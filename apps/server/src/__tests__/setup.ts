// Test servers come and go on ephemeral ports, and macOS hands a freed port straight to the next server. A pooled
// keep-alive socket to the old one would then be reused and fail, so tests never pool connections.
const pooled = globalThis.fetch
globalThis.fetch = Object.assign(
  (input: string | URL | Request, init?: RequestInit) => pooled(input, { ...init, keepalive: false }),
  pooled,
)
