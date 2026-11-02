// Renderer-state regression gate (Level 3C). The unified tab model,
// Meta AI sessions, and the activity registry are pure TypeScript
// with zero imports, so this script compiles them with the project's
// own tsc into a temp dir and asserts their transitions with
// node:assert — no test runner dependency, no browser needed.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SOURCES = [
  'src/state/workbench-tabs.ts',
  'src/state/meta-sessions.ts',
  'src/components/activity-registry.ts',
  'src/components/meta-timeline.ts',
  'src/components/intent.ts',
  'src/components/history-relevance.ts',
]

function compile() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryom-workbench-'))

  execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
      ...SOURCES.map((entry) => path.join(ROOT, entry)),
      '--outDir', outDir,
      '--module', 'commonjs',
      '--target', 'es2022',
      '--moduleResolution', 'node',
      '--skipLibCheck',
    ],
    { cwd: ROOT, stdio: 'inherit' }
  )

  return outDir
}

function fakeStorage() {
  const data = new Map()

  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

function checkTabs(tabs) {
  const code = (p) => ({
    kind: 'code',
    id: tabs.codeTabId(p),
    path: p,
    content: 'a',
    savedContent: 'a',
    mtimeMs: 1,
  })
  const meta = (s) => ({ kind: 'meta-ai', id: tabs.metaTabId(s), sessionId: s })

  let state = tabs.initialWorkbench()

  assert.deepEqual(state.groups, [{ id: 'group-1', tabIds: [], activeId: null }])
  assert.equal(state.activeGroupId, 'group-1')

  state = tabs.openTab(state, code('C:/p/a.ts'))
  state = tabs.openTab(state, code('C:/p/b.ts'))
  state = tabs.openTab(state, meta('ms-1'))

  assert.equal(state.tabs.length, 3)
  assert.equal(tabs.getActiveGroup(state).activeId, 'meta-ai:ms-1')

  // Reopening only moves activation.
  state = tabs.openTab(state, code('C:/p/a.ts'))

  assert.equal(state.tabs.length, 3)
  assert.equal(tabs.getActiveGroup(state).activeId, 'code:C:/p/a.ts')

  // Code and Meta AI tabs share one strip, in open order.
  assert.deepEqual(
    tabs.groupTabs(state, tabs.getActiveGroup(state)).map((entry) => entry.kind),
    ['code', 'code', 'meta-ai']
  )

  // Dirty tracking is code-only; closing needs no session check.
  state = {
    ...state,
    tabs: tabs.updateCodeTab(state.tabs, 'code:C:/p/b.ts', { content: 'b2' }),
  }

  assert.equal(tabs.dirtyTabs(state.tabs).length, 1)
  assert.equal(tabs.isTabDirty(meta('ms-1')), false)

  // Close the middle tab: actives and neighbors heal.
  state = tabs.activateTab(state, 'group-1', 'code:C:/p/b.ts')
  state = tabs.closeTab(state, 'code:C:/p/b.ts')

  assert.equal(tabs.getActiveGroup(state).activeId, 'meta-ai:ms-1')
  assert.equal(state.tabs.length, 2)

  // Closing a Meta AI tab drops only its descriptor.
  state = tabs.closeTab(state, 'meta-ai:ms-1')

  assert.equal(state.tabs.length, 1)
  assert.equal(tabs.getActiveGroup(state).activeId, 'code:C:/p/a.ts')

  // Split duplicates the active tab into a second group.
  state = tabs.openTab(state, meta('ms-2'))
  state = tabs.splitGroupRight(state, 'group-1')

  assert.equal(state.groups.length, 2)
  assert.equal(state.groups[1].tabIds.length, 1)
  assert.equal(state.groups[1].activeId, 'meta-ai:ms-2')
  assert.equal(state.activeGroupId, state.groups[1].id)

  // Same record in both groups: edits stay in sync by construction.
  assert.equal(state.tabs.length, 2)

  state = tabs.closeGroup(state, state.groups[1].id)

  assert.equal(state.groups.length, 1)
  assert.equal(state.tabs.length, 2)

  // Rename re-points code tabs and their group references.
  state = tabs.openTab(state, code('C:/p/sub/c.ts'))
  state = tabs.repathCodeTabs(state, 'C:/p/sub', 'C:/p/moved')

  assert.ok(state.tabs.some((entry) => entry.path === 'C:/p/moved/c.ts'))
  assert.deepEqual(
    tabs.tabsUnderPath(state.tabs, 'C:/p/moved'),
    ['code:C:/p/moved/c.ts']
  )

  // Close-others keeps one tab and collects orphans.
  state = tabs.closeOtherTabs(state, 'group-1', 'code:C:/p/a.ts')

  assert.deepEqual(tabs.getActiveGroup(state).tabIds, ['code:C:/p/a.ts'])
  assert.equal(state.tabs.length, 1)

  // Split is capped; empty splits are refused.
  state = tabs.splitGroupRight(state, 'group-1')
  state = tabs.splitGroupRight(state, state.activeGroupId)

  assert.equal(state.groups.length, 3)

  const capped = tabs.splitGroupRight(state, state.activeGroupId)

  assert.equal(capped.groups.length, 3)

  const empty = tabs.initialWorkbench()

  assert.equal(tabs.splitGroupRight(empty, 'group-1').groups.length, 1)
  assert.equal(tabs.closeGroup(empty, 'group-1').groups.length, 1)
}

function checkSessions(sessions) {
  const created = sessions.createMetaSession('C:/proj', 'muse-spark-1.3')

  assert.equal(created.version, 1)
  assert.equal(created.title, 'New Task')
  assert.equal(created.root, 'C:/proj')
  assert.equal(created.messages.length, 0)
  assert.equal(created.planId, null)

  assert.equal(sessions.deriveSessionTitle('   '), 'New Task')
  assert.equal(sessions.deriveSessionTitle('  Fix  the\nbug  '), 'Fix the bug')

  const long = sessions.deriveSessionTitle('x'.repeat(200))

  assert.ok(long.length <= 80)

  const storage = fakeStorage()

  const first = {
    ...created,
    title: 'Inventory System',
    messages: [{ role: 'user', content: 'hi', at: new Date().toISOString() }],
    changedFiles: [
      { path: 'C:/proj/a.ts', action: 'modified', source: 'agent-apply', at: new Date().toISOString() },
    ],
  }

  sessions.saveMetaSession(first, storage)

  const loaded = sessions.loadMetaSessions('C:/proj', storage)

  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].title, 'Inventory System')
  assert.equal(loaded[0].messages.length, 1)
  assert.equal(loaded[0].changedFiles.length, 1)

  // Roots never mix.
  assert.equal(sessions.loadMetaSessions('C:/other', storage).length, 0)
  assert.equal(sessions.loadMetaSessions(null, storage).length, 0)

  // Changed files key by path: re-apply updates, never doubles.
  const recorded = sessions.recordChangedFiles(
    loaded[0],
    [
      { path: 'C:/proj/a.ts', action: 'modify' },
      { path: 'C:/proj/b.ts', action: 'create' },
      { path: 'C:/proj/gone.ts', action: 'delete' },
    ],
    'agent-apply'
  )

  assert.equal(recorded.changedFiles.length, 3)
  assert.deepEqual(
    recorded.changedFiles.map((entry) => entry.action),
    ['modified', 'added', 'deleted']
  )

  // Corrupt entries are dropped, never thrown.
  storage.setItem('kryom.meta-sessions.v1', JSON.stringify({
    'C:/proj': {
      [first.id]: { ...first, updatedAt: new Date().toISOString() },
      bad: { version: 1, id: 42 },
    },
  }))

  assert.equal(sessions.loadMetaSessions('C:/proj', storage).length, 1)

  // Deletion is explicit and total.
  sessions.deleteMetaSession('C:/proj', first.id, storage)

  assert.equal(sessions.loadMetaSessions('C:/proj', storage).length, 0)

  // Buckets evict oldest-first past 20 sessions.
  const evict = fakeStorage()

  for (let n = 0; n < 21; n += 1) {
    const entry = sessions.createMetaSession('C:/proj', 'm')

    entry.id = `ms-evict-${String(n).padStart(2, '0')}`
    entry.updatedAt = new Date(Date.now() + n * 1000).toISOString()
    sessions.saveMetaSession(entry, evict)
  }

  const survivors = sessions.loadMetaSessions('C:/proj', evict)

  assert.equal(survivors.length, 20)
  assert.ok(!survivors.some((entry) => entry.id === 'ms-evict-00'))
}

