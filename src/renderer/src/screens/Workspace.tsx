import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_SPLIT_RATIO,
  isEditorCollapsed,
  snapSplitRatio,
  splitRatioLimits
} from '@shared/layout'
import { Brand } from '../components/Brand'
import { IconButton } from '../components/Button'
import { Icon, type IconName } from '../components/Icon'
import { Spinner } from '../components/Feedback'
import { FileTree } from '../files/FileTree'
import { EditorPane } from '../editor/EditorPane'
import { TagShelf } from '../tags/TagShelf'
import { PreviewPane } from '../preview/PreviewPane'
import { ProblemsPanel } from '../problems/ProblemsPanel'
import { useApp } from '../state/AppContext'

interface RailItem {
  id: 'tree' | 'tags' | 'preview' | 'problems'
  icon: IconName
  labelKey: string
}

const RAIL_ITEMS: RailItem[] = [
  { id: 'tree', icon: 'folder', labelKey: 'workspace.files' },
  { id: 'tags', icon: 'tag', labelKey: 'workspace.tags' },
  { id: 'preview', icon: 'eye', labelKey: 'workspace.preview' },
  { id: 'problems', icon: 'bug', labelKey: 'workspace.problems' }
]

export function Workspace(): ReactNode {
  const { t } = useTranslation()
  const {
    project,
    server,
    problems,
    showTree,
    showTags,
    showPreview,
    showProblems,
    splitRatio,
    togglePanel,
    setSplitRatio,
    setSettingsOpen,
    settingsOpen,
    saveActive,
    closeProject,
    retryServer,
    revealItem,
    showToast
  } = useApp()
  const splitRef = useRef<HTMLDivElement | null>(null)
  const lastPress = useRef({ time: 0, moved: false })
  const [panesWidth, setPanesWidth] = useState(0)

  useEffect(() => {
    const node = splitRef.current
    if (!node) return
    setPanesWidth(node.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setPanesWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // A stored ratio that is too narrow for the current window collapses, so the
  // editor is never left in the clipped 100–319 px range after a resize.
  useEffect(() => {
    if (panesWidth <= 0) return
    const snapped = snapSplitRatio(splitRatio, panesWidth)
    if (snapped !== splitRatio) setSplitRatio(snapped)
  }, [panesWidth, splitRatio, setSplitRatio])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveActive()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveActive])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const container = splitRef.current
    if (!container) return
    event.preventDefault()

    const now = performance.now()
    const previous = lastPress.current
    if (now - previous.time < 350 && !previous.moved) {
      // Second press of a double-click: the shield swallows the native
      // `dblclick` event, so the toggle is detected here instead.
      lastPress.current = { time: 0, moved: false }
      togglePreviewMaximized()
      return
    }
    lastPress.current = { time: now, moved: false }

    const rect = container.getBoundingClientRect()
    if (rect.width <= 0) return

    // The <webview> is a separate frame and can swallow pointer moves once the
    // cursor crosses into the preview. A full-window shield keeps every move in
    // the host document, so the drag stays smooth all the way to either edge.
    const shield = document.createElement('div')
    shield.className = 'resize-shield'
    document.body.append(shield)

    document.body.classList.add('is-resizing')

    const onMove = (moveEvent: PointerEvent): void => {
      lastPress.current.moved = true
      const ratio = (moveEvent.clientX - rect.left) / rect.width
      setSplitRatio(snapSplitRatio(ratio, rect.width))
    }
    const onUp = (): void => {
      document.body.classList.remove('is-resizing')
      shield.removeEventListener('pointermove', onMove)
      shield.removeEventListener('pointerup', onUp)
      shield.removeEventListener('pointercancel', onUp)
      shield.remove()
    }
    shield.addEventListener('pointermove', onMove)
    shield.addEventListener('pointerup', onUp)
    shield.addEventListener('pointercancel', onUp)
  }

  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0
    const step = event.shiftKey ? 0.1 : 0.02
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSplitRatio(snapSplitRatio(splitRatio - step, width))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      // Once collapsed, ArrowRight restores the balanced split instead of
      // crawling through invisible ratios until the editor reaches 320 px.
      setSplitRatio(
        isEditorCollapsed(splitRatio, width)
          ? DEFAULT_SPLIT_RATIO
          : snapSplitRatio(splitRatio + step, width)
      )
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      // Home restores the balanced split, End gives the preview the full width.
      setSplitRatio(event.key === 'Home' ? DEFAULT_SPLIT_RATIO : splitRatioLimits(width).min)
    }
  }

  const togglePreviewMaximized = (): void => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0
    const widestPreview = splitRatioLimits(width).min
    const maximized = splitRatio <= widestPreview + 0.01
    setSplitRatio(maximized ? DEFAULT_SPLIT_RATIO : widestPreview)
  }

  const editorCollapsed = showPreview && isEditorCollapsed(splitRatio, panesWidth)
  const errorCount = problems.filter((problem) => problem.severity === 'error').length

  const serverLabel =
    server.state === 'starting'
      ? t('workspace.serverStarting')
      : server.state === 'running'
        ? server.phpAvailable
          ? t('workspace.serverRunning')
          : t('workspace.serverStatic')
        : server.state === 'failed'
          ? t('workspace.serverFailed')
          : t('workspace.serverStopped')

  const serverTone =
    server.state === 'running' ? (server.phpAvailable ? 'ok' : 'warn') : server.state === 'starting' ? 'busy' : 'bad'

  const serverDetail = server.message
    ? t(`errors.${server.message}`)
    : server.port
      ? `127.0.0.1:${server.port}`
      : null
  const serverTitle = serverDetail ? `${serverLabel} · ${serverDetail}` : serverLabel

  return (
    <div className="workspace">
      <header className="app-bar">
        <Brand />
        <div className="app-bar__project">
          {project ? (
            <button
              type="button"
              className="project-chip"
              title={project.root}
              onClick={() => void revealItem(project.root)}
            >
              <Icon name="folderOpen" size={18} />
              <span className="project-chip__name">{project.name}</span>
              <span className="project-chip__path">{project.root}</span>
            </button>
          ) : (
            <span className="project-chip is-empty">{t('workspace.noProject')}</span>
          )}
        </div>

        <div className="app-bar__status">
          <button
            type="button"
            className={`status-chip is-${serverTone}`}
            title={serverTitle}
            onClick={() => {
              if (server.state !== 'running') {
                void retryServer()
              } else if (!server.phpAvailable) {
                showToast('workspace.phpUnavailable')
              }
            }}
          >
            {server.state === 'starting' ? (
              <Spinner size={14} />
            ) : (
              <span className="status-chip__dot" />
            )}
            <span>{serverLabel}</span>
            {server.state === 'running' && server.port ? (
              <span className="status-chip__port">{server.port}</span>
            ) : null}
          </button>
        </div>

        <div className="app-bar__actions">
          <IconButton
            icon="save"
            label={t('actions.save')}
            dense
            onClick={() => saveActive()}
          />
          <IconButton
            icon="settings"
            label={t('settings.title')}
            dense
            selected={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          />
          <IconButton
            icon="folderOpen"
            label={t('actions.closeProject')}
            dense
            tooltipSide="left"
            onClick={() => void closeProject()}
          />
        </div>
      </header>

      <div className="workspace__body">
        <nav className="rail" aria-label={t('workspace.files')}>
          <div className="rail__items">
            {RAIL_ITEMS.map((item) => {
              const active =
                item.id === 'problems'
                  ? showProblems
                  : item.id === 'tree'
                    ? showTree
                    : item.id === 'tags'
                      ? showTags
                      : showPreview
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`rail__item${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => togglePanel(item.id)}
                >
                  <span className="rail__indicator">
                    <Icon name={item.icon} size={22} />
                    {item.id === 'problems' && problems.length > 0 ? (
                      <span className={`rail__badge${errorCount > 0 ? ' has-errors' : ''}`}>
                        {problems.length > 99 ? '99+' : problems.length}
                      </span>
                    ) : null}
                  </span>
                  <span className="rail__label">{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>
          <div className="rail__footer">
            <button
              type="button"
              className={`rail__item${settingsOpen ? ' is-active' : ''}`}
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <span className="rail__indicator">
                <Icon name="settings" size={22} />
              </span>
              <span className="rail__label">{t('workspace.settings')}</span>
            </button>
          </div>
        </nav>

        <div className="workspace__content">
          <div className="workspace__split">
            {showTree ? <FileTree /> : null}

            <div className="workspace__panes" ref={splitRef}>
              <div
                className={`workspace__editor-column${editorCollapsed ? ' is-collapsed' : ''}`}
                aria-hidden={editorCollapsed || undefined}
                inert={editorCollapsed || undefined}
                style={
                  showPreview
                    ? {
                        flexBasis: editorCollapsed ? '0%' : `${splitRatio * 100}%`,
                        flexGrow: 0,
                        flexShrink: 1
                      }
                    : undefined
                }
              >
                {showTags ? <TagShelf /> : null}
                <EditorPane />
              </div>

              {showPreview ? (
                <>
                  <div
                    className="splitter"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('workspace.preview')}
                    aria-valuenow={Math.round(splitRatio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    tabIndex={0}
                    onPointerDown={startResize}
                    onKeyDown={resizeByKeyboard}
                  >
                    <span className="splitter__grip" />
                  </div>
                  <div className="workspace__preview-column">
                    <PreviewPane />
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <ProblemsPanel />
        </div>
      </div>
    </div>
  )
}
