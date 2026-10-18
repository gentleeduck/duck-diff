import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { keepStore, useKept } from '../kept'
import { createStore } from '../store'

describe('kept page state', () => {
  it('puts back the part of a store a reload keeps, and nothing else', () => {
    const keep = (store: ReturnType<typeof createStore<{ open: boolean; height: number }>>) =>
      keepStore(
        store,
        'panel',
        ({ open }) => ({ open }),
        (kept, state) => ({ ...state, ...kept }),
      )
    const before = createStore({ open: false, height: 3 })
    keep(before)
    before.set((state) => ({ ...state, open: true, height: 4 }))
    const after = createStore({ open: false, height: 9 })
    keep(after)
    expect(after.get()).toEqual({ open: true, height: 9 })
  })

  it('keeps a value per name, and a new name starts from its own', () => {
    const { result, rerender, unmount } = renderHook(({ name }) => useKept(name, ''), {
      initialProps: { name: 'draft:1' },
    })
    act(() => result.current[1]('one'))
    rerender({ name: 'draft:2' })
    expect(result.current[0]).toBe('')
    act(() => result.current[1]((prev) => `${prev}two`))
    unmount()

    const again = renderHook(() => useKept('draft:1', ''))
    expect(again.result.current[0]).toBe('one')
    expect(renderHook(() => useKept('draft:2', '')).result.current[0]).toBe('two')
  })
})
