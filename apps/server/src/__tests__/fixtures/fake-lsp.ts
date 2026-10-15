// A tiny language server for tests: answers from the text it was sent, so tests can check syncing.
const docs = new Map<string, { version: number; text: string }>()
let configuration: unknown = 'none'
// Hovers wait for the answer to our configuration request, which can arrive after the hover itself.
let configured: () => void = () => {}
const hasConfiguration = new Promise<void>((resolve) => {
  configured = resolve
})
let buffer = Buffer.alloc(0)

function send(message: object) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }))
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}

type Params = {
  textDocument: { uri: string; version: number; text: string }
  position: { line: number }
  contentChanges: { text: string }[]
}

function handle(message: { id?: number; method?: string; params?: Params; result?: unknown }) {
  const { id, method } = message
  const params = message.params as Params
  if (method === undefined) {
    if (id === 900) {
      configuration = message.result
      configured()
    }
    return
  }
  switch (method) {
    case 'initialize':
      send({
        id,
        result: { capabilities: { definitionProvider: true, referencesProvider: true, hoverProvider: true } },
      })
      send({ id: 900, method: 'workspace/configuration', params: { items: [{ section: 'a' }, { section: 'b' }] } })
      return
    case 'textDocument/didOpen':
      docs.set(params.textDocument.uri, { version: params.textDocument.version, text: params.textDocument.text })
      return
    case 'textDocument/didChange':
      docs.set(params.textDocument.uri, {
        version: params.textDocument.version,
        text: params.contentChanges[0]?.text ?? '',
      })
      return
    case 'textDocument/definition': {
      const uri = params.textDocument.uri
      const other = uri.replace(/[^/]+$/, 'other.ts')
      // A link on line 2 to tell both shapes apart.
      if (params.position.line === 1)
        return send({
          id,
          result: [
            {
              targetUri: other,
              targetRange: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
              targetSelectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 20 } },
            },
          ],
        })
      return send({ id, result: { uri, range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } } } })
    }
    case 'textDocument/references':
      return send({
        id,
        result: [
          { uri: params.textDocument.uri, range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } } },
          {
            uri: 'file:///elsewhere/lib.d.ts',
            range: { start: { line: 3, character: 0 }, end: { line: 3, character: 3 } },
          },
        ],
      })
    case 'textDocument/hover': {
      const doc = docs.get(params.textDocument.uri)
      const first = doc?.text.split('\n')[0] ?? ''
      const value = `v${doc?.version} ${first}`
      void hasConfiguration.then(() =>
        send({ id, result: { contents: { kind: 'markdown', value: `${value} ${JSON.stringify(configuration)}` } } }),
      )
      return
    }
    case 'shutdown':
      return send({ id, result: null })
    case 'exit':
      process.exit(0)
  }
  if (id !== undefined) send({ id, error: { code: -32601, message: `no ${method}` } })
}

process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const end = buffer.indexOf('\r\n\r\n')
    if (end === -1) return
    const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, end).toString())?.[1])
    if (buffer.length < end + 4 + length) return
    handle(JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString()))
    buffer = buffer.subarray(end + 4 + length)
  }
})
