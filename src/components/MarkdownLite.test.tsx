// MarkdownLite tests: lightweight highlighting, code copy, long-block
// collapsing, the opt-in Send to Agent action, and untrusted-text
// safety (no HTML is ever parsed or executed).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MarkdownLite } from './MarkdownLite'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MarkdownLite', () => {
  it('highlights keywords, strings, and comments', () => {
    const { container } = render(
      <MarkdownLite text={'```js\nconst greeting = "hi" // say hi\n```'} />
    )

    expect(container.querySelector('.tok-kw')?.textContent).toBe('const')
    expect(container.querySelector('.tok-str')?.textContent).toBe('"hi"')
    expect(container.querySelector('.tok-com')?.textContent).toBe('// say hi')
  })

  it('highlights python keywords and calls', () => {
    const { container } = render(
      <MarkdownLite text={'```python\ndef greet():\n    print("hi")\n```'} />
    )
    const keywords = [...container.querySelectorAll('.tok-kw')].map(
      (element) => element.textContent
    )

    expect(keywords).toContain('def')
    const calls = [...container.querySelectorAll('.tok-fn')].map(
      (element) => element.textContent
    )

    expect(calls).toContain('greet')
    expect(calls).toContain('print')
  })

  it('reports copy denial instead of failing silently', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError')
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<MarkdownLite text={'```js\nconst x = 1\n```'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText('Copy unavailable')).not.toBeNull()
  })

  it('copies code to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<MarkdownLite text={'```js\nconst x = 1\n```'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByText('Copied')).not.toBeNull()
    expect(writeText).toHaveBeenCalledWith('const x = 1')
  })

  it('collapses long blocks and expands on request', () => {
    const long = Array.from(
      { length: 45 },
      (_, index) => `line${index} = ${index}`
    ).join('\n')
    const { container } = render(
      <MarkdownLite text={`\`\`\`js\n${long}\n\`\`\``} />
    )

    expect(container.textContent).not.toContain('line44')
    fireEvent.click(
      screen.getByRole('button', { name: 'Show all 45 lines' })
    )
    expect(container.textContent).toContain('line44')
  })

  it('offers Send to Agent only when wired', () => {
    const onSendToAgent = vi.fn()
    const { rerender } = render(
      <MarkdownLite
        text={'```ts\nconst x = 1\n```'}
        onSendToAgent={onSendToAgent}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to Agent' }))
    expect(onSendToAgent).toHaveBeenCalledWith('const x = 1', 'ts')

    rerender(<MarkdownLite text={'```ts\nconst x = 1\n```'} />)
    expect(
      screen.queryByRole('button', { name: 'Send to Agent' })
    ).toBeNull()
  })

  it('renders nothing unsafe from untrusted text', () => {
    const { container } = render(
      <MarkdownLite
        text={'<img src=x onerror=alert(1)>\n\n```js\n</script>\n```'}
      />
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('renders citations as buttons only when wired', () => {
    const onCitation = vi.fn()
    const { rerender } = render(
      <MarkdownLite text={'Claim text [1] and more [2].'} onCitation={onCitation} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open source 1' }))
    expect(onCitation).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open source 2' }))
    expect(onCitation).toHaveBeenCalledWith(2)

    rerender(<MarkdownLite text={'Claim text [1] and more [2].'} />)
    expect(screen.queryByRole('button', { name: 'Open source 1' })).toBeNull()
  })
})
