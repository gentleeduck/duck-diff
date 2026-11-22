const BOUNDARY = '\ndiff --git '

// Holds back the current file until the next file header arrives, so every emitted text is complete.
// The held text stays in the pieces it came in and only each new chunk is searched, so a file of tens of
// megabytes costs one pass rather than one per chunk.
export function createPatchSplitter(onFile: (text: string) => void) {
  let pieces: string[] = []
  let size = 0
  // The held text's last characters, for a header that starts in one chunk and ends in the next.
  let tail = ''
  const hold = (text: string) => {
    pieces = text ? [text] : []
    size = text.length
    tail = text.slice(1 - BOUNDARY.length)
  }
  return {
    push(chunk: string) {
      const text = tail + chunk
      // A header at the very start of the held file is its own, not the next one's.
      const found = text.indexOf(BOUNDARY, Math.max(0, 1 - size + tail.length))
      if (found === -1) {
        pieces.push(chunk)
        size += chunk.length
        tail = text.slice(1 - BOUNDARY.length)
        return
      }
      const buffer = pieces.join('') + chunk
      let start = 0
      let cut = size - tail.length + found
      while (cut !== -1) {
        onFile(buffer.slice(start, cut + 1))
        start = cut + 1
        cut = buffer.indexOf(BOUNDARY, start + 1)
      }
      hold(buffer.slice(start))
    },
    finish() {
      const buffer = pieces.join('')
      if (buffer.trim()) onFile(buffer)
      hold('')
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
