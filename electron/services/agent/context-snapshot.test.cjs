// Context snapshot tests (Level 3A.4): chat excerpts, research
// snapshots, file fingerprints, and freshness re-checks. No network,
// no Meta calls.
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const {
  setWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const {
  saveChat,
} = require('../ai/chat-store.cjs')
const {
  createSession,
  readSession,
  writeSession,
} = require('../research/session-store.cjs')
const {
  buildChatExcerpt,
  snapshotFiles,
  snapshotResearch,
  buildContextSnapshot,
  checkContextFreshness,
} = require('./context-snapshot.cjs')

async function openWorkspace(prefix = 'kryom-ctx-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix))

  // Return the canonical root the workspace actually runs under: the
  // raw temp path can carry symlinked ancestors (/var on macOS) that
  // never string-match the resolved root in identity checks.
  return setWorkspaceRoot(root)
}

describe('context-snapshot', () => {
  it('builds redacted, bounded chat excerpts', async () => {
    const root = await openWorkspace()

    await assert.rejects(() => buildChatExcerpt(), /No chat history/)

    const seeded = await saveChat(
      [
        { role: 'user', content: 'How do I log in?' },
        { role: 'assistant', content: 'Use the form.' },
        { role: 'user', content: 'My key is Bearer abcdefghijklmnop' },
      ],
      { root }
    )

    assert.equal(seeded.saved, true)

    const excerpt = await buildChatExcerpt()

    assert.equal(excerpt.messageCount, 3)
    assert.ok(excerpt.chars <= 4000)
    assert.ok(!excerpt.excerpt.includes('abcdefghijklmnop'))
    assert.ok(excerpt.excerpt.includes('[redacted]'))
    assert.match(excerpt.digest, /^[0-9a-f]{64}$/)
    assert.ok(excerpt.at)
  })

  it('omits empty history as null when chat is optional', async () => {
    const root = await openWorkspace()

    // No history seeded: optional callers get null, never a throw
    // and never a fabricated excerpt.
    assert.equal(await buildChatExcerpt({ required: false }), null)

    const helloSeed = await saveChat([{ role: 'user', content: 'hello' }], { root })

    assert.equal(helloSeed.saved, true)

    const excerpt = await buildChatExcerpt({ required: false })

    assert.equal(excerpt.messageCount, 1)
    assert.ok(excerpt.excerpt.includes('hello'))

    const snapshot = await buildContextSnapshot({
      files: [],
      researchSessionId: null,
      includeChat: true,
      chatRequired: false,
      workspaceBrief: '',
      projectName: path.basename(root),
    })

    assert.equal(snapshot.chat.messageCount, 1)
  })

  it('omits missing history from optional snapshots without inventing sources', async () => {
    const root = await openWorkspace()

    const snapshot = await buildContextSnapshot({
      files: [{ relativePath: 'a.ts', bytes: 3, content: 'abc' }],
      researchSessionId: null,
      includeChat: true,
      chatRequired: false,
      workspaceBrief: 'Project type: node.',
      projectName: path.basename(root),
    })

    assert.equal(snapshot.chat, null)
    assert.equal(snapshot.files.length, 1)
    assert.equal(snapshot.workspace.projectName, path.basename(root))
  })

  it('still throws for unexpected retrieval failures when chat is optional', async () => {
    const root = await openWorkspace()

    // A directory where the chat file belongs breaks storage reads:
    // that is a genuine failure, not an empty history.
    await fs.mkdir(path.join(root, '.kryom'), { recursive: true })
    await fs.mkdir(path.join(root, '.kryom', 'chat.json'))

    await assert.rejects(
      () => buildChatExcerpt({ required: false }),
      /Storage path is not a file/
    )
    await assert.rejects(
      () =>
        buildContextSnapshot({
          files: [],
          researchSessionId: null,
          includeChat: true,
          chatRequired: false,
          workspaceBrief: '',
          projectName: path.basename(root),
        }),
      /Storage path is not a file/
    )
  })

  it('fingerprints file context with normalized paths', () => {
    const files = snapshotFiles([
      {
        relativePath: ['src', 'app.ts'].join(path.sep),
        bytes: 11,
        content: 'hello world',
      },
    ])

    assert.equal(files.length, 1)
    assert.equal(files[0].relativePath, 'src/app.ts')
    assert.equal(files[0].bytes, 11)
    assert.match(files[0].digest, /^[0-9a-f]{64}$/)
    assert.equal(files[0].excerpt, 'hello world')
    assert.deepEqual(snapshotFiles(null), [])

    const many = snapshotFiles(
      new Array(12).fill({ relativePath: 'x', bytes: 1, content: 'y' })
    )

    assert.equal(many.length, 8)
  })

  it('snapshots research sessions with brief versions', async () => {
    await openWorkspace()

    assert.equal(await snapshotResearch(null), null)

    const session = await createSession('Snapshot me.')
    const snap = await snapshotResearch(session.id)

    assert.equal(snap.sessionId, session.id)
    assert.equal(snap.objective, 'Snapshot me.')
    assert.equal(snap.briefVersion, 0)
    assert.ok(snap.excerptChars > 0)
    assert.match(snap.digest, /^[0-9a-f]{64}$/)

    await assert.rejects(
      () => snapshotResearch('missing-session'),
      /not found|Invalid research session/i
    )
  })

  it('builds whole snapshots without inventing sources', async () => {
    const root = await openWorkspace()
    const projectName = path.basename(root)

    const empty = await buildContextSnapshot({
      files: [],
      researchSessionId: null,
      includeChat: false,
      workspaceBrief: '',
      projectName,
    })

    assert.equal(empty.projectName, projectName)
    assert.deepEqual(empty.files, [])
    assert.equal(empty.research, null)
    assert.equal(empty.chat, null)
    assert.equal(empty.workspace, null)

    const hiSeed = await saveChat([{ role: 'user', content: 'hi' }], { root })

    assert.equal(hiSeed.saved, true)

    const full = await buildContextSnapshot({
      files: [{ relativePath: 'a.ts', bytes: 3, content: 'abc' }],
      researchSessionId: null,
      includeChat: true,
      workspaceBrief: 'Project type: node.',
      projectName,
    })

    assert.equal(full.files.length, 1)
    assert.equal(full.chat.messageCount, 1)
    assert.equal(full.workspace.projectName, projectName)
  })

  it('re-checks files and research honestly', async () => {
    const root = await openWorkspace()

    await fs.writeFile(path.join(root, 'live.ts'), 'v1\n')
    await fs.writeFile(path.join(root, 'gone.ts'), 'bye\n')

    const session = await createSession('Freshness check.')
    const snapshot = await buildContextSnapshot({
      files: [
        { relativePath: 'live.ts', bytes: 3, content: 'v1\n' },
        { relativePath: 'gone.ts', bytes: 4, content: 'bye\n' },
      ],
      researchSessionId: session.id,
      includeChat: false,
      workspaceBrief: 'brief',
      projectName: path.basename(root),
    })

    await fs.writeFile(path.join(root, 'live.ts'), 'v2 much longer\n')
    await fs.unlink(path.join(root, 'gone.ts'))

    const loaded = await readSession(session.id)

    loaded.brief.version = 3
    await writeSession(loaded)

    const checked = await checkContextFreshness(root, snapshot)
    const byPath = new Map(
      checked.files.map((item) => [item.relativePath, item])
    )

    assert.equal(byPath.get('live.ts').status, 'stale')
    assert.equal(byPath.get('gone.ts').status, 'missing')
    assert.equal(checked.research.freshness, 'stale')
    assert.match(checked.research.freshnessReason, /superseded by v3/)
    // Session lifecycle status is preserved beside freshness.
    assert.equal(typeof checked.research.status, 'string')
    assert.equal(checked.workspace.status, 'reference')

    const missing = await checkContextFreshness(root, {
      ...snapshot,
      research: { ...snapshot.research, sessionId: 'vanished' },
    })

    assert.equal(missing.research.freshness, 'missing')
  })

  it('reports current files as current', async () => {
    const root = await openWorkspace()

    await fs.writeFile(path.join(root, 'same.ts'), 'same\n')

    const snapshot = await buildContextSnapshot({
      files: [{ relativePath: 'same.ts', bytes: 5, content: 'same\n' }],
      researchSessionId: null,
      includeChat: false,
      workspaceBrief: '',
      projectName: path.basename(root),
    })

    const checked = await checkContextFreshness(root, snapshot)

    assert.equal(checked.files[0].status, 'current')
  })
})
