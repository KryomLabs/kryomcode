// Chromium permission allowlist tests (Phase E): clipboard writes
// stay allowed (every Copy button needs clipboard-sanitized-write)
// while everything else — including clipboard reads — stays denied.
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { shouldAllowPermission } = require('./permissions.cjs')

describe('chromium permission allowlist', () => {
  it('allows sanitized clipboard writes for Copy buttons', () => {
    assert.equal(shouldAllowPermission('clipboard-sanitized-write'), true)
  })

  it('denies clipboard reads: nothing pastes from the clipboard', () => {
    assert.equal(shouldAllowPermission('clipboard-read'), false)
  })

  it('denies device, location, and notification permissions', () => {
    for (const permission of [
      'camera',
      'microphone',
      'geolocation',
      'notifications',
      'fullscreen',
      'pointerLock',
      'midi',
    ]) {
      assert.equal(shouldAllowPermission(permission), false, permission)
    }
  })

  it('denies malformed or missing permission names', () => {
    for (const permission of [
      undefined,
      null,
      '',
      'clipboard-sanitzed-write',
      'CLIPBOARD-SANITIZED-WRITE',
      42,
    ]) {
      assert.equal(shouldAllowPermission(permission), false)
    }
  })
})
