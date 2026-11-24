import type { TextEditAction } from './types'

export interface TextMenuState {
  /** The target accepts text edits (not read-only, not disabled). */
  editable: boolean
  /** Text is selected inside the target. */
  hasSelection: boolean
  /** The system clipboard holds text that can be pasted. */
  canPaste: boolean
}

export interface TextMenuItem {
  id: TextEditAction
  /** Visible hint on the trailing side of the item, e.g. "Ctrl + C". */
  shortcut: string
  /** Machine-readable combination for `aria-keyshortcuts`. */
  keyShortcut: string
  disabled: boolean
  separatorBefore?: boolean
}

/** True for Apple platforms, where the command key replaces Ctrl in hints. */
export function isMacPlatform(userAgent: string): boolean {
  return /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(userAgent)
}

/** "Ctrl + C" on Windows/Linux, "⌘ + C" on Apple platforms. */
export function shortcutLabel(key: string, mac: boolean): string {
  return mac ? `⌘ + ${key}` : `Ctrl + ${key}`
}

/**
 * Build the text-editing menu. Items stay visible and become disabled when an
 * action is unavailable, as M3 menus require.
 */
export function textMenuItems(state: TextMenuState, mac: boolean): TextMenuItem[] {
  const modifier = mac ? 'Meta' : 'Control'
  const selectionAction = !state.editable || !state.hasSelection

  return [
    {
      id: 'cut',
      shortcut: shortcutLabel('X', mac),
      keyShortcut: `${modifier}+X`,
      disabled: selectionAction
    },
    {
      id: 'copy',
      shortcut: shortcutLabel('C', mac),
      keyShortcut: `${modifier}+C`,
      disabled: !state.hasSelection
    },
    {
      id: 'paste',
      shortcut: shortcutLabel('V', mac),
      keyShortcut: `${modifier}+V`,
      disabled: !state.editable || !state.canPaste
    },
    {
      id: 'delete',
      shortcut: 'Delete',
      keyShortcut: 'Delete',
      disabled: selectionAction
    },
    {
      id: 'selectAll',
      shortcut: shortcutLabel('A', mac),
      keyShortcut: `${modifier}+A`,
      disabled: !state.editable,
      separatorBefore: true
    }
  ]
}
