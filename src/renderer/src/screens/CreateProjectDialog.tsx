import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TemplateId } from '@shared/types'
import { isValidEntryName } from '@shared/names'
import { errorKey } from '@shared/errors'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { getApi } from '../lib/api'
import { useApp } from '../state/AppContext'

const TEMPLATES: { id: TemplateId; icon: IconName; accent: 'primary' | 'secondary' | 'tertiary' }[] = [
  { id: 'blank', icon: 'fileCode', accent: 'primary' },
  { id: 'business-card', icon: 'layers', accent: 'secondary' },
  { id: 'php-form', icon: 'terminal', accent: 'tertiary' }
]

export function CreateProjectDialog(): ReactNode {
  const { t } = useTranslation()
  const { createOpen, createTemplate, setCreateOpen, createProject, appInfo, settings } = useApp()
  const [template, setTemplate] = useState<TemplateId>('blank')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!createOpen) return
    setTemplate(createTemplate ?? 'blank')
    setError(null)
    setBusy(false)
    setLocation((current) => current || appInfo?.documentsDir || '')
  }, [createOpen, createTemplate, appInfo?.documentsDir])

  const trimmed = name.trim()
  const validName = isValidEntryName(trimmed)
  const valid = validName && location.length > 0 && !busy

  const browse = async (): Promise<void> => {
    try {
      const folder = await getApi().project.pickFolder()
      if (folder) setLocation(folder)
    } catch (caught) {
      setError(errorKey(caught))
    }
  }

  const submit = async (): Promise<void> => {
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      await createProject({
        templateId: template,
        parentDirectory: location,
        name: trimmed,
        language: settings.language
      })
      setName('')
    } catch (caught) {
      setError(errorKey(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={createOpen}
      title={t('dialog.createProject.title')}
      description={t('dialog.createProject.description')}
      onClose={() => setCreateOpen(false)}
      dismissible={!busy}
      size="medium"
      actions={
        <>
          <Button variant="text" onClick={() => setCreateOpen(false)} disabled={busy}>
            {t('actions.cancel')}
          </Button>
          <Button icon="sparkle" onClick={() => void submit()} disabled={!valid}>
            {busy ? t('dialog.createProject.creating') : t('actions.create')}
          </Button>
        </>
      }
    >
      <div className="create-form">
        <div className="create-form__section">
          <p className="md-label-large">{t('dialog.createProject.template')}</p>
          <div className="template-picker" role="radiogroup" aria-label={t('dialog.createProject.template')}>
            {TEMPLATES.map((item) => {
              const selected = template === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`template-option template-option--${item.accent}${selected ? ' is-selected' : ''}`}
                  onClick={() => setTemplate(item.id)}
                >
                  <span className="template-option__icon">
                    <Icon name={item.icon} size={22} />
                  </span>
                  <span className="template-option__text">
                    <span className="template-option__name">
                      {t(`start.template.${item.id}.name`)}
                    </span>
                    <span className="template-option__description">
                      {t(`start.template.${item.id}.description`)}
                    </span>
                  </span>
                  <span className="template-option__check">
                    <Icon name="check" size={16} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="md-field">
          <span className="md-field__label">{t('dialog.createProject.name')}</span>
          <input
            className="md-field__input"
            value={name}
            autoFocus
            data-autofocus
            spellCheck={false}
            placeholder={t('dialog.createProject.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <span className="md-field__hint">{t('dialog.createProject.nameHint')}</span>
          {trimmed !== name && trimmed.length > 0 ? (
            <span className="md-field__hint">{t('dialog.trimHint')}</span>
          ) : null}
        </label>

        <div className="md-field">
          <span className="md-field__label">{t('dialog.createProject.location')}</span>
          <div className="md-field__row">
            <input
              className="md-field__input md-field__input--mono"
              value={location}
              readOnly
              placeholder={t('dialog.createProject.locationPlaceholder')}
            />
            <Button variant="tonal" icon="folderOpen" onClick={() => void browse()}>
              {t('actions.browse')}
            </Button>
          </div>
        </div>

        {error ? <p className="md-field__error">{t(error)}</p> : null}
      </div>
    </Dialog>
  )
}
