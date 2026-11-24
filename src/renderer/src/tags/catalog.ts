import type { TagId, TagInsertSpec } from '@shared/tag-insert'

export type TagGroup = 'structure' | 'text' | 'lists' | 'media' | 'table' | 'forms' | 'other'

/** Which mini-form (if any) a tag needs before it can be generated. */
export type TagFormKind =
  | 'skeleton'
  | 'anchor'
  | 'image'
  | 'video'
  | 'table'
  | 'list'
  | 'form'
  | 'input'
  | 'field'
  | 'button'
  | 'comment'
  | 'link'

export interface TagDefinition {
  id: TagId
  group: TagGroup
  /** Displayed on the button, e.g. `<div>`. Tag names are not translated. */
  glyph: string
  form?: TagFormKind
  /** Direct insertion spec for tags without a form. */
  spec?: TagInsertSpec
}

const pair = (tag: string): TagInsertSpec => ({
  open: `<${tag}>`,
  close: `</${tag}>`,
  placeholder: ''
})

export const TAG_GROUPS: TagGroup[] = [
  'structure',
  'text',
  'lists',
  'media',
  'table',
  'forms',
  'other'
]

export const TAG_CATALOG: TagDefinition[] = [
  { id: 'skeleton', group: 'structure', glyph: '!html', form: 'skeleton' },
  { id: 'div', group: 'structure', glyph: '<div>', spec: pair('div') },
  { id: 'header', group: 'structure', glyph: '<header>', spec: pair('header') },
  { id: 'nav', group: 'structure', glyph: '<nav>', spec: pair('nav') },
  { id: 'main', group: 'structure', glyph: '<main>', spec: pair('main') },
  { id: 'section', group: 'structure', glyph: '<section>', spec: pair('section') },
  { id: 'footer', group: 'structure', glyph: '<footer>', spec: pair('footer') },

  { id: 'h1', group: 'text', glyph: '<h1>', spec: pair('h1') },
  { id: 'h2', group: 'text', glyph: '<h2>', spec: pair('h2') },
  { id: 'h3', group: 'text', glyph: '<h3>', spec: pair('h3') },
  { id: 'p', group: 'text', glyph: '<p>', spec: pair('p') },
  { id: 'strong', group: 'text', glyph: '<strong>', spec: pair('strong') },
  { id: 'em', group: 'text', glyph: '<em>', spec: pair('em') },
  { id: 'br', group: 'text', glyph: '<br>', spec: { open: '<br>', caretOnly: true } },
  { id: 'hr', group: 'text', glyph: '<hr>', spec: { open: '<hr>', caretOnly: true } },

  { id: 'ul', group: 'lists', glyph: '<ul>', form: 'list' },
  { id: 'ol', group: 'lists', glyph: '<ol>', form: 'list' },

  { id: 'a', group: 'media', glyph: '<a>', form: 'anchor' },
  { id: 'img', group: 'media', glyph: '<img>', form: 'image' },
  { id: 'video', group: 'media', glyph: '<video>', form: 'video' },

  { id: 'table', group: 'table', glyph: '<table>', form: 'table' },

  { id: 'form', group: 'forms', glyph: '<form>', form: 'form' },
  { id: 'input', group: 'forms', glyph: '<input>', form: 'input' },
  { id: 'textarea', group: 'forms', glyph: '<textarea>', form: 'field' },
  { id: 'select', group: 'forms', glyph: '<select>', form: 'field' },
  { id: 'button', group: 'forms', glyph: '<button>', form: 'button' },

  { id: 'comment', group: 'other', glyph: '<!-- -->', form: 'comment' },
  { id: 'link-css', group: 'other', glyph: '<link>', form: 'link' },
  { id: 'style', group: 'other', glyph: '<style>', spec: pair('style') },
  { id: 'script', group: 'other', glyph: '<script>', spec: pair('script') }
]

export const TAG_BY_ID = new Map(TAG_CATALOG.map((tag) => [tag.id, tag]))
