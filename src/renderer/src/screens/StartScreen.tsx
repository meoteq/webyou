import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentProject, TemplateId } from '@shared/types'
import { Button, IconButton } from '../components/Button'
import { Brand } from '../components/Brand'
import { Icon, type IconName } from '../components/Icon'
import { useApp } from '../state/AppContext'

const TEMPLATES: { id: TemplateId; icon: IconName; accent: 'primary' | 'secondary' | 'tertiary' }[] = [
  { id: 'blank', icon: 'fileCode', accent: 'primary' },
  { id: 'business-card', icon: 'layers', accent: 'secondary' },
  { id: 'php-form', icon: 'terminal', accent: 'tertiary' }
]

function timeAgo(
  openedAt: number,
  translate: (key: string, options?: Record<string, unknown>) => string
): string {
  const minutes = Math.max(0, Math.floor((Date.now() - openedAt) / 60000))
  if (minutes < 1) return translate('time.justNow')
  if (minutes < 60) return translate('time.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return translate('time.hoursAgo', { count: hours })
  return translate('time.daysAgo', { count: Math.floor(hours / 24) })
}

function RecentRow({ item }: { item: RecentProject }): ReactNode {
  const { t } = useTranslation()
  const { openRecentProject, removeRecentProject } = useApp()
  return (
    <div className="recent-row">
      <button
        type="button"
        className="recent-row__main"
        onClick={() => void openRecentProject(item.path)}
        title={item.path}
      >
        <span className="recent-row__icon">
          <Icon name="folder" size={20} />
        </span>
        <span className="recent-row__text">
          <span className="recent-row__name">{item.name}</span>
          <span className="recent-row__path">{item.path}</span>
        </span>
        <span className="recent-row__time">{timeAgo(item.openedAt, t)}</span>
        <Icon name="chevronRight" size={18} />
      </button>
      <IconButton
        icon="x"
        label={t('actions.remove')}
        dense
        tooltipSide="left"
        onClick={() => void removeRecentProject(item.path)}
      />
    </div>
  )
}

export function StartScreen(): ReactNode {
  const { t } = useTranslation()
  const {
    recent,
    appInfo,
    settings,
    openDirectory,
    openCreate,
    setSettingsOpen,
    updateSettings
  } = useApp()

  return (
    <div className="start-screen">
      <header className="start-screen__bar">
        <Brand />
        <div className="start-screen__bar-actions">
          <IconButton
            icon="globe"
            label={t('settings.language')}
            onClick={() =>
              void updateSettings({ language: settings.language === 'ru' ? 'en' : 'ru' })
            }
          />
          <IconButton
            icon="settings"
            label={t('settings.title')}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      <main className="start-screen__main">
        <section className="hero">
          <div className="hero__copy">
            <span className="eyebrow">
              <Icon name="sparkle" size={16} />
              {t('start.eyebrow')}
            </span>
            <h1 className="hero__title">{t('start.title')}</h1>
            <p className="hero__subtitle">{t('start.subtitle')}</p>
            <div className="hero__actions">
              <Button icon="plus" onClick={() => openCreate('blank')}>
                {t('actions.createFromTemplate')}
              </Button>
              <Button variant="outlined" icon="folderOpen" onClick={() => void openDirectory()}>
                {t('actions.openFolder')}
              </Button>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <span className="hero-art__glow" />
            <div className="hero-window">
              <div className="hero-window__bar">
                <span className="hero-dot hero-dot--primary" />
                <span className="hero-dot hero-dot--secondary" />
                <span className="hero-dot hero-dot--tertiary" />
                <span className="hero-window__address">my-first-site</span>
              </div>
              <div className="hero-window__body">
                <div className="hero-code">
                  <span className="hero-line is-tag" style={{ width: '56%' }} />
                  <span className="hero-line is-attr" style={{ width: '78%' }} />
                  <span className="hero-line is-text" style={{ width: '68%' }} />
                  <span className="hero-line is-text" style={{ width: '84%' }} />
                  <span className="hero-line is-close" style={{ width: '42%' }} />
                </div>
                <div className="hero-preview">
                  <span className="hero-preview__badge">Hello</span>
                  <span className="hero-preview__title" />
                  <span className="hero-preview__text" />
                  <span className="hero-preview__text is-short" />
                  <span className="hero-preview__button" />
                </div>
              </div>
            </div>
            <span className="hero-chip hero-chip--tag">&lt;h1&gt;</span>
            <span className="hero-chip hero-chip--css">color: ocean;</span>
          </div>
        </section>

        <section className="start-section">
          <div className="start-section__head">
            <h2 className="md-headline-small">{t('start.templates')}</h2>
          </div>
          <div className="template-grid">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`template-card template-card--${template.accent}`}
                onClick={() => openCreate(template.id)}
              >
                <span className="template-card__top">
                  <span className="template-card__icon">
                    <Icon name={template.icon} size={24} />
                  </span>
                  <span className="template-card__arrow">
                    <Icon name="arrowRight" size={18} />
                  </span>
                </span>
                <span className="template-card__name">
                  {t(`start.template.${template.id}.name`)}
                </span>
                <span className="template-card__description">
                  {t(`start.template.${template.id}.description`)}
                </span>
                <span className="template-card__meta">
                  {t(`start.template.${template.id}.meta`)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="start-section">
          <div className="start-section__head">
            <h2 className="md-headline-small">{t('start.recent')}</h2>
            <p className="md-body-small start-section__hint">{t('start.recentHint')}</p>
          </div>
          {recent.length === 0 ? (
            <div className="recent-empty">
              <Icon name="folderOpen" size={22} />
              <span>{t('start.noRecent')}</span>
            </div>
          ) : (
            <div className="recent-list">
              {recent.map((item) => (
                <RecentRow key={item.path} item={item} />
              ))}
            </div>
          )}
        </section>

        <footer className="start-screen__footer">
          <span>{t('start.footerNote')}</span>
          {appInfo ? <span>WebYou {appInfo.version}</span> : null}
        </footer>
      </main>
    </div>
  )
}
