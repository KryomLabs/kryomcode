// Milestone 3 end-to-end demo: drives a real autonomous agent run
// against a generated broken-calc fixture from the terminal.
//
// Usage:
//   node scripts/demo-agent-run.cjs --live       # real Meta API (needs MODEL_API_KEY)
//   node scripts/demo-agent-run.cjs --scripted   # deterministic canned answers, no key
//
// Live mode pauses at every approval gate and asks on stdin; every
// approval flows through the real service gates (nothing is
// pre-authorized). Scripted mode auto-approves through the same
// gates to demonstrate the full loop without credentials.
//
// The fixture is generated under the OS temp dir and the project is
// never modified. Exit code is 0 only when the run completes.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

const {
  setWorkspaceRoot,
} = require('../electron/services/workspace/workspace.service.cjs')
const {
  assertImplementsProvider,
} = require('../electron/services/ai/providers/provider.interface.cjs')
const {
  startRun,
  getRun,
  approveRun,
  rejectRun,
} = require('../electron/services/agent/autonomous-run.cjs')

const FIXED_CALC = 'function add(a, b) { return a + b }\nmodule.exports = { add }\n'

function scriptedAnswers() {
  return [
    JSON.stringify({
      outcome: 'Calc adds correctly and its test passes.',
      affectedFiles: ['src/calc.js'],
      risks: [],
      needsResearch: false,
      researchQuestions: [],
      validationCriteria: ['npm test'],
    }),
    JSON.stringify({
      objective: 'Fix calc.',
      expectedOutcome: 'Calc adds correctly and its test passes.',
      subtasks: [
        {
          title: 'Fix the add function',
          description: 'Correct the arithmetic in src/calc.js.',
          files: ['src/calc.js'],
          dependsOn: [],
          verification: 'npm test',
          completion: 'add() returns the sum and npm test passes.',
        },
      ],
      risks: [],
      assumptions: [],
    }),
    JSON.stringify({
      edits: [
        {
          path: 'src/calc.js',
          action: 'modify',
          content: FIXED_CALC,
          reason: 'Fix subtraction.',
        },
      ],
      commands: [],
      notes: 'demo proposal',
      expectedOutcome: 'fixed',
    }),
  ]
}

class ScriptedProvider {
  constructor(answers) {
    this.queue = [...answers]
    assertImplementsProvider(this, 'DemoScriptedProvider')
  }

  async chat({ model } = {}) {
    const answer = this.queue.shift()

    if (!answer) {
      throw new Error('Demo provider ran out of answers.')
    }

    return { answer, model: model || 'demo-scripted' }
  }
}

async function makeFixture() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kryom-demo-'))

  await fs.promises.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.promises.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'broken-calc-demo',
        scripts: { test: 'node --test test/*.test.js' },
      },
      null,
      2
    )
  )
  await fs.promises.writeFile(
    path.join(dir, 'src/calc.js'),
    'function add(a, b) { return a - b }\nmodule.exports = { add }\n'
  )
  await fs.promises.mkdir(path.join(dir, 'test'), { recursive: true })
  await fs.promises.writeFile(
    path.join(dir, 'test/calc.test.js'),
    "const test = require('node:test')\n" +
      "const assert = require('node:assert/strict')\n" +
      "const { add } = require('../src/calc.js')\n" +
      '\n' +
      "test('adds numbers', () => {\n" +
      '  assert.equal(add(2, 3), 5)\n' +
      '})\n'
  )

  return dir
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function describeApproval(approval) {
  const payload = approval.payload || {}

  if (approval.kind === 'plan') {
    return (
      `PLAN: ${(payload.subtasks || []).length} step(s), ` +
      `${payload.editCount || 0} edit(s) across ${(payload.files || []).length} file(s).\n` +
      (payload.files || [])
        .map((file) => `  ${file.action} ${file.path}`)
        .join('\n')
    )
  }

  if (approval.kind === 'command') {
    return (
      `COMMAND: ${payload.command}\n` +
      `  purpose: ${payload.purpose || '(none)'}\n` +
      `  policy: ${(payload.review && payload.review.reason) || '(none)'}`
    )
  }

  return (
    `REPAIR attempt ${payload.attempt} for ${payload.check}: ` +
    `${(payload.edits || []).length} edit(s).\n` +
    (payload.edits || [])
      .map((edit) => `  ${edit.action} ${edit.path}`)
      .join('\n')
  )
}

