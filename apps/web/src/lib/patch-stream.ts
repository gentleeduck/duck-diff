const BOUNDARY = '\ndiff --git '

// Holds back the current file until the next file header arrives, so every emitted text is complete.
export function createPatchSplitter(onFile: (text: string) => void) {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      let cut = buffer.indexOf(BOUNDARY, 1)
      while (cut !== -1) {
        onFile(buffer.slice(0, cut + 1))
        buffer = buffer.slice(cut + 1)
        cut = buffer.indexOf(BOUNDARY, 1)
      }
    },
    finish() {
      if (buffer.trim()) onFile(buffer)
      buffer = ''
    },
  }
}

// Parsing a large buffered diff in one go would block the first paint, so work is cut into slices with a
// yield to the browser in between.
const SLICE_MS = 8
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export async function readPatchStream(
  body: ReadableStream<Uint8Array>,
  onFile: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending: string[] = []
  const splitter = createPatchSplitter((text) => pending.push(text))
  let sliceStart = performance.now()
  const drain = async () => {
    const texts = pending
    pending = []
    for (const text of texts) {
      if (signal?.aborted) return
      onFile(text)
      if (performance.now() - sliceStart > SLICE_MS) {
        await yieldToBrowser()
        sliceStart = performance.now()
      }
    }
  }
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      splitter.push(decoder.decode(value, { stream: true }))
      await drain()
    }
    if (!signal?.aborted) {
      splitter.push(decoder.decode())
      splitter.finish()
      await drain()
    }
  } finally {
    reader.releaseLock()
  }
}
