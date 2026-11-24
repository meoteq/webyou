import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ThemePreference } from '@shared/types'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { Switch } from '../components/Switch'
import { useApp } from '../state/AppContext'

const THEMES: { id: ThemePreference; icon: IconName }[] = [
  { id: 'system', icon: 'monitor' },
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' }
]

export function SettingsDialog(): ReactNode {
  const { t } = useTranslation()
  const { settings, settingsOpen, setSettingsOpen, updateSettings, appInfo, server } = useApp()
  const [fontSize, setFontSize] = useState(settings.fontSize)
  const [delay, setDelay] = useState(settings.autoSaveDelay)
  const fontTimer = useRef<number | null>(null)
  const delayTimer = useRef<number | null>(null)

  useEffect(() => {
    setFontSize(settings.fontSize)
  }, [settings.fontSize])

  useEffect(() => {
    setDelay(settings.autoSaveDelay)
  }, [settings.autoSaveDelay])

  useEffect(() => {
    return () => {
      if (fontTimer.current !== null) window.clearTimeout(fontTimer.current)
      if (delayTimer.current !== null) window.clearTimeout(delayTimer.current)
    }
  }, [])

  const commitFontSize = (value: number): void => {
    const next = Math.min(32, Math.max(10, Math.round(value)))
    setFontSize(next)
    if (fontTimer.current !== null) window.clearTimeout(fontTimer.current)
    fontTimer.current = window.setTimeout(() => {
      void updateSettings({ fontSize: next })
    }, 160)
  }

  const commitDelay = (value: number): void => {
    const next = Math.min(3000, Math.max(150, Math.round(value / 50) * 50))
    setDelay(next)
    if (delayTimer.current !== null) window.clearTimeout(delayTimer.current)
    delayTimer.current = window.setTimeout(() => {
      void updateSettings({ autoSaveDelay: next })
    }, 160)
  }

  const phpLabel = appInfo?.phpVersion
    ? t('settings.phpFound', { version: appInfo.phpVersion })
    : t('settings.phpMissing')

  return (
    <Dialog
      open={settingsOpen}
      title={t('settings.title')}
      onClose={() => setSettingsOpen(false)}
      size="medium"
      actions={
        <Button variant="text" onClick={() => setSettingsOpen(false)}>
          {t('actions.close')}
        </Button>
      }
    >
      <div className="settings-form">
        <section className="settings-section">
          <h3 className="settings-section__title">{t('settings.appearance')}</h3>

          <div className="setting-row">
            <div className="setting-row__label">
              <p className="md-title-small">{t('settings.language')}</p>
              <p className="md-body-small">{t('settings.languageHint')}</p>
            </div>
            <div className="segmented segmented--text" role="group" aria-label={t('settings.language')}>
              <button
                type="button"
                className={`segmented__button${settings.language === 'ru' ? ' is-selected' : ''}`}
                aria-pressed={settings.language === 'ru'}
                onClick={() => void updateSettings({ language: 'ru' })}
              >
                Русский
              </button>
              <button
                type="button"
                className={`segmented__button${settings.language === 'en' ? ' is-selected' : ''}`}
                aria-pressed={settings.language === 'en'}
                onClick={() => void updateSettings({ language: 'en' })}
              >
                English
              </button>
            </div>
          </div>

          <div className="setting-row setting-row--stack">
            <div className="setting-row__label">
              <p className="md-title-small">{t('settings.theme')}</p>
            </div>
            <div className="theme-picker" role="radiogroup" aria-label={t('settings.theme')}>
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.theme === theme.id}
                  className={`theme-option${settings.theme === theme.id ? ' is-selected' : ''}`}
                  onClick={() => void updateSettings({ theme: theme.id })}
                >
                  <span className={`theme-option__preview theme-option__preview--${theme.id}`}>
                    <span />
                  </span>
                  <span className="theme-option__label">
                    <Icon name={theme.icon} size={16} />
                    {t(`settings.theme${theme.id === 'system' ? 'System' : theme.id === 'light' ? 'Light' : 'Dark'}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="settings-divider" />

        <section className="settings-section">
          <h3 className="settings-section__title">{t('settings.editor')}</h3>

          <div className="setting-row setting-row--stack">
            <div className="setting-row__label">
              <p className="md-title-small">{t('settings.fontSize')}</p>
              <p className="md-body-small">{t('settings.fontSizeHint')}</p>
            </div>
            <div className="range-row">
              <button
                type="button"
                className="md-icon-button md-icon-button--tonal"
                aria-label={t('settings.fontSize')}
                onClick={() => commitFontSize(fontSize - 1)}
                disabled={fontSize <= 10}
              >
                <Icon name="minus" size={14} />
              </button>
              <input
                type="range"
                min={10}
                max={32}
                step={1}
                value={fontSize}
                aria-label={t('settings.fontSize')}
                onChange={(event) => commitFontSize(Number(event.target.value))}
              />
              <span className="range-row__value">{fontSize}px</span>
              <button
                type="button"
                className="md-icon-button md-icon-button--tonal"
                aria-label={t('settings.fontSize')}
                onClick={() => commitFontSize(fontSize + 1)}
                disabled={fontSize >= 32}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <p className="md-title-small">{t('settings.wordWrap')}</p>
              <p className="md-body-small">{t('settings.wordWrapHint')}</p>
            </div>
            <Switch
              checked={settings.wordWrap}
              label={t('settings.wordWrap')}
              onChange={(checked) => void updateSettings({ wordWrap: checked })}
            />
          </div>

          <div className="setting-row setting-row--stack">
            <div className="setting-row__label">
              <p className="md-title-small">{t('settings.autoSave')}</p>
              <p className="md-body-small">{t('settings.autoSaveHint')}</p>
            </div>
            <div className="range-row">
              <input
                type="range"
                min={150}
                max={3000}
                step={50}
                value={delay}
                aria-label={t('settings.autoSave')}
                onChange={(event) => commitDelay(Number(event.target.value))}
              />
              <span className="range-row__value">{t('settings.delayValue', { value: delay })}</span>
            </div>
          </div>
        </section>

        <div className="settings-divider" />

        <section className="settings-section">
          <h3 className="settings-section__title">{t('settings.about')}</h3>
          <dl className="about-list">
            <div className="about-list__row">
              <dt>{t('settings.versionLabel')}</dt>
              <dd>{appInfo ? `WebYou ${appInfo.version}` : '—'}</dd>
            </div>
            <div className="about-list__row">
              <dt>{t('settings.php')}</dt>
              <dd className={appInfo?.phpVersion ? 'is-positive' : 'is-muted'}>{phpLabel}</dd>
            </div>
            <div className="about-list__row">
              <dt>{t('settings.server')}</dt>
              <dd>
                {server.state === 'running' && server.port
                  ? t('settings.serverRunning', { port: server.port })
                  : t('settings.serverStopped')}
              </dd>
            </div>
            <div className="about-list__row">
              <dt>{t('settings.dataFolder')}</dt>
              <dd className="about-list__path" title={appInfo?.dataDir}>
                {appInfo?.dataDir ?? '—'}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </Dialog>
  )
}