function checkRegistry(registry) {
  registry.__resetActivityRegistry()
  registry.registerBuiltinActivities()

  const builtins = registry.listActivities()
  const ids = builtins.map((entry) => entry.id)

  for (const id of ['explorer', 'search', 'git', 'run', 'extensions', 'ai-workspace', 'knowledge', 'history']) {
    assert.ok(ids.includes(id), `missing builtin activity ${id}`)
  }

  assert.equal(builtins.length, 8)

  // Sidebar areas drive the left sidebar, aside areas the right dock.
  const areas = Object.fromEntries(builtins.map((entry) => [entry.id, entry.area]))

  assert.deepEqual(areas, {
    explorer: 'sidebar',
    search: 'sidebar',
    git: 'sidebar',
    run: 'sidebar',
    extensions: 'sidebar',
    'ai-workspace': 'aside',
    knowledge: 'aside',
    history: 'aside',
  })

  // Sorted by order.
  const orders = builtins.map((entry) => entry.order)

  assert.deepEqual([...orders].sort((a, b) => a - b), orders)

  // Future modules register without touching the shell.
  registry.registerActivity({
    id: 'demo-tool',
    label: 'Demo Tool',
    paths: ['M4 4h16v16H4z'],
    area: 'sidebar',
    order: 65,
  })

  assert.equal(registry.hasActivity('demo-tool'), true)
  assert.equal(registry.getActivity('demo-tool')?.label, 'Demo Tool')

  assert.throws(
    () => registry.registerActivity({
      id: 'demo-tool',
      label: 'Dup',
      paths: ['M4 4h16v16H4z'],
      area: 'sidebar',
      order: 66,
    }),
    /already registered/
  )

  for (const bad of [
    { id: 'Bad', label: 'x', paths: ['M1 1h1v1H1z'], area: 'sidebar', order: 1 },
    { id: 'ok-id', label: '', paths: ['M1 1h1v1H1z'], area: 'sidebar', order: 1 },
    { id: 'ok-id', label: 'x', paths: [], area: 'sidebar', order: 1 },
    { id: 'ok-id', label: 'x', paths: ['M1 1h1v1H1z'], area: 'nope', order: 1 },
  ]) {
    assert.throws(() => registry.registerActivity(bad), /Invalid activity/)
  }

  assert.equal(registry.unregisterActivity('demo-tool'), true)
  assert.equal(registry.hasActivity('demo-tool'), false)

  registry.__resetActivityRegistry()
}

