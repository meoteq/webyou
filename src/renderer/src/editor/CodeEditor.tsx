import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode
} from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  isolateHistory
} from '@codemirror/commands'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import {
  bracketMatching,
  foldGutter,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { php } from '@codemirror/lang-php'
import { json } from '@codemirror/lang-json'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import type { Problem, Settings } from '@shared/types'
import { extnameText } from '@shared/path-text'
import { insertTag as insertTagAt, insertMarkup as insertMarkupAt } from '@shared/tag-insert'
import type { EditorHandle } from './editor-handle'
import type { GotoTarget, OpenTab } from '../state/AppContext'

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--md-sys-color-tertiary)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--md-sys-color-primary)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--md-sys-color-on-surface-variant)', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null], color: 'var(--md-sys-color-secondary)' },
  { tag: t.tagName, color: 'var(--md-sys-color-primary)', fontWeight: '600' },
  { tag: t.attributeName, color: 'var(--md-sys-color-tertiary)' },
  { tag: t.attributeValue, color: 'var(--md-sys-color-secondary)' },
  { tag: t.variableName, color: 'var(--md-sys-color-on-surface)' },
  { tag: [t.propertyName, t.function(t.variableName)], color: 'var(--md-sys-color-tertiary)' },
  { tag: [t.typeName, t.className], color: 'var(--md-sys-color-secondary)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--md-sys-color-on-surface-variant)' },
  { tag: t.heading, fontWeight: '700' },
  { tag: t.link, color: 'var(--md-sys-color-primary)', textDecoration: 'underline' },
  { tag: t.invalid, color: 'var(--md-sys-color-error)' }
])

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: 'var(--editor-font-size, 14px)',
      backgroundColor: 'transparent',
      color: 'var(--md-sys-color-on-surface)'
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--md-sys-typescale-code)',
      lineHeight: '1.7',
      overflow: 'auto'
    },
    '.cm-content': {
      padding: '14px 0 80px',
      caretColor: 'var(--md-sys-color-primary)'
    },
    '.cm-line': { padding: '0 18px 0 14px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--md-sys-color-on-surface-variant)',
      border: 'none',
      paddingLeft: '6px'
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 10px', minWidth: '34px' },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--md-sys-color-primary)'
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent)'
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--md-sys-color-primary) 22%, transparent)'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--md-sys-color-primary)',
      borderLeftWidth: '2px'
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--md-sys-color-secondary-container)',
      color: 'var(--md-sys-color-on-secondary-container)',
      border: 'none',
      borderRadius: '6px',
      padding: '0 6px'
    },
    '.cm-panels': {
      backgroundColor: 'var(--md-sys-color-surface-container)',
      color: 'var(--md-sys-color-on-surface)',
      borderBottom: '1px solid var(--md-sys-color-outline-variant)'
    },
    '.cm-panel.cm-search': {
      padding: '8px 12px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignItems: 'center'
    },
    '.cm-textfield': {
      backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
      color: 'var(--md-sys-color-on-surface)',
      border: '1px solid var(--md-sys-color-outline)',
      borderRadius: '8px',
      padding: '5px 8px',
      fontFamily: 'var(--md-sys-typescale-plain)',
      fontSize: '13px'
    },
    '.cm-button': {
      backgroundColor: 'var(--md-sys-color-secondary-container)',
      backgroundImage: 'none',
      color: 'var(--md-sys-color-on-secondary-container)',
      border: 'none',
      borderRadius: '8px',
      padding: '5px 10px',
      fontFamily: 'var(--md-sys-typescale-plain)'
    },
    '.cm-searchMatch': {
      backgroundColor: 'color-mix(in srgb, var(--md-sys-color-tertiary) 32%, transparent)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in srgb, var(--md-sys-color-tertiary) 55%, transparent)'
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--md-sys-color-surface-container-high)',
      color: 'var(--md-sys-color-on-surface)',
      border: '1px solid var(--md-sys-color-outline-variant)',
      borderRadius: '12px',
      boxShadow: 'var(--md-sys-elevation-2)',
      overflow: 'hidden'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--md-sys-color-secondary-container)',
      color: 'var(--md-sys-color-on-secondary-container)'
    },
    '.cm-diagnostic': {
      fontFamily: 'var(--md-sys-typescale-plain)',
      fontSize: '12px',
      padding: '6px 10px'
    },
    '.cm-diagnostic-error': {
      borderLeft: '3px solid var(--md-sys-color-error)'
    },
    '.cm-diagnostic-warning': {
      borderLeft: '3px solid var(--md-sys-color-tertiary)'
    },
    '.cm-lintRange-error': {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 1.5 1 3 2.5 4.5 1 6 2.5' fill='none' stroke='%23ba1a1a' stroke-width='1'/%3E%3C/svg%3E\")"
    },
    '.cm-lintRange-warning': {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 1.5 1 3 2.5 4.5 1 6 2.5' fill='none' stroke='%23585a8b' stroke-width='1'/%3E%3C/svg%3E\")"
    },
    '.cm-gutter-lint': { width: '14px' }
  },
  { dark: false }
)

