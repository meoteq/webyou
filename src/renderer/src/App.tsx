import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Brand } from './components/Brand'
import { Dialog } from './components/Dialog'
import { Spinner, Snackbar } from './components/Feedback'
import { TextContextMenu } from './components/TextContextMenu'
import { StartScreen } from './screens/StartScreen'
import { Workspace } from './screens/Workspace'
import { CreateProjectDialog } from './screens/CreateProjectDialog'
import { SettingsDialog } from './screens/SettingsDialog'
import { useApp } from './state/AppContext'

function Splash(): ReactNode {
  return (
    <div className="boot-screen">
      <Brand showTagline />
      <Spinner size={26} />
    </div>
  )
}

export function MissingApi(): ReactNode {
  const { t } = useTranslation()
  return (
    <div className="boot-screen">
      <Brand showTagline />
      <p className="boot-screen__message">{t('errors.preload')}</p>
    </div>
  )
}

function ToastHost(): ReactNode {
  const { t } = useTranslation()
  const { toast, dismissToast } = useApp()
  if (!toast) return null
  return (
    <Snackbar
      message={t(toast.key, toast.options)}
      kind={toast.kind}
      onDismiss={dismissToast}
    />
  )
}

/**
 * Shown when a dirty tab collided with an external edit. It cannot be dismissed
 * with Escape: one side has to win before autosave resumes.
 */
function ConflictDialog(): ReactNode {
  const { t } = useTranslation()
  const { conflict, conflictCount, resolveConflict } = useApp()
  if (!conflict) return null
  return (
    <Dialog
      open
      title={t('dialog.conflict.title')}
      description={conflict.relative}
      onClose={() => undefined}
      dismissible={false}
      actions={
        <>
          <button
            type="button"
            className="md-button md-button--text"
            onClick={() => void resolveConflict('reload')}
          >
            {t('dialog.conflict.reload')}
          </button>
          <button
            type="button"
            className="md-button md-button--filled"
            onClick={() => void resolveConflict('mine')}
            data-autofocus
          >
            {t('dialog.conflict.keepMine')}
          </button>
        </>
      }
    >
      <p className="md-dialog__message">
        {t('dialog.conflict.message', { name: conflict.name })}
      </p>
      {conflictCount > 1 ? (
        <p className="md-body-small dialog-queue-note">
          {t('dialog.conflict.queue', { count: conflictCount - 1 })}
        </p>
      ) : null}
    </Dialog>
  )
}

/**
 * Shown when closing a project or a tab would drop edits that could not be
 * written. Closing is blocked until the person cancels or explicitly discards.
 */
function SaveFailureDialog(): ReactNode {
  const { t } = useTranslation()
  const { saveFailure, dismissSaveFailure, discardAndClose } = useApp()
  if (!saveFailure) return null
  return (
    <Dialog
      open
      title={t('dialog.saveFailed.title')}
      description={t('dialog.saveFailed.message', { count: saveFailure.files.length })}
      onClose={dismissSaveFailure}
      actions={
        <>
          <button type="button" className="md-button md-button--text" onClick={dismissSaveFailure}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="md-button md-button--filled md-button--danger"
            onClick={() => void discardAndClose()}
            data-autofocus
          >
            {t('dialog.saveFailed.discard')}
          </button>
        </>
      }
    >
      <ul className="save-failure-list">
        {saveFailure.files.map((file) => (
          <li key={file.path}>
            <span className="save-failure-list__name">{file.relative}</span>
            <span className="save-failure-list__reason">{t(file.reason)}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

export default function App(): ReactNode {
  const { t } = useTranslation()
  const { ready, fatal, project } = useApp()

  if (!ready) return <Splash />
  if (fatal) {
    return (
      <div className="boot-screen">
        <Brand showTagline />
        <p className="boot-screen__message">{t('errors.generic')}</p>
      </div>
    )
  }

  return (
    <>
      {project ? <Workspace /> : <StartScreen />}
      <CreateProjectDialog />
      <SettingsDialog />
      <ConflictDialog />
      <SaveFailureDialog />
      <TextContextMenu />
      <ToastHost />
    </>
  )
}
