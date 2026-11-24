import type { TagId } from './tag-insert'

export interface TagFormValues {
  href?: string
  text?: string
  src?: string
  alt?: string
  rows?: number
  columns?: number
  items?: number
  inputType?: string
  name?: string
  label?: string
  method?: 'get' | 'post'
  action?: string
  title?: string
  lang?: string
}

export interface MarkupLabels {
  tableHeader: string
  tableCell: string
  listItem: string
  formPlaceholder: string
  pageTitle: string
  comment: string
  selectOption: string
}

const INPUT_TYPES = new Set([
  'text',
  'email',
  'password',
  'number',
  'date',
  'time',
  'search',
  'tel',
  'url',
  'color',
  'range',
  'checkbox',
  'radio',
  'file'
])

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function slug(value: string, fallback: string): string {
  const result = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return result || fallback
}

function indentLines(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n')
}

/** Generate the markup inserted by a tag form. Kept pure so it is easy to unit test. */
export function buildTagMarkup(id: TagId, values: TagFormValues, labels: MarkupLabels): string {
  switch (id) {
    case 'skeleton': {
      const title = escapeHtml(values.title?.trim() || labels.pageTitle)
      const lang = (values.lang || 'en').replace(/[^a-zA-Z-]/g, '') || 'en'
      return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <h1>${title}</h1>
    <p></p>
  </body>
</html>`
    }
    case 'a': {
      const href = escapeAttr(values.href?.trim() || '#')
      const text = escapeHtml(values.text?.trim() || 'link')
      return `<a href="${href}">${text}</a>`
    }
    case 'img': {
      const src = escapeAttr(values.src?.trim() || 'images/picture.jpg')
      const alt = escapeAttr(values.alt?.trim() || '')
      return `<img src="${src}" alt="${alt}">`
    }
    case 'video': {
      const src = escapeAttr(values.src?.trim() || 'video.mp4')
      return `<video src="${src}" controls></video>`
    }
    case 'table': {
      const rows = Math.max(1, Math.min(20, Math.round(values.rows ?? 3)))
      const columns = Math.max(1, Math.min(12, Math.round(values.columns ?? 3)))
      const head = `<tr>\n${Array.from(
        { length: columns },
        (_, column) => `      <th>${escapeHtml(labels.tableHeader)} ${column + 1}</th>`
      ).join('\n')}\n    </tr>`
      const body = Array.from(
        { length: rows },
        () =>
          `    <tr>\n${Array.from(
            { length: columns },
            () => `      <td>${escapeHtml(labels.tableCell)}</td>`
          ).join('\n')}\n    </tr>`
      ).join('\n')
      return `<table>\n  <thead>\n    ${head}\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>`
    }
    case 'ul':
    case 'ol': {
      const items = Math.max(1, Math.min(30, Math.round(values.items ?? 3)))
      const tag = id
      const list = Array.from(
        { length: items },
        (_, index) => `  <li>${escapeHtml(labels.listItem)} ${index + 1}</li>`
      ).join('\n')
      return `<${tag}>\n${list}\n</${tag}>`
    }
    case 'form': {
      const method = values.method === 'get' ? 'get' : 'post'
      const action = escapeAttr(values.action?.trim() || '')
      return `<form action="${action}" method="${method}">
  <!-- ${escapeHtml(labels.formPlaceholder)} -->
</form>`
    }
    case 'input': {
      const type = INPUT_TYPES.has(values.inputType ?? '') ? (values.inputType as string) : 'text'
      const rawName = values.name?.trim() || 'field'
      const name = slug(rawName, 'field')
      const label = escapeHtml(values.label?.trim() || rawName)
      return `<label for="${name}">${label}</label>\n<input type="${type}" id="${name}" name="${name}">`
    }
    case 'textarea': {
      const rawName = values.name?.trim() || 'message'
      const name = slug(rawName, 'message')
      const label = escapeHtml(values.label?.trim() || rawName)
      return `<label for="${name}">${label}</label>\n<textarea id="${name}" name="${name}" rows="4"></textarea>`
    }
    case 'select': {
      const rawName = values.name?.trim() || 'choice'
      const name = slug(rawName, 'choice')
      const label = escapeHtml(values.label?.trim() || rawName)
      return `<label for="${name}">${label}</label>\n<select id="${name}" name="${name}">\n  <option value="1">${escapeHtml(labels.selectOption)} 1</option>\n  <option value="2">${escapeHtml(labels.selectOption)} 2</option>\n</select>`
    }
    case 'button': {
      const text = escapeHtml(values.label?.trim() || 'OK')
      return `<button type="button">${text}</button>`
    }
    case 'comment':
      return `<!-- ${escapeHtml(values.text?.trim() || labels.comment)} -->`
    case 'link-css': {
      const href = escapeAttr(values.href?.trim() || 'style.css')
      return `<link rel="stylesheet" href="${href}">`
    }
    case 'style':
      return `<style>\n  \n</style>`
    case 'script':
      return `<script>\n  \n</script>`
    default:
      return ''
  }
}

/** Empty-cell placeholder tuned for pretty-printing inside generated structure. */
export function indentMarkup(markup: string, spaces: number): string {
  return indentLines(markup, spaces)
}
