import { useEffect, useState } from 'react'
import { kryom, errorMessage } from '../api/kryom'
import { SUPPORTED_LOCALES, localeLabel, setLocale, useLocale } from '../i18n'
import { ProviderSettings } from './ProviderSettings'
import { ProfilePanel } from './ProfilePanel'

export type SettingsSection = 'general' | 'providers' | 'account'

export interface SettingsModalProps {
  open: boolean
  initial: KryomSettings
  initialSection?: SettingsSection
  onClose: () => void
  onSaved: (settings: KryomSettings) => void
  onStatus: (status: string) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  // D2 terminal renderer controls. Absent = rows hidden.
  terminalFontSize?: number
  onTerminalFontSizeChange?: (size: number) => void
  terminalRenderer?: 'xterm' | 'pre'
  onTerminalRendererChange?: (renderer: 'xterm' | 'pre') => void
  autoSave: boolean
  onToggleAutoSave: () => void
  panelLeftWidth: number
  panelBottomHeight: number
  onResetPanels: () => void
  accountWorkspaceRoot?: string | null
  accountModel?: string
  accountSummary?: KryomWorkspaceSummary | null
  onOpenAbout?: () => void
}

const MODELS = ['muse-spark-1.3', 'muse-wonder-1.0'] as const
const FONT_MIN = 10
const FONT_MAX = 24
const TERMINAL_FONT_MIN = 11
const TERMINAL_FONT_MAX = 16

