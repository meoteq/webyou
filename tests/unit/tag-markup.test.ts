import { describe, expect, it } from 'vitest'
import { buildTagMarkup, escapeAttr, escapeHtml, type MarkupLabels } from '@shared/tag-markup'

const labels: MarkupLabels = {
  tableHeader: 'Заголовок',
  tableCell: 'Ячейка',
  listItem: 'Пункт',
  formPlaceholder: 'Поля формы',
  pageTitle: 'Моя страница',
  comment: 'Комментарий',
  selectOption: 'Вариант'
}

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml('<a href="x">Tom & Jerry\'s</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry\'s&lt;/a&gt;'
    )
  })

  it('also escapes single quotes in attributes', () => {
    expect(escapeAttr("it's")).toBe('it&#39;s')
  })
})

describe('buildTagMarkup', () => {
  it('builds a full page skeleton with a sanitized language', () => {
    const markup = buildTagMarkup(
      'skeleton',
      { title: 'Визитка', lang: 'ru" onload="x' },
      labels
    )

    expect(markup.startsWith('<!doctype html>')).toBe(true)
    expect(markup).toContain('<html lang="ruonloadx">')
    expect(markup).toContain('<title>Визитка</title>')
    expect(markup).toContain('<link rel="stylesheet" href="style.css">')
    expect(markup).toContain('<h1>Визитка</h1>')
  })

  it('falls back to the localized title when the field is empty', () => {
    expect(buildTagMarkup('skeleton', {}, labels)).toContain(
      '<title>Моя страница</title>'
    )
  })

  it('escapes link text and href', () => {
    const markup = buildTagMarkup(
      'a',
      { href: 'about.html?x=1&y="2"', text: 'О нас <тут>' },
      labels
    )

    expect(markup).toBe('<a href="about.html?x=1&amp;y=&quot;2&quot;">О нас &lt;тут&gt;</a>')
  })

  it('always writes an alt attribute for images', () => {
    expect(buildTagMarkup('img', { src: 'images/me.png' }, labels)).toBe(
      '<img src="images/me.png" alt="">'
    )
  })

  it('builds a table with the requested number of rows and columns', () => {
    const markup = buildTagMarkup('table', { rows: 2, columns: 2 }, labels)

    expect(markup.match(/<th>/g)).toHaveLength(2)
    expect(markup.match(/<td>/g)).toHaveLength(4)
    expect(markup).toContain('<th>Заголовок 1</th>')
    expect(markup).toContain('<td>Ячейка</td>')
  })

  it('clamps table sizes to a usable range', () => {
    expect(buildTagMarkup('table', { rows: 0, columns: 100 }, labels).match(/<td>/g)).toHaveLength(12)
  })

  it('builds ordered and unordered lists', () => {
    expect(buildTagMarkup('ul', { items: 2 }, labels)).toBe(
      '<ul>\n  <li>Пункт 1</li>\n  <li>Пункт 2</li>\n</ul>'
    )
    expect(buildTagMarkup('ol', { items: 1 }, labels)).toContain('<ol>')
  })

  it('creates a label and a matching id from a human readable name', () => {
    expect(buildTagMarkup('input', { name: 'E-mail адрес', label: 'Почта' }, labels)).toBe(
      '<label for="e-mail-адрес">Почта</label>\n<input type="text" id="e-mail-адрес" name="e-mail-адрес">'
    )
  })

  it('rejects unknown input types', () => {
    expect(buildTagMarkup('input', { inputType: 'evil', name: 'n' }, labels)).toContain(
      'type="text"'
    )
    expect(buildTagMarkup('input', { inputType: 'checkbox', name: 'n' }, labels)).toContain(
      'type="checkbox"'
    )
  })

  it('builds the form wrapper with the chosen method', () => {
    expect(buildTagMarkup('form', { method: 'get', action: 'send.php' }, labels)).toBe(
      '<form action="send.php" method="get">\n  <!-- Поля формы -->\n</form>'
    )
  })

  it('builds an escaped comment', () => {
    expect(buildTagMarkup('comment', { text: 'a --> b' }, labels)).toBe('<!-- a --&gt; b -->')
  })

  it('returns an empty string for tags that are inserted directly', () => {
    expect(buildTagMarkup('div', {}, labels)).toBe('')
  })
})
