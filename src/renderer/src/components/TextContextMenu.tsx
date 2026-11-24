import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isMacPlatform, textMenuItems, type TextMenuState } from '@shared/text-menu'
import type { TextEditAction } from '@shared/types'
import { ContextMenu, type MenuItemSpec } from './Menu'
import type { IconName } from './Icon'

const ICONS: Record<TextEditAction, IconName> = {
  cut: 'cut',
  copy: 'copy',
  paste: 'paste',
  delete: 'trash',
  selectAll: 'selectAll'
}

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number'
])

interface OpenTextMenu {
  x: number
  y: number
  target: HTMLElement
  state: TextMenuState
}

/** The editable field under the pointer, if the right-click belongs to one. */
function editableTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const element = node.closest<HTMLElement>(
    'input, textarea, [contenteditable="true"], [contenteditable=""]'
  )
  if (!element) return null
  if (element instanceof HTMLInputElement) {
    if (!TEXT_INPUT_TYPES.has(element.type) || element.disabled) return null
    return element
  }
  if (element instanceof HTMLTextAreaElement) {
    return element.disabled ? null : element
  }
  return element.isContentEditable ? element : null
}

function selectionState(target: HTMLElement): { editable: boolean; hasSelection: boolean } {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const editable = !target.disabled && !target.readOnly
    let hasSelection = false
    try {
      hasSelection =
        target.selectionStart !== null &&
        target.selectionEnd !== null &&
        target.selectionStart !== target.selectionEnd
    } catch {
      // Some input types (number) do not expose a text selection.
      hasSelection = false
    }
    return { editable, hasSelection }
  }

  const selection = window.getSelection()
  const hasSelection = Boolean(
    selection &&
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      selection.anchorNode &&
      selection.focusNode &&
      target.contains(selection.anchorNode) &&
      target.contains(selection.focusNode)
  )
  return { editable: target.isContentEditable, hasSelection }
}

/**
 * Right-click menu for the editor and text fields. Native editing commands run
 * in main so cut/copy/paste keep working with CodeMirror's own clipboard
 * handling and with the window's focused element.
 */
export function TextContextMenu(): ReactNode {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<OpenTextMenu | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const onContextMenu = (event: MouseEvent): void => {
      const target = editableTarget(event.target)
      if (!target) return
      event.preventDefault()

      const token = ++requestRef.current
      const rect = target.getBoundingClientRect()
      const keyboardInvoked = event.clientX === 0 && event.clientY === 0
      const x = keyboardInvoked ? Math.round(rect.left + Math.min(rect.width / 2, 120)) : event.clientX
      const y = keyboardInvoked ? Math.round(rect.top + 24) : event.clientY
      const selection = selectionState(target)

      void window.webyou.ui
        .clipboardState()
        .then((clipboard) => {
          if (requestRef.current !== token) return
          setMenu({
            x,
            y,
            target,
            state: { ...selection, canPaste: clipboard.hasText }
          })
        })
        .catch(() => {
          if (requestRef.current !== token) return
          setMenu({ x, y, target, state: { ...selection, canPaste: false } })
        })
    }

    // A second click before the clipboard check finishes must not open a menu
    // at stale coordinates.
    const invalidate = (): void => {
      requestRef.current += 1
    }
    const close = (): void => setMenu(null)

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('pointerdown', invalidate, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('pointerdown', invalidate, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      requestRef.current += 1
    }
  }, [])

  if (!menu) return null

  const mac = isMacPlatform(navigator.userAgent)
  const items: MenuItemSpec[] = textMenuItems(menu.state, mac).map((item) => ({
    id: item.id,
    label: t(`textMenu.${item.id}`),
    icon: ICONS[item.id],
    disabled: item.disabled,
    separatorBefore: item.separatorBefore,
    shortcut: item.shortcut,
    keyShortcut: item.keyShortcut
  }))

  return (
    <ContextMenu
      open
      x={menu.x}
      y={menu.y}
      items={items}
      label={t('textMenu.label')}
      className="md-menu--text"
      restoreFocus={menu.target}
      onClose={() => setMenu(null)}
      onSelect={(id) => {
        void window.webyou.ui.edit(id as TextEditAction).catch(() => undefined)
      }}
    />
  )
}
