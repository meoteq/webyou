import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { extnameText } from '@shared/path-text'
import { FilterChip, IconButton } from '../components/Button'
import { TagFormDialog } from './TagFormDialog'
import { TAG_CATALOG, TAG_GROUPS, type TagDefinition, type TagGroup } from './catalog'
import { useApp } from '../state/AppContext'

export function TagShelf(): ReactNode {
  const { t } = useTranslation()
  const { activeTab, editorRef, setPanel, showToast } = useApp()
  const [group, setGroup] = useState<TagGroup>('structure')
  const [formTag, setFormTag] = useState<TagDefinition | null>(null)

  const extension = activeTab ? extnameText(activeTab.name) : ''
  const enabled = extension === '.html' || extension === '.htm' || extension === '.php'

  const tags = useMemo(
    () => TAG_CATALOG.filter((tag) => tag.group === group),
    [group]
  )

  const insert = (tag: TagDefinition): void => {
    if (!enabled) {
      showToast('tags.disabled', 'error')
      return
    }
    if (tag.form) {
      setFormTag(tag)
      return
    }
    if (!tag.spec || !editorRef.current) {
      showToast('errors.generic', 'error')
      return
    }
    editorRef.current.insertTag(tag.spec)
  }

  return (
    <section className={`tag-shelf${enabled ? '' : ' is-disabled'}`} aria-label={t('tags.title')}>
      <div className="tag-shelf__header">
        <div className="tag-shelf__heading">
          <h2 className="md-title-small">{t('tags.title')}</h2>
          <p className="md-body-small tag-shelf__hint">{enabled ? t('tags.hint') : t('tags.disabled')}</p>
        </div>
        <IconButton
          icon="chevronDown"
          label={t('actions.close')}
          dense
          onClick={() => setPanel('tags', false)}
        />
      </div>

      <div className="tag-shelf__groups" role="group" aria-label={t('tags.title')}>
        {TAG_GROUPS.map((item) => (
          <FilterChip
            key={item}
            selected={group === item}
            onClick={() => setGroup(item)}
          >
            {t(`tags.groups.${item}`)}
          </FilterChip>
        ))}
      </div>

      <div className="tag-shelf__tags">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="tag-button"
            disabled={!enabled}
            data-tooltip={t(`tags.hints.${tag.id}`)}
            data-tooltip-side="top"
            onClick={() => insert(tag)}
          >
            <span className="tag-button__glyph">{tag.glyph}</span>
          </button>
        ))}
      </div>

      {formTag ? (
        <TagFormDialog
          key={formTag.id}
          tag={formTag}
          onClose={() => setFormTag(null)}
        />
      ) : null}
    </section>
  )
}
