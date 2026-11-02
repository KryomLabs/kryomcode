import { useState, type ReactElement, type ReactNode } from 'react'
import { copyText } from '../utils/clipboard'

// Dependency-free renderer for model and brief text. Supports fenced
// code blocks (with Copy), headings, lists, quotes, inline code, and
// bold. Everything renders as React text nodes: no HTML is parsed or
// executed, so untrusted output cannot inject markup or scripts.
// Code blocks get lightweight approximate highlighting (keywords,
// strings, numbers, comments, calls) from a small tokenizer — no
// grammar engine, no new dependency.

type Block =
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'para'; text: string }

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const fence = line.match(/^```(\S*)\s*$/)

    if (fence) {
      const code: string[] = []
      index += 1

      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }

      // Skip the closing fence when present; unterminated fences
      // still render their collected lines.
      if (index < lines.length) {
        index += 1
      }

      blocks.push({ kind: 'code', lang: fence[1] || '', code: code.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/)

    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        text: heading[2].trim(),
      })
      index += 1
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)

    if (quote) {
      const quoted: string[] = []

      while (index < lines.length) {
        const match = lines[index].match(/^>\s?(.*)$/)

        if (!match) {
          break
        }

        quoted.push(match[1])
        index += 1
      }

      blocks.push({ kind: 'quote', text: quoted.join('\n') })
      continue
    }

    const listMarker = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)

    if (listMarker) {
      const ordered = /^\d/.test(listMarker[2])
      const items: string[] = []

      while (index < lines.length) {
        const match = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)

        if (!match) {
          break
        }

        items.push(match[3])
        index += 1
      }

      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    if (line.trim() === '') {
      index += 1
      continue
    }

    const para: string[] = []

    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !lines[index].startsWith('```') &&
      !lines[index].match(/^#{1,3}\s+/) &&
      !lines[index].match(/^>\s?/) &&
      !lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+/)
    ) {
      para.push(lines[index])
      index += 1
    }

    blocks.push({ kind: 'para', text: para.join('\n') })
  }

  return blocks
}

function renderCitationChunk(
  chunk: string,
  keyPrefix: string,
  onCitation?: (index: number) => void
): ReactElement[] {
  if (!onCitation) {
    return [<span key={keyPrefix}>{chunk}</span>]
  }

  // Citation markers [n] become buttons that jump to the source; all
  // other text stays inert spans, exactly as before.
  return chunk.split(/(\[\d{1,3}\])/g).map((part, partIndex) => {
    const match = part.match(/^\[(\d{1,3})\]$/)

    if (match) {
      const index = parseInt(match[1], 10)

      return (
        <button
          key={`${keyPrefix}-cite${partIndex}`}
          type="button"
          className="md-cite"
          onClick={() => onCitation(index)}
          title={`Open source ${index}`}
          aria-label={`Open source ${index}`}
        >
          [{index}]
        </button>
      )
    }

    return <span key={`${keyPrefix}-t${partIndex}`}>{part}</span>
  })
}

