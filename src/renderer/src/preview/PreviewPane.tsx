import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { buildPreviewUrl } from '@shared/preview'
import { IconButton } from '../components/Button'
import { EmptyState, Spinner } from '../components/Feedback'
import { Icon } from '../components/Icon'
import { getApi } from '../lib/api'
import { useApp } from '../state/AppContext'
import type { WebviewElement } from './webview'

type ScreenSize = 'phone' | 'tablet' | 'desktop'

const SCREEN_WIDTHS: Record<ScreenSize, number | null> = {
  phone: 375,
  tablet: 768,
  desktop: null
}

/** Bezel padding around the frame, in CSS pixels on both sides. */
const DEVICE_PADDING = 8
/** Never shrink a device viewport below this, or modes become indistinguishable. */
const MIN_DEVICE_SCALE = 0.7

function readableAddress(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${decodeURIComponent(parsed.pathname)}${parsed.hash}`
  } catch {
    return url
  }
}

export function PreviewPane(): ReactNode {
  const { t } = useTranslation()
  const { project, previewPath, server, previewReload, setPanel, retryServer } = useApp()
  const [size, setSize] = useState<ScreenSize>('desktop')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const webviewRef = useRef<WebviewElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageWidth, setStageWidth] = useState(0)
  const pendingScroll = useRef<number | null>(null)

  const src = useMemo(() => {
    if (!project || !previewPath || !server.port) return null
    return buildPreviewUrl(server.port, project.root, previewPath)
  }, [project, previewPath, server.port])

  const ready = server.state === 'running' && Boolean(src)

  const reloadPreservingScroll = useCallback((): void => {
    const webview = webviewRef.current
    if (!webview || !webview.isConnected) return
    const reload = (): void => {
      // The element can be replaced by a remount (for example after a rename)
      // while the scroll position is read. Reloading a detached webview throws,
      // so guard it instead of letting the error unmount the whole app.
      if (!webview.isConnected) return
      try {
        webview.reload()
      } catch {
        // The new webview is already loading its own src.
      }
    }
    try {
      const scroll = webview.executeJavaScript<number>('window.scrollY')
      void scroll
        .then((value) => {
          pendingScroll.current = typeof value === 'number' ? value : 0
        })
        .catch(() => {
          pendingScroll.current = 0
        })
        .finally(() => {
          setLoading(true)
          reload()
        })
    } catch {
      setLoading(true)
      reload()
    }
  }, [])

  const previousSrc = useRef(src)
  useEffect(() => {
    if (previousSrc.current !== src) {
      // A different page is already being loaded by the remounted webview.
      previousSrc.current = src
      return
    }
    if (previewReload === 0) return
    reloadPreservingScroll()
  }, [previewReload, src, reloadPreservingScroll])

  useEffect(() => {
    pendingScroll.current = null
    setFailed(false)
    setCurrentUrl(src ?? '')
  }, [src])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      setStageWidth(entry ? entry.contentRect.width : stage.clientWidth)
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview || !src) return

    const onStart = (): void => {
      setLoading(true)
      setFailed(false)
    }
    const onStop = (): void => {
      setLoading(false)
      try {
        setCanBack(webview.canGoBack())
        setCanForward(webview.canGoForward())
        setCurrentUrl(webview.getURL() || src)
      } catch {
        setCurrentUrl(src)
      }
      if (pendingScroll.current !== null) {
        const y = pendingScroll.current
        pendingScroll.current = null
        window.setTimeout(() => {
          void webview
            .executeJavaScript(`window.scrollTo(0, ${Math.round(y)})`)
            .catch(() => undefined)
        }, 40)
      }
    }
    const onNavigate = (event: Event): void => {
      const url = (event as Event & { url?: string }).url
      if (url) setCurrentUrl(url)
      try {
        setCanBack(webview.canGoBack())
        setCanForward(webview.canGoForward())
      } catch {
        // Ignore a webview that is being torn down.
      }
    }
    const onFail = (event: Event): void => {
      const details = event as Event & { errorCode?: number; isMainFrame?: boolean }
      if (details.isMainFrame === false) return
      if (details.errorCode === -3) return
      setLoading(false)
      setFailed(true)
    }

    webview.addEventListener('did-start-loading', onStart)
    webview.addEventListener('did-stop-loading', onStop)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)
    webview.addEventListener('did-fail-load', onFail)
    return () => {
      webview.removeEventListener('did-start-loading', onStart)
      webview.removeEventListener('did-stop-loading', onStop)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
      webview.removeEventListener('did-fail-load', onFail)
    }
  }, [src])

  const goBack = (): void => {
    const webview = webviewRef.current
    if (!webview) return
    try {
      if (webview.canGoBack()) webview.goBack()
    } catch {
      // Ignore.
    }
  }

  const goForward = (): void => {
    const webview = webviewRef.current
    if (!webview) return
    try {
      if (webview.canGoForward()) webview.goForward()
    } catch {
      // Ignore.
    }
  }

  const openExternal = (): void => {
    const url = currentUrl || src
    if (!url) return
    void getApi().shell.openExternal(url)
  }

  const frameWidth = SCREEN_WIDTHS[size]
  // The bezel is part of the device box, so the inner frame keeps the true CSS
  // width of the chosen device (375 / 768) instead of losing 16 px to padding.
  const deviceWidth = frameWidth ? frameWidth + DEVICE_PADDING * 2 : null
  const rawScale =
    deviceWidth && stageWidth > 0 ? Math.min(1, stageWidth / deviceWidth) : 1
  // Scale only down to a readable floor. Below it the stage scrolls instead of
  // turning phone and tablet into two almost identical thumbnails.
  const deviceScale = Math.max(rawScale, MIN_DEVICE_SCALE)
  const scaledWidth = deviceWidth ? Math.round(deviceWidth * deviceScale) : null

  return (
    <section className="pane preview-pane" aria-label={t('preview.title')}>
      <div className="pane__header preview-pane__header">
        <div className="pane__heading">
          <h2 className="md-title-small">{t('preview.title')}</h2>
          <p className="md-body-small pane__subtitle">
            {previewPath ? previewPath.split(/[\\/]/).pop() : t('preview.empty')}
          </p>
        </div>
        <div className="pane__actions">
          <div className="segmented" role="group" aria-label={t('preview.width')}>
            {(['phone', 'tablet', 'desktop'] as const).map((item) => (
              <IconButton
                key={item}
                icon={item === 'phone' ? 'phone' : item === 'tablet' ? 'tablet' : 'monitor'}
                label={t(`preview.${item}`)}
                selected={size === item}
                dense
                onClick={() => setSize(item)}
              />
            ))}
          </div>
          <IconButton
            icon="panelLeft"
            label={t('actions.close')}
            dense
            tooltipSide="left"
            onClick={() => setPanel('preview', false)}
          />
        </div>
      </div>

      <div className="preview-toolbar">
        <IconButton
          icon="arrowLeft"
          label={t('actions.back')}
          dense
          disabled={!canBack}
          onClick={goBack}
        />
        <IconButton
          icon="arrowRight"
          label={t('actions.forward')}
          dense
          disabled={!canForward}
          onClick={goForward}
        />
        <IconButton
          icon="refresh"
          label={t('actions.reload')}
          dense
          disabled={!ready}
          onClick={reloadPreservingScroll}
        />
        <div className="preview-address" title={currentUrl || src || ''}>
          <Icon name="lock" size={14} />
          <span>{src ? readableAddress(currentUrl || src) : t('preview.empty')}</span>
          {loading ? <Spinner size={14} /> : null}
        </div>
        {scaledWidth ? (
          <span className="preview-scale-badge" role="status">
            {t('preview.scale', {
              width: frameWidth,
              scale: Math.round(deviceScale * 100)
            })}
          </span>
        ) : null}
        <IconButton
          icon="external"
          label={t('actions.openInBrowser')}
          dense
          disabled={!ready}
          tooltipSide="left"
          onClick={openExternal}
        />
      </div>

      {server.state === 'running' && !server.phpAvailable ? (
        <div className="preview-notice" role="status">
          <Icon name="info" size={18} />
          <span>{t('preview.phpFallback')}</span>
        </div>
      ) : null}

      <div className="preview-stage" data-size={size} ref={stageRef}>
        {ready ? (
          <div
            className="preview-device-slot"
            data-scaled={deviceScale < 1 || undefined}
            style={scaledWidth ? { width: `${scaledWidth}px` } : undefined}
          >
            <div
              className="preview-device"
              data-width={frameWidth ?? undefined}
              data-scaled={deviceScale < 1 || undefined}
              style={
                deviceWidth
                  ? {
                      width: `${deviceWidth}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      height: `${100 / deviceScale}%`,
                      flex: '0 0 auto',
                      transform: `scale(${deviceScale})`,
                      transformOrigin: 'top left'
                    }
                  : undefined
              }
            >
            {failed ? (
              <div className="preview-failed">
                <EmptyState
                  icon="alert"
                  title={t('preview.failed')}
                  action={
                    <button type="button" className="md-button md-button--tonal" onClick={reloadPreservingScroll}>
                      {t('actions.retry')}
                    </button>
                  }
                />
              </div>
            ) : null}
            {createElement('webview', {
              key: src,
              ref: (node: HTMLElement | null) => {
                webviewRef.current = node as WebviewElement | null
              },
              partition: 'persist:webyou-preview',
              src,
              className: 'preview-frame',
              webpreferences: 'contextIsolation=yes,sandbox=yes,nodeIntegration=no',
              style: { display: failed ? 'none' : 'flex' }
            })}
            </div>
          </div>
        ) : (
          <div className="preview-placeholder">
            {server.state === 'starting' ? (
              <>
                <Spinner size={26} />
                <p>{t('workspace.serverStarting')}</p>
              </>
            ) : server.state === 'running' && !previewPath ? (
              <EmptyState icon="eye" title={t('preview.empty')} hint={t('preview.emptyHint')} />
            ) : (
              <EmptyState
                icon="terminal"
                title={server.state === 'failed' ? t('preview.serverFailed') : t('preview.empty')}
                hint={
                  server.state === 'failed'
                    ? t('workspace.phpUnavailable')
                    : t('preview.emptyHint')
                }
                action={
                  <button
                    type="button"
                    className="md-button md-button--tonal"
                    onClick={() => void retryServer()}
                  >
                    {t('actions.restartServer')}
                  </button>
                }
              />
            )}
          </div>
        )}
      </div>
    </section>
  )
}