export function SettingsModal(props: SettingsModalProps) {
  const { locale, t } = useLocale()
  const [defaultModel, setDefaultModel] = useState(props.initial.defaultModel)
  const [aiContextEnabled, setAiContextEnabled] = useState(
    props.initial.aiContextEnabled
  )
  const [confirmAllCommands, setConfirmAllCommands] = useState(
    props.initial.confirmAllCommands
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [section, setSection] = useState<SettingsSection>('general')

  useEffect(() => {
    if (props.open) {
      setDefaultModel(props.initial.defaultModel)
      setAiContextEnabled(props.initial.aiContextEnabled)
      setConfirmAllCommands(props.initial.confirmAllCommands)
      setError('')
      setSection(props.initialSection ?? 'general')
    }
  }, [props.open, props.initial, props.initialSection])

  useEffect(() => {
    if (!props.open) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose()
      }
    }

    document.addEventListener('keydown', onKey)

    return () => document.removeEventListener('keydown', onKey)
  }, [props.open, props.onClose])

  if (!props.open) {
    return null
  }

  async function save() {
    setSaving(true)
    setError('')

    try {
      const saved = await kryom().updateSettings({
        defaultModel,
        aiContextEnabled,
        confirmAllCommands,
      })
      props.onSaved(saved)
      props.onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose()
        }
      }}
    >
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <h2>Settings</h2>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'general'}
            className={section === 'general' ? 'panel-tab active' : 'panel-tab'}
            onClick={() => setSection('general')}
          >
            GENERAL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'providers'}
            className={section === 'providers' ? 'panel-tab active' : 'panel-tab'}
            onClick={() => setSection('providers')}
          >
            PROVIDERS
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'account'}
            className={section === 'account' ? 'panel-tab active' : 'panel-tab'}
            onClick={() => setSection('account')}
          >
            ACCOUNT
          </button>
        </div>

        {section === 'providers' && (
          <ProviderSettings onStatus={props.onStatus} />
        )}

        {section === 'account' && (
          <ProfilePanel
            workspaceRoot={props.accountWorkspaceRoot ?? null}
            defaultModel={props.accountModel ?? props.initial.defaultModel}
            summary={props.accountSummary ?? null}
            onOpenSettings={() => setSection('general')}
            onOpenAbout={props.onOpenAbout ?? (() => undefined)}
          />
        )}

        {section === 'general' && (
          <>
        <label className="field-label">
          Default AI model
          <select
            value={defaultModel}
            onChange={(event) => setDefaultModel(event.target.value)}
            aria-label="Default AI model"
          >
            {MODELS.map((id) => (
              <option key={id} value={id}>
                {id === 'muse-spark-1.3' ? 'Muse Spark 1.3' : 'Muse Wonder 1.0'}
              </option>
            ))}
          </select>
        </label>

        <label className="context-toggle">
          <input
            type="checkbox"
            checked={aiContextEnabled}
            onChange={(event) => setAiContextEnabled(event.target.checked)}
          />
          Include active file context in AI requests by default
        </label>

        <label className="context-toggle">
          <input
            type="checkbox"
            checked={confirmAllCommands}
            onChange={(event) => setConfirmAllCommands(event.target.checked)}
          />
          Confirm every terminal and diagnostics command before running
          (warning-bearing commands always confirm)
        </label>

        <div className="settings-row">
          <span id="settings-autosave-label">Auto Save</span>
          <button
            type="button"
            role="switch"
            aria-checked={props.autoSave}
            aria-labelledby="settings-autosave-label"
            className={props.autoSave ? 'switch on' : 'switch'}
            onClick={props.onToggleAutoSave}
          >
            <span className="switch-knob" aria-hidden="true" />
          </button>
        </div>

        <div className="settings-row">
          <span id="settings-font-label">Editor font size</span>
          <div
            className="stepper"
            role="group"
            aria-labelledby="settings-font-label"
          >
            <button
              type="button"
              className="mini-btn"
              onClick={() =>
                props.onFontSizeChange(Math.max(FONT_MIN, props.fontSize - 1))
              }
              disabled={props.fontSize <= FONT_MIN}
              aria-label="Decrease editor font size"
            >
              −
            </button>
            <span aria-live="polite">{props.fontSize}px</span>
            <button
              type="button"
              className="mini-btn"
              onClick={() =>
                props.onFontSizeChange(Math.min(FONT_MAX, props.fontSize + 1))
              }
              disabled={props.fontSize >= FONT_MAX}
              aria-label="Increase editor font size"
            >
              +
            </button>
          </div>
        </div>

        {props.terminalFontSize !== undefined &&
          props.onTerminalFontSizeChange && (
            <div className="settings-row">
              <span id="settings-terminal-font-label">
                Terminal font size
              </span>
              <div
                className="stepper"
                role="group"
                aria-labelledby="settings-terminal-font-label"
              >
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() =>
                    props.onTerminalFontSizeChange?.(
                      Math.max(
                        TERMINAL_FONT_MIN,
                        (props.terminalFontSize ?? TERMINAL_FONT_MIN) - 1
                      )
                    )
                  }
                  disabled={props.terminalFontSize <= TERMINAL_FONT_MIN}
                  aria-label="Decrease terminal font size"
                >
                  −
                </button>
                <span aria-live="polite">{props.terminalFontSize}px</span>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() =>
                    props.onTerminalFontSizeChange?.(
                      Math.min(
                        TERMINAL_FONT_MAX,
                        (props.terminalFontSize ?? TERMINAL_FONT_MIN) + 1
                      )
                    )
                  }
                  disabled={props.terminalFontSize >= TERMINAL_FONT_MAX}
                  aria-label="Increase terminal font size"
                >
                  +
                </button>
              </div>
            </div>
          )}

        {props.terminalRenderer !== undefined &&
          props.onTerminalRendererChange && (
            <div className="settings-row">
              <span id="settings-terminal-renderer-label">
                Terminal output
              </span>
              <div
                className="segmented"
                role="group"
                aria-labelledby="settings-terminal-renderer-label"
              >
                <button
                  type="button"
                  className={
                    props.terminalRenderer === 'xterm'
                      ? 'segment active'
                      : 'segment'
                  }
                  aria-pressed={props.terminalRenderer === 'xterm'}
                  onClick={() =>
                    props.onTerminalRendererChange?.('xterm')
                  }
                >
                  Terminal
                </button>
                <button
                  type="button"
                  className={
                    props.terminalRenderer === 'pre'
                      ? 'segment active'
                      : 'segment'
                  }
                  aria-pressed={props.terminalRenderer === 'pre'}
                  onClick={() => props.onTerminalRendererChange?.('pre')}
                >
                  Plain text
                </button>
              </div>
            </div>
          )}

        <div className="settings-row">
          <span id="settings-theme-label">Appearance</span>
          <div
            className="segmented"
            role="group"
            aria-labelledby="settings-theme-label"
          >
            <button
              type="button"
              className={props.theme === 'dark' ? 'segment active' : 'segment'}
              aria-pressed={props.theme === 'dark'}
              onClick={() => props.onThemeChange('dark')}
            >
              Dark
            </button>
            <button
              type="button"
              className={props.theme === 'light' ? 'segment active' : 'segment'}
              aria-pressed={props.theme === 'light'}
              onClick={() => props.onThemeChange('light')}
            >
              Light
            </button>
          </div>
        </div>

        <div className="settings-row">
          <span>{t('settings.language')}</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            aria-label={t('settings.language')}
          >
            {SUPPORTED_LOCALES.map((entry) => (
              <option key={entry} value={entry}>
                {localeLabel(entry)}
              </option>
            ))}
          </select>
        </div>
        <p className="muted settings-note">{t('settings.languageNote')}</p>

        <div className="settings-row">
          <span>Panel sizes</span>
          <button
            type="button"
            className="mini-btn"
            onClick={props.onResetPanels}
            title="Reset sidebar and bottom panel to default sizes"
          >
            Reset to defaults
          </button>
        </div>
        <p className="muted settings-note">
          Sidebar {props.panelLeftWidth}px · Bottom panel{' '}
          {props.panelBottomHeight}px. Drag the dividers to resize; sizes
          persist automatically.
        </p>

        <p className="muted">
          API keys are managed under Providers and are never shown
          here. A development key in your local .env file keeps
          working and takes precedence.
        </p>

        {error && (
          <div className="ai-error" role="alert">
            <p>{error}</p>
          </div>
        )}
          </>
        )}

        <div className="dialog-actions">
          <button className="secondary-button" onClick={props.onClose}>
            {section === 'general' ? 'Cancel' : 'Close'}
          </button>
          {section === 'general' && (
            <button
              className="primary-button"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
