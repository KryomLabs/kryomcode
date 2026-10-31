const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  setWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const {
  MockProvider,
} = require('../ai/providers/mock.provider.cjs')
const {
  refreshIndex,
} = require('../project-intelligence/code-index.service.cjs')
const {
  saveChat,
} = require('../ai/chat-store.cjs')
const {
  getPlan,
  setStepState,
} = require('../agent/plan-store.cjs')
const {
  buildImplementationPlan,
  reviseImplementationPlan,
  cancelPlanning,
} = require('./plan-builder.cjs')

const SAVED_KEY = process.env.MODEL_API_KEY

afterEach(() => {
  if (SAVED_KEY === undefined) {
    delete process.env.MODEL_API_KEY
  } else {
    process.env.MODEL_API_KEY = SAVED_KEY
  }
})

function decomposition(subtasks) {
  return JSON.stringify({
    objective: 'Add login',
    expectedOutcome: 'Users can log in.',
    subtasks,
    risks: [
      { severity: 'low', explanation: 'Minor UI churn.', mitigation: 'Review diffs.' },
    ],
    assumptions: ['Auth module exists.'],
  })
}

async function openFixture() {
  process.env.MODEL_API_KEY = 'test-key'
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-plan-'))
  await fs.mkdir(path.join(root, 'src'), { recursive: true })
  await fs.writeFile(path.join(root, 'src', 'auth.ts'), 'export class Auth {}\n')
  await fs.writeFile(path.join(root, 'src', 'app.ts'), 'import "./auth"\n')
  await setWorkspaceRoot(root)
  await refreshIndex()

  return root
}

