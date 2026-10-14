import { describe, expect, it } from 'vitest'
import { createPatchSplitter, readPatchStream } from '../patch-stream'

const A = 'diff --git a/a.ts b/a.ts\nindex 1..2 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n'
const B = 'diff --git a/b.ts b/b.ts\nindex 3..4 100644\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-c\n+d\n'

describe('createPatchSplitter', () => {
  it('emits each file once its successor starts, and the last on finish', () => {
    const files: string[] = []
    const splitter = createPatchSplitter((text) => files.push(text))
    splitter.push(A.slice(0, 20))
    splitter.push(A.slice(20) + B.slice(0, 5))
    expect(files).toEqual([])
    splitter.push(B.slice(5))
    expect(files).toEqual([A])
    splitter.finish()
    expect(files).toEqual([A, B])
  })

  it('does not split on "diff --git" inside a line', () => {
    const tricky = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-say diff --git a/y b/y\n+ok\n'
    const files: string[] = []
    const splitter = createPatchSplitter((text) => files.push(text))
    splitter.push(tricky)
    splitter.finish()
    expect(files).toEqual([tricky])
  })

  it('emits nothing for an empty patch', () => {
    const files: string[] = []
    const splitter = createPatchSplitter((text) => files.push(text))
    splitter.finish()
    expect(files).toEqual([])
  })
})

describe('readPatchStream', () => {
  it('splits a byte stream across arbitrary chunk boundaries', async () => {
    const bytes = new TextEncoder().encode(A + B)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
        controller.close()
      },
    })
    const files: string[] = []
    await readPatchStream(body, (text) => files.push(text))
    expect(files).toEqual([A, B])
  })
})
