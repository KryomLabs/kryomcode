// Theme preference tests: persistence, document application, OS
// fallback, and the Monaco theme mapping. Runs in jsdom through
// `npm run test:renderer`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MONACO_FONT_FAMILY,
  applyTheme,
  getStoredTheme,
  initialTheme,
  monacoTheme,
  systemPrefersLight,
} from './theme'

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles')

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: light)' ? matches : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  })
}

afterEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  document.querySelector('meta[name="theme-color"]')?.remove()
  vi.restoreAllMocks()
})

describe('getStoredTheme', () => {
  it('returns the stored theme when valid', () => {
    window.localStorage.setItem('kryom.theme', 'light')
    expect(getStoredTheme()).toBe('light')
    window.localStorage.setItem('kryom.theme', 'dark')
    expect(getStoredTheme()).toBe('dark')
  })

  it('falls back to dark for missing or corrupt values', () => {
    expect(getStoredTheme()).toBe('dark')
    window.localStorage.setItem('kryom.theme', 'sepia')
    expect(getStoredTheme()).toBe('dark')
  })
})

describe('systemPrefersLight', () => {
  it('is false when matchMedia is unavailable', () => {
    // jsdom ships without matchMedia; the helper must not throw.
    expect(systemPrefersLight()).toBe(false)
  })

  it('is true only for a first run on a light OS theme', () => {
    mockMatchMedia(true)
    expect(systemPrefersLight()).toBe(true)
    window.localStorage.setItem('kryom.theme', 'dark')
    expect(systemPrefersLight()).toBe(false)
  })

  it('is false on a dark OS theme', () => {
    mockMatchMedia(false)
    expect(systemPrefersLight()).toBe(false)
  })
})

describe('initialTheme', () => {
  it('honours the OS light preference on first run', () => {
    mockMatchMedia(true)
    expect(initialTheme()).toBe('light')
  })

  it('prefers the stored theme over the OS preference', () => {
    mockMatchMedia(true)
    window.localStorage.setItem('kryom.theme', 'dark')
    expect(initialTheme()).toBe('dark')
  })

  it('defaults to dark otherwise', () => {
    mockMatchMedia(false)
    expect(initialTheme()).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('sets data-theme and persists the choice', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('kryom.theme')).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('kryom.theme')).toBe('dark')
  })

  it('updates the theme-color meta tag when present', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
    applyTheme('light')
    expect(meta.getAttribute('content')).toBe('#f2f2f5')
    applyTheme('dark')
    expect(meta.getAttribute('content')).toBe('#0e0f13')
  })

  it('applies cleanly without a theme-color meta tag', () => {
    expect(() => applyTheme('light')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('monacoTheme', () => {
  it('maps light to kryom-light and dark to kryom-dark', () => {
    expect(monacoTheme('light')).toBe('kryom-light')
    expect(monacoTheme('dark')).toBe('kryom-dark')
  })
})

describe('MONACO_FONT_FAMILY', () => {
  it('prefers the registered JetBrains Mono Variable family with offline system fallbacks', () => {
    const [first, ...rest] = MONACO_FONT_FAMILY.split(',')

    // Must match the exact family registered by
    // @fontsource-variable/jetbrains-mono (F1 regression: the plain
    // 'JetBrains Mono' name has no @font-face and never loads).
    expect(first.trim()).toBe("'JetBrains Mono Variable'")
    expect(rest.join(',')).toContain('Cascadia Code')
    expect(rest.join(',')).toContain('Consolas')
    expect(rest.join(',')).toContain('monospace')
  })

  it('matches the --kc-font-mono token first family and fallbacks', () => {
    const css = readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8')
    const token = css.match(/--kc-font-mono\s*:\s*([^;]+);/)

    expect(token).not.toBeNull()

    const [tokenFirst, ...tokenRest] = (token?.[1] ?? '').split(',')
    const [stackFirst, ...stackRest] = MONACO_FONT_FAMILY.split(',')

    expect(stackFirst.trim()).toBe(tokenFirst.trim())
    expect(stackRest.join(',')).toBe(tokenRest.join(','))
  })
})
