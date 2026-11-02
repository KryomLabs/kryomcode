// Chromium permission allowlist (Phase E). The main process denies
// every permission request by default; this module names the single
// exception. `clipboard-sanitized-write` backs
// `navigator.clipboard.writeText`, which every in-app Copy button
// uses — denying it (as the old blanket-deny handler did) rejects
// every copy with NotAllowedError. Reads (`clipboard-read`) stay
// denied: nothing in the UI pastes from the clipboard.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

function shouldAllowPermission(permission) {
  return (
    typeof permission === 'string' && ALLOWED_PERMISSIONS.has(permission)
  )
}

module.exports = { shouldAllowPermission }
