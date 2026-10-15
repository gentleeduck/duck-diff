import { afterEach, describe, expect, it } from 'vitest'
import { setQueryTopics, setTopicSender } from '../topics'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  setTopicSender(null)
  setQueryTopics([])
})

describe('topics', () => {
  it('tells the server once per batch and only when the set changes', async () => {
    const sent: string[] = []
    setTopicSender((data) => sent.push(data))
    await tick()
    sent.length = 0
    setQueryTopics(['item:3', 'runs'])
    setQueryTopics(['item:3', 'runs'])
    await tick()
    expect(sent.map((data) => JSON.parse(data).topics)).toEqual([['item:3', 'runs']])

    setQueryTopics(['item:3'])
    await tick()
    expect(JSON.parse(sent.at(-1) ?? '{}').topics).toEqual(['item:3'])
  })

  it('announces again after a reconnect', async () => {
    setQueryTopics(['notifications'])
    const sent: string[] = []
    setTopicSender((data) => sent.push(data))
    await tick()
    expect(JSON.parse(sent[0] ?? '{}').topics).toEqual(['notifications'])
  })
})
