import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode
} from 'react'
import type {
  AppInfo,
  FileNode,
  FileReadResult,
  FsChangedEvent,
  Problem,
  ProjectInfo,
  RecentProject,
  ServerStatus,
  Settings,
  TemplateId
} from '@shared/types'
import type { CreateProjectInput } from '@shared/api'
import { clampRatio, DEFAULT_SPLIT_RATIO } from '@shared/layout'
import {
  basenameText,
  dirnameRelative,
  extnameText,
  joinPathText,
  relativePosixText
} from '@shared/path-text'
import { isPreviewablePage, pickEntryPage, pickPreviewPage } from '@shared/preview'
import { errorKey } from '@shared/errors'
import i18n, { applyLanguage } from '../i18n'
import { getApi } from '../lib/api'
import type { EditorHandle } from '../editor/editor-handle'

export interface OpenTab {
  path: string
  relative: string
  name: string
  content: string
  saved: string
  eol: 'lf' | 'crlf'
  binary: boolean
  mime: string
  /** Last observed on-disk modification time; guards against external edits. */
  mtime: number
  /**
   * The file was deleted outside WebYou while this buffer had unsaved edits.
   * Autosave must not recreate it; only an explicit save may do that.
   */
  orphaned?: boolean
}

/** A dirty tab whose file was changed on disk by something else. */
export interface FileConflict {
  path: string
  relative: string
  name: string
}

export interface SaveFailureFile {
  path: string
  relative: string
  name: string
  /** Translation key explaining why the write failed. */
  reason: string
}

/** A blocking close that was stopped because some buffers could not be saved. */
export interface SaveFailure {
  action: 'project' | 'tab'
  tabPath?: string
  files: SaveFailureFile[]
}

export interface ToastMessage {
  key: string
  kind: 'info' | 'success' | 'error'
  options?: Record<string, unknown>
}

export interface GotoTarget {
  path: string
  line: number
  column: number
  nonce: number
}

export type PanelName = 'tree' | 'tags' | 'preview' | 'problems'

interface LayoutState {
  showTree: boolean
  showTags: boolean
  showPreview: boolean
  showProblems: boolean
  splitRatio: number
}

