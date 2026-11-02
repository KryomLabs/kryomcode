import { useEffect, useRef, useState } from 'react'
import { kryom, errorMessage, isCancelError } from '../api/kryom'
import { resolveAgainstRoot } from '../utils/paths'
import { logOutput } from '../utils/output-log'
import { confirmCommandRun } from '../utils/command-confirm'
import { useDialogs } from './dialogs'

export interface ProblemsPanelProps {
  workspaceRoot: string | null
  requireConfirmAll: boolean
  scripts: string[]
  onOpenFileAtLine: (path: string, line: number) => void
  onStatus: (status: string) => void
  pendingRun?: { nonce: number } | null
  onResult?: (count: number, success: boolean) => void
  onDiagnostics?: (result: KryomDiagnosticsResult | null) => void
  // Explains one diagnostic in home chat. Absent = no Ask AI button.
  onExplainDiagnostic?: (report: {
    diagnostic: KryomDiagnostic
    command: string
  }) => void
}

function suggestCommand(scripts: string[]): string {
  if (scripts.includes('build')) {
    return 'npm run build'
  }

  if (scripts.includes('test')) {
    return 'npm run test'
  }

  return 'npm test'
}

export function ProblemsPanel(props: ProblemsPanelProps) {
  const dialogs = useDialogs()
  const [command, setCommand] = useState('')
  const [result, setResult] = useState<KryomDiagnosticsResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!command && props.scripts.length > 0) {
      setCommand(suggestCommand(props.scripts))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scripts])

  function resolvePath(file: string): string {
    return resolveAgainstRoot(props.workspaceRoot, file)
  }

  const resultRef = useRef(props.onResult)
  resultRef.current = props.onResult
  const diagnosticsRef = useRef(props.onDiagnostics)
  diagnosticsRef.current = props.onDiagnostics

  useEffect(() => {
    setResult(null)
    setError('')
    diagnosticsRef.current?.(null)
  }, [props.workspaceRoot])

  async function run(override?: string) {
    const trimmed = (override ?? command).trim()

    if (!props.workspaceRoot || running || !trimmed) {
      return
    }

    const approved = await confirmCommandRun(trimmed, {
      requireConfirmAll: props.requireConfirmAll,
      classify: (text) =>
        kryom()
          .classifyCommand(text)
          .then((result) => result.warnings),
      confirm: (title, message, confirmLabel) =>
        dialogs.confirm({ title, message, confirmLabel, danger: true }),
    })

    if (!approved) {
      props.onStatus('Diagnostics run cancelled')
      return
    }

    setRunning(true)
    setError('')

    try {
      const next = await kryom().runDiagnostics({ command: trimmed })
      setResult(next)
      props.onStatus(
        next.cancelled
          ? 'Diagnostics cancelled'
          : next.success
            ? `Diagnostics passed (${next.diagnostics.length} problem(s))`
            : 'Diagnostics failed'
      )
      resultRef.current?.(next.diagnostics.length, next.success)
      // One-line Debug Console summary (Phase D1, decision D4). The
      // full output stays in this panel's raw-output view; only run
      // metadata crosses into the shared output log.
      logOutput(
        'debug',
        `${trimmed} → exit ${next.exitCode} · ${next.diagnostics.length} problem(s)` +
          (next.cancelled ? ' · cancelled' : '') +
          (next.timedOut ? ' · timed out' : '')
      )
      diagnosticsRef.current?.(next)
    } catch (e) {
      setResult(null)
      setError(errorMessage(e))
      diagnosticsRef.current?.(null)
      // Main-process approval declines (native dialog Cancel) land
      // here as cancellations, not failures. React batches the clear
      // with the set above, so no error flashes.
      if (isCancelError(e)) {
        setError('')
        props.onStatus('Diagnostics run cancelled')
      }
    } finally {
      setRunning(false)
    }
  }

  // Diagnostics runs carry the 'diagnostics' origin, so Stop
  // uses the scoped diagnostics cancel channel (never kill-all).
  function stop() {
    if (!running) {
      return
    }

    kryom().cancelDiagnostics().catch(() => undefined)
  }

  // Per-tab Clear (Phase D1): drops the last result and its editor
  // markers/badge via the existing null-result path. The status bar
  // keeps describing the last completed run.
  function clearResults() {
    if (running) {
      return
    }

    setResult(null)
    setError('')
    diagnosticsRef.current?.(null)
    props.onStatus('Problems cleared')
  }

  // External runs (Run menu / F5) use the current command, falling
  // back to the suggested command when the input is still empty.
  const consumedRunNonce = useRef<number | null>(null)

  useEffect(() => {
    const pending = props.pendingRun

    if (
      !pending ||
      consumedRunNonce.current === pending.nonce ||
      !props.workspaceRoot
    ) {
      return
    }

    consumedRunNonce.current = pending.nonce
    void run(command.trim() ? undefined : suggestCommand(props.scripts))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pendingRun, props.workspaceRoot])

  return (
    <section className="problems-panel bottom-tab-panel">
      <form
        className="terminal-input"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <input
          aria-label="Build or test command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={
            props.workspaceRoot ? 'npm run build' : 'Open a project first…'
          }
          disabled={!props.workspaceRoot || running}
        />
        <button
          type="submit"
          disabled={!props.workspaceRoot || running || !command.trim()}
        >
          {running ? 'Running…' : 'Run'}
        </button>
        <button type="button" disabled={!running} onClick={stop}>
          Stop
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={running || (!result && !error)}
          onClick={clearResults}
          title="Clear problems results"
        >
          Clear
        </button>
      </form>

      {props.scripts.length > 0 && (
        <div className="script-chips">
          {props.scripts.slice(0, 8).map((script) => (
            <button
              key={script}
              type="button"
              className="secondary-button"
              disabled={running}
              onClick={() => setCommand(`npm run ${script}`)}
              title={`Run npm run ${script}`}
            >
              {script}
            </button>
          ))}
        </div>
      )}

      {error && <p className="inline-error padded">{error}</p>}

      {!result && !error && (
        <p className="muted padded">
          Run a build or test command to collect structured diagnostics.
        </p>
      )}

      {result && (
        <>
          <div
            className={`verdict ${result.success ? 'verdict-pass' : 'verdict-fail'}`}
            role="status"
          >
            {result.cancelled
              ? 'Cancelled'
              : result.success
                ? 'Passed'
                : 'Failed'}{' '}
            · exit code {result.exitCode}
            {result.timedOut ? ' · timed out' : ''}
            {result.outputLimited ? ' · output truncated' : ''} ·{' '}
            {result.diagnostics.length} problem(s)
            {result.diagnosticsTruncated ? ' (list truncated)' : ''}
          </div>

          <div className="diagnostics-list">
            {result.diagnostics.map((diagnostic, index) => (
              <div
                key={`${diagnostic.file}:${diagnostic.line}:${diagnostic.column}:${index}`}
                className="diagnostic-row"
              >
                <button
                  type="button"
                  className="diagnostic-open"
                  onClick={() =>
                    props.onOpenFileAtLine(
                      resolvePath(diagnostic.file),
                      diagnostic.line
                    )
                  }
                  title={`Open ${diagnostic.file}`}
                >
                  <span className={`severity severity-${diagnostic.severity}`}>
                    {diagnostic.severity.toUpperCase()}
                  </span>
                  <span className="diagnostic-location">
                    {diagnostic.file}:{diagnostic.line}:{diagnostic.column}
                  </span>
                  <span className="diagnostic-message">
                    {diagnostic.code ? `${diagnostic.code} ` : ''}
                    {diagnostic.message}
                  </span>
                </button>
                {props.onExplainDiagnostic && (
                  <button
                    type="button"
                    className="mini-btn diagnostic-ask"
                    onClick={() =>
                      props.onExplainDiagnostic?.({
                        diagnostic,
                        command: command.trim(),
                      })
                    }
                    title="Explain this error with Kryom AI"
                  >
                    Ask AI
                  </button>
                )}
              </div>
            ))}

            {result.diagnostics.length === 0 && (
              <p className="muted padded">
                No parsed problems. Raw output is below.
              </p>
            )}
          </div>

          <details className="raw-output">
            <summary>Raw output</summary>
            <pre className="terminal-output">{result.output}</pre>
          </details>
        </>
      )}
    </section>
  )
}
