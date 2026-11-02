// Monaco theme data tests: structural validity (no Monaco import
// needed), hex discipline, required color keys, and correspondence
// with the unified CSS tokens. Runs in plain vitest without jsdom.
import { describe, expect, it, vi } from 'vitest'
import {
  KRYOM_DARK,
  KRYOM_LIGHT,
  defineKryomThemes,
  type KryomThemeData,
} from './monaco-themes'

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const RULE_HEX = /^[0-9a-fA-F]{6}$/

const REQUIRED_COLORS = [
  'editor.background',
  'editor.foreground',
  'editorLineNumber.foreground',
  'editorLineNumber.activeForeground',
  'editorCursor.foreground',
  'editor.selectionBackground',
  'editor.lineHighlightBackground',
  'editorGutter.background',
  'editorWidget.background',
  'editorWidget.border',
  'editor.findMatchBackground',
  'editor.findMatchHighlightBackground',
  'diffEditor.insertedTextBackground',
  'diffEditor.removedTextBackground',
  'editorWhitespace.foreground',
  'editorIndentGuide.background1',
  'editorIndentGuide.activeBackground1',
]

const THEMES: Array<[string, KryomThemeData, 'vs' | 'vs-dark']> = [
  ['kryom-dark', KRYOM_DARK, 'vs-dark'],
  ['kryom-light', KRYOM_LIGHT, 'vs'],
]

describe.each(THEMES)('%s theme data', (_name, theme, base) => {
  it('inherits the correct stock base', () => {
    expect(theme.base).toBe(base)
    expect(theme.inherit).toBe(true)
  })

  it('uses valid hex for every color', () => {
    for (const [key, value] of Object.entries(theme.colors)) {
      expect(value, key).toMatch(HEX)
    }
  })

  it('covers every required editor color key', () => {
    for (const key of REQUIRED_COLORS) {
      expect(theme.colors[key], `missing ${key}`).toMatch(HEX)
    }
  })

  it('uses valid token rules', () => {
    expect(theme.rules.length).toBeGreaterThan(0)

    for (const rule of theme.rules) {
      expect(rule.token.length).toBeGreaterThan(0)
      expect(rule.foreground, rule.token).toMatch(RULE_HEX)
    }
  })
})

describe('token correspondence', () => {
  it('matches the unified CSS surface tokens', () => {
    // Keep in sync with --kc-editor (tokens.css dark) and the light
    // editor token (theme.css). Deliberate literals: the test must
    // fail if either side drifts.
    expect(KRYOM_DARK.colors['editor.background']).toBe('#101116')
    expect(KRYOM_DARK.colors['editorGutter.background']).toBe('#101116')
    expect(KRYOM_LIGHT.colors['editor.background']).toBe('#FFFFFF')
    expect(KRYOM_LIGHT.colors['editorGutter.background']).toBe('#FFFFFF')
  })

  it('keeps dark and light rule sets aligned', () => {
    expect(KRYOM_DARK.rules.map((rule) => rule.token)).toEqual(
      KRYOM_LIGHT.rules.map((rule) => rule.token)
    )
  })
})

describe('defineKryomThemes', () => {
  it('registers both themes on the host', () => {
    const defineTheme = vi.fn()
    defineKryomThemes({ editor: { defineTheme } })

    expect(defineTheme).toHaveBeenCalledTimes(2)
    expect(defineTheme).toHaveBeenNthCalledWith(1, 'kryom-dark', KRYOM_DARK)
    expect(defineTheme).toHaveBeenNthCalledWith(
      2,
      'kryom-light',
      KRYOM_LIGHT
    )
  })
})
