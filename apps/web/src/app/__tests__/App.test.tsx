import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeApi } from '../../test/fake-api'
import { App } from '../App'

describe('App', () => {
  it('renders the shell regions', () => {
    render(<App api={fakeApi()} />)
    expect(screen.getByRole('banner')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Changed files' })).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('contentinfo')).toBeTruthy()
  })
})
