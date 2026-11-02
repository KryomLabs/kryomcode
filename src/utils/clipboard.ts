// Single guarded access point for the async clipboard (Phase E).
// The packaged app grants clipboard-sanitized-write from the main
// process (electron/security/permissions.cjs); reads stay denied.
// Never throws: callers branch on the boolean and keep their own
// Copied/unavailable feedback.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (text === '') {
      return false
    }

    if (typeof navigator === 'undefined') {
      return false
    }

    const clipboard = navigator.clipboard

    if (!clipboard || typeof clipboard.writeText !== 'function') {
      return false
    }

    await clipboard.writeText(text)

    return true
  } catch {
    return false
  }
}
