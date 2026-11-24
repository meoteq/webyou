import type { TagInsertSpec } from '@shared/tag-insert'

export interface EditorContext {
  doc: string
  from: number
  to: number
}

/** Imperative surface the tag shelf uses to edit the active document. */
export interface EditorHandle {
  getContext(): EditorContext | null
  insertTag(spec: TagInsertSpec): void
  insertMarkup(markup: string): void
  focus(): void
}
