import type {
  AppInfo,
  CreateProjectResult,
  FileNode,
  FileReadResult,
  FileTreeResult,
  FileWriteResult,
  FsChangedEvent,
  LintResult,
  Problem,
  ProjectInfo,
  RecentProject,
  ServerLogEvent,
  ServerStatus,
  Settings,
  TemplateId,
  TextEditAction,
  Language
} from './types'

export interface CreateProjectInput {
  templateId: TemplateId
  parentDirectory: string
  name: string
  language: Language
}

export interface WriteFileInput {
  path: string
  content: string
  eol: 'lf' | 'crlf'
  /** Expected on-disk mtime; a mismatch means the file changed outside WebYou. */
  expectedMtime?: number
  /**
   * Recreate a file that was deleted externally. Only set from an explicit
   * "save file" action, never from autosave.
   */
  createMissing?: boolean
}

export interface CopyIntoProjectInput {
  source: string
  targetDirectory?: string
}

export type Unsubscribe = () => void

/**
 * The complete surface the renderer can touch. Implemented in the preload via
 * `contextBridge`; the renderer never sees `ipcRenderer` itself.
 */
export interface WebYouApi {
  app: {
    info(): Promise<AppInfo>
    /** Main asks the renderer to flush pending saves before the window closes. */
    onFlushRequest(callback: (token: number) => void): Unsubscribe
    flushDone(result: { token: number; failed: number }): void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  project: {
    openDialog(): Promise<ProjectInfo | null>
    openPath(path: string): Promise<ProjectInfo>
    pickFolder(): Promise<string | null>
    createFromTemplate(input: CreateProjectInput): Promise<CreateProjectResult>
    close(): Promise<void>
    recent(): Promise<RecentProject[]>
    removeRecent(path: string): Promise<RecentProject[]>
    onChanged(callback: (event: FsChangedEvent) => void): Unsubscribe
  }
  fs: {
    tree(): Promise<FileTreeResult>
    read(path: string): Promise<FileReadResult>
    write(input: WriteFileInput): Promise<FileWriteResult>
    create(input: { parent: string; name: string; kind: 'file' | 'directory' }): Promise<FileNode>
    rename(input: { path: string; newName: string }): Promise<FileNode>
    remove(path: string): Promise<void>
    reveal(path: string): Promise<void>
    copyIntoProject(input: CopyIntoProjectInput): Promise<{ absolute: string; relative: string }>
    pickImage(targetDirectory?: string): Promise<string | null>
  }
  server: {
    start(): Promise<ServerStatus>
    stop(): Promise<ServerStatus>
    status(): Promise<ServerStatus>
    onStatusChanged(callback: (status: ServerStatus) => void): Unsubscribe
    onLog(callback: (event: ServerLogEvent) => void): Unsubscribe
    onProblems(callback: (problems: Problem[]) => void): Unsubscribe
  }
  lint: {
    php(path: string): Promise<LintResult>
    html(input: { path: string; content: string }): Promise<Problem[]>
  }
  shell: {
    openExternal(url: string): Promise<void>
    showItem(path: string): Promise<void>
  }
  ui: {
    setTitleBarColors(colors: { color: string; symbolColor: string }): void
    /** Run a native editing command on the focused element. */
    edit(action: TextEditAction): Promise<void>
    /** Whether the clipboard currently holds text, without exposing its contents. */
    clipboardState(): Promise<{ hasText: boolean }>
    onSystemThemeChanged(callback: (dark: boolean) => void): Unsubscribe
    onMaximized(callback: (maximized: boolean) => void): Unsubscribe
  }
}
