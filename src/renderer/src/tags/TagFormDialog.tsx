import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TagFormValues } from '@shared/tag-markup'
import { buildTagMarkup, type MarkupLabels } from '@shared/tag-markup'
import { dirnameRelative } from '@shared/path-text'
import { errorKey } from '@shared/errors'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { getApi } from '../lib/api'
import { useApp } from '../state/AppContext'
import type { TagDefinition, TagFormKind } from './catalog'

const INPUT_TYPES = [
  'text',
  'email',
  'password',
  'number',
  'date',
  'time',
  'search',
  'tel',
  'url',
  'color',
  'range',
  'checkbox',
  'radio',
  'file'
] as const

const TITLE_KEYS: Record<TagFormKind, string> = {
  skeleton: 'tags.form.skeletonTitle',
  anchor: 'tags.form.anchorTitle',
  image: 'tags.form.imageTitle',
  video: 'tags.form.videoTitle',
  table: 'tags.form.tableTitle',
  list: 'tags.form.listTitle',
  form: 'tags.form.formTitle',
  input: 'tags.form.inputTitle',
  field: 'tags.form.fieldTitle',
  button: 'tags.form.buttonTitle',
  comment: 'tags.form.commentTitle',
  link: 'tags.form.linkTitle'
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  type?: 'text' | 'number'
  min?: number
  max?: number
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  type = 'text',
  min,
  max
}: TextFieldProps): ReactNode {
  return (
    <label className="md-field">
      <span className="md-field__label">{label}</span>
      <input
        className="md-field__input"
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        autoFocus={autoFocus}
        data-autofocus={autoFocus ? '' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

interface TagFormDialogProps {
  tag: TagDefinition
  onClose: () => void
}

export function TagFormDialog({ tag, onClose }: TagFormDialogProps): ReactNode {
  const { t } = useTranslation()
  const { activeTab, editorRef, settings, showToast } = useApp()
  const selectId = useId()
  const [values, setValues] = useState<TagFormValues>({
    method: 'post',
    inputType: 'text',
    rows: 3,
    columns: 3,
    items: 3,
    lang: settings.language,
    href: tag.id === 'link-css' ? 'style.css' : ''
  })

  const form = tag.form
  if (!form) return null

  const set = <K extends keyof TagFormValues>(key: K, value: TagFormValues[K]): void => {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  const labels: MarkupLabels = {
    tableHeader: t('tags.markup.tableHeader'),
    tableCell: t('tags.markup.tableCell'),
    listItem: t('tags.markup.listItem'),
    formPlaceholder: t('tags.markup.formPlaceholder'),
    pageTitle: t('tags.markup.pageTitle'),
    comment: t('tags.markup.comment'),
    selectOption: t('tags.markup.selectOption')
  }

  const chooseImage = async (): Promise<void> => {
    if (!activeTab) return
    try {
      const directory = dirnameRelative(activeTab.relative) || '.'
      const relative = await getApi().fs.pickImage(directory)
      if (relative) set('src', relative)
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  const insert = (): void => {
    if (!editorRef.current) {
      showToast('errors.generic', 'error')
      return
    }
    editorRef.current.insertMarkup(buildTagMarkup(tag.id, values, labels))
    onClose()
  }

  const nameField = (): ReactNode => (
    <>
      <TextField
        label={t('tags.form.fields.name')}
        value={values.name ?? ''}
        onChange={(value) => set('name', value)}
        placeholder={t('tags.form.placeholders.name')}
        autoFocus
      />
      <TextField
        label={t('tags.form.fields.label')}
        value={values.label ?? ''}
        onChange={(value) => set('label', value)}
        placeholder={t('tags.form.placeholders.label')}
      />
    </>
  )

  return (
    <Dialog
      open
      title={t(TITLE_KEYS[form])}
      description={form === 'skeleton' ? t('tags.form.skeletonHint') : undefined}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button icon="plus" onClick={insert}>
            {t('actions.insert')}
          </Button>
        </>
      }
    >
      <div className="tag-form">
        {form === 'skeleton' ? (
          <>
            <TextField
              label={t('tags.form.fields.title')}
              value={values.title ?? ''}
              onChange={(value) => set('title', value)}
              placeholder={t('tags.form.placeholders.title')}
              autoFocus
            />
            <div className="md-field">
              <label className="md-field__label" htmlFor={selectId}>
                {t('tags.form.fields.lang')}
              </label>
              <select
                id={selectId}
                className="md-field__input"
                value={values.lang ?? 'en'}
                onChange={(event) => set('lang', event.target.value)}
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </div>
          </>
        ) : null}

        {form === 'anchor' ? (
          <>
            <TextField
              label={t('tags.form.fields.href')}
              value={values.href ?? ''}
              onChange={(value) => set('href', value)}
              placeholder={t('tags.form.placeholders.href')}
              autoFocus
            />
            <TextField
              label={t('tags.form.fields.text')}
              value={values.text ?? ''}
              onChange={(value) => set('text', value)}
              placeholder={t('tags.form.placeholders.text')}
            />
          </>
        ) : null}

        {form === 'image' ? (
          <>
            <div className="md-field">
              <span className="md-field__label">{t('tags.form.fields.src')}</span>
              <div className="md-field__row">
                <input
                  className="md-field__input"
                  value={values.src ?? ''}
                  placeholder={t('tags.form.placeholders.src')}
                  data-autofocus
                  onChange={(event) => set('src', event.target.value)}
                />
                <Button variant="tonal" icon="image" onClick={() => void chooseImage()}>
                  {t('actions.browse')}
                </Button>
              </div>
            </div>
            <TextField
              label={t('tags.form.fields.alt')}
              value={values.alt ?? ''}
              onChange={(value) => set('alt', value)}
              placeholder={t('tags.form.placeholders.alt')}
            />
          </>
        ) : null}

        {form === 'video' ? (
          <TextField
            label={t('tags.form.fields.src')}
            value={values.src ?? ''}
            onChange={(value) => set('src', value)}
            placeholder="video.mp4"
            autoFocus
          />
        ) : null}

        {form === 'table' ? (
          <div className="tag-form__grid">
            <TextField
              label={t('tags.form.fields.rows')}
              type="number"
              min={1}
              max={20}
              value={String(values.rows ?? 3)}
              onChange={(value) => set('rows', Number(value) || 1)}
              autoFocus
            />
            <TextField
              label={t('tags.form.fields.columns')}
              type="number"
              min={1}
              max={12}
              value={String(values.columns ?? 3)}
              onChange={(value) => set('columns', Number(value) || 1)}
            />
          </div>
        ) : null}

        {form === 'list' ? (
          <TextField
            label={t('tags.form.fields.items')}
            type="number"
            min={1}
            max={30}
            value={String(values.items ?? 3)}
            onChange={(value) => set('items', Number(value) || 1)}
            autoFocus
          />
        ) : null}

        {form === 'form' ? (
          <>
            <TextField
              label={t('tags.form.fields.action')}
              value={values.action ?? ''}
              onChange={(value) => set('action', value)}
              placeholder={t('tags.form.placeholders.action')}
              autoFocus
            />
            <div className="md-field">
              <label className="md-field__label" htmlFor={`${selectId}-method`}>
                {t('tags.form.fields.method')}
              </label>
              <select
                id={`${selectId}-method`}
                className="md-field__input"
                value={values.method ?? 'post'}
                onChange={(event) => set('method', event.target.value as 'get' | 'post')}
              >
                <option value="post">{t('tags.form.methodPost')}</option>
                <option value="get">{t('tags.form.methodGet')}</option>
              </select>
            </div>
          </>
        ) : null}

        {form === 'input' ? (
          <>
            <div className="md-field">
              <label className="md-field__label" htmlFor={`${selectId}-type`}>
                {t('tags.form.fields.inputType')}
              </label>
              <select
                id={`${selectId}-type`}
                className="md-field__input"
                value={values.inputType ?? 'text'}
                onChange={(event) => set('inputType', event.target.value)}
              >
                {INPUT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`tags.form.inputTypes.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            {nameField()}
          </>
        ) : null}

        {form === 'field' ? nameField() : null}

        {form === 'button' ? (
          <TextField
            label={t('tags.form.fields.label')}
            value={values.label ?? ''}
            onChange={(value) => set('label', value)}
            placeholder="OK"
            autoFocus
          />
        ) : null}

        {form === 'comment' ? (
          <TextField
            label={t('tags.form.fields.comment')}
            value={values.text ?? ''}
            onChange={(value) => set('text', value)}
            placeholder={t('tags.form.placeholders.text')}
            autoFocus
          />
        ) : null}

        {form === 'link' ? (
          <TextField
            label={t('tags.form.fields.href')}
            value={values.href ?? ''}
            onChange={(value) => set('href', value)}
            placeholder="style.css"
            autoFocus
          />
        ) : null}
      </div>
    </Dialog>
  )
}
