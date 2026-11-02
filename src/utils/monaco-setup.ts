// Local Monaco bundling. @monaco-editor/react loads the editor from a
// CDN by default; configuring the loader with the bundled monaco
// instance keeps the editor fully offline and removes the runtime
// supply-chain dependency. Imported once from the renderer entry
// point before any <Editor> mounts.
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import { defineKryomThemes } from './monaco-themes'

// Vite emits each ?worker import as a same-origin chunk under the
// app's base path, so worker-src 'self' covers them on both the dev
// server and the packaged kryom://app origin.
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') {
      return new jsonWorker()
    }

    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }

    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }

    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }

    return new editorWorker()
  },
}

loader.config({ monaco })

// Register the KryomCode editor themes before any <Editor> mounts so
// the theme prop never resolves to an unknown name.
defineKryomThemes(monaco)

export default monaco
