import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import { useTranslation } from 'react-i18next'

interface DialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  size?: 'small' | 'medium' | 'large'
  dismissible?: boolean
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  actions,
  size = 'small',
  dismissible = true
}: DialogProps): ReactNode {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const target = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel
    window.setTimeout(() => target?.focus(), 40)

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      restoreRef.current?.focus?.()
    }
  }, [open, dismissible])

  if (!open) return null

  return createPortal(
    <div
      className="md-dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`md-dialog md-dialog--${size}`}
      >
        <div className="md-dialog__header">
          <div>
            <h2 id={titleId} className="md-dialog__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="md-dialog__description">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <IconButton icon="x" label={t('actions.close')} onClick={onClose} dense />
          ) : null}
        </div>
        <div className="md-dialog__body">{children}</div>
        {actions ? <div className="md-dialog__actions">{actions}</div> : null}
      </div>
    </div>,
    document.body
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): ReactNode {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      dismissible={!busy}
      size="small"
      actions={
        <>
          <button type="button" className="md-button md-button--text" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`md-button ${danger ? 'md-button--danger' : 'md-button--filled'}`}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="md-dialog__message">{message}</p>
    </Dialog>
  )
}