describe('plan-builder', () => {
  it('builds an ordered plan grounded in project evidence', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Add login method',
          description: 'Implement login on Auth.',
          files: ['src/auth.ts'],
          dependsOn: [],
          verification: 'npm test',
          completion: 'login works',
        },
        {
          title: 'Wire login UI',
          description: 'Call login from app.',
          files: ['src/app.ts'],
          dependsOn: [0],
          verification: 'npm test',
          completion: 'UI calls login',
        },
      ]),
    })

    const result = await buildImplementationPlan(
      { requirement: 'Add user login' },
      { provider }
    )

    assert.equal(result.decomposition.subtasks.length, 2)
    assert.deepEqual(result.executionOrder, [0, 1])
    assert.equal(result.parallelGroups.length, 2)
    assert.equal(result.plan.steps.length, 5)
    assert.ok(result.plan.id.startsWith('pl-'))
    assert.equal(provider.calls.length, 1)
    assert.ok(
      provider.lastCall.messages.some((entry) =>
        String(entry.content).includes('Project evidence')
      )
    )
  })

  it('fails loudly on empty chat history when chat is required', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Add login method',
          description: 'Implement login on Auth.',
          files: ['src/auth.ts'],
          dependsOn: [],
          verification: 'npm test',
          completion: 'login works',
        },
      ]),
    })

    // Explicit requests keep the strict contract: no silent omission.
    await assert.rejects(
      () =>
        buildImplementationPlan(
          { requirement: 'Add user login', includeChat: true },
          { provider }
        ),
      /No chat history/
    )
    await assert.rejects(
      () =>
        buildImplementationPlan(
          { requirement: 'x', includeChat: true, chatRequired: 'yes' },
          { provider }
        ),
      /Invalid chatRequired flag/
    )
  })

  it('omits empty chat history when chat is optional', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Add login method',
          description: 'Implement login on Auth.',
          files: ['src/auth.ts'],
          dependsOn: [],
          verification: 'npm test',
          completion: 'login works',
        },
      ]),
    })

    const result = await buildImplementationPlan(
      { requirement: 'Add user login', includeChat: true, chatRequired: false },
      { provider }
    )

    assert.equal(result.chatOmitted, true)
    assert.equal(result.decomposition.subtasks.length, 1)
    assert.ok(result.plan.id.startsWith('pl-'))
    // Nothing fabricated: the decomposer saw no chat block at all.
    assert.ok(
      !provider.lastCall.messages.some((entry) =>
        String(entry.content).includes('Recent chat')
      )
    )
  })

  it('grounds on real chat history when chat is optional and present', async () => {
    const root = await openFixture()

    await saveChat(
      [{ role: 'user', content: 'We chose session cookies.' }],
      { root }
    )

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Add login method',
          description: 'Implement login on Auth.',
          files: ['src/auth.ts'],
          dependsOn: [],
          verification: 'npm test',
          completion: 'login works',
        },
      ]),
    })

    const result = await buildImplementationPlan(
      { requirement: 'Add user login', includeChat: true, chatRequired: false },
      { provider }
    )

    assert.equal(result.chatOmitted, false)
    assert.ok(
      provider.lastCall.messages.some((entry) =>
        String(entry.content).includes('session cookies')
      )
    )

    const stored = await getPlan(result.plan.id)

    assert.equal(stored.context.chat.messageCount, 1)
  })

  it('reports no omission when chat is not requested', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Add login method',
          description: 'Implement login on Auth.',
          files: ['src/auth.ts'],
          dependsOn: [],
          verification: 'npm test',
          completion: 'login works',
        },
      ]),
    })

    const result = await buildImplementationPlan(
      { requirement: 'Add user login' },
      { provider }
    )

    assert.equal(result.chatOmitted, false)
  })

  it('groups independent disjoint work for parallel execution', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Task A', description: 'a', files: ['src/auth.ts'],
          dependsOn: [], verification: 'npm test', completion: 'a done',
        },
        {
          title: 'Task B', description: 'b', files: ['src/app.ts'],
          dependsOn: [], verification: 'npm test', completion: 'b done',
        },
      ]),
    })

    const result = await buildImplementationPlan(
      { requirement: 'Two independent tasks' },
      { provider }
    )

    assert.equal(result.parallelGroups.length, 1)
    assert.equal(result.parallelGroups[0].parallel, true)
    assert.deepEqual(result.parallelGroups[0].subtasks.sort(), [0, 1])
  })

  it('sequences shared-file conflicts and reports them', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Task A', description: 'a', files: ['src/auth.ts'],
          dependsOn: [], verification: 'npm test', completion: 'a done',
        },
        {
          title: 'Task B', description: 'b', files: ['src/auth.ts'],
          dependsOn: [], verification: 'npm test', completion: 'b done',
        },
      ]),
    })

    const result = await buildImplementationPlan(
      { requirement: 'Conflicting tasks' },
      { provider }
    )

    assert.equal(result.sharedFileConflicts.length, 1)
    assert.equal(result.sharedFileConflicts[0].file, 'src/auth.ts')
    assert.equal(result.parallelGroups.length, 2)
  })

  it('rejects cyclic dependencies instead of producing an order', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Task A', description: 'a', files: [],
          dependsOn: [1], verification: 'x', completion: 'a',
        },
        {
          title: 'Task B', description: 'b', files: [],
          dependsOn: [0], verification: 'x', completion: 'b',
        },
      ]),
    })

    await assert.rejects(
      () => buildImplementationPlan({ requirement: 'cycle' }, { provider }),
      /cycle/
    )
  })

  it('drops invalid dependency edges and reports them', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Task A', description: 'a', files: [],
          dependsOn: [9, 0], verification: 'x', completion: 'a',
        },
      ]),
    })

    const result = await buildImplementationPlan(
      { requirement: 'bad edges' },
      { provider }
    )

    assert.equal(result.decomposition.droppedEdges.length, 2)
    assert.deepEqual(result.executionOrder, [0])
  })

  it('revises a plan into a new record and preserves completed work', async () => {
    await openFixture()

    const provider = new MockProvider({
      answer: decomposition([
        {
          title: 'Task A', description: 'a', files: ['src/auth.ts'],
          dependsOn: [], verification: 'npm test', completion: 'a done',
        },
      ]),
    })

    const built = await buildImplementationPlan(
      { requirement: 'Original' },
      { provider }
    )

    await setStepState(built.plan.id, 'review', 'in_progress')
    await setStepState(built.plan.id, 'review', 'completed')

    const reviser = new MockProvider({
      answer: decomposition([
        {
          title: 'Task B', description: 'b', files: ['src/app.ts'],
          dependsOn: [], verification: 'npm test', completion: 'b done',
        },
      ]),
    })

    const revised = await reviseImplementationPlan(
      { planId: built.plan.id, change: 'Also update the app.' },
      { provider: reviser }
    )

    assert.notEqual(revised.plan.id, built.plan.id)
    assert.equal(revised.revises, built.plan.id)
    assert.equal(revised.preservedCompleted.length, 1)
    assert.equal(revised.preservedCompleted[0].id, 'review')

    const original = await getPlan(built.plan.id)

    assert.equal(original.steps[0].state, 'completed')
    assert.ok(original.title.indexOf('Revision') === -1)
  })

  it('supports cancellation of an in-flight decomposition', async () => {
    await openFixture()

    const provider = new MockProvider({ answer: 'never', delayMs: 5000 })
    const pending = buildImplementationPlan(
      { requirement: 'slow plan' },
      { provider }
    )

    for (let i = 0; i < 200 && provider.calls.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    assert.equal(provider.calls.length, 1)

    const outcome = cancelPlanning()

    assert.equal(outcome.cancelled, true)
    await assert.rejects(() => pending, /cancel/i)
  })
})
