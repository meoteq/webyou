import { describe, expect, it } from 'vitest'
import { insertMarkup, insertTag, lineIndentAt } from '@shared/tag-insert'

describe('lineIndentAt', () => {
  it('returns the whitespace before the caret', () => {
    expect(lineIndentAt('<body>\n    <p></p>\n</body>', 12)).toBe('    ')
  })

  it('returns an empty string for unindented lines', () => {
    expect(lineIndentAt('<p>hello</p>', 4)).toBe('')
  })

  it('handles the very start of a document', () => {
    expect(lineIndentAt('<p>', 0)).toBe('')
  })
})

describe('insertTag', () => {
  it('inserts a paired tag and selects its placeholder', () => {
    const doc = '<body>\n  \n</body>'
    const from = doc.indexOf('  \n') + 2
    const result = insertTag(doc, from, from, {
      open: '<p>',
      close: '</p>',
      placeholder: 'Текст'
    })

    expect(result.doc).toBe('<body>\n  <p>Текст</p>\n</body>')
    expect(result.doc.slice(result.selectionStart, result.selectionEnd)).toBe('Текст')
  })

  it('wraps the current selection instead of the placeholder', () => {
    const doc = 'Hello world'
    const result = insertTag(doc, 6, 11, { open: '<strong>', close: '</strong>', placeholder: 'x' })

    expect(result.doc).toBe('Hello <strong>world</strong>')
    expect(result.doc.slice(result.selectionStart, result.selectionEnd)).toBe('world')
  })

  it('inserts a void element and places the caret after it', () => {
    const doc = '<p>\n\n</p>'
    const from = 4
    const result = insertTag(doc, from, from, { open: '<br>', caretOnly: true })

    expect(result.doc).toBe('<p>\n<br>\n</p>')
    expect(result.selectionStart).toBe(from + '<br>'.length)
    expect(result.selectionStart).toBe(result.selectionEnd)
  })

  it('inserts a paired tag inline and puts the caret between the tags', () => {
    const doc = '<body> текст'
    const from = doc.length
    const result = insertTag(doc, from, from, { open: '<p>', close: '</p>', placeholder: '' })

    expect(result.doc).toBe('<body> текст<p></p>')
    expect(result.selectionStart).toBe(doc.length + '<p>'.length)
    expect(result.selectionStart).toBe(result.selectionEnd)
  })

  it('indents generated multi-line markup at the caret', () => {
    const doc = '<body>\n  \n</body>'
    const from = doc.indexOf('  \n') + 2
    const result = insertMarkup(doc, from, from, '<div>\n  <p>Hello</p>\n</div>')

    expect(result.doc).toBe('<body>\n  <div>\n    <p>Hello</p>\n  </div>\n</body>')
  })
})

describe('insertMarkup', () => {
  it('keeps already indented first lines intact', () => {
    const doc = '<body>\n  \n</body>'
    const from = doc.indexOf('  \n') + 2
    const result = insertMarkup(doc, from, from, '<div>\n  <p>Hi</p>\n</div>')

    expect(result.doc).toBe('<body>\n  <div>\n    <p>Hi</p>\n  </div>\n</body>')
    expect(result.selectionStart).toBe(result.doc.length - '</body>'.length - 1)
  })

  it('places the caret at a requested offset inside generated markup', () => {
    const doc = '<p>\n\n</p>'
    const from = 4
    const markup = '<label for="name">Name</label>'
    const result = insertMarkup(doc, from, from, markup, {
      offset: markup.indexOf('Name'),
      length: 4
    })

    expect(result.doc).toBe(`<p>\n${markup}\n</p>`)
    expect(result.doc.slice(result.selectionStart, result.selectionEnd)).toBe('Name')
  })
})
