import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppProvider, useApp } from '../../app/AppProvider'
import { DEFAULT_SETTINGS, type Settings } from '../../state/settings'
import { fakeApi } from '../../test/fake-api'
import { SettingsPopover } from '../SettingsPopover'

let read: () => Settings = () => DEFAULT_SETTINGS

function Probe() {
  const { settings } = useApp()
  read = settings.get
  return null
}

function open() {
  localStorage.clear()
  render(
    <AppProvider api={fakeApi()}>
      <Probe />
      <SettingsPopover />
    </AppProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Diff settings' }))
}

describe('SettingsPopover', () => {
  it('switches layout and theme', () => {
    open()
    fireEvent.click(screen.getByText('Stacked'))
    expect(read().diffStyle).toBe('unified')
    fireEvent.click(screen.getByText('Light'))
    expect(read().themeType).toBe('light')
  })

  it('toggles the switches', () => {
    open()
    fireEvent.click(screen.getByLabelText('Wrap long lines'))
    fireEvent.click(screen.getByLabelText('Line numbers'))
    fireEvent.click(screen.getByLabelText('Line backgrounds'))
    fireEvent.click(screen.getByLabelText('Show unchanged lines'))
    expect(read()).toMatchObject({ overflow: 'wrap', lineNumbers: false, backgrounds: false, expandUnchanged: true })
  })

  it('steps font size and tab width within bounds, and resets', () => {
    open()
    fireEvent.click(screen.getByLabelText('Increase font size'))
    fireEvent.click(screen.getByLabelText('Decrease tab width'))
    expect(read()).toMatchObject({ fontSize: DEFAULT_SETTINGS.fontSize + 1, tabSize: DEFAULT_SETTINGS.tabSize - 1 })
    fireEvent.click(screen.getByText('Reset to defaults'))
    expect(read()).toEqual(DEFAULT_SETTINGS)
  })
})
