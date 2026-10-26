import { TooltipProvider } from '@duck-diff/ui'
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
      <TooltipProvider>
        <Probe />
        <SettingsPopover />
      </TooltipProvider>
    </AppProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Diff settings' }))
}

describe('SettingsPopover', () => {
  it('switches layout and theme, and the light button only talks', async () => {
    open()
    fireEvent.click(screen.getByText('Stacked'))
    expect(read().diffStyle).toBe('unified')
    fireEvent.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(read().theme).toBe('tokyo-night')
    fireEvent.click(screen.getByRole('combobox', { name: 'Theme' }))
    fireEvent.click(await screen.findByRole('option', { name: /Mallard/ }))
    expect(read().theme).toBe('mallard')
  })

  it('picks the editor files open in', async () => {
    open()
    expect(read().editor).toBe('auto')
    fireEvent.click(screen.getByRole('combobox', { name: 'Open files in' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Cursor' }))
    expect(read().editor).toBe('cursor')
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
    fireEvent.click(screen.getByLabelText('Increase code size'))
    fireEvent.click(screen.getByLabelText('Decrease tab width'))
    expect(read()).toMatchObject({ fontSize: DEFAULT_SETTINGS.fontSize + 1, tabSize: DEFAULT_SETTINGS.tabSize - 1 })
    fireEvent.click(screen.getByText('Reset to defaults'))
    expect(read()).toEqual(DEFAULT_SETTINGS)
  })
})
