export type TagId =
  | 'skeleton'
  | 'div'
  | 'header'
  | 'nav'
  | 'main'
  | 'section'
  | 'footer'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'p'
  | 'strong'
  | 'em'
  | 'br'
  | 'hr'
  | 'ul'
  | 'ol'
  | 'a'
  | 'img'
  | 'video'
  | 'table'
  | 'form'
  | 'input'
  | 'textarea'
  | 'select'
  | 'button'
  | 'comment'
  | 'link-css'
  | 'style'
  | 'script'

export interface TagInsertSpec {
  open: string
  close?: string
  placeholder?: string
  /** When true the caret is placed after the inserted markup without selecting a placeholder. */
  caretOnly?: boolean
}

export interface InsertionResult {
  doc: string
  selectionStart: number
  selectionEnd: number
}

/** Leading whitespace of the line that contains `position`. */
export function lineIndentAt(doc: string, position: number): string {
  const lineStart = doc.lastIndexOf('\n', Math.max(0, position - 1)) + 1
  const line = doc.slice(lineStart, position)
  return /^[\t ]*/.exec(line)?.[0] ?? ''
}

/**
 * Insert a tag in a single, undoable operation.
 * - A selection inside a paired tag is wrapped.
 * - With no selection, the placeholder is selected so typing replaces it.
 * - Multi-line markup is indented to the current line.
 */
export function insertTag(
  doc: string,
  from: number,
  to: number,
  spec: TagInsertSpec
): InsertionResult {
  const indent = lineIndentAt(doc, from)
  const selected = doc.slice(from, to)
  const inner = selected || spec.placeholder || ''
  const isMultiline = spec.open.includes('\n') || (spec.close ?? '').includes('\n')

  let markup: string
  let innerOffset: number
  let innerLength: number

  if (!spec.close) {
    markup = spec.open
    innerOffset = markup.length
    innerLength = 0
  } else if (isMultiline) {
    const body = inner
      .split('\n')
      .map((line, index) => (index === 0 ? line : indent + line))
      .join('\n')
    markup = `${spec.open}\n${indent}  ${body}\n${indent}${spec.close}`
    innerOffset = spec.open.length + 1 + indent.length + 2
    innerLength = body.length
  } else {
    markup = `${spec.open}${inner}${spec.close}`
    innerOffset = spec.open.length
    innerLength = inner.length
  }

  const atLineStart = /^[\t ]*$/.test(doc.slice(doc.lastIndexOf('\n', Math.max(0, from - 1)) + 1, from))
  const blockLike = isMultiline && !atLineStart
  const prefix = blockLike ? `\n${indent}` : ''
  const nextDoc = doc.slice(0, from) + prefix + markup + doc.slice(to)

  if (spec.caretOnly) {
    const caret = from + prefix.length + markup.length
    return { doc: nextDoc, selectionStart: caret, selectionEnd: caret }
  }

  const innerStart = from + prefix.length + innerOffset
  if (innerLength > 0 && !selected) {
    return { doc: nextDoc, selectionStart: innerStart, selectionEnd: innerStart + innerLength }
  }
  return {
    doc: nextDoc,
    selectionStart: innerStart,
    selectionEnd: innerStart + innerLength
  }
}

/** Insert already-generated markup, indenting every continuation line. */
export function insertMarkup(
  doc: string,
  from: number,
  to: number,
  markup: string,
  caret?: { offset: number; length: number }
): InsertionResult {
  const indent = lineIndentAt(doc, from)
  const atLineStart = /^[\t ]*$/.test(doc.slice(doc.lastIndexOf('\n', Math.max(0, from - 1)) + 1, from))
  const lines = markup.split('\n')
  const indented = atLineStart
    ? lines
        .map((line, index) => (index === 0 || !line ? line : indent + line))
        .join('\n')
    : `\n${indent}${lines[0]}\n${lines.slice(1).map((l) => indent + l).join('\n')}`
  const prefix = atLineStart ? '' : '\n' + indent
  const nextDoc = doc.slice(0, from) + prefix + indented + doc.slice(to)
  if (!caret) {
    const position = from + prefix.length + indented.length
    return { doc: nextDoc, selectionStart: position, selectionEnd: position }
  }
  const start = from + prefix.length + caret.offset
  return { doc: nextDoc, selectionStart: start, selectionEnd: start + caret.length }
}
