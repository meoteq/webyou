import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'

export function Brand({ showTagline = false }: { showTagline?: boolean }): ReactNode {
  const { t } = useTranslation()
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">
        <Icon name="code" size={22} />
      </span>
      <span className="brand__text">
        <span className="brand__name">{t('app.name')}</span>
        {showTagline ? <span className="brand__tagline">{t('app.tagline')}</span> : null}
      </span>
    </div>
  )
}
