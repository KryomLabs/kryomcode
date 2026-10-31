const { ipcMain } = require('electron')

const {
  planTask,
  applyEdits,
  cancelPlan,
} = require('../services/agent/agent.service.cjs')
const {
  listCheckpoints,
  undoCheckpoint,
} = require('../services/agent/checkpoint-store.cjs')
const {
  createPlan,
  listPlans,
  getPlan,
  setStepState,
  attachEvidence,
  recordVerification,
  cancelPlan: cancelTrackedPlan,
  resumePlan,
  completePlan,
} = require('../services/agent/plan-store.cjs')
const {
  assertPlainObject,
  assertNonEmptyString,
  assertOptionalString,
  assertStringArray,
  assertEnum,
} = require('../security/validate-input.cjs')
const {
  gatherSourceContext,
} = require('../services/agent/context.service.cjs')
const {
  startRepairCycle,
  proposeRepair,
  applyRepair,
  recordRepair,
  cancelRepair,
  getRepairCycle,
} = require('../services/agent/repair.service.cjs')

// Planning proposes; applying changes the disk. The renderer must show
// the plan and collect explicit approval before calling agent:apply.
// Commands in a plan are suggestions only and are never executed here.

function assertContextPaths(value) {
  if (value === undefined || value === null) {
    return undefined
  }

  return assertStringArray(value, 'context paths', {
    maxItems: 32,
    maxLength: 1000,
  })
}

