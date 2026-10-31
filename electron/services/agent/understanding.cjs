// Project understanding engine (Milestone 3). Builds one bounded,
// task-relevant bundle describing the open project for the
// autonomous agent: structure summary, languages/frameworks,
// scripts, task-relevant files (actually read), git state, and
// index status.
//
// Honesty rules:
// - `inspected` names exactly the files whose contents were read.
//   The agent must never claim understanding of any other file;
//   everything else is reported as names/counts only.
// - All retrieval reuses existing bounded gatherers
//   (gatherSourceContext exclusions + budgets, searchProject,
//   getWorkspaceSummary, analyzeArchitecture, git getStatus).
//   Nothing here reads secrets, ignored directories, or the whole
//   repository into a prompt.
// - Every failed source lands in `failures` with its error; the
//   bundle is still returned when the core summary survives.
// - `checkBundleFreshness` re-hashes inspected files so the runner
//   can refuse stale context instead of planning on moved ground.
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const {
  getWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const {
  getWorkspaceSummary,
} = require('../project-intelligence/project-analyzer.service.cjs')
const {
  analyzeArchitecture,
} = require('../project-intelligence/architecture.service.cjs')
const {
  searchProject,
} = require('../project-intelligence/semantic-search.service.cjs')
const {
  getIndexStatus,
  refreshIndex,
} = require('../project-intelligence/code-index.service.cjs')
const {
  getStatus: getGitStatus,
} = require('../git/git.service.cjs')
const {
  gatherSourceContext,
  MAX_CONTEXT_FILES,
} = require('./context.service.cjs')
const { createLogger } = require('../../utils/logger.cjs')

const log = createLogger('understanding')

const MAX_TASK_LENGTH = 4000
const MAX_SEARCH_RESULTS = 10
const MAX_GIT_ENTRIES = 50
const MAX_BRIEF_CHARS = 12000

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function capList(entries, max) {
  return Array.isArray(entries) ? entries.slice(0, max) : []
}

async function ensureIndexed() {
  const status = await getIndexStatus()

  if (status.indexed) {
    return { refreshed: false, refreshedAt: status.refreshedAt }
  }

  const report = await refreshIndex()

  return { refreshed: true, refreshedAt: report.refreshedAt }
}

async function readGitState() {
  try {
    const status = await getGitStatus()

    return {
      available: true,
      branch: status.branch,
      upstream: status.upstream,
      clean: status.clean,
      staged: capList(status.staged, MAX_GIT_ENTRIES),
      unstaged: capList(status.unstaged, MAX_GIT_ENTRIES),
      untracked: capList(status.untracked, MAX_GIT_ENTRIES),
      stagedTotal: status.staged.length,
      unstagedTotal: status.unstaged.length,
      untrackedTotal: status.untracked.length,
    }
  } catch (error) {
    return { available: false, reason: error.message }
  }
}

// Merges user-selected paths (first, never dropped by relevance)
// with task-relevant index hits. User paths that fail containment
// reject loudly from the gatherer; relevance hits that no longer
// resolve are skipped with a recorded reason instead of failing.
function mergePaths(contextPaths, searchResults) {
  const merged = []
  const seen = new Set()

  for (const raw of contextPaths) {
    if (typeof raw === 'string' && raw.trim() && !seen.has(raw.trim())) {
      seen.add(raw.trim())
      merged.push(raw.trim())
    }
  }

  for (const hit of searchResults) {
    // Semantic-search hits carry `file` (index-relative); accept the
    // legacy `relativePath`/`path` spellings defensively.
    const candidate =
      typeof hit.file === 'string'
        ? hit.file
        : typeof hit.relativePath === 'string'
          ? hit.relativePath
          : typeof hit.path === 'string'
            ? hit.path
            : ''

    if (candidate && !seen.has(candidate)) {
      seen.add(candidate)
      merged.push(candidate)
    }
  }

  return merged
}

function briefBlock(bundle) {
  const lines = [
    `Project: ${bundle.projectName} (${bundle.projectType}).`,
  ]

  if (bundle.frameworks.length > 0) {
    lines.push(`Frameworks: ${bundle.frameworks.join(', ')}.`)
  }

  if (bundle.primaryLanguage) {
    lines.push(`Primary language: ${bundle.primaryLanguage}.`)
  }

  const scriptNames = Object.keys(bundle.scripts)

  if (scriptNames.length > 0) {
    lines.push(`Scripts: ${scriptNames.join(', ')}.`)
  }

  if (bundle.entryPoints.length > 0) {
    lines.push(`Entry points: ${bundle.entryPoints.join(', ')}.`)
  }

  lines.push(
    `Files: ${bundle.counts.files} total, ${bundle.counts.indexed} indexed.`
  )

  if (bundle.git.available) {
    lines.push(
      `Git: branch ${bundle.git.branch || 'unknown'}, ` +
        (bundle.git.clean
          ? 'clean worktree.'
          : `${bundle.git.unstagedTotal} unstaged, ${bundle.git.stagedTotal} staged, ` +
            `${bundle.git.untrackedTotal} untracked. User modifications must be preserved.`)
    )

    if (!bundle.git.clean) {
      const touched = [
        ...bundle.git.unstaged.slice(0, 10),
        ...bundle.git.staged.slice(0, 10),
      ]

      if (touched.length > 0) {
        lines.push(`Touched files: ${touched.join(', ')}.`)
      }
    }
  } else {
    lines.push(`Git: unavailable (${bundle.git.reason}).`)
  }

  if (bundle.inspected.length > 0) {
    lines.push(
      `Inspected source (${bundle.inspected.length} file(s), contents provided separately): ` +
        bundle.inspected.map((file) => file.relativePath).join(', ')
    )
  } else {
    lines.push('Inspected source: none (task brief only).')
  }

  if (bundle.failures.length > 0) {
    lines.push(`Unavailable sources: ${bundle.failures.join(' | ')}`)
  }

  return lines.join('\n').slice(0, MAX_BRIEF_CHARS)
}

async function buildUnderstanding(task, options = {}) {
  if (typeof task !== 'string' || !task.trim()) {
    throw new Error('A task description is required to understand the project.')
  }

  if (task.length > MAX_TASK_LENGTH) {
    throw new Error(`Task exceeds ${MAX_TASK_LENGTH} characters.`)
  }

  const root = getWorkspaceRoot()

  if (!root) {
    throw new Error('Open a project folder first.')
  }

  const contextPaths = Array.isArray(options.contextPaths)
    ? options.contextPaths.filter(
        (entry) => typeof entry === 'string' && entry.trim()
      ).slice(0, 32)
    : []

  const failures = []
  const summary = await getWorkspaceSummary()

  // The index comes first: architecture and relevance both read it.
  let index = { refreshed: false, refreshedAt: null }

  try {
    index = await ensureIndexed()
  } catch (error) {
    failures.push(`Code index unavailable: ${error.message}`)
  }

  let architecture = null

  try {
    const analyzed = await analyzeArchitecture()

    architecture = {
      primaryLanguage: analyzed.primaryLanguage || null,
      frameworks: Array.isArray(analyzed.frameworks)
        ? analyzed.frameworks.slice(0, 10)
        : [],
      entryPoints: Array.isArray(analyzed.entryPoints)
        ? analyzed.entryPoints.slice(0, 10)
        : [],
      modules: Array.isArray(analyzed.modules)
        ? analyzed.modules.slice(0, 15)
        : [],
      conventions: analyzed.conventions || null,
    }
  } catch (error) {
    failures.push(`Architecture unavailable: ${error.message}`)
  }

  let searchResults = []

  try {
    const search = await searchProject(task.trim())

    searchResults = capList(search.results || [], MAX_SEARCH_RESULTS)
  } catch (error) {
    failures.push(`Relevance search unavailable: ${error.message}`)
  }

  const git = await readGitState()

  // User selection first, relevance fills the remaining gatherer
  // budget. The gatherer enforces containment, exclusions, and byte
  // caps; relevance hits are best-effort (a hit that fails
  // containment is dropped with a failure note, never sent).
  const requested = mergePaths(contextPaths, searchResults).slice(
    0,
    MAX_CONTEXT_FILES + searchResults.length
  )
  let gathered = { files: [], excluded: [], totalBytes: 0 }

  try {
    gathered = await gatherSourceContext(requested)
  } catch (error) {
    // Containment failures name the offending path; relevance hits
    // are retried without user paths to isolate a bad selection
    // from a bad hit before giving up loudly.
    const relevanceOnly = requested.filter(
      (entry) => !contextPaths.includes(entry)
    )

    try {
      gathered = await gatherSourceContext(relevanceOnly)
      failures.push(`Context selection rejected: ${error.message}`)
    } catch (nested) {
      failures.push(`Source context unavailable: ${nested.message}`)
      gathered = { files: [], excluded: [], totalBytes: 0 }
    }
  }

  const inspected = []
  const contents = []

  for (const file of gathered.files) {
    const digest = sha256Hex(Buffer.from(file.content, 'utf8'))
    const display = file.relativePath.split(path.sep).join('/')

    inspected.push({ relativePath: display, bytes: file.bytes, digest })
    contents.push({ relativePath: display, content: file.content })
  }

  const bundle = {
    version: 1,
    projectName: path.basename(root),
    generatedAt: new Date().toISOString(),
    projectType: summary.projectType,
    scripts: summary.scripts || {},
    counts: {
      files: summary.counts?.files ?? 0,
      indexed: summary.fileIndex ? summary.fileIndex.length : 0,
    },
    primaryLanguage: architecture?.primaryLanguage ?? null,
    frameworks: architecture?.frameworks ?? [],
    entryPoints: architecture?.entryPoints ?? [],
    modules: architecture?.modules ?? [],
    conventions: architecture?.conventions ?? null,
    git,
    index,
    relevantFiles: searchResults.map((hit) => ({
      path:
        typeof hit.file === 'string'
          ? hit.file
          : typeof hit.relativePath === 'string'
            ? hit.relativePath
            : (hit.path ?? ''),
      score: typeof hit.score === 'number' ? hit.score : null,
      reason:
        typeof hit.why === 'string'
          ? hit.why.slice(0, 300)
          : typeof hit.reason === 'string'
            ? hit.reason.slice(0, 300)
            : '',
    })),
    inspected,
    contents,
    excluded: gathered.excluded,
    totalContextBytes: gathered.totalBytes,
    diagnostics: {
      baseline: 'not-executed',
      reason:
        'No baseline command has been approved yet; verification runs during the verify phase.',
    },
    failures,
  }

  bundle.brief = briefBlock(bundle)

  log.info(
    `Understanding built for ${bundle.projectName}: ` +
      `${inspected.length} inspected file(s), ${failures.length} failure(s).`
  )

  return bundle
}

// Re-hashes inspected files against the live workspace. Returns the
// stale/missing entries; an empty array means the bundle is current.
// Used before planning on and before executing from a bundle.
async function checkBundleFreshness(bundle) {
  const root = getWorkspaceRoot()

  if (!root) {
    throw new Error('Open a project folder first.')
  }

  if (!bundle || !Array.isArray(bundle.inspected)) {
    throw new Error('Invalid understanding bundle.')
  }

  const stale = []

  for (const entry of bundle.inspected) {
    if (
      !entry ||
      typeof entry.relativePath !== 'string' ||
      !entry.relativePath ||
      entry.relativePath.includes('..') ||
      path.isAbsolute(entry.relativePath)
    ) {
      stale.push({
        path:
          entry && typeof entry.relativePath === 'string'
            ? entry.relativePath.slice(0, 200)
            : '(invalid entry)',
        status: 'invalid',
      })
      continue
    }

    const absolute = path.join(root, entry.relativePath)

    let buffer = null

    try {
      buffer = await fs.readFile(absolute)
    } catch {
      stale.push({ path: entry.relativePath, status: 'missing' })
      continue
    }

    if (sha256Hex(buffer) !== entry.digest) {
      stale.push({ path: entry.relativePath, status: 'stale' })
    }
  }

  return stale
}

module.exports = {
  buildUnderstanding,
  checkBundleFreshness,
  MAX_TASK_LENGTH,
}
