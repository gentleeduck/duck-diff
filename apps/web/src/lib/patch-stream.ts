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

export async function readPatchStream(
  body: ReadableStream<Uint8Array>,
  onFile: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const splitter = createPatchSplitter(onFile)
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      splitter.push(decoder.decode(value, { stream: true }))
    }
    if (!signal?.aborted) {
      splitter.push(decoder.decode())
      splitter.finish()
    }
  } finally {
    reader.releaseLock()
  }
}
