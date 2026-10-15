import { afterEach, describe, expect, it, vi } from 'vitest'
import { setTopicSender, topicChanged, watchTopic } from '../topics'

afterEach(() => setTopicSender(null))

describe('topics', () => {
  it('tells the server the union once per batch and calls listeners on a push', async () => {
    const sent: string[] = []
    setTopicSender((data) => sent.push(data))
    const first = vi.fn()
    const stopA = watchTopic('runs', first)
    const stopB = watchTopic('item:3', () => {})
    const stopC = watchTopic('runs', () => {})
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent.map((data) => JSON.parse(data).topics)).toEqual([['runs', 'item:3']])

    topicChanged('runs')
    topicChanged('pulls')
    expect(first).toHaveBeenCalledTimes(1)

    stopA()
    stopC()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(JSON.parse(sent.at(-1) ?? '{}').topics).toEqual(['item:3'])
    stopB()
  })

  it('announces again after a reconnect', async () => {
    const stop = watchTopic('notifications', () => {})
    const sent: string[] = []
    setTopicSender((data) => sent.push(data))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(JSON.parse(sent[0] ?? '{}').topics).toEqual(['notifications'])
    stop()
  })
})
