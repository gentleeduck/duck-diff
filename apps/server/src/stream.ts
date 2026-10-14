export function iterableToStream(source: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const iterator = source[Symbol.asyncIterator]()
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) controller.close()
      else controller.enqueue(encoder.encode(value))
    },
    async cancel() {
      await iterator.return?.()
    },
  })
}
