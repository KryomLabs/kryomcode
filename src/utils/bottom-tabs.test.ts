// Bottom-tab restore contract (Phase D1): the persisted active
// panel restores validated, with retired/unknown values falling
// back to the terminal.
import { describe, expect, it } from 'vitest'
import { BOTTOM_TAB_IDS, parseBottomTab } from './bottom-tabs'

describe('parseBottomTab', () => {
  it('restores every known destination id', () => {
    for (const id of BOTTOM_TAB_IDS) {
      expect(parseBottomTab(id)).toBe(id)
    }

    expect(BOTTOM_TAB_IDS).toEqual([
      'terminal',
      'problems',
      'output',
      'debug',
      'tasks',
    ])
  })

  it('falls back to the terminal for missing values', () => {
    expect(parseBottomTab(null)).toBe('terminal')
    expect(parseBottomTab('')).toBe('terminal')
  })

  it('falls back to the terminal for retired or corrupt ids', () => {
    expect(parseBottomTab('git')).toBe('terminal')
    expect(parseBottomTab('TERMINAL')).toBe('terminal')
    expect(parseBottomTab('not-a-panel')).toBe('terminal')
  })
})
