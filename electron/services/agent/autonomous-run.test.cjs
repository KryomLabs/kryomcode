const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  setWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const {
  assertImplementsProvider,
} = require('../ai/providers/provider.interface.cjs')
const {
  saveChat,
} = require('../ai/chat-store.cjs')
const {
  startRun,
  getRun,
  listRuns,
  getRunProposal,
  cancelRun,
  pauseRun,
  resumeRun,
  approveRun,
  rejectRun,
  extractVerificationCommand,
} = require('./autonomous-run.cjs')

function useTestKey() {
  const saved = {
    MODEL_API_KEY: process.env.MODEL_API_KEY,
    META_MODEL: process.env.META_MODEL,
  }

  process.env.MODEL_API_KEY = 'test-key'
  delete process.env.META_MODEL

  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function openWorkspace(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-agent-run-'))

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)

    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content)
  }

  // Return the canonical root the workspace actually runs under: the
  // raw temp path can carry symlinked ancestors (/var on macOS) that
  // never string-match the resolved root in identity checks.
  return setWorkspaceRoot(dir)
}

// Deterministic provider: serves one queued JSON answer per model
// call, in order. Optional per-call gates pause the call until
// released (or reject on abort) for pause/cancel tests.
class ScriptedProvider {
  constructor(answers) {
    this.queue = answers.map((entry) =>
      typeof entry === 'string' ? { answer: entry } : entry
    )
    this.calls = []

    assertImplementsProvider(this, 'ScriptedProvider')
  }

  async chat({ model, messages, signal } = {}) {
    this.calls.push({ model, messages })

    if (signal && signal.aborted) {
      throw abortError()
    }

    const next = this.queue.shift()

    if (!next) {
      throw new Error('ScriptedProvider: no more answers queued.')
    }

    if (next.gate) {
      await next.gate.promise(signal)
    }

    return { answer: next.answer, model: model || 'mock' }
  }
}

function abortError() {
  const error = new Error('Scripted request was cancelled.')

  error.name = 'AbortError'

  return error
}

function makeGate() {
  let release = null

  const gate = {
    released: false,
    promise(signal) {
      if (gate.released) {
        return Promise.resolve()
      }

      return new Promise((resolve, reject) => {
        release = resolve

        if (signal) {
          if (signal.aborted) {
            reject(abortError())
          } else {
            signal.addEventListener('abort', () => reject(abortError()), {
              once: true,
            })
          }
        }
      })
    },
    open() {
      gate.released = true

      if (release) {
        release()
      }
    },
  }

  return gate
}

