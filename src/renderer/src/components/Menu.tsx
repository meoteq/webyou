import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'

export interface MenuItemSpec {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  /** Visible hint on the trailing side, e.g. "Ctrl + C". */
  shortcut?: string
  /** Machine-readable combination for `aria-keyshortcuts`, e.g. "Control+C". */
  keyShortcut?: string
}

interface ContextMenuProps {
  open: boolean
  x: number
  y: number
  items: MenuItemSpec[]
  onSelect: (id: string) => void
  onClose: () => void
  /** Accessible name for the menu. */
  label?: string
  className?: string
  /**
   * Element that receives focus again when the menu closes. Defaults to
   * whatever was focused when the menu opened.
   */
  restoreFocus?: HTMLElement | null
}

export function ContextMenu({
  open,
  x,
  y,
  items,
  onSelect,
  onClose,
  label,
  className,
  restoreFocus
}: ContextMenuProps): ReactNode {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const restoreRef = useRef<HTMLElement | null>(null)

  const closeAndRestore = useCallback((): void => {
    const target = restoreRef.current
    restoreRef.current = null
    onClose()
    if (target?.isConnected) target.focus({ preventScroll: true })
  }, [onClose])

  // Keep the menu inside the window and grow it from the clicked corner.
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    menu.style.transformOrigin = `${left < x ? 'right' : 'left'} ${top < y ? 'bottom' : 'top'}`
  }, [open, x, y, items.length])

  // M3 menus focus their first item on open and return focus on close.
  useEffect(() => {
    if (!open) return
    restoreRef.current = restoreFocus ?? (document.activeElement as HTMLElement | null)
    const list = itemsRef.current
    const firstEnabled = list.findIndex((item) => !item.disabled)
    const index = firstEnabled === -1 ? 0 : firstEnabled
    const timer = window.setTimeout(() => {
      itemRefs.current[index]?.focus({ preventScroll: true })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      restoreRef.current = null
    }
  }, [open, restoreFocus])

  // Escape must close the menu before an underlying dialog sees the key.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeAndRestore()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, closeAndRestore])

  const moveFocus = (delta: number): void => {
    const list = itemRefs.current
    if (list.length === 0) return
    const current = list.findIndex((element) => element === document.activeElement)
    const start = current === -1 ? (delta > 0 ? -1 : 0) : current
    const next = (start + delta + list.length) % list.length
    list[next]?.focus({ preventScroll: true })
  }

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(-1)
        break
      case 'Home':
        event.preventDefault()
        itemRefs.current[0]?.focus({ preventScroll: true })
        break
      case 'End':
        event.preventDefault()
        itemRefs.current[itemRefs.current.length - 1]?.focus({ preventScroll: true })
        break
      case 'Tab':
        // Return focus to the trigger; the browser then moves it onward.
        closeAndRestore()
        break
      default:
        break
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="md-menu-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeAndRestore()
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        closeAndRestore()
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        className={`md-menu${className ? ` ${className}` : ''}`}
        style={{ left: x, top: y }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onKeyDown={onMenuKeyDown}
      >
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <div className="md-menu__divider" role="separator" /> : null}
            <button
              ref={(node) => {
                itemRefs.current[index] = node
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              aria-keyshortcuts={item.keyShortcut}
              className={`md-menu__item${item.danger ? ' is-danger' : ''}${
                item.disabled ? ' is-disabled' : ''
              }`}
              onClick={() => {
                if (item.disabled) return
                closeAndRestore()
                onSelect(item.id)
              }}
            >
              {item.icon ? <Icon name={item.icon} size={20} /> : <span className="md-menu__spacer" />}
              <span className="md-menu__label">{item.label}</span>
              {item.shortcut ? (
                <span className="md-menu__shortcut" aria-hidden="true">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          </Fragment>
        ))}
      </div>
    </div>,
    document.body
  )
}
