import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './Icon'

interface SnackbarProps {
  message: string
  kind?: 'info' | 'success' | 'error'
  onDismiss: () => void
}

export function Snackbar({ message, kind = 'info', onDismiss }: SnackbarProps): ReactNode {
  const { t } = useTranslation()
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, kind === 'error' ? 6000 : 3800)
    return () => window.clearTimeout(timer)
  }, [message, kind, onDismiss])

  return (
    <div className={`md-snackbar md-snackbar--${kind}`} role="status" aria-live="polite">
      <Icon name={kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info'} size={20} />
      <span>{message}</span>
      <button
        type="button"
        className="md-snackbar__close"
        onClick={onDismiss}
        aria-label={t('actions.close')}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  )
}

export function Spinner({ size = 20 }: { size?: number }): ReactNode {
  return <span className="md-spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

interface EmptyStateProps {
  icon: IconName
  title: string
  hint?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, hint, action }: EmptyStateProps): ReactNode {
  return (
    <div className="md-empty">
      <div className="md-empty__icon">
        <Icon name={icon} size={26} />
      </div>
      <p className="md-empty__title">{title}</p>
      {hint ? <p className="md-empty__hint">{hint}</p> : null}
      {action}
    </div>
  )
}
