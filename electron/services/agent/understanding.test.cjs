const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  setWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const {
  buildUnderstanding,
  checkBundleFreshness,
} = require('./understanding.cjs')

async function openWorkspace(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-understand-'))

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)

    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, content)
  }

  await setWorkspaceRoot(dir)

  return dir
}

const BILLING_FILES = {
  'package.json': JSON.stringify({
    name: 'billing-demo',
    scripts: { test: 'node --test', build: 'echo build' },
  }),
  'src/billing.js': 'function charge(amount) { return amount * 2 }\nmodule.exports = { charge }\n',
  'src/billing.test.js': "const t = require('node:test')\n",
  '.env': 'MODEL_API_KEY=super-secret-value',
  'credentials.json': '{"token": "secret"}',
}

describe('understanding', () => {
  it('builds a bounded bundle with inspected files and git state', async () => {
    const root = await openWorkspace(BILLING_FILES)
    const bundle = await buildUnderstanding('Fix the billing total calculation.')

    assert.equal(bundle.projectName, path.basename(root))
    assert.ok(bundle.projectType)
    assert.deepEqual(Object.keys(bundle.scripts).sort(), ['build', 'test'])
    assert.ok(bundle.generatedAt)
    assert.ok(bundle.brief.includes(bundle.projectName))
    // Git state is reported when discovery finds a repo, and never
    // fatal when it does not (ancestor repos make this
    // environment-dependent, so only the shape is asserted here).
    assert.equal(typeof bundle.git.available, 'boolean')

    if (bundle.git.available) {
      assert.ok(Array.isArray(bundle.git.staged))
      assert.ok(Array.isArray(bundle.git.unstaged))
      assert.ok(Array.isArray(bundle.git.untracked))
    } else {
      assert.ok(bundle.git.reason)
    }
    // Relevance retrieval ran against the real index.
    assert.ok(Array.isArray(bundle.relevantFiles))
    // Fresh workspace: index, architecture, and search all succeed.
    assert.deepEqual(bundle.failures, [])
    // Inspected contents are the only files the agent may claim.
    assert.ok(bundle.inspected.length > 0)
    assert.ok(bundle.inspected.length <= 8)

    for (const entry of bundle.inspected) {
      assert.match(entry.digest, /^[0-9a-f]{64}$/)
      assert.ok(
        bundle.contents.some((file) => file.relativePath === entry.relativePath)
      )
    }

    assert.ok(bundle.totalContextBytes <= 96 * 1024)
    assert.equal(bundle.diagnostics.baseline, 'not-executed')
  })

  it('reports git as unavailable outside any repository', async () => {
    const root = await openWorkspace(BILLING_FILES)
    const saved = process.env.GIT_CEILING_DIRECTORIES

    // Stop git discovery above the temp workspace so the temp dir is
    // never inside an ancestor repo, whatever the machine holds.
    // The ceiling names the parent: git refuses to ascend out of it.
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(root)

    try {
      const bundle = await buildUnderstanding('Fix the billing total.')

      assert.equal(bundle.git.available, false)
      assert.ok(bundle.git.reason)
    } finally {
      if (saved === undefined) {
        delete process.env.GIT_CEILING_DIRECTORIES
      } else {
        process.env.GIT_CEILING_DIRECTORIES = saved
      }
    }
  })

  it('never sends secrets or .env contents to the bundle', async () => {
    await openWorkspace(BILLING_FILES)

    const bundle = await buildUnderstanding('Rotate credentials', {
      contextPaths: ['.env', 'credentials.json', 'src/billing.js'],
    })

    const inspected = bundle.inspected.map((entry) => entry.relativePath)

    assert.ok(!inspected.includes('.env'))
    assert.ok(!inspected.includes('credentials.json'))
    assert.ok(inspected.includes('src/billing.js'))

    const blob = JSON.stringify(bundle.contents)

    assert.ok(!blob.includes('super-secret-value'))
    assert.ok(
      bundle.excluded.some((entry) => entry.path === '.env'),
      'expected .env in excluded'
    )
  })

  it('prefers user-selected files over relevance hits', async () => {
    await openWorkspace(BILLING_FILES)

    const bundle = await buildUnderstanding('billing', {
      contextPaths: ['src/billing.test.js'],
    })

    assert.ok(
      bundle.inspected.some(
        (entry) => entry.relativePath === 'src/billing.test.js'
      )
    )
  })

  it('detects stale and missing inspected files', async () => {
    const root = await openWorkspace(BILLING_FILES)
    const bundle = await buildUnderstanding('billing totals')

    assert.deepEqual(await checkBundleFreshness(bundle), [])

    await fs.writeFile(
      path.join(root, 'src/billing.js'),
      'function charge() { return 0 }\n'
    )
    await fs.unlink(path.join(root, 'src/billing.test.js'))

    const stale = await checkBundleFreshness(bundle)
    const byPath = new Map(stale.map((entry) => [entry.path, entry.status]))

    assert.equal(byPath.get('src/billing.js'), 'stale')
    assert.equal(byPath.get('src/billing.test.js'), 'missing')
  })

  it('rejects invalid bundles and traversal entries', async () => {
    await openWorkspace(BILLING_FILES)

    await assert.rejects(() => checkBundleFreshness(null), /Invalid understanding bundle/)
    await assert.rejects(() => buildUnderstanding(''), /task description is required/)
    await assert.rejects(
      () => buildUnderstanding('x'.repeat(4001)),
      /exceeds 4000/
    )

    const stale = await checkBundleFreshness({
      inspected: [{ relativePath: '../escape.js', digest: 'x' }],
    })

    assert.deepEqual(stale, [{ path: '../escape.js', status: 'invalid' }])
  })
})
