import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { glide } from '../glide'

describe('glide', () => {
  let now = 0
  let frames: FrameRequestCallback[] = []
  beforeEach(() => {
    now = 0
    frames = []
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => vi.unstubAllGlobals())
  const tick = (ms: number) => {
    now += ms
    const run = frames
    frames = []
    for (const frame of run) frame(now)
  }
  const box = (height = 500) => ({ scrollTop: 0, clientHeight: height }) as HTMLElement

  it('eases to the target within its time and lands on it exactly', async () => {
    const element = box()
    const done = glide(element, 300, 100)
    tick(50)
    expect(element.scrollTop).toBeGreaterThan(150)
    expect(element.scrollTop).toBeLessThan(300)
    tick(60)
    await done
    expect(element.scrollTop).toBe(300)
  })

  it('jumps a long way to one screen short, so the part the eye follows is never longer than a screen', () => {
    const element = box(500)
    void glide(element, 10_000, 100)
    expect(element.scrollTop).toBe(10_000 - 500)
  })

  it('starts gently enough to follow and takes a little longer for a longer way', async () => {
    const element = box(1000)
    const done = glide(element, 1000)
    tick(16)
    // A first frame that moves a third of the way reads as a jump, not a scroll.
    expect(element.scrollTop).toBeLessThan(150)
    tick(184)
    expect(element.scrollTop).toBeLessThan(1000)
    tick(100)
    await done
    expect(element.scrollTop).toBe(1000)

    const near = box(1000)
    const short = glide(near, 100)
    tick(180)
    await short
    expect(near.scrollTop).toBe(100)
  })

  it('a new glide takes over from where the last one is', () => {
    const element = box()
    void glide(element, 300, 100)
    tick(50)
    const mid = element.scrollTop
    void glide(element, 0, 100)
    tick(200)
    expect(mid).toBeGreaterThan(0)
    expect(element.scrollTop).toBe(0)
  })
})