async function waitFor(runId, predicate, timeoutMs = 10 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const record = await getRun(runId)

    if (predicate(record)) {
      return record
    }

    if (Date.now() > deadline) {
      throw new Error(`Timed out in state ${record.state}.`)
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

async function main() {
  const scripted = process.argv.includes('--scripted')
  const live = process.argv.includes('--live') || !scripted

  if (live && !scripted && !process.env.MODEL_API_KEY) {
    console.error('Live demo needs MODEL_API_KEY in the environment.')
    console.error('Hint: node scripts/demo-agent-run.cjs --scripted needs no key.')
    process.exitCode = 2

    return
  }

  if (scripted && !process.env.MODEL_API_KEY) {
    // The scripted provider answers every model call; the key only
    // satisfies config validation and is never used on the network.
    process.env.MODEL_API_KEY = 'demo-scripted-key'
  }

  const fixture = await makeFixture()

  console.log(`Fixture project: ${fixture}`)

  await setWorkspaceRoot(fixture)

  const provider = scripted ? new ScriptedProvider(scriptedAnswers()) : undefined
  const options = provider ? { provider } : {}
  const started = await startRun(
    {
      task: 'Analyze this existing project, identify the cause of its failing tests, create a repair plan, review the affected files, implement the fix across all required files, run the relevant tests, repair any failures and provide a final verified summary.',
      researchMode: 'off',
    },
    options
  )

  console.log(`Run started: ${started.id}`)
  console.log('Follow the timeline below; approvals pause the run.\n')

  let seenEvents = 0

  for (;;) {
    const record = await waitFor(
      started.id,
      (entry) =>
        entry.state === 'waiting_for_approval' ||
        entry.state === 'completed' ||
        entry.state === 'failed' ||
        entry.state === 'cancelled'
    )

    for (const event of record.events.slice(seenEvents)) {
      console.log(`[${event.phase}] ${event.message}`)
    }

    seenEvents = record.events.length

    if (record.state === 'completed') {
      console.log('\n=== FINAL SUMMARY ===')
      console.log(`Verification: ${record.summary.verification}`)
      console.log(
        `Checks: ${record.summary.checkCounts.passed} passed, ` +
          `${record.summary.checkCounts.failed} failed, ` +
          `${record.summary.checkCounts.notExecuted} not executed, ` +
          `${record.summary.checkCounts.manualPending} manual-pending.`
      )
      console.log(`Files: ${record.summary.whatChanged.map((entry) => entry.label).join(', ')}`)

      for (const issue of record.summary.remainingIssues) {
        console.log(`Remaining: ${issue}`)
      }

      console.log(`Next: ${record.summary.suggestedNext}`)
      process.exitCode = record.summary.verification === 'verified' ? 0 : 1

      return
    }

    if (record.state === 'failed' || record.state === 'cancelled') {
      console.log(`\nRun ${record.state}: ${(record.error && record.error.message) || 'no detail'}`)
      process.exitCode = 1

      return
    }

    const approval = record.pendingApproval

    console.log(`\n--- APPROVAL (${approval.kind}) ---`)
    console.log(describeApproval(approval))

    if (scripted) {
      console.log('Scripted mode: approving through the real gate.\n')
      await approveRun(record.id, approval.id, options)
      continue
    }

    const answer = await ask('Approve? [y]es / [n]o / [r]evise (plan only): ')

    if (answer.toLowerCase().startsWith('y')) {
      await approveRun(record.id, approval.id, options)
      continue
    }

    const reason = await ask('Reason: ')
    const revise =
      approval.kind === 'plan' && answer.toLowerCase().startsWith('r')

    await rejectRun(record.id, approval.id, { reason, revise }, options)
  }
}

main().catch((error) => {
  console.error(`Demo failed: ${error.message}`)
  process.exitCode = 1
})