function checkTimeline(timeline) {
  const events = timeline.buildTimeline({
    sessionCreatedAt: '2026-10-30T10:00:00.000Z',
    sessionTitle: 'Inventory System',
    messages: [
      { role: 'user', content: 'Add stock alerts', at: '2026-10-30T10:01:00.000Z' },
      { role: 'assistant', content: 'Done.', model: 'muse-spark-1.3', at: '2026-10-30T10:02:00.000Z' },
      { role: 'user', content: 'undated entry', at: 'not-a-date' },
    ],
    plan: {
      title: 'Alerts plan',
      status: 'active',
      verification: 'partial',
      createdAt: '2026-10-30T10:03:00.000Z',
      steps: [
        { label: 'Review', state: 'completed', startedAt: '2026-10-30T10:03:01.000Z', finishedAt: '2026-10-30T10:04:00.000Z', detail: 'ok' },
        { label: 'Apply', state: 'in_progress', startedAt: null, finishedAt: null },
      ],
      reports: [
        { check: 'npm test', conclusion: 'passed', at: '2026-10-30T10:05:00.000Z' },
      ],
    },
    research: {
      objective: 'alert patterns',
      status: 'completed',
      updatedAt: '2026-10-30T10:06:00.000Z',
      sources: 4,
      steps: [
        { label: 'Search', status: 'done', finishedAt: '2026-10-30T10:05:30.000Z' },
        { label: 'Synthesize', status: 'running', finishedAt: null },
      ],
    },
    orchRun: {
      id: 'or-1',
      state: 'active',
      planTitle: 'Alerts plan',
      history: [
        { at: '2026-10-30T10:04:30.000Z', kind: 'task-proposed', task: 'task-1' },
      ],
    },
    changedFiles: [
      { path: 'C:/p/a.ts', action: 'modified', source: 'agent-apply', at: '2026-10-30T10:04:45.000Z' },
    ],
  })

  // Undated entries (bad message date, unstarted step, running
  // research step) never appear; everything else sorts by time.
  assert.ok(events.length >= 9)
  assert.equal(events[0].kind, 'session')

  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index - 1].at <= events[index].at)
  }

  assert.ok(events.some((entry) => entry.kind === 'verification' && /passed/.test(entry.label)))
  assert.ok(events.some((entry) => entry.kind === 'file' && /Modified/.test(entry.label)))
  assert.ok(!events.some((entry) => /undated entry/.test(entry.label ?? '')))

  assert.equal(timeline.classifyAIError('Meta AI request was cancelled.'), 'cancelled')
  assert.equal(timeline.classifyAIError('Meta API key is not configured. Add your key.'), 'missing-key')
  assert.equal(timeline.classifyAIError('Meta API authentication failed. Check key.'), 'auth')
  assert.equal(timeline.classifyAIError('Meta API rate limit reached.'), 'rate-limit')
  assert.equal(timeline.classifyAIError('Check your network connection and try again.'), 'network')
  assert.equal(timeline.classifyAIError('Something else broke.'), 'unknown')
}

