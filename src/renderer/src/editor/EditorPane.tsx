import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/Feedback'
import { CodeEditor } from './CodeEditor'
import { useApp } from '../state/AppContext'

export function EditorPane(): ReactNode {
  const { t } = useTranslation()
  const {
    tabs,
    activeTab,
    activePath,
    closeTab,
    updateContent,
    saveTab,
    saveActive,
    settings,
    problems,
    goto,
    editorRef,
    openFile
  } = useApp()
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const tabStripRef = useRef<HTMLDivElement | null>(null)

  const activeProblems = useMemo(
    () => (activeTab ? problems.filter((problem) => problem.file === activeTab.relative) : []),
    [problems, activeTab]
  )

  useEffect(() => {
    setCursor({ line: 1, column: 1 })
  }, [activePath])

  useEffect(() => {
    const strip = tabStripRef.current
    if (!strip) return
    const revealActive = (): void => {
      const active = strip.querySelector<HTMLElement>('[data-active="true"]')
      if (!active) return
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      // `scrollIntoView` leaves a half-visible neighbour on the left. Snap the
      // scroll position to a tab boundary so no cut-off tab remains visible.
      // Reset the trailing spacer first so the measurements use real tab widths.
      strip.style.setProperty('--tab-tail', '0px')
      const items = Array.from(strip.querySelectorAll<HTMLElement>('.file-tab'))
      const firstFull = items.find((item) => item.offsetLeft >= strip.scrollLeft - 1)
      if (!firstFull) return
      // Without trailing room the last tabs cannot be scrolled to the left edge,
      // so a sliver of the previous tab always stayed visible. Add exactly the
      // space the snap needs and no more.
      const maxScroll = strip.scrollWidth - strip.clientWidth
      const tail = Math.max(0, firstFull.offsetLeft - maxScroll)
      strip.style.setProperty('--tab-tail', `${tail}px`)
      if (firstFull.offsetLeft > 0) {
        strip.scrollLeft = firstFull.offsetLeft
      }
    }
    revealActive()
    // Shrinking the window (or widening the preview) can push the active tab
    // out of view; scrolling only on activePath used to leave it unreachable.
    const observer = new ResizeObserver(revealActive)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [activePath, tabs.length])

  const dirty = activeTab ? activeTab.content !== activeTab.saved : false

  return (
    <section className="pane editor-pane" aria-label={t('workspace.files')}>
      <div className="tabstrip">
        <div className="tabstrip__tabs" role="tablist" ref={tabStripRef}>
          {tabs.map((tab) => {
            const isActive = tab.path === activePath
            return (
              <div
                key={tab.path}
                className={`file-tab${isActive ? ' is-active' : ''}${
                  tab.content !== tab.saved ? ' is-dirty' : ''
                }`}
                data-active={isActive}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={tab.relative}
                  className="file-tab__main"
                  onClick={() => void openFile(tab.path)}
                >
                  <Icon name={tab.binary ? 'image' : 'fileCode'} size={16} />
                  <span className="file-tab__name">{tab.name}</span>
                  {tab.content !== tab.saved ? <span className="file-tab__dot" /> : null}
                </button>
                <button
                  type="button"
                  className="file-tab__close"
                  aria-label={t('editor.tabClose', { name: tab.name })}
                  onClick={(event) => {
                    event.stopPropagation()
                    void closeTab(tab.path)
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            )
          })}
        </div>
        <div className="tabstrip__status" aria-live="polite">
          {activeTab ? (
            <>
              <span className={`save-state${dirty ? ' is-dirty' : ''}`}>
                <Icon name={dirty ? 'info' : 'check'} size={14} />
                {dirty ? t('editor.unsaved') : t('editor.saved')}
              </span>
              <span className="cursor-position">
                {t('editor.lineColumn', { line: cursor.line, column: cursor.column })}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="editor-pane__body">
        {activeTab?.orphaned ? (
          <div className="editor-banner" role="status">
            <Icon name="alert" size={18} />
            <div className="editor-banner__text">
              <strong>{t('editor.fileDeleted')}</strong>
              <span>{t('editor.fileDeletedHint')}</span>
            </div>
            <button
              type="button"
              className="md-button md-button--text"
              onClick={() => saveTab(activeTab.path)}
            >
              {t('editor.saveFile')}
            </button>
            <button
              type="button"
              className="md-button md-button--text"
              onClick={() => void closeTab(activeTab.path)}
            >
              {t('actions.close')}
            </button>
          </div>
        ) : null}
        {activeTab ? (
          activeTab.binary ? (
            activeTab.mime.startsWith('image/') ? (
              <div className="binary-preview">
                <img
                  src={`data:${activeTab.mime};base64,${activeTab.content}`}
                  alt={activeTab.name}
                />
                <p className="binary-preview__hint">
                  {t('editor.binaryHint')}
                </p>
              </div>
            ) : (
              <EmptyState
                icon="file"
                title={t('editor.binaryTitle')}
                hint={t('editor.binaryHint')}
              />
            )
          ) : (
            <CodeEditor
              ref={editorRef}
              tab={activeTab}
              settings={settings}
              diagnostics={activeProblems}
              goto={goto}
              onChange={(content) => {
                if (activeTab) updateContent(activeTab.path, content)
              }}
              onSave={saveActive}
              onCursor={setCursor}
            />
          )
        ) : (
          <EmptyState
            icon="code"
            title={t('editor.noFile')}
            hint={t('editor.noFileHint')}
          />
        )}
      </div>
    </section>
  )
}
