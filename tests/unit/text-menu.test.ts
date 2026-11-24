import { describe, expect, it } from 'vitest'
import { isMacPlatform, shortcutLabel, textMenuItems } from '@shared/text-menu'

const enabled = { editable: true, hasSelection: true, canPaste: true }

function byId(items: ReturnType<typeof textMenuItems>, id: string) {
  const item = items.find((entry) => entry.id === id)
  if (!item) throw new Error(`missing menu item: ${id}`)
  return item
}

describe('shortcutLabel', () => {
  it('uses Ctrl on Windows and Linux', () => {
    expect(shortcutLabel('C', false)).toBe('Ctrl + C')
  })

  it('uses the command symbol on Apple platforms', () => {
    expect(shortcutLabel('C', true)).toBe('⌘ + C')
  })
})

describe('isMacPlatform', () => {
  it('detects Apple user agents', () => {
    expect(isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe(true)
  })

  it('does not treat Windows as a Mac', () => {
    expect(isMacPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })
})

describe('textMenuItems', () => {
  it('offers all five actions in order', () => {
    const items = textMenuItems(enabled, false)
    expect(items.map((item) => item.id)).toEqual(['cut', 'copy', 'paste', 'delete', 'selectAll'])
  })

  it('keeps everything enabled for an editable field with a selection', () => {
    const items = textMenuItems(enabled, false)
    expect(items.every((item) => !item.disabled)).toBe(true)
  })

  it('disables actions that need a selection when nothing is selected', () => {
    const items = textMenuItems({ ...enabled, hasSelection: false }, false)
    expect(byId(items, 'cut').disabled).toBe(true)
    expect(byId(items, 'copy').disabled).toBe(true)
    expect(byId(items, 'delete').disabled).toBe(true)
    expect(byId(items, 'paste').disabled).toBe(false)
    expect(byId(items, 'selectAll').disabled).toBe(false)
  })

  it('disables editing commands in a read-only field but keeps copy and select all', () => {
    const items = textMenuItems({ ...enabled, editable: false }, false)
    expect(byId(items, 'cut').disabled).toBe(true)
    expect(byId(items, 'paste').disabled).toBe(true)
    expect(byId(items, 'delete').disabled).toBe(true)
    expect(byId(items, 'copy').disabled).toBe(false)
    expect(byId(items, 'selectAll').disabled).toBe(true)
  })

  it('disables paste when the clipboard has no text', () => {
    const items = textMenuItems({ ...enabled, canPaste: false }, false)
    expect(byId(items, 'paste').disabled).toBe(true)
  })

  it('shows platform-specific hints and aria combinations', () => {
    const items = textMenuItems(enabled, true)
    expect(byId(items, 'copy')).toMatchObject({
      shortcut: '⌘ + C',
      keyShortcut: 'Meta+C'
    })
    expect(byId(items, 'selectAll').keyShortcut).toBe('Meta+A')
  })

  it('separates select all from the destructive actions', () => {
    const items = textMenuItems(enabled, false)
    expect(byId(items, 'selectAll').separatorBefore).toBe(true)
    expect(items.filter((item) => item.separatorBefore)).toHaveLength(1)
  })
})