function checkIntent(intent) {
  // Routing table: ordinary questions stay in chat.
  assert.equal(intent.classifyIntent('Explain what a closure is'), 'chat')
  assert.equal(
    intent.classifyIntent('Ask a question about this code: what does it do?'),
    'chat'
  )
  assert.equal(intent.classifyIntent(''), 'chat')
  assert.equal(intent.classifyIntent('   '), 'chat')

  // Research signals stay in research.
  assert.equal(
    intent.classifyIntent('Research retry strategies for flaky networks'),
    'research'
  )
  assert.equal(
    intent.classifyIntent('Compare REST vs gRPC for this service'),
    'research'
  )
  assert.equal(
    intent.classifyIntent('What are the best practices for API versioning?'),
    'research'
  )

  // Strong coding actions route to the agent.
  assert.equal(intent.classifyIntent('Create a file server.py'), 'agent')
  assert.equal(
    intent.classifyIntent('Generate the validation code for signup'),
    'agent'
  )
  assert.equal(intent.classifyIntent('Implement the login feature'), 'agent')
  assert.equal(intent.classifyIntent('Fix the bug in auth.ts'), 'agent')
  assert.equal(intent.classifyIntent('Debug and fix the failing test'), 'agent')
  assert.equal(intent.classifyIntent('Refactor the user service logic'), 'agent')
  assert.equal(intent.classifyIntent('Run the project implementation'), 'agent')
  assert.equal(intent.classifyIntent('Plan and implement stock alerts'), 'agent')

  // Ambiguous input stays put: questions about code are chat, not
  // agent work, even when they mention files or bugs.
  assert.equal(
    intent.classifyIntent('Why does this function return undefined?'),
    'chat'
  )
  assert.equal(
    intent.classifyIntent('What causes this error message?'),
    'chat'
  )
  assert.equal(
    intent.classifyIntent('How does authentication work here?'),
    'chat'
  )
}

