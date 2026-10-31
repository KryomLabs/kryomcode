// Provenance-labelled context snapshots (Level 3A.4). When the agent
// gathers context for a planning request, this module records exactly
// what was sent: per-file digests, the research brief version, a chat
// excerpt fingerprint, and a workspace-brief digest — each with the
// source identity needed to re-check it later. Nothing is invented:
// sources that were not attached stay null, and re-checks only touch
// referenced files (never a repository walk).
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const {
  restoreChat,
} = require('../ai/chat-store.cjs')
const {
  loadResearchContext,
} = require('../research/brief.service.cjs')
const {
  readSession,
} = require('../research/session-store.cjs')
const {
  resolveWorkspacePath,
} = require('../../security/validate-path.cjs')
const { redactText } = require('../../utils/logger.cjs')

const MAX_CHAT_EXCERPT_CHARS = 4000
const MAX_ITEM_EXCERPT_CHARS = 200
const MAX_SNAPSHOT_FILES = 8

function digest(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function nowIso() {
  return new Date().toISOString()
}

// Recent chat formatted for model context. Bounded, redacted, and
// newest-last. By default it throws when there is no history so an
// explicit user request never silently degrades to "no chat
// attached". Pass { required: false } for callers that degrade
// gracefully (the autonomous planner): empty history then resolves
// to null — never a fabricated excerpt — while genuine retrieval
// failures still throw for the caller's error taxonomy.
async function buildChatExcerpt(options = {}) {
  const required = options.required !== false
  const restored = await restoreChat()
  const messages = Array.isArray(restored.messages)
    ? restored.messages
    : []

  if (messages.length === 0) {
    if (!required) {
      return null
    }

    throw new Error('No chat history to include.')
  }

  let excerpt = ''

  for (const entry of messages) {
    const line = `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}\n`

    if (excerpt.length + line.length > MAX_CHAT_EXCERPT_CHARS) {
      break
    }

    excerpt += line
  }

  const redacted = redactText(excerpt.trim())

  if (!redacted) {
    if (!required) {
      return null
    }

    throw new Error('No chat history to include.')
  }

  return {
    messageCount: messages.length,
    chars: redacted.length,
    truncated: excerpt.length >= MAX_CHAT_EXCERPT_CHARS,
    excerpt: redacted,
    digest: digest(redacted),
    at: nowIso(),
  }
}

function snapshotFiles(files) {
  if (!Array.isArray(files)) {
    return []
  }

  return files.slice(0, MAX_SNAPSHOT_FILES).map((file) => ({
    relativePath: String(file.relativePath).split(path.sep).join('/'),
    bytes: file.bytes,
    digest: digest(file.content ?? ''),
    excerpt: redactText(String(file.content ?? '').slice(0, MAX_ITEM_EXCERPT_CHARS)),
  }))
}

async function snapshotResearch(sessionId) {
  if (!sessionId) {
    return null
  }

  const loaded = await loadResearchContext(sessionId, 6000)
  const session = await readSession(loaded.sessionId)
  const briefVersion =
    session.brief && typeof session.brief.version === 'number'
      ? session.brief.version
      : 0

  return {
    sessionId: loaded.sessionId,
    objective: session.objective,
    status: loaded.status,
    briefVersion,
    excerptChars: loaded.context.length,
    digest: digest(loaded.context),
    at: nowIso(),
  }
}

function snapshotWorkspace(workspaceBrief, projectName) {
  if (!workspaceBrief) {
    return null
  }

  return {
    projectName,
    chars: workspaceBrief.length,
    digest: digest(workspaceBrief),
    at: nowIso(),
  }
}

async function buildContextSnapshot({
  files,
  researchSessionId,
  includeChat,
  chatRequired,
  workspaceBrief,
  projectName,
}) {
  return {
    at: nowIso(),
    projectName,
    files: snapshotFiles(files),
    research: await snapshotResearch(
      researchSessionId && researchSessionId.trim()
        ? researchSessionId.trim()
        : null
    ),
    chat:
      includeChat === true
        ? await buildChatExcerpt({ required: chatRequired !== false })
        : null,
    workspace: snapshotWorkspace(workspaceBrief, projectName),
  }
}

// Re-checks a stored snapshot against the current project. File and
// research items revalidate (stale/missing surface honestly); chat
// and workspace items are point-in-time references by design and are
// labelled as recorded, never re-verified.
async function checkContextFreshness(root, snapshot) {
  const files = []

  for (const item of snapshot.files) {
    files.push({ ...item, ...(await checkFileItem(root, item)) })
  }

  return {
    at: snapshot.at,
    projectName: snapshot.projectName,
    files,
    research: snapshot.research
      ? await withResearchFreshness(snapshot.research)
      : null,
    chat: snapshot.chat
      ? { ...snapshot.chat, status: 'recorded', reason: 'Point-in-time excerpt; chat is not re-validated.' }
      : null,
    workspace: snapshot.workspace
      ? { ...snapshot.workspace, status: 'reference', reason: 'Project brief; shown for provenance only.' }
      : null,
  }
}

async function checkFileItem(root, item) {
  let resolved = null

  try {
    resolved = await resolveWorkspacePath(
      path.join(root, ...item.relativePath.split('/'))
    )
  } catch (error) {
    if (error && /does not exist/i.test(error.message || '')) {
      return { status: 'missing', reason: 'File was removed.' }
    }

    return { status: 'missing', reason: 'File cannot be read.' }
  }

  if (!resolved.stat.isFile()) {
    return { status: 'missing', reason: 'No longer a file.' }
  }

  // Size mismatch decides without reading: the recorded bytes are
  // bounded, so an equal-size read below is bounded too.
  if (resolved.stat.size !== item.bytes) {
    return { status: 'stale', reason: 'File changed since planning.' }
  }

  const content = await fs.readFile(resolved.path, 'utf8')

  if (digest(content) !== item.digest) {
    return { status: 'stale', reason: 'File changed since planning.' }
  }

  return { status: 'current', reason: '' }
}

async function withResearchFreshness(item) {
  // Freshness lives beside the session status (not over it): `status`
  // stays the research lifecycle state.
  let session = null

  try {
    session = await readSession(item.sessionId)
  } catch {
    return { ...item, freshness: 'missing', freshnessReason: 'Research session is gone.' }
  }

  const briefVersion =
    session.brief && typeof session.brief.version === 'number'
      ? session.brief.version
      : 0

  if (briefVersion !== item.briefVersion) {
    return {
      ...item,
      freshness: 'stale',
      freshnessReason: `Brief v${item.briefVersion} was superseded by v${briefVersion}.`,
    }
  }

  return { ...item, freshness: 'current', freshnessReason: '' }
}

module.exports = {
  MAX_CHAT_EXCERPT_CHARS,
  buildChatExcerpt,
  snapshotFiles,
  snapshotResearch,
  snapshotWorkspace,
  buildContextSnapshot,
  checkContextFreshness,
}
