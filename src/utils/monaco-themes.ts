// KryomCode Monaco editor themes (Phase 1). Color data mirrors the
// unified design tokens (dark: src/styles/tokens.css, light:
// src/styles/theme.css); when the palette changes, update the theme
// data in the same edit — monaco-themes.test.ts pins the key
// correspondences. Only long-stable Monaco color keys are used so the
// themes survive Monaco upgrades.
export interface KryomTokenRule {
  token: string
  foreground: string
  fontStyle?: string
}

export interface KryomThemeData {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  inherit: boolean
  rules: KryomTokenRule[]
  colors: Record<string, string>
}

// Structural subset of the Monaco API surface this module needs.
// Real `monaco.editor.defineTheme` satisfies it, and the narrow type
// keeps this module (and its tests) independent of the Monaco version.
export interface MonacoThemeHost {
  editor: {
    defineTheme(name: string, data: KryomThemeData): void
  }
}

export const KRYOM_DARK: KryomThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8E8E9B', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C4B5FD' },
    { token: 'string', foreground: '7EE2A8' },
    { token: 'number', foreground: 'E8C874' },
    { token: 'type', foreground: '2E9BFF' },
    { token: 'entity.name.function', foreground: '7AA8FF' },
  ],
  colors: {
    'editor.background': '#101116',
    'editor.foreground': '#E7E7EC',
    'editorLineNumber.foreground': '#6B6B78',
    'editorLineNumber.activeForeground': '#B9B9C6',
    'editorCursor.foreground': '#8B7CFF',
    'editor.selectionBackground': '#8B7CFF47',
    'editor.lineHighlightBackground': '#FFFFFF0D',
    'editorGutter.background': '#101116',
    'editorWidget.background': '#1E1F29',
    'editorWidget.border': '#26272F',
    'editor.findMatchBackground': '#E8C87466',
    'editor.findMatchHighlightBackground': '#E8C87433',
    'diffEditor.insertedTextBackground': '#7EE2A833',
    'diffEditor.removedTextBackground': '#FF8F9A33',
    'editorWhitespace.foreground': '#34353F',
    'editorIndentGuide.background1': '#26272F',
    'editorIndentGuide.activeBackground1': '#34353F',
  },
}

export const KRYOM_LIGHT: KryomThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6E6E78', fontStyle: 'italic' },
    { token: 'keyword', foreground: '4A3FA8' },
    { token: 'string', foreground: '1A7F4B' },
    { token: 'number', foreground: '8F6200' },
    { token: 'type', foreground: '0B5FFF' },
    { token: 'entity.name.function', foreground: '5F4FD6' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#191A20',
    'editorLineNumber.foreground': '#A6A6B0',
    'editorLineNumber.activeForeground': '#4E4E59',
    'editorCursor.foreground': '#5F4FD6',
    'editor.selectionBackground': '#5F4FD638',
    'editor.lineHighlightBackground': '#1414280D',
    'editorGutter.background': '#FFFFFF',
    'editorWidget.background': '#FFFFFF',
    'editorWidget.border': '#D9D9E0',
    'editor.findMatchBackground': '#8F620066',
    'editor.findMatchHighlightBackground': '#8F620033',
    'diffEditor.insertedTextBackground': '#1A7F4B33',
    'diffEditor.removedTextBackground': '#D92D2033',
    'editorWhitespace.foreground': '#C4C4CD',
    'editorIndentGuide.background1': '#E6E6EB',
    'editorIndentGuide.activeBackground1': '#C4C4CD',
  },
}

export function defineKryomThemes(monaco: MonacoThemeHost): void {
  monaco.editor.defineTheme('kryom-dark', KRYOM_DARK)
  monaco.editor.defineTheme('kryom-light', KRYOM_LIGHT)
}
