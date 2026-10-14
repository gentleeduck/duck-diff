import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../App'

describe('App', () => {
  it('renders', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'duck-diff' })).toBeTruthy()
  })
  it('renders a duck-ui button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'ready' })).toBeTruthy()
  })
})
