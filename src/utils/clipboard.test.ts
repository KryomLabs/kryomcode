// Clipboard helper tests (Phase E): the single guarded access
// point never throws — callers branch on the boolean.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('resolves true after a successful write', async () => {
    const writeText = vi.fn(async () => undefined)

    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('resolves false when the write rejects (denied permission)', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError')
    })

    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('resolves false when the clipboard API is absent', async () => {
    vi.stubGlobal('navigator', {})

    await expect(copyText('hello')).resolves.toBe(false)

    vi.stubGlobal('navigator', { clipboard: {} })

    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('resolves false for empty text without touching the API', async () => {
    const writeText = vi.fn(async () => undefined)

    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('')).resolves.toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })
})
