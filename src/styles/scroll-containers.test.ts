// Scroll-container integrity tests (Phase E): the agent output
// surfaces broke silently when stylesheet overrides removed their
// scrollers — these contracts pin the scrolling chain in place.
// Reads the real CSS sources from disk like theme-tokens.test.ts;
// no CSSOM needed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

function load(file: string): string {
  return readFileSync(join(HERE, file), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )
}

const app = load('app.css')
const meta = load('meta-ai.css')

// Returns the declaration block for an exact top-level selector, or
// null when the selector is absent.
function rule(css: string, selector: string): string | null {
  const match = css.match(
    new RegExp(
      `^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\}`,
      'm'
    )
  )

  return match ? match[1] : null
}

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>()

  for (const part of block.split(';')) {
    const index = part.indexOf(':')

    if (index === -1) {
      continue
    }

    out.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }

  return out
}

describe('scroll container contracts', () => {
  it('keeps the chat message list a constrained flex scroller', () => {
    const block = rule(app, '.ai-messages')

    expect(block).not.toBeNull()

    const props = declarations(block ?? '')

    expect(props.get('flex')).toBe('1')
    expect(props.get('min-height')).toBe('0')
    expect(props.get('overflow-y')).toBe('auto')
  })

  it('never overrides the agent message scroller layout', () => {
    // Phase E root cause: .meta-messages overrode flex, max-height,
    // and overflow, collapsing the list into the outer workspace
    // scroller and silently disabling stick-to-bottom follow.
    const block = rule(meta, '.meta-messages')

    expect(block).not.toBeNull()

    const props = declarations(block ?? '')

    expect(props.has('flex')).toBe(false)
    expect(props.has('max-height')).toBe(false)
    expect(props.has('overflow')).toBe(false)
    expect(props.has('overflow-y')).toBe(false)
  })

  it('scrolls the run console internally instead of clipping it', () => {
    // Phase E root cause: .agent-workspace had no overflow while its
    // parent .tab-body hides overflow — long output was unreachable.
    const block = rule(app, '.agent-workspace')

    expect(block).not.toBeNull()

    const props = declarations(block ?? '')

    expect(props.get('flex')).toBe('1')
    expect(props.get('min-height')).toBe('0')
    expect(props.get('overflow-y')).toBe('auto')
  })

  it('bounds the nested agent output wells', () => {
    for (const selector of [
      '.agent-run-timeline',
      '.agent-run-output',
      '.md-pre',
    ]) {
      const block = rule(app, selector)

      expect(block, selector).not.toBeNull()

      const props = declarations(block ?? '')

      expect(props.has('max-height'), selector).toBe(true)
      expect(
        props.get('overflow') ?? props.get('overflow-y'),
        selector
      ).toMatch(/auto|scroll/)
    }
  })
})