function renderInline(
  text: string,
  keyPrefix: string,
  onCitation?: (index: number) => void
): ReactNode[] {
  const codeSplit = text.split(/(`[^`\n]+`)/g)

  return codeSplit.flatMap((part, partIndex) => {
    const codeMatch = part.match(/^`([^`\n]+)`$/)

    if (codeMatch) {
      return [
        <code key={`${keyPrefix}-c${partIndex}`} className="md-code">
          {codeMatch[1]}
        </code>,
      ]
    }

    return part.split(/(\*\*[^*\n]+\*\*)/g).flatMap((chunk, chunkIndex) => {
      const boldMatch = chunk.match(/^\*\*([^*`\n]+)\*\*$/)

      if (boldMatch) {
        // Without citations the legacy shape (raw string child) is
        // preserved exactly; citation splitting only wraps when asked.
        if (!onCitation) {
          return [
            <strong key={`${keyPrefix}-b${partIndex}-${chunkIndex}`}>
              {boldMatch[1]}
            </strong>,
          ]
        }

        return [
          <strong key={`${keyPrefix}-b${partIndex}-${chunkIndex}`}>
            {renderCitationChunk(
              boldMatch[1],
              `${keyPrefix}-b${partIndex}-${chunkIndex}`,
              onCitation
            )}
          </strong>,
        ]
      }

      return renderCitationChunk(
        chunk,
        `${keyPrefix}-t${partIndex}-${chunkIndex}`,
        onCitation
      )
    })
  })
}

const JS_KEYWORDS = new Set(
  (
    'await break case catch class const continue debugger default delete do ' +
    'else enum export extends false finally for from function get if implements ' +
    'import in instanceof interface let new null of return set static super ' +
    'switch this throw true try typeof undefined var void while with yield ' +
    'async as satisfies type readonly abstract override async'
  ).split(' ')
)

const PYTHON_KEYWORDS = new Set(
  (
    'False None True and as assert async await break class continue def del ' +
    'elif else except finally for from global if import in is lambda nonlocal ' +
    'not or pass raise return try while with yield match case'
  ).split(' ')
)

const SHELL_KEYWORDS = new Set(
  'if then else elif fi for while in do done case esac function select until return exit export local readonly'.split(
    ' '
  )
)

const SQL_KEYWORDS = new Set(
  (
    'select from where join left right inner outer on group by order having ' +
    'insert into values update set delete create table index view drop alter ' +
    'add primary key foreign references not null unique default check and or ' +
    'as distinct limit offset union all like in is between exists case when ' +
    'then else end true false'
  ).split(' ')
)

interface HighlightSyntax {
  lineComments: string[]
  blockStart: string | null
  blockEnd: string | null
  tripleQuotes: boolean
  backtickString: boolean
  keywords: Set<string> | null
}

function syntaxFor(lang: string): HighlightSyntax {
  const id = lang.trim().toLowerCase()

  if (id === 'py' || id === 'python' || id === 'rb' || id === 'ruby') {
    return {
      lineComments: ['#'],
      blockStart: null,
      blockEnd: null,
      tripleQuotes: true,
      backtickString: false,
      keywords: PYTHON_KEYWORDS,
    }
  }

  if (
    id === 'sh' ||
    id === 'bash' ||
    id === 'zsh' ||
    id === 'shell' ||
    id === 'ps1' ||
    id === 'powershell'
  ) {
    return {
      lineComments: ['#'],
      blockStart: null,
      blockEnd: null,
      tripleQuotes: false,
      backtickString: false,
      keywords: id === 'ps1' || id === 'powershell' ? null : SHELL_KEYWORDS,
    }
  }

  if (id === 'sql') {
    return {
      lineComments: ['--'],
      blockStart: '/*',
      blockEnd: '*/',
      tripleQuotes: false,
      backtickString: false,
      keywords: SQL_KEYWORDS,
    }
  }

  if (id === 'html' || id === 'xml' || id === 'svg' || id === 'vue') {
    return {
      lineComments: [],
      blockStart: '<!--',
      blockEnd: '-->',
      tripleQuotes: false,
      backtickString: false,
      keywords: null,
    }
  }

  if (id === 'css' || id === 'scss' || id === 'less') {
    return {
      lineComments: [],
      blockStart: '/*',
      blockEnd: '*/',
      tripleQuotes: false,
      backtickString: false,
      keywords: null,
    }
  }

  // C-style default (js/ts/jsx/tsx/json/c/cpp/csharp/java/go/rust/…):
  // `//` and `/* */` comments, quote/backtick strings, JS-ish
  // keywords. Unknown languages share it; guessing C-style is right
  // far more often than highlighting nothing.
  return {
    lineComments: ['//'],
    blockStart: '/*',
    blockEnd: '*/',
    tripleQuotes: id === 'py' || id === 'python',
    backtickString: true,
    keywords: JS_KEYWORDS,
  }
}

interface Token {
  text: string
  cls: 'tok-kw' | 'tok-str' | 'tok-num' | 'tok-com' | 'tok-fn' | null
}

function tokenize(code: string, syntax: HighlightSyntax): Token[] {
  const tokens: Token[] = []
  let plain = ''
  let index = 0

  function flush() {
    if (plain !== '') {
      tokens.push({ text: plain, cls: null })
      plain = ''
    }
  }

  while (index < code.length) {
    const rest = code.slice(index)

    // Block comment.
    if (
      syntax.blockStart !== null &&
      syntax.blockEnd !== null &&
      rest.startsWith(syntax.blockStart)
    ) {
      const end = code.indexOf(syntax.blockEnd, index + syntax.blockStart.length)
      const stop =
        end === -1 ? code.length : end + syntax.blockEnd.length
      flush()
      tokens.push({ text: code.slice(index, stop), cls: 'tok-com' })
      index = stop
      continue
    }

    // Line comment.
    const lineStart = syntax.lineComments.find((marker) =>
      rest.startsWith(marker)
    )

    if (lineStart !== undefined) {
      const end = code.indexOf('\n', index)
      const stop = end === -1 ? code.length : end
      flush()
      tokens.push({ text: code.slice(index, stop), cls: 'tok-com' })
      index = stop
      continue
    }

    // Triple-quoted string (Python).
    const triple =
      syntax.tripleQuotes &&
      (rest.startsWith("'''") || rest.startsWith('"""'))
        ? rest.slice(0, 3)
        : null

    if (triple !== null) {
      const end = code.indexOf(triple, index + 3)
      const stop = end === -1 ? code.length : end + 3
      flush()
      tokens.push({ text: code.slice(index, stop), cls: 'tok-str' })
      index = stop
      continue
    }

    // Quoted string with backslash escapes.
    const quote = rest[0]

    if (
      quote === '"' ||
      quote === "'" ||
      (quote === '`' && syntax.backtickString)
    ) {
      let stop = index + 1

      while (stop < code.length) {
        if (code[stop] === '\\') {
          stop += 2
          continue
        }

        if (code[stop] === quote) {
          stop += 1
          break
        }

        // A single-quoted span never crosses a newline (except
        // backticks); an unterminated quote ends at the line end
        // instead of swallowing the rest of the block.
        if (code[stop] === '\n' && quote !== '`') {
          break
        }

        stop += 1
      }

      flush()
      tokens.push({ text: code.slice(index, stop), cls: 'tok-str' })
      index = stop
      continue
    }

    // Number.
    const number = rest.match(/^\b\d+(?:\.\d+)?\b/)

    if (number) {
      flush()
      tokens.push({ text: number[0], cls: 'tok-num' })
      index += number[0].length
      continue
    }

    // Word: keyword, call, or plain.
    const word = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)

    if (word) {
      const text = word[0]
      const lower = text.toLowerCase()
      const after = code.slice(index + text.length)
      const isCall =
        /^\s*\(/.test(after) &&
        !(syntax.keywords && syntax.keywords.has(text)) &&
        !(syntax.keywords && syntax.keywords.has(lower))

      flush()

      if (syntax.keywords && (syntax.keywords.has(text) || (syntax.keywords === SQL_KEYWORDS && syntax.keywords.has(lower)))) {
        tokens.push({ text, cls: 'tok-kw' })
      } else if (isCall) {
        tokens.push({ text, cls: 'tok-fn' })
      } else {
        tokens.push({ text, cls: null })
      }

      index += text.length
      continue
    }

    plain += code[index]
    index += 1
  }

  flush()

  return tokens
}

function renderTokens(tokens: Token[], keyPrefix: string): ReactNode[] {
  return tokens.map((token, tokenIndex) =>
    token.cls === null ? (
      <span key={`${keyPrefix}-p${tokenIndex}`}>{token.text}</span>
    ) : (
      <span key={`${keyPrefix}-h${tokenIndex}`} className={token.cls}>
        {token.text}
      </span>
    )
  )
}

// Long blocks start collapsed past 40 lines so one huge answer
// cannot push the conversation away; Copy always copies the full
// text, collapsed or not.
const COLLAPSE_LINES = 40

function CodeBlock({
  lang,
  code,
  onSendToAgent,
}: {
  lang: string
  code: string
  onSendToAgent?: (code: string, lang: string) => void
}) {
  const [status, setStatus] = useState<'copy' | 'copied' | 'failed'>('copy')
  const [expanded, setExpanded] = useState(
    () => code.split('\n').length <= COLLAPSE_LINES
  )
  const lineCount = code.split('\n').length
  const collapsible = lineCount > COLLAPSE_LINES
  const visible =
    expanded || !collapsible
      ? code
      : code.split('\n').slice(0, COLLAPSE_LINES).join('\n')

  async function copy() {
    try {
      if (!(await copyText(code))) throw new Error('clipboard write failed')
      setStatus('copied')
      setTimeout(() => setStatus('copy'), 1500)
    } catch {
      setStatus('failed')
      setTimeout(() => setStatus('copy'), 1500)
    }
  }

  return (
    <div className="md-codeblock">
      <div className="md-codeblock-head">
        <span className="md-lang">{lang || 'code'}</span>
        {collapsible && (
          <button
            type="button"
            className="mini-btn"
            onClick={() => setExpanded((value) => !value)}
            title={
              expanded
                ? 'Collapse this code block'
                : `Show all ${lineCount} lines`
            }
          >
            {expanded ? 'Collapse' : `Show all ${lineCount} lines`}
          </button>
        )}
        {onSendToAgent && (
          <button
            type="button"
            className="mini-btn"
            onClick={() => onSendToAgent(code, lang)}
            title="Open this code in the Agent tab, where every change is reviewed before apply"
          >
            Send to Agent
          </button>
        )}
        <button
          type="button"
          className="mini-btn"
          onClick={() => void copy()}
          title="Copy code to clipboard"
        >
          {status === 'copied'
            ? 'Copied'
            : status === 'failed'
              ? 'Copy unavailable'
              : 'Copy'}
        </button>
      </div>
      <pre className="md-pre">
        {visible === '' ? ' ' : renderTokens(tokenize(visible, syntaxFor(lang)), 't')}
      </pre>
    </div>
  )
}

export function MarkdownLite({
  text,
  onSendToAgent,
  onCitation,
}: {
  text: string
  onSendToAgent?: (code: string, lang: string) => void
  onCitation?: (index: number) => void
}) {
  const blocks = parseBlocks(text)

  if (blocks.length === 0) {
    return <span className="muted">(empty)</span>
  }

  return (
    <>
      {blocks.map((block, index) => {
        const key = `md-${index}`

        if (block.kind === 'code') {
          return (
            <CodeBlock
              key={key}
              lang={block.lang}
              code={block.code}
              onSendToAgent={onSendToAgent}
            />
          )
        }

        if (block.kind === 'heading') {
          const content = renderInline(block.text, key, onCitation)

          if (block.level === 1) {
            return (
              <h4 key={key} className="md-heading">
                {content}
              </h4>
            )
          }

          if (block.level === 2) {
            return (
              <h5 key={key} className="md-heading">
                {content}
              </h5>
            )
          }

          return (
            <h6 key={key} className="md-heading">
              {content}
            </h6>
          )
        }

        if (block.kind === 'list') {
          const items = block.items.map((item, itemIndex) => (
            <li key={`${key}-i${itemIndex}`}>
              {renderInline(item, `${key}-i${itemIndex}`, onCitation)}
            </li>
          ))

          return block.ordered ? (
            <ol key={key} className="md-list">
              {items}
            </ol>
          ) : (
            <ul key={key} className="md-list">
              {items}
            </ul>
          )
        }

        if (block.kind === 'quote') {
          return (
            <blockquote key={key} className="md-quote">
              {renderInline(block.text, key, onCitation)}
            </blockquote>
          )
        }

        return (
          <p key={key} className="md-para">
            {renderInline(block.text, key, onCitation)}
          </p>
        )
      })}
    </>
  )
}