function languageFor(name: string): Extension {
  switch (extnameText(name)) {
    case '.html':
    case '.htm':
      return html({ autoCloseTags: true, matchClosingTags: true })
    case '.php':
      return php()
    case '.css':
      return css()
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.ts':
      return javascript()
    case '.json':
      return json()
    default:
      return []
  }
}

interface CodeEditorProps {
  tab: OpenTab
  settings: Settings
  diagnostics: Problem[]
  goto: GotoTarget | null
  onChange: (content: string) => void
  onSave: () => void
  onCursor: (position: { line: number; column: number }) => void
}

export const CodeEditor = forwardRef<EditorHandle, CodeEditorProps>(function CodeEditor(
  { tab, settings, diagnostics, goto, onChange, onSave, onCursor },
  ref
): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const wrapCompartment = useRef(new Compartment()).current
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onCursorRef = useRef(onCursor)
  const diagnosticsRef = useRef(diagnostics)
  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onCursorRef.current = onCursor
  diagnosticsRef.current = diagnostics

  const applyDiagnostics = (view: EditorView, list: Problem[]): void => {
    const doc = view.state.doc
    const mapped = list.map((problem) => {
      const lineNumber = Math.min(doc.lines, Math.max(1, problem.line))
      const line = doc.line(lineNumber)
      const from = Math.min(doc.length, line.from + Math.max(0, problem.column - 1))
      const to = Math.min(doc.length, from < line.to ? from + 1 : from)
      return {
        from,
        to,
        severity: problem.severity,
        message: problem.message,
        source: problem.source
      }
    })
    view.dispatch(setDiagnostics(view.state, mapped))
  }

  const buildExtensions = (name: string): Extension[] => [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true, maxRenderedOptions: 40 }),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    lintGutter(),
    syntaxHighlighting(highlightStyle),
    editorTheme,
    languageFor(name),
    wrapCompartment.of(settings.wordWrap ? EditorView.lineWrapping : []),
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveRef.current()
          return true
        }
      },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      indentWithTab
    ]),
    EditorView.contentAttributes.of({
      'aria-label': name,
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off'
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head
        const line = update.state.doc.lineAt(head)
        onCursorRef.current({
          line: line.number,
          column: head - line.from + 1
        })
      }
    })
  ]

  useImperativeHandle(
    ref,
    () => ({
      getContext() {
        const view = viewRef.current
        if (!view) return null
        return {
          doc: view.state.doc.toString(),
          from: view.state.selection.main.from,
          to: view.state.selection.main.to
        }
      },
      insertTag(spec) {
        const view = viewRef.current
        if (!view) return
        const selection = view.state.selection.main
        const result = insertTagAt(
          view.state.doc.toString(),
          selection.from,
          selection.to,
          spec
        )
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: result.doc },
          selection: { anchor: result.selectionStart, head: result.selectionEnd },
          scrollIntoView: true,
          userEvent: 'input.tag',
          annotations: isolateHistory.of('after')
        })
        view.focus()
      },
      insertMarkup(markup) {
        const view = viewRef.current
        if (!view) return
        const selection = view.state.selection.main
        const result = insertMarkupAt(
          view.state.doc.toString(),
          selection.from,
          selection.to,
          markup
        )
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: result.doc },
          selection: { anchor: result.selectionStart, head: result.selectionEnd },
          scrollIntoView: true,
          userEvent: 'input.tag',
          annotations: isolateHistory.of('after')
        })
        view.focus()
      },
      focus() {
        viewRef.current?.focus()
      }
    }),
    []
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: tab.content,
        extensions: buildExtensions(tab.name)
      })
    })
    viewRef.current = view
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    onCursorRef.current({ line: line.number, column: head - line.from + 1 })

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The view is rebuilt per file; content updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.path])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === tab.content) return
    // A differing document can only come from outside the editor (external
    // reload or "reload from disk"). Replace it with a fresh state so the stale
    // version is not left in the undo stack: otherwise Ctrl+Z would restore the
    // previous file content and autosave it over the external version.
    const head = Math.min(view.state.selection.main.head, tab.content.length)
    const scroller = view.scrollDOM
    const scrollTop = scroller.scrollTop
    const scrollLeft = scroller.scrollLeft
    view.setState(
      EditorState.create({
        doc: tab.content,
        selection: { anchor: head },
        extensions: buildExtensions(tab.name)
      })
    )
    applyDiagnostics(view, diagnosticsRef.current)
    scroller.scrollTop = scrollTop
    scroller.scrollLeft = scrollLeft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.content])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapCompartment.reconfigure(
        settings.wordWrap ? EditorView.lineWrapping : []
      )
    })
  }, [settings.wordWrap, wrapCompartment])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    applyDiagnostics(view, diagnostics)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics])

  useEffect(() => {
    if (!goto || goto.path !== tab.path) return
    const view = viewRef.current
    if (!view) return
    const lineNumber = Math.min(view.state.doc.lines, Math.max(1, goto.line))
    const line = view.state.doc.line(lineNumber)
    const position = Math.min(line.to, line.from + Math.max(0, goto.column - 1))
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' })
    })
    view.focus()
  }, [goto, tab.path])

  const style = {
    '--editor-font-size': `${settings.fontSize}px`
  } as CSSProperties

  return <div ref={hostRef} className="code-editor" style={style} />
})
