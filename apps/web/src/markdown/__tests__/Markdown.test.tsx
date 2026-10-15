import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../Markdown'

const README = [
  '<p align="center">',
  '  <img src="./public/logo.png" alt="Logo" width="180" onerror="alert(1)">',
  '</p>',
  '',
  '<h1 align="center">Project</h1>',
  '<script>alert(2)</script>',
  '',
  '![shot](docs/shot.png) ![remote](https://example.com/a.png)',
  '',
  '> [!TIP]',
  '> Read this.',
].join('\n')

describe('Markdown', () => {
  it("renders a README's HTML the way GitHub does, without anything that runs", () => {
    const { container } = render(<Markdown text={README} imageUrl={(src) => `/api/raw?path=${src}`} />)
    const [logo, shot, remote] = [...container.querySelectorAll('img')]
    expect(logo?.getAttribute('src')).toBe('/api/raw?path=./public/logo.png')
    expect(logo?.getAttribute('width')).toBe('180')
    expect(logo?.getAttribute('onerror')).toBeNull()
    expect(logo?.closest('p')?.getAttribute('align')).toBe('center')
    expect(container.querySelector('h1')?.textContent).toBe('Project')
    expect(container.querySelector('script')).toBeNull()
    expect(shot?.getAttribute('src')).toBe('/api/raw?path=docs/shot.png')
    expect(remote?.getAttribute('src')).toBe('https://example.com/a.png')
    expect(container.querySelector('.markdown-alert-tip')?.textContent).toContain('Read this.')
  })
})
