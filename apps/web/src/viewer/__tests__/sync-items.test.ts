import { describe, expect, it } from 'vitest'
import { type ItemSink, syncItems } from '../sync-items'

interface Item {
  id: string
  version?: number
}

function sink() {
  const calls: string[] = []
  const target: ItemSink<Item> = {
    addItems: (items) => {
      calls.push(`add ${items.map((i) => i.id).join(',')}`)
    },
    updateItem: (item) => {
      calls.push(`update ${item.id}`)
      return true
    },
    removeItem: (id) => {
      calls.push(`remove ${id}`)
      return true
    },
  }
  return { target, calls }
}

const a = { id: 'a', version: 0 }
const b = { id: 'b', version: 0 }
const c = { id: 'c', version: 0 }

describe('syncItems', () => {
  it('appends new items in one call', () => {
    const { target, calls } = sink()
    syncItems(target, [a], [a, b, c])
    expect(calls).toEqual(['add b,c'])
  })

  it('does nothing for an identical list', () => {
    const { target, calls } = sink()
    syncItems(target, [a, b], [a, b])
    expect(calls).toEqual([])
  })

  it('updates items whose version or object changed', () => {
    const { target, calls } = sink()
    syncItems(target, [a, b, c], [a, { id: 'b', version: 1 }, { ...c }])
    expect(calls).toEqual(['update b', 'update c'])
  })

  it('removes items that left', () => {
    const { target, calls } = sink()
    syncItems(target, [a, b, c], [a, c])
    expect(calls).toEqual(['remove b'])
  })

  it('rebuilds after an insertion in the middle so order holds', () => {
    const { target, calls } = sink()
    syncItems(target, [a, c], [a, b, c])
    expect(calls).toEqual(['remove c', 'add b,c'])
  })
})