interface AppContextValue extends LayoutState {
  ready: boolean
  fatal: boolean
  settings: Settings
  appInfo: AppInfo | null
  project: ProjectInfo | null
  recent: RecentProject[]
  tree: FileNode[]
  treeTruncated: boolean
  tabs: OpenTab[]
  activeTab: OpenTab | null
  activePath: string | null
  problems: Problem[]
  server: ServerStatus
  toast: ToastMessage | null
  /** First unresolved conflict; the dialog resolves them one at a time. */
  conflict: FileConflict | null
  conflictCount: number
  saveFailure: SaveFailure | null
  previewPath: string | null
  previewReload: number
  goto: GotoTarget | null
  createOpen: boolean
  createTemplate: TemplateId | null
  settingsOpen: boolean
  editorRef: MutableRefObject<EditorHandle | null>
  showToast: (key: string, kind?: ToastMessage['kind'], options?: Record<string, unknown>) => void
  dismissToast: () => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  openDirectory: () => Promise<void>
  openRecentProject: (path: string) => Promise<void>
  removeRecentProject: (path: string) => Promise<void>
  createProject: (input: CreateProjectInput) => Promise<void>
  closeProject: () => Promise<void>
  refreshTree: () => Promise<void>
  openFile: (path: string, location?: { line: number; column: number }) => Promise<void>
  closeTab: (path: string) => Promise<void>
  updateContent: (path: string, content: string) => void
  saveTab: (path: string) => void
  saveActive: () => void
  createItem: (parent: string, name: string, kind: 'file' | 'directory') => Promise<void>
  renameItem: (path: string, newName: string) => Promise<void>
  deleteItem: (path: string) => Promise<void>
  revealItem: (path: string) => Promise<void>
  resolveConflict: (choice: 'mine' | 'reload') => Promise<void>
  dismissSaveFailure: () => void
  discardAndClose: () => Promise<void>
  navigateProblem: (problem: Problem) => void
  setPanel: (panel: PanelName, open: boolean) => void
  togglePanel: (panel: PanelName) => void
  setSplitRatio: (ratio: number) => void
  setCreateOpen: (open: boolean) => void
  openCreate: (template?: TemplateId) => void
  setSettingsOpen: (open: boolean) => void
  retryServer: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

const LAYOUT_KEY = 'webyou.layout'
const DEFAULT_LAYOUT: LayoutState = {
  showTree: true,
  showTags: true,
  showPreview: true,
  showProblems: false,
  splitRatio: DEFAULT_SPLIT_RATIO
}

const LAYOUT_KEYS: Record<PanelName, keyof Omit<LayoutState, 'splitRatio'>> = {
  tree: 'showTree',
  tags: 'showTags',
  preview: 'showPreview',
  problems: 'showProblems'
}

function readLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as Partial<LayoutState>
    return {
      showTree: typeof parsed.showTree === 'boolean' ? parsed.showTree : DEFAULT_LAYOUT.showTree,
      showTags: typeof parsed.showTags === 'boolean' ? parsed.showTags : DEFAULT_LAYOUT.showTags,
      showPreview:
        typeof parsed.showPreview === 'boolean' ? parsed.showPreview : DEFAULT_LAYOUT.showPreview,
      showProblems:
        typeof parsed.showProblems === 'boolean'
          ? parsed.showProblems
          : DEFAULT_LAYOUT.showProblems,
      splitRatio:
        typeof parsed.splitRatio === 'number' && parsed.splitRatio >= 0 && parsed.splitRatio <= 1
          ? parsed.splitRatio
          : DEFAULT_LAYOUT.splitRatio
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

function tabsStorageKey(root: string): string {
  return `webyou.tabs:${root.toLowerCase()}`
}

function readStoredTabs(root: string): { paths: string[]; activePath: string | null } {
  try {
    const raw = localStorage.getItem(tabsStorageKey(root))
    if (!raw) return { paths: [], activePath: null }
    const parsed = JSON.parse(raw) as { paths?: unknown; activePath?: unknown }
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.filter((item): item is string => typeof item === 'string')
      : []
    return {
      paths,
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null
    }
  } catch {
    return { paths: [], activePath: null }
  }
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  const walk = (list: FileNode[]): void => {
    for (const node of list) {
      if (node.kind === 'file') files.push(node)
      else if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return files
}

function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function startsWithPath(candidate: string, base: string): boolean {
  const lower = candidate.toLowerCase()
  const baseLower = base.toLowerCase()
  return lower === baseLower || lower.startsWith(`${baseLower}\\`) || lower.startsWith(`${baseLower}/`)
}

function mergeRuntimeProblems(previous: Problem[], incoming: Problem[]): Problem[] {
  const seen = new Set(previous.map((item) => `${item.file}:${item.line}:${item.message}`))
  const merged = [...previous]
  for (const problem of incoming) {
    const key = `${problem.file}:${problem.line}:${problem.message}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(problem)
  }
  return merged.slice(-40)
}

/** Move lint results to their new relative paths after a rename. */
function remapProblemRecords(
  previous: Record<string, Problem[]>,
  remap: (relative: string) => string
): Record<string, Problem[]> {
  let changed = false
  const next: Record<string, Problem[]> = {}
  for (const [relative, problems] of Object.entries(previous)) {
    const mapped = remap(relative)
    next[mapped] = problems.map((problem) => ({ ...problem, file: mapped }))
    if (mapped !== relative) changed = true
  }
  return changed ? next : previous
}

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const api = getApi()
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    language: 'en',
    theme: 'system',
    fontSize: 14,
    wordWrap: true,
    autoSaveDelay: 500
  })
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [tree, setTree] = useState<FileNode[]>([])
  const [treeTruncated, setTreeTruncated] = useState(false)
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [phpProblems, setPhpProblems] = useState<Record<string, Problem[]>>({})
  const [htmlProblems, setHtmlProblems] = useState<Record<string, Problem[]>>({})
  const [runtimeProblems, setRuntimeProblems] = useState<Problem[]>([])
  const [server, setServer] = useState<ServerStatus>({
    state: 'stopped',
    port: null,
    phpAvailable: false
  })
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [conflicts, setConflicts] = useState<FileConflict[]>([])
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null)
  const [layout, setLayout] = useState<LayoutState>(readLayout)
  const [lastPreviewPath, setLastPreviewPath] = useState<string | null>(null)
  const [previewReload, setPreviewReload] = useState(0)
  const [goto, setGoto] = useState<GotoTarget | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTemplate, setCreateTemplate] = useState<TemplateId | null>('blank')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )

  const editorRef = useRef<EditorHandle | null>(null)
  const tabsRef = useRef<OpenTab[]>(tabs)
  const projectRef = useRef<ProjectInfo | null>(project)
  const settingsRef = useRef<Settings>(settings)
  const lastPreviewRef = useRef<string | null>(lastPreviewPath)
  const saveTimers = useRef(new Map<string, number>())
  const writeChains = useRef(new Map<string, Promise<unknown>>())
  const lastWrite = useRef(new Map<string, number>())
  const failedSaves = useRef(new Set<string>())
  const saveErrors = useRef(new Map<string, string>())
  const conflictsRef = useRef<FileConflict[]>(conflicts)
  const treeTimer = useRef<number | null>(null)
  const refreshTreeRef = useRef<() => Promise<void>>(async () => undefined)
  const externalReloadRef = useRef<(event: FsChangedEvent) => void>(() => undefined)
  const queueSaveRef = useRef<(path: string) => Promise<boolean>>(async () => true)

  tabsRef.current = tabs
  projectRef.current = project
  settingsRef.current = settings
  lastPreviewRef.current = lastPreviewPath
  conflictsRef.current = conflicts

  const showToast = useCallback(
    (key: string, kind: ToastMessage['kind'] = 'info', options?: Record<string, unknown>) => {
      setToast({ key, kind, options })
    },
    []
  )

  const dismissToast = useCallback(() => setToast(null), [])

  const clearSaveTimer = (path: string): void => {
    const timer = saveTimers.current.get(path)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      saveTimers.current.delete(path)
    }
  }

  const hasConflict = (path: string): boolean =>
    conflictsRef.current.some((item) => samePath(item.path, path))

  const addConflict = (file: FileConflict): void => {
    setConflicts((previous) =>
      previous.some((item) => samePath(item.path, file.path)) ? previous : [...previous, file]
    )
  }

  const removeConflict = (path: string): void => {
    setConflicts((previous) => previous.filter((item) => !samePath(item.path, path)))
  }

  const describeFailure = (tab: OpenTab): SaveFailureFile => ({
    path: tab.path,
    relative: tab.relative,
    name: tab.name,
    reason: tab.orphaned
      ? 'errors.fileDeleted'
      : saveErrors.current.get(tab.path) ?? 'errors.generic'
  })

  const runLints = async (tab: OpenTab, content: string): Promise<void> => {
    const root = projectRef.current?.root
    if (!root) return
    const extension = extnameText(tab.name)
    try {
      if (extension === '.php') {
        const result = await api.lint.php(tab.path)
        setPhpProblems((previous) => {
          const next = { ...previous }
          if (result.problems.length > 0) next[tab.relative] = result.problems
          else delete next[tab.relative]
          return next
        })
      } else if (extension === '.html' || extension === '.htm') {
        const found = await api.lint.html({ path: tab.path, content })
        setHtmlProblems((previous) => {
          const next = { ...previous }
          if (found.length > 0) next[tab.relative] = found
          else delete next[tab.relative]
          return next
        })
      }
    } catch {
      // Linting is best-effort; editing and saving must keep working.
    }
  }

  const performSave = async (path: string): Promise<boolean> => {
    const tab = tabsRef.current.find((item) => item.path === path)
    if (!tab || tab.binary || tab.content === tab.saved) return true
    const content = tab.content
    const orphaned = Boolean(tab.orphaned)
    lastWrite.current.set(path.toLowerCase(), Date.now())
    try {
      const result = await api.fs.write({
        path,
        content,
        eol: tab.eol,
        expectedMtime: orphaned ? undefined : tab.mtime,
        createMissing: orphaned
      })
      failedSaves.current.delete(path)
      saveErrors.current.delete(path)
      removeConflict(path)
      const nextTabs = tabsRef.current.map((item) =>
        item.path === path
          ? { ...item, saved: content, mtime: result.mtime, orphaned: false }
          : item
      )
      // Update the ref synchronously so an in-flight flush loop sees the tab as
      // clean without waiting for React to re-render.
      tabsRef.current = nextTabs
      setTabs(nextTabs)
      setPreviewReload((value) => value + 1)
      if (tab.relative.toLowerCase().endsWith('.php')) setRuntimeProblems([])
      void runLints(tab, content)
      const latest = tabsRef.current.find((item) => item.path === path)
      if (latest && latest.content !== content && !latest.orphaned) {
        saveTimers.current.set(
          path,
          window.setTimeout(() => {
            saveTimers.current.delete(path)
            void queueSaveRef.current(path)
          }, 120)
        )
      }
      return true
    } catch (error) {
      failedSaves.current.add(path)
      const reason = errorKey(error)
      saveErrors.current.set(path, reason)
      const message = error instanceof Error ? error.message : String(error ?? '')
      if (message.includes('FILE_CHANGED')) {
        // Keep the local buffer; the dialog lets the person decide which side
        // wins instead of silently overwriting the external edit.
        clearSaveTimer(path)
        addConflict({ path: tab.path, relative: tab.relative, name: tab.name })
        return false
      }
      showToast('errors.saveFailed', 'error', {
        name: tab.name,
        reason: i18n.t(reason)
      })
      return false
    }
  }

  const queueSave = (path: string): Promise<boolean> => {
    const previous = writeChains.current.get(path) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(() => performSave(path))
    writeChains.current.set(path, next)
    void next.finally(() => {
      if (writeChains.current.get(path) === next) writeChains.current.delete(path)
    })
    return next
  }
  queueSaveRef.current = queueSave

  /** Writes every dirty tab and returns how many could not be saved. */
  const flushAll = async (): Promise<number> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const dirty = tabsRef.current.filter(
        (tab) =>
          !tab.binary &&
          !tab.orphaned &&
          tab.content !== tab.saved &&
          !failedSaves.current.has(tab.path) &&
          !hasConflict(tab.path)
      )
      if (dirty.length === 0) break
      await Promise.all(dirty.map((tab) => queueSave(tab.path)))
    }
    return tabsRef.current.filter(
      (tab) => !tab.binary && tab.content !== tab.saved
    ).length
  }
  const flushRef = useRef(flushAll)
  flushRef.current = flushAll

  const saveTab = (path: string): void => {
    clearSaveTimer(path)
    queueSave(path)
  }

  const saveActive = (): void => {
    const path = tabsRef.current.find((item) => item.path === activePath)?.path
    if (path) saveTab(path)
  }

  /**
   * Resolves the first external-edit conflict: either reload the file from disk
   * (the local buffer is dropped) or adopt the fresh mtime and overwrite it.
   * Remaining conflicts stay queued and the dialog shows the next one.
   */
  const resolveConflict = async (choice: 'mine' | 'reload'): Promise<void> => {
    const current = conflictsRef.current[0]
    if (!current) return
    try {
      const disk = await api.fs.read(current.path)
      if (choice === 'reload') {
        const target = tabsRef.current.find((tab) => samePath(tab.path, current.path))
        if (target) {
          const updated: OpenTab = {
            ...target,
            content: disk.content,
            saved: disk.content,
            eol: disk.eol,
            binary: disk.binary,
            mime: disk.mime,
            mtime: disk.mtime,
            orphaned: false
          }
          const next = tabsRef.current.map((tab) =>
            samePath(tab.path, current.path) ? updated : tab
          )
          tabsRef.current = next
          setTabs(next)
          failedSaves.current.delete(current.path)
          saveErrors.current.delete(current.path)
          void runLints(updated, disk.content)
        }
        removeConflict(current.path)
        setPreviewReload((value) => value + 1)
        return
      }

      const next = tabsRef.current.map((tab) =>
        samePath(tab.path, current.path) ? { ...tab, mtime: disk.mtime } : tab
      )
      tabsRef.current = next
      setTabs(next)
      removeConflict(current.path)
      failedSaves.current.delete(current.path)
      await queueSaveRef.current(current.path)
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  const readTab = async (absolute: string, root: string): Promise<OpenTab> => {
    const result: FileReadResult = await api.fs.read(absolute)
    return {
      path: result.path,
      relative: relativePosixText(root, result.path),
      name: basenameText(result.path),
      content: result.content,
      saved: result.content,
      eol: result.eol,
      binary: result.binary,
      mime: result.mime,
      mtime: result.mtime
    }
  }

  const resetWorkspace = (): void => {
    for (const timer of saveTimers.current.values()) window.clearTimeout(timer)
    saveTimers.current.clear()
    failedSaves.current.clear()
    saveErrors.current.clear()
    setConflicts([])
    setSaveFailure(null)
    if (treeTimer.current !== null) window.clearTimeout(treeTimer.current)
    setTabs([])
    setActivePath(null)
    setTree([])
    setTreeTruncated(false)
    setPhpProblems({})
    setHtmlProblems({})
    setRuntimeProblems([])
    setLastPreviewPath(null)
    setGoto(null)
    setServer({ state: 'stopped', port: null, phpAvailable: false })
  }

  const enterProject = async (info: ProjectInfo): Promise<void> => {
    resetWorkspace()
    setProject(info)
    projectRef.current = info
    const [treeResult, nextRecent, status] = await Promise.all([
      api.fs.tree(),
      api.project.recent(),
      api.server.status()
    ])
    setTree(treeResult.nodes)
    setTreeTruncated(treeResult.truncated)
    setRecent(nextRecent)
    setServer(status)

    const files = flattenFiles(treeResult.nodes).map((node) => node.path)
    const lowerFiles = new Set(files.map((item) => item.toLowerCase()))
    const entry = pickEntryPage(files)
    const stored = readStoredTabs(info.root)
    const restored: OpenTab[] = []
    for (const storedPath of stored.paths) {
      if (!lowerFiles.has(storedPath.toLowerCase())) continue
      const tab = await readTab(storedPath, info.root).catch(() => null)
      if (tab) restored.push(tab)
    }
    if (restored.length === 0 && entry) {
      const tab = await readTab(entry, info.root).catch(() => null)
      if (tab) restored.push(tab)
    }
    setTabs(restored)
    const wantedActive = stored.activePath
      ? restored.find((tab) => samePath(tab.path, stored.activePath as string))
      : undefined
    setActivePath(wantedActive?.path ?? restored[0]?.path ?? null)
    setLastPreviewPath(entry)
  }

  const refreshTree = async (): Promise<void> => {
    if (!projectRef.current) return
    try {
      const result = await api.fs.tree()
      setTree(result.nodes)
      setTreeTruncated(result.truncated)
    } catch {
      // A transient read error should not disturb editing.
    }
  }
  refreshTreeRef.current = refreshTree

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const [initialSettings, initialRecent, info] = await Promise.all([
          api.settings.get(),
          api.project.recent(),
          api.app.info()
        ])
        if (cancelled) return
        setSettings(initialSettings)
        settingsRef.current = initialSettings
        applyLanguage(initialSettings.language)
        setRecent(initialRecent)
        setAppInfo(info)
      } catch {
        if (!cancelled) setFatal(true)
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    applyLanguage(settings.language)
    document.documentElement.lang = settings.language
    document.documentElement.dataset.theme = settings.theme
    document.title = i18n.t('app.name')
  }, [settings.language, settings.theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const styles = getComputedStyle(document.documentElement)
      const color = styles.getPropertyValue('--md-sys-color-surface').trim()
      const symbolColor = styles.getPropertyValue('--md-sys-color-on-surface').trim()
      if (/^#[0-9a-fA-F]{6}/.test(color) && /^#[0-9a-fA-F]{6}/.test(symbolColor)) {
        api.ui.setTitleBarColors({ color, symbolColor })
      }
    }, 30)
    return () => window.clearTimeout(timer)
  }, [api, settings.theme, systemDark])

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      // Private storage can be unavailable; layout is a convenience only.
    }
  }, [layout])

  const tabsKey = useMemo(() => tabs.map((tab) => tab.path).join('|'), [tabs])
  useEffect(() => {
    if (!project) return
    try {
      localStorage.setItem(
        tabsStorageKey(project.root),
        JSON.stringify({ paths: tabs.map((tab) => tab.path), activePath })
      )
    } catch {
      // Ignore storage failures.
    }
    // `tabsKey` intentionally captures open paths without depending on content.
  }, [tabsKey, activePath, project])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.path === activePath) ?? null,
    [tabs, activePath]
  )

  useEffect(() => {
    if (activeTab && isPreviewablePage(activeTab.path)) {
      setLastPreviewPath(activeTab.path)
    }
  }, [activeTab?.path])

  useEffect(() => {
    const offStatus = api.server.onStatusChanged((status) => setServer(status))
    const offProblems = api.server.onProblems((problems) => {
      setRuntimeProblems((previous) => mergeRuntimeProblems(previous, problems))
    })
    const offFs = api.project.onChanged((event) => {
      if (!projectRef.current) return
      if (treeTimer.current !== null) window.clearTimeout(treeTimer.current)
      treeTimer.current = window.setTimeout(() => {
        treeTimer.current = null
        void refreshTreeRef.current()
      }, 220)
      externalReloadRef.current(event)
    })
    return () => {
      offStatus()
      offProblems()
      offFs()
    }
  }, [api])

  // Main intercepts the window close and asks for a flush first. The reply must
  // arrive even if something throws, or the window would wait for the timeout.
  useEffect(() => {
    return api.app.onFlushRequest((token) => {
      void flushRef
        .current()
        .then((failed) => api.app.flushDone({ token, failed }))
        .catch(() => api.app.flushDone({ token, failed: 1 }))
    })
  }, [api])

  useEffect(() => {
    return () => {
      for (const timer of saveTimers.current.values()) window.clearTimeout(timer)
      saveTimers.current.clear()
      if (treeTimer.current !== null) window.clearTimeout(treeTimer.current)
    }
  }, [])

  const externalReload = (event: FsChangedEvent): void => {
    if (event.type === 'deleted') {
      const deletedTab = tabsRef.current.find((tab) => samePath(tab.path, event.path))
      if (deletedTab) {
        clearSaveTimer(deletedTab.path)
        failedSaves.current.delete(deletedTab.path)
        saveErrors.current.delete(deletedTab.path)
        removeConflict(deletedTab.path)
        setPhpProblems((previous) => {
          if (!(deletedTab.relative in previous)) return previous
          const next = { ...previous }
          delete next[deletedTab.relative]
          return next
        })
        setHtmlProblems((previous) => {
          if (!(deletedTab.relative in previous)) return previous
          const next = { ...previous }
          delete next[deletedTab.relative]
          return next
        })
        if (!deletedTab.binary && deletedTab.content !== deletedTab.saved) {
          // Keep the buffer and let the person decide. Autosave is paused for
          // orphaned tabs, so a deliberate external delete stays deleted.
          const next = tabsRef.current.map((tab) =>
            samePath(tab.path, deletedTab.path) ? { ...tab, orphaned: true } : tab
          )
          tabsRef.current = next
          setTabs(next)
          showToast('toast.fileDeletedExternally', 'error', { name: deletedTab.name })
        } else {
          const next = tabsRef.current.filter((tab) => !samePath(tab.path, deletedTab.path))
          tabsRef.current = next
          setTabs(next)
          setActivePath((current) =>
            current && samePath(current, deletedTab.path) ? null : current
          )
          setLastPreviewPath((current) =>
            current && samePath(current, deletedTab.path) ? null : current
          )
        }
      }
      return
    }
    if (event.type !== 'changed' && event.type !== 'created') return
    const written = lastWrite.current.get(event.path.toLowerCase()) ?? 0
    if (Date.now() - written < 1500) return
    const tab = tabsRef.current.find((item) => samePath(item.path, event.path))
    if (!tab || tab.binary) return

    if (tab.content !== tab.saved) {
      // The file changed on disk while this tab has unsaved edits. Compare the
      // mtime now so the person is warned even before the next autosave.
      void api.fs
        .read(event.path)
        .then((result) => {
          const current = tabsRef.current.find((item) => samePath(item.path, tab.path))
          if (!current) return
          const cleared = tabsRef.current.map((item) =>
            samePath(item.path, current.path) ? { ...item, orphaned: false } : item
          )
          tabsRef.current = cleared
          setTabs(cleared)
          if (current.content === current.saved) {
            const reloaded = cleared.map((item) =>
              samePath(item.path, current.path)
                ? {
                    ...item,
                    content: result.content,
                    saved: result.content,
                    eol: result.eol,
                    mtime: result.mtime
                  }
                : item
            )
            tabsRef.current = reloaded
            setTabs(reloaded)
            setPreviewReload((value) => value + 1)
            return
          }
          if (Math.abs(result.mtime - current.mtime) <= 1) return
          clearSaveTimer(current.path)
          addConflict({ path: current.path, relative: current.relative, name: current.name })
        })
        .catch(() => undefined)
      return
    }

    void api.fs
      .read(event.path)
      .then((result) => {
        setTabs((previous) =>
          previous.map((item) =>
            samePath(item.path, tab.path)
              ? {
                  ...item,
                  content: result.content,
                  saved: result.content,
                  eol: result.eol,
                  mtime: result.mtime,
                  orphaned: false
                }
              : item
          )
        )
        setPreviewReload((value) => value + 1)
      })
      .catch(() => undefined)
  }
  externalReloadRef.current = externalReload

  const openFile = async (
    path: string,
    location?: { line: number; column: number }
  ): Promise<void> => {
    const root = projectRef.current?.root
    if (!root) return
    const existing = tabsRef.current.find((tab) => samePath(tab.path, path))
    if (existing) {
      setActivePath(existing.path)
      if (location) {
        setGoto({ path: existing.path, line: location.line, column: location.column, nonce: Date.now() })
      }
      return
    }
    try {
      const tab = await readTab(path, root)
      setTabs((previous) => [...previous, tab])
      setActivePath(tab.path)
      if (location) {
        setGoto({ path: tab.path, line: location.line, column: location.column, nonce: Date.now() })
      }
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  /** Forgets a tab without writing it. Callers decide whether that is safe. */
  const removeTabFromState = (path: string): void => {
    const tab = tabsRef.current.find((item) => samePath(item.path, path))
    if (!tab) return
    clearSaveTimer(path)
    failedSaves.current.delete(path)
    saveErrors.current.delete(path)
    removeConflict(path)
    const remaining = tabsRef.current.filter((item) => !samePath(item.path, path))
    tabsRef.current = remaining
    setTabs(remaining)
    setActivePath((current) =>
      current && samePath(current, path) ? remaining[remaining.length - 1]?.path ?? null : current
    )
    setLastPreviewPath((current) => (current && samePath(current, path) ? null : current))
    setGoto((current) => (current && samePath(current.path, path) ? null : current))
    setPhpProblems((previous) => {
      if (!(tab.relative in previous)) return previous
      const next = { ...previous }
      delete next[tab.relative]
      return next
    })
    setHtmlProblems((previous) => {
      if (!(tab.relative in previous)) return previous
      const next = { ...previous }
      delete next[tab.relative]
      return next
    })
  }

  const closeTab = async (path: string): Promise<void> => {
    const tab = tabsRef.current.find((item) => samePath(item.path, path))
    if (!tab) return
    clearSaveTimer(path)
    if (!tab.binary && tab.content !== tab.saved) {
      // An orphaned buffer cannot be written back silently; closing must be a
      // deliberate choice. A save failure keeps the tab open and names the file.
      if (tab.orphaned) {
        setSaveFailure({ action: 'tab', tabPath: tab.path, files: [describeFailure(tab)] })
        return
      }
      const ok = await queueSaveRef.current(tab.path)
      if (!ok) {
        // The conflict dialog already explains this tab; don't stack dialogs.
        if (hasConflict(tab.path)) return
        const current = tabsRef.current.find((item) => samePath(item.path, path)) ?? tab
        setSaveFailure({ action: 'tab', tabPath: current.path, files: [describeFailure(current)] })
        return
      }
    }
    removeTabFromState(tab.path)
  }

  const updateContent = (path: string, content: string): void => {
    const tab = tabsRef.current.find((item) => samePath(item.path, path))
    setTabs((previous) =>
      previous.map((item) => (samePath(item.path, path) ? { ...item, content } : item))
    )
    clearSaveTimer(path)
    // A deleted file stays deleted until the person explicitly saves it, and an
    // unresolved conflict must not be overwritten by autosave.
    if (!tab || tab.orphaned || hasConflict(path)) return
    failedSaves.current.delete(path)
    saveErrors.current.delete(path)
    const delay = settingsRef.current.autoSaveDelay
    const timer = window.setTimeout(() => {
      saveTimers.current.delete(path)
      queueSaveRef.current(path)
    }, delay)
    saveTimers.current.set(path, timer)
  }

  const updateSettings = async (patch: Partial<Settings>): Promise<void> => {
    try {
      const next = await api.settings.set(patch)
      setSettings(next)
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  const openDirectory = async (): Promise<void> => {
    try {
      const info = await api.project.openDialog()
      if (!info) return
      await enterProject(info)
      showToast('toast.projectOpened', 'success')
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  const openRecentProject = async (path: string): Promise<void> => {
    try {
      const info = await api.project.openPath(path)
      await enterProject(info)
      showToast('toast.projectOpened', 'success')
    } catch (error) {
      showToast(errorKey(error), 'error')
      setRecent(await api.project.recent().catch(() => []))
    }
  }

  const removeRecentProject = async (path: string): Promise<void> => {
    try {
      setRecent(await api.project.removeRecent(path))
      showToast('toast.recentRemoved')
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  const createProject = async (input: CreateProjectInput): Promise<void> => {
    const result = await api.project.createFromTemplate(input)
    if (!result.project) throw new Error('INVALID_ARGUMENT')
    await enterProject(result.project)
    setCreateOpen(false)
    showToast('toast.projectCreated', 'success')
  }

  const finalizeCloseProject = async (): Promise<void> => {
    try {
      await api.project.close()
    } catch {
      // Closing the window still works even if the server refuses to stop.
    }
    setProject(null)
    projectRef.current = null
    resetWorkspace()
    setRecent(await api.project.recent().catch(() => []))
  }

  const closeProject = async (): Promise<void> => {
    // Retry every writable dirty buffer; conflicted tabs are intentionally left
    // alone (their dialog asks which side wins) and orphaned tabs must not be
    // recreated by autosave.
    const dirty = tabsRef.current.filter((tab) => !tab.binary && tab.content !== tab.saved)
    await Promise.all(
      dirty.filter((tab) => !tab.orphaned).map((tab) => queueSaveRef.current(tab.path))
    )
    const remaining = tabsRef.current.filter((tab) => !tab.binary && tab.content !== tab.saved)
    if (remaining.length > 0) {
      const blocking = remaining.filter((tab) => !hasConflict(tab.path))
      if (blocking.length > 0) {
        // Keep the project open; only "Discard and close" may throw these away.
        setSaveFailure({ action: 'project', files: blocking.map(describeFailure) })
      }
      return
    }
    await finalizeCloseProject()
  }

  const dismissSaveFailure = (): void => setSaveFailure(null)

  const discardAndClose = async (): Promise<void> => {
    const failure = saveFailure
    setSaveFailure(null)
    if (!failure) return
    if (failure.action === 'project') {
      for (const tab of tabsRef.current) clearSaveTimer(tab.path)
      await finalizeCloseProject()
      return
    }
    if (failure.tabPath) removeTabFromState(failure.tabPath)
  }

  const createItem = async (
    parent: string,
    name: string,
    kind: 'file' | 'directory'
  ): Promise<void> => {
    const node = await api.fs.create({ parent, name, kind })
    await refreshTree()
    if (node.kind === 'file') await openFile(node.path)
  }

  const renameItem = async (path: string, newName: string): Promise<void> => {
    const root = projectRef.current?.root
    if (!root) return
    if (basenameText(path) === newName) {
      // Same name: nothing to do, and definitely not an ALREADY_EXISTS error.
      await refreshTree()
      return
    }

    const affected = tabsRef.current.filter((tab) => startsWithPath(tab.path, path))
    for (const tab of affected) clearSaveTimer(tab.path)
    const dirty = affected.filter((tab) => !tab.binary && tab.content !== tab.saved)
    const saved = await Promise.all(dirty.map((tab) => queueSave(tab.path)))
    if (saved.some((ok) => !ok)) {
      // Moving the file now would lose the unsaved buffer; the save error or
      // conflict dialog already told the person what happened.
      return
    }

    const node = await api.fs.rename({ path, newName })
    const remap = (value: string): string =>
      startsWithPath(value, path) ? `${node.path}${value.slice(path.length)}` : value
    const oldRelative = relativePosixText(root, path)
    const newRelative = relativePosixText(root, node.path)
    const remapRelative = (relative: string): string => {
      const lower = relative.toLowerCase()
      const base = oldRelative.toLowerCase()
      if (lower === base) return newRelative
      if (lower.startsWith(`${base}/`)) {
        return `${newRelative}${relative.slice(oldRelative.length)}`
      }
      return relative
    }

    const nextTabs = tabsRef.current.map((tab) => {
      if (!startsWithPath(tab.path, path)) return tab
      const nextPath = remap(tab.path)
      return {
        ...tab,
        path: nextPath,
        relative: relativePosixText(root, nextPath),
        name: basenameText(nextPath)
      }
    })
    tabsRef.current = nextTabs
    setTabs(nextTabs)
    setActivePath((current) => (current ? remap(current) : current))
    setLastPreviewPath((current) => (current ? remap(current) : current))
    setGoto((current) => (current ? { ...current, path: remap(current.path) } : current))
    setConflicts((current) =>
      current.map((item) => ({ ...item, path: remap(item.path), relative: remapRelative(item.relative) }))
    )
    const remapErrors = new Map<string, string>()
    for (const [key, value] of saveErrors.current) remapErrors.set(remap(key), value)
    saveErrors.current = remapErrors
    // Diagnostics are stored by relative path, so a rename (including a folder
    // or case-only rename) must move the keys or clicking a problem would open
    // a file that no longer exists.
    setPhpProblems((previous) => remapProblemRecords(previous, remapRelative))
    setHtmlProblems((previous) => remapProblemRecords(previous, remapRelative))
    setRuntimeProblems((previous) =>
      previous.map((problem) => ({ ...problem, file: remapRelative(problem.file) }))
    )
    await refreshTree()
    showToast('toast.renamed')
  }

  const deleteItem = async (path: string): Promise<void> => {
    const affected = tabsRef.current.filter((tab) => startsWithPath(tab.path, path))
    // Drop pending autosaves before the file disappears; closing the tabs via
    // `closeTab` would flush their buffers back to disk and recreate the file.
    for (const tab of affected) {
      clearSaveTimer(tab.path)
      failedSaves.current.delete(tab.path)
      saveErrors.current.delete(tab.path)
    }
    await api.fs.remove(path)
    if (affected.length > 0) {
      const deletedPaths = new Set(affected.map((tab) => tab.path.toLowerCase()))
      const deletedRelative = new Set(affected.map((tab) => tab.relative))
      setConflicts((current) =>
        current.filter((item) => !deletedPaths.has(item.path.toLowerCase()))
      )
      const remaining = tabsRef.current.filter(
        (tab) => !deletedPaths.has(tab.path.toLowerCase())
      )
      tabsRef.current = remaining
      setTabs(remaining)
      setActivePath((current) =>
        current && deletedPaths.has(current.toLowerCase())
          ? remaining[remaining.length - 1]?.path ?? null
          : current
      )
      setLastPreviewPath((current) =>
        current && deletedPaths.has(current.toLowerCase()) ? null : current
      )
      setGoto((current) =>
        current && deletedPaths.has(current.path.toLowerCase()) ? null : current
      )
      setPhpProblems((previous) => {
        const next = { ...previous }
        for (const relative of deletedRelative) delete next[relative]
        return next
      })
      setHtmlProblems((previous) => {
        const next = { ...previous }
        for (const relative of deletedRelative) delete next[relative]
        return next
      })
      setRuntimeProblems((previous) =>
        previous.filter((problem) => !deletedRelative.has(problem.file))
      )
    }
    await refreshTree()
    showToast('toast.deleted')
  }

  const revealItem = async (path: string): Promise<void> => {
    try {
      await api.fs.reveal(path)
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  const navigateProblem = (problem: Problem): void => {
    const root = projectRef.current?.root
    if (!root) return
    void openFile(joinPathText(root, problem.file), {
      line: problem.line,
      column: problem.column
    })
  }

  const setPanel = (panel: PanelName, open: boolean): void => {
    setLayout((previous) => ({ ...previous, [LAYOUT_KEYS[panel]]: open }))
  }

  const togglePanel = (panel: PanelName): void => {
    setLayout((previous) => ({ ...previous, [LAYOUT_KEYS[panel]]: !previous[LAYOUT_KEYS[panel]] }))
  }

  const setSplitRatio = (ratio: number): void => {
    setLayout((previous) => ({
      ...previous,
      splitRatio: clampRatio(ratio)
    }))
  }

  const openCreate = (template: TemplateId = 'blank'): void => {
    setCreateTemplate(template)
    setCreateOpen(true)
  }

  const retryServer = async (): Promise<void> => {
    try {
      setServer(await api.server.start())
      showToast('toast.serverRestarted')
    } catch (error) {
      showToast(errorKey(error), 'error')
    }
  }

  const problems = useMemo(() => {
    const merged = [
      ...Object.values(phpProblems).flat(),
      ...Object.values(htmlProblems).flat(),
      ...runtimeProblems
    ]
    return merged.sort((a, b) => {
      const fileOrder = a.file.localeCompare(b.file)
      if (fileOrder !== 0) return fileOrder
      return a.line - b.line
    })
  }, [phpProblems, htmlProblems, runtimeProblems])

  const previewPath = useMemo(
    () => pickPreviewPage(activePath, lastPreviewPath),
    [activePath, lastPreviewPath]
  )

  const conflict = conflicts[0] ?? null

  const value: AppContextValue = {
    ready,
    fatal,
    settings,
    appInfo,
    project,
    recent,
    tree,
    treeTruncated,
    tabs,
    activeTab,
    activePath,
    problems,
    server,
    toast,
    conflict,
    conflictCount: conflicts.length,
    saveFailure,
    previewPath,
    previewReload,
    goto,
    createOpen,
    createTemplate,
    settingsOpen,
    editorRef,
    showToast,
    dismissToast,
    updateSettings,
    openDirectory,
    openRecentProject,
    removeRecentProject,
    createProject,
    closeProject,
    refreshTree,
    openFile,
    closeTab,
    updateContent,
    saveTab,
    saveActive,
    createItem,
    renameItem,
    deleteItem,
    revealItem,
    resolveConflict,
    dismissSaveFailure,
    discardAndClose,
    navigateProblem,
    setPanel,
    togglePanel,
    setSplitRatio,
    setCreateOpen,
    openCreate,
    setSettingsOpen,
    retryServer,
    ...layout
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}

/** Directory of the active file, relative to the project root. */
export function activeDirectory(tab: OpenTab | null): string {
  return tab ? dirnameRelative(tab.relative) : ''
}
