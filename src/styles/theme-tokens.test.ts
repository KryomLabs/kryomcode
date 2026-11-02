// Stylesheet integrity tests (Phase 0+1 harness): every custom
// property the app stylesheets consume must be defined, in both
// themes; files stay brace-balanced; the unified token graph in
// tokens.css covers the legacy namespaces; declared text pairs meet
// contrast floors; and legacy --kryom-* consumption is quarantined
// to meta-ai.css (no new var(--kryom-*) may appear elsewhere).
// Reads the real CSS sources from disk (the harness resolves `?raw`
// CSS imports to empty strings, so bundler imports cannot be trusted
// here); no CSSOM needed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

function load(name: 'app' | 'hero' | 'meta' | 'theme' | 'tokens'): string {
  const file =
    name === 'app'
      ? 'app.css'
      : name === 'hero'
        ? 'hero.css'
        : name === 'meta'
          ? 'meta-ai.css'
          : name === 'tokens'
            ? 'tokens.css'
            : 'theme.css'

  return readFileSync(join(HERE, file), 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function usedTokens(css: string, prefix: 'kc' | 'kryom'): Set<string> {
  const found = new Set<string>()
  const re =
    prefix === 'kc'
      ? /var\(--kc-([a-z0-9-]+)\)?/g
      : /var\(--kryom-([a-z-]+)\)?/g
  for (const match of css.matchAll(re)) {
    found.add(match[1])
  }
  return found
}

function definedTokens(css: string, prefix: 'kc' | 'kryom'): Set<string> {
  const found = new Set<string>()
  const re =
    prefix === 'kc'
      ? /--kc-([a-z0-9-]+)\s*:/g
      : /--kryom-([a-z-]+)\s*:/g
  for (const match of css.matchAll(re)) {
    found.add(match[1])
  }
  return found
}

// Parses `--name: value;` pairs out of one flat rule block.
function blockValues(block: string): Map<string, string> {
  const values = new Map<string, string>()

  for (const match of block.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/g)) {
    values.set(match[1].replace(/^kc-/, ''), match[2].trim())
  }

  return values
}

function luminance(hex: string): number {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(
    (part) => {
      const channel = parseInt(part, 16) / 255

      return channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4)
    }
  )

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))

  return (lighter + 0.05) / (darker + 0.05)
}

// Tokens that are intentionally theme-independent and therefore need
// no light override: layout constants plus the global font, radius,
// spacing, shadow, layer, motion, tracking, and type/mono scales.
function isThemeIndependent(token: string): boolean {
  if (
    token === 'activity-width' ||
    token === 'titlebar-height' ||
    token === 'statusbar-height'
  ) {
    return true
  }

  if (/^(text|mono)-\d+$/.test(token)) {
    return true
  }

  return /^(font|radius|space|shadow|z|motion|tracking)-/.test(token)
}

const app = stripComments(load('app'))
const hero = stripComments(load('hero'))
const theme = stripComments(load('theme'))
const meta = stripComments(load('meta'))
const tokens = stripComments(load('tokens'))

