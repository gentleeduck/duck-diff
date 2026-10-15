import type { ChangedFile } from '@duck-diff/protocol'
import { describe, expect, it } from 'vitest'
import { fileNote, formatBytes, isImage } from '../file-info'

const file = (over: Partial<ChangedFile>): ChangedFile => ({
  path: 'a.bin',
  oldPath: null,
  status: 'modified',
  additions: null,
  deletions: null,
  binary: true,
  oldSha: 'o',
  newSha: 'n',
  ...over,
})

describe('file info', () => {
  it('formats sizes the way people read them', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(12_700)).toBe('12.4 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('describes conflicts, generated files and binary size changes', () => {
    expect(fileNote(file({ status: 'conflicted', binary: false }))).toBe('Merge conflict')
    expect(fileNote(file({ binary: false, generated: true }))).toBe('Generated')
    expect(fileNote(file({ status: 'untracked', binary: false, additions: 0, deletions: 0 }))).toBe('Empty file')
    expect(fileNote(file({ status: 'renamed', binary: false, additions: 0, deletions: 0 }))).toBe(
      'Renamed without changes',
    )
    expect(fileNote(file({ status: 'modified', binary: false, additions: 0, deletions: 0 }))).toBeNull()
    expect(fileNote(file({ oldSize: 7, newSize: 10 }))).toBe('Binary, 7 B to 10 B')
    expect(fileNote(file({ status: 'added', oldSize: null, newSize: 2048 }))).toBe('Binary, 2.0 KB')
    expect(fileNote(file({ binary: false }))).toBeNull()
  })

  it('knows which files the page can show as images', () => {
    expect(isImage('assets/logo.PNG')).toBe(true)
    expect(isImage('icon.svg')).toBe(true)
    expect(isImage('notes.txt')).toBe(false)
  })
})
