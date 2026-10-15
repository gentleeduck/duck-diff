import { afterEach, describe, expect, it } from 'vitest'
import { deepActive, listOf, move } from '../motions'

afterEach(() => {
  document.body.innerHTML = ''
})

function list(handlesArrows = false) {
  document.body.innerHTML = `
    <ul aria-label="Things">
      <li><button type="button">one</button></li>
      <li><button type="button">two</button></li>
      <li><button type="button" disabled>off</button></li>
      <li><button type="button">three</button></li>
    </ul>`
  const ul = document.querySelector('ul') as HTMLElement
  if (handlesArrows) {
    ul.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return
      event.preventDefault()
      ul.dataset.arrowed = 'yes'
    })
  }
  const buttons = [...document.querySelectorAll('button')]
  return { ul, buttons }
}

describe('motions', () => {
  it('moves focus item by item, skipping disabled ones, and to either end', () => {
    const { buttons } = list()
    buttons[0]?.focus()
    expect(listOf(deepActive())).not.toBeNull()
    move('down')
    expect(document.activeElement?.textContent).toBe('two')
    move('down')
    expect(document.activeElement?.textContent).toBe('three')
    move('down')
    expect(document.activeElement?.textContent).toBe('three')
    move('first')
    expect(document.activeElement?.textContent).toBe('one')
    move('last')
    expect(document.activeElement?.textContent).toBe('three')
    move('up')
    expect(document.activeElement?.textContent).toBe('two')
  })

  it('lets a widget that knows its arrow keys move itself', () => {
    const { ul, buttons } = list(true)
    buttons[0]?.focus()
    move('down')
    expect(ul.dataset.arrowed).toBe('yes')
    expect(document.activeElement?.textContent).toBe('one')
  })

  it('finds focus inside a shadow root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<div role="tree"><div role="treeitem" tabindex="0">a</div></div>'
    const item = root.querySelector('[role="treeitem"]') as HTMLElement
    item.focus()
    expect(deepActive()).toBe(item)
    expect(listOf(item)?.getAttribute('role')).toBe('tree')
  })
})