async function waitFor(runId, predicate, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const record = await getRun(runId)

    if (predicate(record)) {
      return record
    }

    if (Date.now() > deadline) {
      const tail = record.events
        .slice(-5)
        .map((event) => `${event.kind}:${event.message.slice(0, 120)}`)
        .join(' | ')
      const failure = record.error
        ? ` error=${record.error.phase}:${record.error.message.slice(0, 200)}`
        : ''

      throw new Error(
        `Timed out waiting for run ${runId} (state: ${record.state}).${failure} tail=[${tail}]`
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const isParked = (record) => record.state === 'waiting_for_approval'
const isTerminal = (record) =>
  record.state === 'completed' ||
  record.state === 'failed' ||
  record.state === 'cancelled'

function analysisAnswer(overrides = {}) {
  return JSON.stringify({
    outcome: 'Calc adds correctly.',
    affectedFiles: ['src/calc.js'],
    risks: [],
    needsResearch: false,
    researchQuestions: [],
    validationCriteria: ['node --version'],
    ...overrides,
  })
}

function decompositionAnswer(subtasks, overrides = {}) {
  return JSON.stringify({
    objective: 'Fix calc.',
    expectedOutcome: 'Calc adds correctly.',
    subtasks,
    risks: [],
    assumptions: [],
    ...overrides,
  })
}

function proposalAnswer(edits, overrides = {}) {
  return JSON.stringify({
    edits,
    commands: [],
    notes: 'test proposal',
    expectedOutcome: 'fixed',
    ...overrides,
  })
}

const CALC_FILES = {
  'package.json': JSON.stringify({ name: 'calc-demo', scripts: { test: 'node --test' } }),
  'src/calc.js': 'function add(a, b) { return a - b }\nmodule.exports = { add }\n',
}

const FIXED_CALC = 'function add(a, b) { return a + b }\nmodule.exports = { add }\n'

function calcSubtask(verification = 'node --version') {
  return {
    title: 'Fix the add function',
    description: 'Correct the arithmetic in src/calc.js.',
    files: ['src/calc.js'],
    dependsOn: [],
    verification,
    completion: 'add() returns the sum.',
  }
}

describe('extractVerificationCommand', () => {
  it('extracts backticked, prefixed, and bare commands only', () => {
    assert.equal(
      extractVerificationCommand('Run `npm test` to verify.'),
      'npm test'
    )
    assert.equal(extractVerificationCommand('run npm run build'), 'npm run build')
    assert.equal(extractVerificationCommand('Execute `node --test`.'), 'node --test')
    assert.equal(extractVerificationCommand('npm test'), 'npm test')
    assert.equal(extractVerificationCommand('  node --version  '), 'node --version')
  })

  it('refuses prose, questions, and empty text', () => {
    assert.equal(extractVerificationCommand(''), null)
    assert.equal(extractVerificationCommand(null), null)
    assert.equal(
      extractVerificationCommand('Verify manually in the browser.'),
      null
    )
    assert.equal(extractVerificationCommand('Does npm test pass?'), null)
    assert.equal(
      extractVerificationCommand('Run the tests; then check lint!'),
      null
    )
    assert.equal(extractVerificationCommand('x'.repeat(300)), null)
  })
})

describe('autonomous-run lifecycle', () => {
  it('runs analyze, plan, approve, execute, verify to a verified completion', async () => {
    const restore = useTestKey()

    try {
      const root = await openWorkspace(CALC_FILES)
      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          {
            path: 'src/calc.js',
            action: 'modify',
            content: FIXED_CALC,
            reason: 'Fix subtraction.',
          },
        ]),
      ])

      const started = await startRun(
        { task: 'Fix the add function.', researchMode: 'off' },
        { provider }
      )

      assert.match(started.id, /^ar-/)
      assert.equal(started.state, 'analyzing')

      const parked = await waitFor(started.id, isParked)

      assert.equal(parked.pendingApproval.kind, 'plan')
      assert.equal(parked.pendingApproval.payload.editCount, 1)
      assert.equal(parked.proposals[0].editCount, 1)
      assert.ok(parked.understanding)
      assert.ok(parked.analysis)
      assert.equal(parked.analysis.needsResearch, false)

      const kinds = parked.events.map((event) => event.kind)

      assert.ok(kinds.includes('analysis'))
      assert.ok(kinds.includes('plan'))
      assert.ok(kinds.includes('proposal'))
      assert.ok(kinds.includes('approval-requested'))

      const full = await getRunProposal(started.id, 0)

      assert.equal(full.proposal.edits.length, 1)
      assert.equal(full.proposal.edits[0].content, FIXED_CALC)

      // Nothing writes before approval.
      assert.equal(
        await fs.readFile(path.join(root, 'src/calc.js'), 'utf8'),
        CALC_FILES['src/calc.js']
      )

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(
        await fs.readFile(path.join(root, 'src/calc.js'), 'utf8'),
        FIXED_CALC
      )
      assert.equal(done.checks.length, 1)
      assert.equal(done.checks[0].conclusion, 'passed')
      assert.equal(done.checks[0].exitCode, 0)
      assert.ok(done.checks[0].reportId)
      // Real captured stdout travels with the check (node prints vX.Y.Z).
      assert.match(done.checks[0].output || '', /v\d+\.\d+\.\d+/)
      assert.equal(done.checks[0].outputLimited, false)
      assert.equal(done.subtasks[0].state, 'passed')
      assert.equal(done.summary.verification, 'verified')
      assert.equal(done.summary.filesAffected, 1)
      assert.deepEqual(done.summary.remainingIssues, [])
      assert.ok(done.memoryId)

      const endKinds = done.events.map((event) => event.kind)

      assert.ok(endKinds.includes('edit-applied'))
      assert.ok(endKinds.includes('command'))
      assert.ok(endKinds.includes('check'))
      assert.ok(endKinds.includes('completed'))
    } finally {
      restore()
    }
  })

  it('rejects forged approvals and double approval', async () => {
    const restore = useTestKey()

    try {
      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])

      await openWorkspace(CALC_FILES)

      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      await assert.rejects(
        () => approveRun(started.id, 'ap-00000000-000000'),
        /Unknown approval/
      )
      await assert.rejects(
        () => rejectRun(started.id, 'not-an-id', {}),
        /Invalid approval id/
      )

      await approveRun(started.id, parked.pendingApproval.id, { provider })
      await waitFor(started.id, isTerminal)

      await assert.rejects(
        () => approveRun(started.id, parked.pendingApproval.id, { provider }),
        /nothing to approve/
      )
    } finally {
      restore()
    }
  })

  it('cancels on plan rejection and revises on revise requests', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      const cancelled = await rejectRun(started.id, parked.pendingApproval.id, {
        reason: 'Not what I wanted.',
      })

      assert.equal(cancelled.state, 'cancelled')
      assert.ok(
        cancelled.events.some((event) => event.message.includes('Not what I wanted'))
      )
    } finally {
      restore()
    }
  })

  it('re-plans after a revise rejection, bounded to two revisions', async () => {
    const restore = useTestKey()

    try {
      const root = await openWorkspace(CALC_FILES)
      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
        // Revision decomposition + proposal.
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'y' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      await rejectRun(
        started.id,
        parked.pendingApproval.id,
        {
          reason: 'Try again.',
          revise: true,
        },
        { provider }
      )

      const reparked = await waitFor(
        started.id,
        (record) =>
          record.state === 'waiting_for_approval' &&
          record.pendingApproval.id !== parked.pendingApproval.id
      )

      assert.equal(reparked.revisions, 1)
      assert.equal(reparked.planIds.length, 2)

      await approveRun(started.id, reparked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(
        await fs.readFile(path.join(root, 'src/calc.js'), 'utf8'),
        FIXED_CALC
      )
    } finally {
      restore()
    }
  })

  it('parks approve-class commands and runs them after explicit approval', async () => {
    const restore = useTestKey()

    try {
      const files = {
        ...CALC_FILES,
        'scripts/verify.js': 'process.exit(0)\n',
      }

      await openWorkspace(files)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask('Run `node scripts/verify.js` to verify.')]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      assert.equal(
        parked.pendingApproval.payload.verification[0].review.verdict,
        'approve'
      )

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const commandPark = await waitFor(
        started.id,
        (record) =>
          record.state === 'waiting_for_approval' &&
          record.pendingApproval.kind === 'command'
      )

      assert.equal(commandPark.pendingApproval.payload.command, 'node scripts/verify.js')
      assert.ok(commandPark.pendingApproval.payload.purpose.includes('verify'))

      await approveRun(started.id, commandPark.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(done.checks[0].conclusion, 'passed')
      assert.equal(done.summary.verification, 'verified')
    } finally {
      restore()
    }
  })

  it('records declined commands as not-executed and completes honestly', async () => {
    const restore = useTestKey()

    try {
      const files = {
        ...CALC_FILES,
        'scripts/verify.js': 'process.exit(0)\n',
      }

      await openWorkspace(files)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask('Run `node scripts/verify.js` to verify.')]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const commandPark = await waitFor(
        started.id,
        (record) =>
          record.state === 'waiting_for_approval' &&
          record.pendingApproval.kind === 'command'
      )

      await rejectRun(started.id, commandPark.pendingApproval.id, {
        reason: 'I will run it myself.',
      })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(done.checks[0].conclusion, 'not_executed')
      assert.match(done.checks[0].reason, /I will run it myself/)
      assert.equal(done.summary.verification, 'unverified')
      assert.equal(done.summary.remainingIssues.length, 1)
      assert.match(done.summary.suggestedNext, /verification is incomplete/)
    } finally {
      restore()
    }
  })

  it('refuses deny-class checks without asking and completes unverified', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask('npm install')]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      assert.equal(
        parked.pendingApproval.payload.verification[0].review.verdict,
        'deny'
      )

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      // No command approval was ever parked: the deny verdict skips it.
      assert.ok(
        !done.events.some(
          (event) =>
            event.kind === 'approval-requested' && event.message.includes('needs approval to run')
        )
      )
      assert.equal(done.state, 'completed')
      assert.equal(done.checks[0].conclusion, 'not_executed')
      assert.match(done.checks[0].reason, /refused by policy/)
      assert.equal(done.summary.verification, 'unverified')
    } finally {
      restore()
    }
  })

  it('repairs a failing check with per-attempt approval', async () => {
    const restore = useTestKey()

    try {
      const files = {
        ...CALC_FILES,
        'scripts/gate.js': 'process.exit(1)\n',
      }
      const root = await openWorkspace(files)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask('Run `node scripts/gate.js` to verify.')]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
        // Repair attempt: make the gate pass.
        proposalAnswer([
          { path: 'scripts/gate.js', action: 'modify', content: 'process.exit(0)\n', reason: 'fix gate' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const commandPark = await waitFor(
        started.id,
        (record) =>
          record.state === 'waiting_for_approval' &&
          record.pendingApproval.kind === 'command'
      )

      await approveRun(started.id, commandPark.pendingApproval.id, { provider })

      const repairPark = await waitFor(
        started.id,
        (record) =>
          record.state === 'waiting_for_approval' &&
          record.pendingApproval.kind === 'repair'
      )

      assert.equal(repairPark.pendingApproval.payload.edits.length, 1)
      assert.match(repairPark.pendingApproval.payload.edits[0].path, /gate\.js$/)

      await approveRun(started.id, repairPark.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(done.subtasks[0].state, 'repaired')
      assert.equal(
        await fs.readFile(path.join(root, 'scripts/gate.js'), 'utf8'),
        'process.exit(0)\n'
      )

      const conclusions = done.checks.map((check) => check.conclusion)

      assert.ok(conclusions.includes('failed'))
      assert.ok(conclusions.includes('passed'))
      assert.ok(done.events.some((event) => event.kind === 'repair'))
    } finally {
      restore()
    }
  })

  it('fails honestly when repair is declined', async () => {
    const restore = useTestKey()

    try {
      const files = {
        ...CALC_FILES,
        'scripts/gate.js': 'process.exit(1)\n',
      }

      await openWorkspace(files)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask('Run `node scripts/gate.js` to verify.')]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
        proposalAnswer([
          { path: 'scripts/gate.js', action: 'modify', content: 'process.exit(0)\n', reason: 'fix' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const commandPark = await waitFor(
        started.id,
        (record) =>
          record.state === 'waiting_for_approval' &&
          record.pendingApproval.kind === 'command'
      )

      await approveRun(started.id, commandPark.pendingApproval.id, { provider })

      const repairPark = await waitFor(
        started.id,
        (record) =>
          record.state === 'waiting_for_approval' &&
          record.pendingApproval.kind === 'repair'
      )

      const done = await rejectRun(started.id, repairPark.pendingApproval.id, {
        reason: 'I will fix it by hand.',
      })

      assert.equal(done.state, 'failed')
      assert.match(done.error.message, /declined/i)
      assert.equal(done.subtasks[0].state, 'failed')
      assert.equal(done.summary.verification, 'unverified')
    } finally {
      restore()
    }
  })

  it('refuses to overwrite files changed after the proposal', async () => {
    const restore = useTestKey()

    try {
      const root = await openWorkspace(CALC_FILES)
      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      // The user edits the file after the proposal was made.
      const newer = 'function add(a, b) { return Number(a) + Number(b) }\nmodule.exports = { add }\n'

      await fs.writeFile(path.join(root, 'src/calc.js'), newer)
      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'failed')
      assert.match(done.error.message, /stale|Pre-apply check blocked/i)
      // The newer user content survives untouched.
      assert.equal(await fs.readFile(path.join(root, 'src/calc.js'), 'utf8'), newer)
      assert.equal(done.appliedFiles.length, 0)
    } finally {
      restore()
    }
  })

  it('drops out-of-scope proposal edits and completes with a gap', async () => {
    const restore = useTestKey()

    try {
      const files = { ...CALC_FILES, 'src/other.js': 'module.exports = {}\n' }

      await openWorkspace(files)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/other.js', action: 'modify', content: 'module.exports = { pwned: true }\n', reason: 'unrelated' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      assert.equal(parked.proposals[0].editCount, 0)
      assert.equal(parked.proposals[0].droppedOutOfScope, 1)

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(done.appliedFiles.length, 0)
      assert.equal(done.summary.checkCounts.manualPending, 1)
      assert.match(done.summary.remainingIssues[0], /Manual verification pending/)
    } finally {
      restore()
    }
  })

  it('runs checks for verify-only subtasks with no edits', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const verifyOnly = {
        title: 'Verify the full suite',
        description: 'Run the suite without changing files.',
        files: ['src/calc.js'],
        dependsOn: [0],
        verification: 'node --version',
        completion: 'Suite passes.',
      }
      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask(), verifyOnly]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
        proposalAnswer([]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      assert.equal(parked.proposals[1].editCount, 0)
      assert.equal(parked.subtasks[1].state, 'pending')

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(done.subtasks[1].state, 'passed')
      assert.equal(done.checks.length, 2)
      assert.ok(done.checks.every((check) => check.conclusion === 'passed'))
      assert.equal(done.summary.verification, 'verified')
    } finally {
      restore()
    }
  })

  it('cancels a parked run and an in-flight run', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)
      const cancelled = await cancelRun(parked.id)

      assert.equal(cancelled.state, 'cancelled')

      // In-flight: gate the analysis call, cancel, then release.
      const gate = makeGate()
      const gated = new ScriptedProvider([{ answer: analysisAnswer(), gate }])

      await openWorkspace(CALC_FILES)

      const flying = await startRun({ task: 'Fix calc.', researchMode: 'off' }, { provider: gated })
      const deadline = Date.now() + 15000

      while (gated.calls.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      assert.equal(gated.calls.length, 1)

      const cancelAck = await cancelRun(flying.id)

      assert.ok(['cancelled', 'analyzing'].includes(cancelAck.state))
      gate.open()

      const done = await waitFor(flying.id, isTerminal)

      assert.equal(done.state, 'cancelled')
    } finally {
      restore()
    }
  })

  it('pauses between units and resumes where it parked', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const gate = makeGate()
      const provider = new ScriptedProvider([
        { answer: analysisAnswer(), gate },
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )
      const deadline = Date.now() + 15000

      while (provider.calls.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      assert.equal(provider.calls.length, 1)

      await pauseRun(started.id)
      gate.open()

      const paused = await waitFor(
        started.id,
        (record) => record.state === 'paused'
      )

      assert.equal(paused.prevState, 'planning')

      await resumeRun(started.id, { provider })

      const parked = await waitFor(started.id, isParked)

      assert.equal(parked.pendingApproval.kind, 'plan')

      // Parking while parked is a harmless note.
      const still = await pauseRun(started.id)

      assert.equal(still.state, 'waiting_for_approval')
    } finally {
      restore()
    }
  })

  it('continues without research when an optional session fails', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([
        analysisAnswer({ needsResearch: true, researchQuestions: ['How does add work?'] }),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const research = {
        start: async () => ({ id: 'rs-test-failed', status: 'running' }),
        status: async () => ({ status: 'failed', statusDetail: 'provider outage' }),
      }
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'auto' },
        { provider, research }
      )
      const parked = await waitFor(started.id, isParked)

      assert.equal(parked.researchSessionId, 'rs-test-failed')
      assert.ok(
        parked.events.some((event) =>
          event.message.includes('continuing without it')
        )
      )

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
    } finally {
      restore()
    }
  })

  it('fails honestly when required research fails', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([analysisAnswer()])
      const research = {
        start: async () => ({ id: 'rs-test-blocked', status: 'running' }),
        status: async () => ({ status: 'blocked', statusDetail: 'interrupted' }),
      }
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'required' },
        { provider, research }
      )
      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'failed')
      assert.match(done.error.message, /Required research blocked/)
    } finally {
      restore()
    }
  })

  it('transfers completed research as attributed, untrusted context', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const {
        createSession,
        writeSession,
      } = require('../research/session-store.cjs')
      const session = await createSession('How does add work?')

      session.status = 'completed'
      session.sources = [
        { title: 'Addition facts', url: 'https://example.com/add' },
      ]
      session.findings = [
        { claim: 'Addition combines numbers.', sourceIndexes: [1] },
      ]

      await writeSession(session)

      const provider = new ScriptedProvider([
        analysisAnswer({ needsResearch: true, researchQuestions: ['How does add work?'] }),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const research = {
        start: async () => ({ id: session.id, status: 'running' }),
        status: async () => ({ status: 'completed', sources: session.sources }),
      }
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'auto' },
        { provider, research }
      )
      const parked = await waitFor(started.id, isParked)

      assert.equal(parked.researchSessionId, session.id)
      assert.equal(parked.research.status, 'completed')
      assert.equal(parked.research.sources, 1)
      assert.ok(
        parked.events.some((event) =>
          event.message.includes('untrusted reference material')
        )
      )

      // The planner received the research session id (grounding), not
      // a pasted brief: findings stay cited reference material.
      const decomposerCall = provider.calls[1]

      assert.ok(
        decomposerCall.messages.some(
          (message) =>
            typeof message.content === 'string' &&
            message.content.includes('untrusted')
        )
      )
    } finally {
      restore()
    }
  })

  it('continues without chat context when enabled history is empty', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off', includeChat: true },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      // The preference is preserved on the record; nothing disables it.
      assert.equal(parked.includeChat, true)
      assert.ok(
        parked.events.some(
          (event) =>
            event.kind === 'note' &&
            event.message ===
              'No recent chat history available; continuing without chat context.'
        ),
        'expected the chat-omission timeline event'
      )
      // Planning used the remaining context: plan, proposal, and
      // verification precondition all survived.
      assert.ok(parked.planId)
      assert.equal(parked.proposals[0].editCount, 1)

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
      assert.equal(done.summary.verification, 'verified')
    } finally {
      restore()
    }
  })

  it('grounds planning on real chat history when enabled and present', async () => {
    const restore = useTestKey()

    try {
      const root = await openWorkspace(CALC_FILES)

      const seeded = await saveChat(
        [{ role: 'user', content: 'Totals must round half up.' }],
        { root }
      )

      assert.equal(seeded.saved, true)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off', includeChat: true },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      assert.ok(
        !parked.events.some((event) =>
          event.message.includes('continuing without chat context')
        ),
        'no omission event when history exists'
      )

      const decomposerCall = provider.calls[1]

      assert.ok(
        decomposerCall.messages.some(
          (message) =>
            typeof message.content === 'string' &&
            message.content.includes('round half up')
        ),
        'decomposer saw the real chat excerpt'
      )

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
    } finally {
      restore()
    }
  })

  it('emits no chat event when including chat is disabled', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off', includeChat: false },
        { provider }
      )
      const parked = await waitFor(started.id, isParked)

      assert.ok(
        !parked.events.some((event) =>
          event.message.includes('chat history available')
        )
      )

      await approveRun(started.id, parked.pendingApproval.id, { provider })

      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'completed')
    } finally {
      restore()
    }
  })

  it('fails planning per taxonomy when chat retrieval genuinely fails', async () => {
    const restore = useTestKey()

    try {
      const root = await openWorkspace(CALC_FILES)

      // A directory where the chat file belongs: retrieval fails for
      // real, which is not an empty history.
      await fs.mkdir(path.join(root, '.kryom', 'chat.json'), { recursive: true })

      const provider = new ScriptedProvider([analysisAnswer()])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off', includeChat: true },
        { provider }
      )
      const done = await waitFor(started.id, isTerminal)

      assert.equal(done.state, 'failed')
      assert.equal(done.error.phase, 'planning')
      assert.match(done.error.message, /Storage path is not a file/)
      assert.ok(
        !done.events.some((event) =>
          event.message.includes('continuing without chat context')
        ),
        'genuine failures are not reported as omissions'
      )
    } finally {
      restore()
    }
  })

  it('lists runs and validates inputs', async () => {
    const restore = useTestKey()

    try {
      await openWorkspace(CALC_FILES)

      const provider = new ScriptedProvider([
        analysisAnswer(),
        decompositionAnswer([calcSubtask()]),
        proposalAnswer([
          { path: 'src/calc.js', action: 'modify', content: FIXED_CALC, reason: 'x' },
        ]),
      ])
      const started = await startRun(
        { task: 'Fix calc.', researchMode: 'off' },
        { provider }
      )

      await waitFor(started.id, isParked)

      const listed = await listRuns()
      const found = listed.runs.find((run) => run.id === started.id)

      assert.ok(found)
      assert.equal(found.state, 'waiting_for_approval')
      assert.equal(found.subtasks.length, 1)

      await assert.rejects(() => getRun('ar-abc123-def456'), /not found/)
      await assert.rejects(
        () => rejectRun(started.id, 'bad', {}),
        /Invalid approval id/
      )
      await assert.rejects(() => getRunProposal(started.id, 7), /not found/)
      await assert.rejects(() => startRun({ task: '' }, { provider }), /task/)
      await assert.rejects(
        () => startRun({ task: 'x', researchMode: 'sometimes' }, { provider }),
        /research mode/
      )
      await assert.rejects(() => cancelRun('nope'), /Invalid agent run id/)
      await assert.rejects(() => pauseRun(started.id).then(() => resumeRun(started.id)), /only paused runs/)
    } finally {
      restore()
    }
  })
})