describe('theme token integrity', () => {
  it('keeps every stylesheet brace-balanced', () => {
    for (const [name, css] of [
      ['tokens.css', tokens],
      ['app.css', app],
      ['hero.css', hero],
      ['theme.css', theme],
      ['meta-ai.css', meta],
    ] as const) {
      const open = (css.match(/\{/g) ?? []).length
      const close = (css.match(/\}/g) ?? []).length
      expect(`${name}: ${open} open vs ${close} close`).toBe(
        `${name}: ${open} open vs ${open} close`
      )
      expect(open).toBeGreaterThan(0)
    }
  })

  it('defines every --kc-* token the stylesheets use', () => {
    const used = new Set([
      ...usedTokens(app, 'kc'),
      ...usedTokens(hero, 'kc'),
      ...usedTokens(theme, 'kc'),
      ...usedTokens(tokens, 'kc'),
    ])
    const defined = new Set([
      ...definedTokens(app, 'kc'),
      ...definedTokens(theme, 'kc'),
      ...definedTokens(tokens, 'kc'),
    ])
    const missing = [...used].filter((token) => !defined.has(token))
    expect(missing).toEqual([])
    expect(used.size).toBeGreaterThan(20)
  })

  it('defines every --kryom-* token the stylesheets use', () => {
    const used = new Set([
      ...usedTokens(meta, 'kryom'),
      ...usedTokens(app, 'kryom'),
      ...usedTokens(theme, 'kryom'),
    ])
    const defined = new Set([
      ...definedTokens(meta, 'kryom'),
      ...definedTokens(theme, 'kryom'),
      ...definedTokens(tokens, 'kryom'),
    ])
    const missing = [...used].filter((token) => !defined.has(token))
    expect(missing).toEqual([])
    expect(used.size).toBeGreaterThan(5)
  })

  it('overrides the full token set for the light theme', () => {
    const lightIde = theme.match(
      /html\[data-theme='light'\]\s*\.ide\s*\{([\s\S]*?)\}/
    )
    expect(lightIde).not.toBeNull()
    const lightKc = definedTokens(lightIde?.[1] ?? '', 'kc')
    const consumed = new Set([
      ...usedTokens(app, 'kc'),
      ...usedTokens(hero, 'kc'),
      ...usedTokens(theme, 'kc'),
      ...usedTokens(tokens, 'kc'),
    ])
    const missing = [...consumed].filter(
      (token) => !isThemeIndependent(token) && !lightKc.has(token)
    )
    expect(missing).toEqual([])
  })

  it('covers the Meta layer tokens through theme-aware aliases', () => {
    // The legacy per-theme --kryom-* block is gone: tokens.css aliases
    // resolve through the active --kc-* values instead. Union every
    // html-level light rule (forgiving of future additions) with the
    // alias block before checking coverage.
    const lightRoots = [
      ...theme.matchAll(/html\[data-theme='light'\]\s*\{([\s\S]*?)\}/g),
    ]
    expect(lightRoots.length).toBeGreaterThan(0)
    const lightKryom = new Set([
      ...lightRoots.flatMap((block) => [...definedTokens(block[1], 'kryom')]),
      ...definedTokens(tokens, 'kryom'),
    ])
    const consumed = usedTokens(meta, 'kryom')
    // Radius/gap/font/mono are theme-independent by design.
    const themed = [...consumed].filter(
      (token) => !['radius', 'gap', 'font', 'mono'].includes(token)
    )
    expect(themed.every((token) => lightKryom.has(token))).toBe(true)
  })

  it('quarantines legacy --kryom-* consumption to meta-ai.css', () => {
    // The alias shim keeps old rules working, but no new
    // var(--kryom-*) may appear outside the one legacy stylesheet.
    expect([...usedTokens(app, 'kryom')]).toEqual([])
    expect([...usedTokens(hero, 'kryom')]).toEqual([])
    expect([...usedTokens(theme, 'kryom')]).toEqual([])
    expect([...usedTokens(tokens, 'kryom')]).toEqual([])
  })

  it('leads --kc-font-mono with the registered Fontsource family (F1)', () => {
    // @fontsource-variable/jetbrains-mono registers exactly
    // 'JetBrains Mono Variable'; the plain 'JetBrains Mono' name has
    // no @font-face and silently falls back to Cascadia/Consolas.
    const token = tokens.match(/--kc-font-mono\s*:\s*([^;]+);/)

    expect(token).not.toBeNull()

    const [first, ...rest] = (token?.[1] ?? '').split(',')

    expect(first.trim()).toBe("'JetBrains Mono Variable'")
    expect(rest.join(',')).toContain('Cascadia Code')
    expect(rest.join(',')).toContain('Consolas')
    expect(rest.join(',')).toContain('monospace')
  })

  it('defines the Phase 1 semantic tokens in both themes', () => {
    const darkBlock = tokens.match(/html\s*\.ide\s*\{([\s\S]*?)\}/)
    expect(darkBlock).not.toBeNull()
    const dark = definedTokens(darkBlock?.[1] ?? '', 'kc')
    const lightIde = theme.match(
      /html\[data-theme='light'\]\s*\.ide\s*\{([\s\S]*?)\}/
    )
    const light = definedTokens(lightIde?.[1] ?? '', 'kc')

    for (const token of [
      'sidebar',
      'editor',
      'raised',
      'text-ghost',
      'border-strong',
      'ai',
      'ai-deep',
      'info',
      'info-bg',
      'info-border',
      'selection',
      'hover',
      'disabled-fg',
      'disabled-bg',
      'disabled-border',
    ]) {
      expect(dark.has(token), `dark --kc-${token}`).toBe(true)
      expect(light.has(token), `light --kc-${token}`).toBe(true)
    }

    for (const token of [
      'font-ui',
      'font-mono',
      'radius-s',
      'radius-m',
      'radius-l',
      'radius-xl',
      'radius-pill',
      'text-14',
      'mono-12',
    ]) {
      expect(definedTokens(tokens, 'kc').has(token), `--kc-${token}`).toBe(
        true
      )
    }
  })

  it('meets contrast floors for the dark text pairs', () => {
    const darkBlock = tokens.match(/html\s*\.ide\s*\{([\s\S]*?)\}/)
    const values = blockValues(darkBlock?.[1] ?? '')
    const ratio = (fg: string, bg: string) =>
      contrastRatio(values.get(fg) ?? '#000000', values.get(bg) ?? '#ffffff')

    // Floors sit below the design targets (12/7/4.5) with margin for
    // rounding; if a pair fails, adjust the token values, never the
    // floors — the floors encode the accessibility contract.
    expect(ratio('text', 'bg')).toBeGreaterThanOrEqual(10)
    expect(ratio('text-dim', 'bg')).toBeGreaterThanOrEqual(7)
    expect(ratio('text-faint', 'panel')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('on-accent', 'accent-btn')).toBeGreaterThanOrEqual(4)
    expect(ratio('text', 'editor')).toBeGreaterThanOrEqual(10)
    expect(ratio('text-dim', 'sidebar')).toBeGreaterThanOrEqual(7)
  })

  it('meets contrast floors for the light text pairs', () => {
    const lightIde = theme.match(
      /html\[data-theme='light'\]\s*\.ide\s*\{([\s\S]*?)\}/
    )
    const values = blockValues(lightIde?.[1] ?? '')
    const ratio = (fg: string, bg: string) =>
      contrastRatio(values.get(fg) ?? '#000000', values.get(bg) ?? '#ffffff')

    expect(ratio('text', 'editor')).toBeGreaterThanOrEqual(12)
    expect(ratio('text-dim', 'bg')).toBeGreaterThanOrEqual(6.5)
    expect(ratio('text-faint', 'panel')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('accent', 'panel')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('on-accent', 'accent-btn')).toBeGreaterThanOrEqual(4.5)
  })
})