function checkHistoryRelevance(relevance) {
  // Overlap wins; ties keep recency (input) order.
  assert.equal(
    relevance.scoreHistoryCandidate('Add stock alerts', {
      id: 'a',
      text: 'Inventory System stock alerts plan',
    }),
    2
  )
  assert.equal(
    relevance.scoreHistoryCandidate('Add stock alerts', {
      id: 'b',
      text: 'Unrelated website redesign notes',
    }),
    0
  )

  // Stop words and short tokens never score.
  assert.equal(
    relevance.scoreHistoryCandidate('the and of it', {
      id: 'c',
      text: 'the and of it to be',
    }),
    0
  )
  assert.equal(relevance.scoreHistoryCandidate('', { id: 'd', text: 'x' }), 0)

  const ranked = relevance.rankHistoryCandidates('retry strategies', [
    { id: 'old', text: 'website colors' },
    { id: 'match', text: 'Retry strategies for flaky networks' },
    { id: 'partial', text: 'network retry helper' },
  ])

  assert.deepEqual(
    ranked.map((entry) => entry.id),
    ['match', 'partial', 'old']
  )

  // Empty query preserves input order.
  assert.deepEqual(
    relevance
      .rankHistoryCandidates('', [
        { id: 'one', text: 'alpha' },
        { id: 'two', text: 'beta' },
      ])
      .map((entry) => entry.id),
    ['one', 'two']
  )
}

function checkHistoryRefs(sessions) {
  const created = sessions.createMetaSession('C:/proj', 'muse-spark-1.3')

  assert.deepEqual(created.historyRefs, [])

  const storage = fakeStorage()
  const withRefs = {
    ...created,
    historyRefs: [
      { kind: 'research', id: 'rs-1', label: 'Retry strategies' },
      { kind: 'agent', id: 'ms-9', label: 'Inventory System' },
      { kind: 'chat', id: 'C:/proj', label: 'Project chat' },
    ],
  }

  sessions.saveMetaSession(withRefs, storage)

  const loaded = sessions.loadMetaSessions('C:/proj', storage)

  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].historyRefs.length, 3)
  assert.equal(loaded[0].historyRefs[0].kind, 'research')

  // Pre-history records load with empty refs; malformed refs drop.
  storage.setItem('kryom.meta-sessions.v1', JSON.stringify({
    'C:/proj': {
      legacy: { ...created, id: 'ms-legacy', historyRefs: undefined },
      mixed: {
        ...created,
        id: 'ms-mixed',
        historyRefs: [
          { kind: 'research', id: 'rs-2', label: 'ok' },
          { kind: 'nope', id: 'x', label: 'bad kind' },
          { kind: 'agent', id: 42, label: 'bad id' },
          null,
        ],
      },
    },
  }))

  const reloaded = sessions.loadMetaSessions('C:/proj', storage)
  const legacy = reloaded.find((entry) => entry.id === 'ms-legacy')
  const mixed = reloaded.find((entry) => entry.id === 'ms-mixed')

  assert.deepEqual(legacy.historyRefs, [])
  assert.deepEqual(
    mixed.historyRefs.map((entry) => entry.id),
    ['rs-2']
  )
}

function main() {
  const outDir = compile()

  // tsc preserves the longest common source prefix (src/), so outputs
  // land in state/ and components/ subdirectories.
  const tabs = require(path.join(outDir, 'state', 'workbench-tabs.js'))
  const sessions = require(path.join(outDir, 'state', 'meta-sessions.js'))
  const registry = require(
    path.join(outDir, 'components', 'activity-registry.js')
  )

  const timeline = require(
    path.join(outDir, 'components', 'meta-timeline.js')
  )
  const intent = require(
    path.join(outDir, 'components', 'intent.js')
  )
  const relevance = require(
    path.join(outDir, 'components', 'history-relevance.js')
  )

  checkTabs(tabs)
  checkSessions(sessions)
  checkRegistry(registry)
  checkTimeline(timeline)
  checkIntent(intent)
  checkHistoryRelevance(relevance)
  checkHistoryRefs(sessions)

  fs.rmSync(outDir, { recursive: true, force: true })
  process.stdout.write('Workbench state: tabs, sessions, activity registry, timeline, intent, and history relevance ok.\n')
}

main()
