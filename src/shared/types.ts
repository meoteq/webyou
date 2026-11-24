export type Language = 'ru' | 'en'
export type ThemePreference = 'system' | 'light' | 'dark'

/** Editing commands offered by the text context menu. */
export type TextEditAction = 'cut' | 'copy' | 'paste' | 'delete' | 'selectAll'

export interface Settings {
  language: Language
  theme: ThemePreference
  fontSize: number
  wordWrap: boolean
  autoSaveDelay: number
}

export interface RecentProject {
  path: string
  name: string
  openedAt: number
}

export interface ProjectInfo {
  root: string
  name: string
}

export type FileKind = 'file' | 'directory'

export interface FileNode {
  name: string
  path: string
  kind: FileKind
  children?: FileNode[]
  size?: number
}

export interface FileTreeResult {
  nodes: FileNode[]
  /** True when the tree hit the node/depth limit and some files are hidden. */
  truncated: boolean
}

export interface ServerStatus {
  state: 'starting' | 'running' | 'stopped' | 'failed'
  port: number | null
  phpAvailable: boolean
  message?: string
}

export type ProblemSeverity = 'error' | 'warning'
export type ProblemSource = 'php-syntax' | 'php-runtime' | 'html'

export interface Problem {
  file: string
  line: number
  column: number
  severity: ProblemSeverity
  source: ProblemSource
  message: string
  originalMessage: string
  code?: string
}

export interface LintResult {
  problems: Problem[]
  phpAvailable: boolean
  error?: string
}

export interface AppInfo {
  version: string
  platform: string
  phpVersion: string | null
  dataDir: string
  resourcesDir: string
  documentsDir: string
  isPackaged: boolean
}

export type TemplateId = 'blank' | 'business-card' | 'php-form'

export interface TemplateInfo {
  id: TemplateId
  nameKey: string
  descriptionKey: string
  accent: 'primary' | 'secondary' | 'tertiary'
}

export interface CreateProjectResult {
  project: ProjectInfo | null
  canceled: boolean
}

export interface FileReadResult {
  path: string
  content: string
  encoding: 'utf8' | 'base64'
  eol: 'lf' | 'crlf'
  binary: boolean
  mime: string
  size: number
  /** Modification time used to detect external edits before an overwrite. */
  mtime: number
}

export interface FileWriteResult {
  path: string
  savedAt: number
  /** New modification time, stored on the tab for the next conflict check. */
  mtime: number
}

export interface FsChangedEvent {
  type: 'created' | 'changed' | 'deleted'
  path: string
}

export interface ServerLogEvent {
  line: string
  stream: 'stdout' | 'stderr'
}

export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.avif'
] as const

export const TEXT_EXTENSIONS = [
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.php',
  '.json',
  '.txt',
  '.md',
  '.xml',
  '.svg',
  '.csv',
  '.sql',
  '.htaccess',
  '.ini',
  '.yml',
  '.yaml'
] as const

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'system',
  fontSize: 14,
  wordWrap: true,
  autoSaveDelay: 500
}