module.exports = function registerAgentIPC({
  isTrustedSender,
}) {
  ipcMain.handle('agent:plan', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent task')
    assertNonEmptyString(payload.task, 'task', 4000)

    if (
      payload.includeChat !== undefined &&
      payload.includeChat !== null &&
      typeof payload.includeChat !== 'boolean'
    ) {
      throw new Error('Invalid includeChat flag: a boolean is required.')
    }

    return planTask({
      task: payload.task,
      model: assertOptionalString(payload.model, 'model', 100) ?? undefined,
      contextPaths: assertContextPaths(payload.contextPaths),
      researchSessionId:
        assertOptionalString(payload.researchSessionId, 'researchSessionId', 64) ?? undefined,
      includeChat: payload.includeChat === true,
    })
  })

  // Chat excerpt preview: shows what recent chat would reach the
  // model WITHOUT transmitting anything, mirroring agent:context.
  ipcMain.handle('agent:chat-excerpt', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    const { buildChatExcerpt } = require('../services/agent/context-snapshot.cjs')

    return buildChatExcerpt()
  })

  // Context preview: reports which selected files would reach the
  // model (and why others would not) WITHOUT sending contents, so
  // the user sees the selection before planning transmits anything.
  ipcMain.handle('agent:context', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent context request')

    const gathered = await gatherSourceContext(
      assertContextPaths(payload.paths) ?? []
    )

    return {
      files: gathered.files.map((file) => ({
        path: file.path,
        relativePath: file.relativePath,
        bytes: file.bytes,
      })),
      excluded: gathered.excluded,
      totalBytes: gathered.totalBytes,
    }
  })

  ipcMain.handle('agent:apply', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'apply payload')

    return applyEdits({
      edits: payload.edits,
      task: assertOptionalString(payload.task, 'task', 4000) ?? undefined,
    })
  })

  // Dependency-aware change sets (3B.6). Read-only analysis over
  // an approved edit batch; the service validates every entry and
  // the manifest only informs review and ordering — approval,
  // freshness, checkpoints, and rollback stay in the apply path.
  ipcMain.handle('agent:change-set', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'change-set request')

    if (!Array.isArray(payload.edits)) {
      throw new Error('Invalid change-set edits: an array is required.')
    }

    const { buildChangeSet } = require('../services/agent/change-set.cjs')

    // The baseline is advisory (stale-dependency warnings only); the
    // service ignores malformed shapes, so it passes through.
    return buildChangeSet(payload.edits, { baseline: payload.baseline ?? null })
  })

  ipcMain.handle('agent:checkpoints', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    return listCheckpoints()
  })

  ipcMain.handle('agent:undo', async (event, payload = {}) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    const options = payload && typeof payload === 'object' ? payload : {}

    return undoCheckpoint(
      assertOptionalString(options.checkpointId, 'checkpoint id', 80) ?? null
    )
  })

  ipcMain.handle('agent:cancel', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    return cancelPlan()
  })

  // Persistent execution plans (3A.3). Tracking turns an ephemeral
  // proposal into a plan record; step transitions and verification
  // reports then accumulate as the user-approved workflow proceeds.
  ipcMain.handle('agent:track-plan', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'track payload')
    assertPlainObject(payload.proposal, 'proposal')

    return createPlan(payload.proposal, {
      title: assertOptionalString(payload.title, 'title', 200) ?? undefined,
    })
  })

  ipcMain.handle('agent:plans', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    return listPlans()
  })

  ipcMain.handle('agent:plan-get', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'plan request')

    return getPlan(assertNonEmptyString(payload.id, 'id', 80))
  })

  ipcMain.handle('agent:plan-step', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'step update')

    return setStepState(
      assertNonEmptyString(payload.id, 'id', 80),
      assertNonEmptyString(payload.stepId, 'step id', 32),
      assertEnum(payload.state, 'state', [
        'pending',
        'in_progress',
        'completed',
        'verified',
        'blocked',
        'failed',
        'cancelled',
      ]),
      assertOptionalString(payload.detail, 'detail', 2000) ?? ''
    )
  })

  ipcMain.handle('agent:plan-evidence', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'evidence')
    assertPlainObject(payload.evidence, 'evidence entry')

    return attachEvidence(
      assertNonEmptyString(payload.id, 'id', 80),
      assertNonEmptyString(payload.stepId, 'step id', 32),
      {
        kind: assertEnum(payload.evidence.kind, 'kind', [
          'checkpoint',
          'report',
          'diagnostics',
          'file',
          'commit',
          'note',
          'research',
          'chat',
        ]),
        ref: assertNonEmptyString(payload.evidence.ref, 'ref', 1000),
        summary:
          assertOptionalString(payload.evidence.summary, 'summary', 500) ??
          undefined,
      }
    )
  })

  ipcMain.handle('agent:plan-verify', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'verification report')

    const input = {
      planId: assertNonEmptyString(payload.planId, 'plan id', 80),
      stepId: assertNonEmptyString(payload.stepId, 'step id', 32),
      check: assertNonEmptyString(payload.check, 'check', 200),
      result: assertEnum(payload.result, 'result', [
        'pass',
        'fail',
        'error',
        'skip',
        'not_executed',
      ]),
    }

    if (payload.exitCode !== undefined && payload.exitCode !== null) {
      if (typeof payload.exitCode !== 'number' || !Number.isInteger(payload.exitCode)) {
        throw new Error('Invalid exit code: an integer is required.')
      }

      input.exitCode = payload.exitCode
    }

    if (payload.timedOut !== undefined) {
      input.timedOut = payload.timedOut === true
    }

    if (payload.output !== undefined && payload.output !== null) {
      assertNonEmptyString(payload.output, 'output', 20000)
      input.output = payload.output
    }

    // Execution facts resolve from the cited run inside the store;
    // the boundary only checks the id shape so forgeries fail fast.
    if (payload.executionRunId !== undefined && payload.executionRunId !== null) {
      input.executionRunId = assertNonEmptyString(
        payload.executionRunId,
        'execution run id',
        80
      )
    }

    // The store re-validates the diagnosis and the model
    // explanation; the boundary only checks shapes.
    if (payload.diagnosis !== undefined && payload.diagnosis !== null) {
      assertPlainObject(payload.diagnosis, 'diagnosis')
      input.diagnosis = payload.diagnosis
    }

    if (
      payload.modelExplanation !== undefined &&
      payload.modelExplanation !== null
    ) {
      assertPlainObject(payload.modelExplanation, 'model explanation')
      input.modelExplanation = payload.modelExplanation
    }

    if (payload.markStep !== undefined && payload.markStep !== null) {
      input.markStep = assertEnum(payload.markStep, 'mark', [
        'verified',
        'failed',
        'blocked',
      ])
    }

    return recordVerification(input)
  })

  ipcMain.handle('agent:plan-cancel', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'plan cancel')

    return cancelTrackedPlan(
      assertNonEmptyString(payload.id, 'id', 80),
      assertOptionalString(payload.reason, 'reason', 2000) ?? ''
    )
  })

  ipcMain.handle('agent:plan-resume', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'plan resume')

    return resumePlan(assertNonEmptyString(payload.id, 'id', 80))
  })

  ipcMain.handle('agent:plan-complete', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'plan completion')

    return completePlan(assertNonEmptyString(payload.id, 'id', 80))
  })

  // Bounded repair cycles: the boundary checks shapes and trust;
  // caps, deadlines, and state transitions are enforced inside the
  // service, so forged renderers cannot bypass them.
  ipcMain.handle('agent:repair-start', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'repair start')

    const input = {
      planId: assertNonEmptyString(payload.planId, 'plan id', 80),
      check: assertNonEmptyString(payload.check, 'check', 200),
    }

    if (payload.stepId !== undefined && payload.stepId !== null) {
      input.stepId = assertNonEmptyString(payload.stepId, 'step id', 32)
    }

    if (payload.diagnosis !== undefined && payload.diagnosis !== null) {
      assertPlainObject(payload.diagnosis, 'diagnosis')
      input.diagnosis = payload.diagnosis
    }

    return startRepairCycle(input)
  })

  ipcMain.handle('agent:repair-propose', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'repair proposal')

    return proposeRepair({
      cycleId: assertNonEmptyString(payload.cycleId, 'cycle id', 80),
    })
  })

  ipcMain.handle('agent:repair-apply', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'repair apply')

    if (!Array.isArray(payload.edits)) {
      throw new Error('Invalid repair edits: an array is required.')
    }

    return applyRepair({
      cycleId: assertNonEmptyString(payload.cycleId, 'cycle id', 80),
      attemptId: assertNonEmptyString(payload.attemptId, 'attempt id', 100),
      edits: payload.edits,
      task: assertOptionalString(payload.task, 'task', 4000) ?? undefined,
    })
  })

  ipcMain.handle('agent:repair-record', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'repair record')

    return recordRepair({
      cycleId: assertNonEmptyString(payload.cycleId, 'cycle id', 80),
      attemptId: assertNonEmptyString(payload.attemptId, 'attempt id', 100),
      executionRunId: assertNonEmptyString(
        payload.executionRunId,
        'execution run id',
        80
      ),
    })
  })

  ipcMain.handle('agent:repair-cancel', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'repair cancel')

    const input = {
      cycleId: assertNonEmptyString(payload.cycleId, 'cycle id', 80),
    }

    if (payload.reason !== undefined && payload.reason !== null) {
      input.reason = assertEnum(payload.reason, 'reason', ['cancelled', 'approval-denied'])
    }

    return cancelRepair(input)
  })

  ipcMain.handle('agent:repair-get', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'repair status')

    return getRepairCycle(assertNonEmptyString(payload.cycleId, 'cycle id', 80))
  })

  // Intelligent implementation planning (3C.2). Builds structured,
  // dependency-aware plans grounded in project intelligence. Plans
  // persist for review and approval; nothing is executed here.
  ipcMain.handle('agent:impl-plan', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'planning request')

    const {
      buildImplementationPlan,
    } = require('../services/planning/plan-builder.cjs')

    if (
      payload.includeChat !== undefined &&
      payload.includeChat !== null &&
      typeof payload.includeChat !== 'boolean'
    ) {
      throw new Error('Invalid includeChat flag: a boolean is required.')
    }

    return buildImplementationPlan({
      requirement: assertNonEmptyString(payload.requirement, 'requirement', 4000),
      model: assertOptionalString(payload.model, 'model', 100) ?? undefined,
      contextPaths: assertContextPaths(payload.contextPaths),
      researchSessionId:
        assertOptionalString(payload.researchSessionId, 'researchSessionId', 64) ?? undefined,
      includeChat: payload.includeChat === true,
      title: assertOptionalString(payload.title, 'title', 200) ?? undefined,
    })
  })

  ipcMain.handle('agent:impl-plan-revise', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'revision request')

    const {
      reviseImplementationPlan,
    } = require('../services/planning/plan-builder.cjs')

    return reviseImplementationPlan({
      planId: assertNonEmptyString(payload.planId, 'plan id', 80),
      change: assertNonEmptyString(payload.change, 'change', 4000),
      model: assertOptionalString(payload.model, 'model', 100) ?? undefined,
    })
  })

  ipcMain.handle('agent:impl-plan-cancel', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    const {
      cancelPlanning,
    } = require('../services/planning/plan-builder.cjs')

    return cancelPlanning()
  })

  // Specialist agents (3C.3). Runs start detached and report through
  // their stored record; the coding specialist only proposes edits
  // and nothing here writes project sources.
  ipcMain.handle('agent:specialist-run', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'specialist request')

    const {
      runSpecialist,
    } = require('../services/specialists/specialist.service.cjs')

    if (
      payload.includeChat !== undefined &&
      payload.includeChat !== null &&
      typeof payload.includeChat !== 'boolean'
    ) {
      throw new Error('Invalid includeChat flag: a boolean is required.')
    }

    return runSpecialist({
      specialist: assertEnum(payload.specialist, 'specialist', [
        'research',
        'coding',
        'testing',
        'debugging',
        'security',
        'review',
      ]),
      task: assertNonEmptyString(payload.task, 'task', 4000),
      model: assertOptionalString(payload.model, 'model', 100) ?? undefined,
      contextPaths: assertContextPaths(payload.contextPaths),
      researchSessionId:
        assertOptionalString(payload.researchSessionId, 'researchSessionId', 64) ?? undefined,
      includeChat: payload.includeChat === true,
      context: assertOptionalString(payload.context, 'context', 4000) ?? undefined,
      planId: assertOptionalString(payload.planId, 'plan id', 80) ?? undefined,
    })
  })

  ipcMain.handle('agent:specialist-get', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'specialist status')

    const {
      getSpecialistRun,
    } = require('../services/specialists/specialist.service.cjs')

    return getSpecialistRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:specialist-cancel', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'specialist cancel')

    const {
      cancelSpecialistRun,
    } = require('../services/specialists/specialist.service.cjs')

    return cancelSpecialistRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:specialist-list', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    const {
      listSpecialistRuns,
    } = require('../services/specialists/specialist.service.cjs')

    return listSpecialistRuns()
  })

  // Controlled multi-agent orchestration (3C.4). Runs start from
  // approved plans only; specialists propose, humans approve each
  // merge, and all disk writes flow through the guarded apply path.
  ipcMain.handle('agent:orch-start', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'orchestration request')

    if (!Array.isArray(payload.tasks)) {
      throw new Error('Invalid tasks: an array is required.')
    }

    const {
      startRun,
    } = require('../services/orchestration/orchestrator.service.cjs')

    return startRun({
      planId: assertNonEmptyString(payload.planId, 'plan id', 80),
      tasks: payload.tasks.slice(0, 8).map((entry, index) => {
        assertPlainObject(entry, `tasks[${index}]`)

        return {
          specialist: assertEnum(entry.specialist, `tasks[${index}].specialist`, [
            'research',
            'coding',
            'testing',
            'debugging',
            'security',
            'review',
          ]),
          title: assertNonEmptyString(entry.title, `tasks[${index}].title`, 200),
          detail: assertOptionalString(entry.detail, `tasks[${index}].detail`, 4000) ?? undefined,
          files: entry.files === undefined || entry.files === null
            ? undefined
            : assertStringArray(entry.files, `tasks[${index}].files`, { maxItems: 10, maxLength: 1000 }),
          dependsOn: entry.dependsOn === undefined || entry.dependsOn === null
            ? undefined
            : entry.dependsOn,
          planStepId: assertOptionalString(entry.planStepId, `tasks[${index}].planStepId`, 32) ?? undefined,
        }
      }),
    })
  })

  ipcMain.handle('agent:orch-advance', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'orchestration advance')

    const {
      advanceRun,
    } = require('../services/orchestration/orchestrator.service.cjs')

    return advanceRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:orch-approve', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'orchestration approval')

    const {
      approveTask,
    } = require('../services/orchestration/orchestrator.service.cjs')

    return approveTask(
      assertNonEmptyString(payload.runId, 'run id', 80),
      assertNonEmptyString(payload.taskId, 'task id', 32)
    )
  })

  ipcMain.handle('agent:orch-retry', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'orchestration retry')

    const {
      retryTask,
    } = require('../services/orchestration/orchestrator.service.cjs')

    return retryTask(
      assertNonEmptyString(payload.runId, 'run id', 80),
      assertNonEmptyString(payload.taskId, 'task id', 32)
    )
  })

  ipcMain.handle('agent:orch-cancel', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'orchestration cancel')

    const {
      cancelRun,
    } = require('../services/orchestration/orchestrator.service.cjs')

    return cancelRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:orch-get', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'orchestration status')

    const {
      getRun,
    } = require('../services/orchestration/orchestrator.service.cjs')

    return getRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:orch-list', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    const {
      listRuns,
    } = require('../services/orchestration/orchestrator.service.cjs')

    return listRuns()
  })

  // Autonomous coding-agent runs (Milestone 3). The boundary checks
  // trust and shapes; the state machine, approvals, policy, budgets,
  // and persistence live in the service, so forged renderers cannot
  // bypass them. Approval ids are server-issued and single-use.
  ipcMain.handle('agent:run-start', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run request')

    const {
      startRun,
    } = require('../services/agent/autonomous-run.cjs')

    if (
      payload.includeChat !== undefined &&
      payload.includeChat !== null &&
      typeof payload.includeChat !== 'boolean'
    ) {
      throw new Error('Invalid includeChat flag: a boolean is required.')
    }

    return startRun({
      task: assertNonEmptyString(payload.task, 'task', 4000),
      model: assertOptionalString(payload.model, 'model', 100) ?? undefined,
      contextPaths: assertContextPaths(payload.contextPaths),
      researchMode:
        payload.researchMode === undefined || payload.researchMode === null
          ? undefined
          : assertEnum(payload.researchMode, 'research mode', ['off', 'auto', 'required']),
      includeChat: payload.includeChat === true,
    })
  })

  ipcMain.handle('agent:run-get', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run status')

    const {
      getRun,
    } = require('../services/agent/autonomous-run.cjs')

    return getRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:run-list', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    const {
      listRuns,
    } = require('../services/agent/autonomous-run.cjs')

    return listRuns()
  })

  ipcMain.handle('agent:run-proposal', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run proposal')

    if (
      typeof payload.subtask !== 'number' ||
      !Number.isInteger(payload.subtask) ||
      payload.subtask < 0 ||
      payload.subtask > 10
    ) {
      throw new Error('Invalid subtask index.')
    }

    const {
      getRunProposal,
    } = require('../services/agent/autonomous-run.cjs')

    return getRunProposal(
      assertNonEmptyString(payload.runId, 'run id', 80),
      payload.subtask
    )
  })

  ipcMain.handle('agent:run-cancel', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run cancel')

    const {
      cancelRun,
    } = require('../services/agent/autonomous-run.cjs')

    return cancelRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:run-pause', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run pause')

    const {
      pauseRun,
    } = require('../services/agent/autonomous-run.cjs')

    return pauseRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:run-resume', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run resume')

    const {
      resumeRun,
    } = require('../services/agent/autonomous-run.cjs')

    return resumeRun(assertNonEmptyString(payload.runId, 'run id', 80))
  })

  ipcMain.handle('agent:run-approve', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run approval')

    const {
      approveRun,
    } = require('../services/agent/autonomous-run.cjs')

    return approveRun(
      assertNonEmptyString(payload.runId, 'run id', 80),
      assertNonEmptyString(payload.approvalId, 'approval id', 80)
    )
  })

  ipcMain.handle('agent:run-reject', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized agent request.')
    }

    assertPlainObject(payload, 'agent run rejection')

    const {
      rejectRun,
    } = require('../services/agent/autonomous-run.cjs')

    return rejectRun(
      assertNonEmptyString(payload.runId, 'run id', 80),
      assertNonEmptyString(payload.approvalId, 'approval id', 80),
      {
        reason: assertOptionalString(payload.reason, 'reason', 2000) ?? undefined,
        revise: payload.revise === true,
      }
    )
  })
}
