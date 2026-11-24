import { app, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type {
  FileNode,
  FileReadResult,
  FileTreeResult,
  FileWriteResult,
  FsChangedEvent,
  ProjectInfo
} from '@shared/types'
import { isInside, isInsideOrEqual, looksBinary, mimeForPath, resolveInside } from '@shared/paths'
import { isValidEntryName } from '@shared/names'

// Only build/tooling folders are hidden. `data` is a common user folder name
// (datasets, fixtures, JSON), so it must stay visible.
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.webyou'])
const MAX_TREE_NODES = 6000
const MAX_TREE_DEPTH = 24
const WATCH_DEPTH = MAX_TREE_DEPTH + 1
const MAX_TEXT_SIZE = 5 * 1024 * 1024
const MAX_BINARY_SIZE = 25 * 1024 * 1024

/** Atomic-save leftovers (`.index.html.<pid>.<ts>.tmp`) must never show up. */
const TEMP_FILE = /^\..+\.\d+\.\d+\.tmp$/i
const RENAME_TEMP_FILE = /^\.webyou-rename-\d+-\d+$/i

function isInternalTemp(name: string): boolean {
  return TEMP_FILE.test(name) || RENAME_TEMP_FILE.test(name)
}

function fail(code: string, message = code): never {
  const error = new Error(message) as NodeJS.ErrnoException
  error.code = code
  throw error
}

function validateName(name: string): string {
  if (!isValidEntryName(name)) fail('INVALID_NAME')
  return name
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export class ProjectManager {
  private root: string | null = null
  private watcher: FSWatcher | null = null

  constructor(private readonly onChanged: (event: FsChangedEvent) => void) {}

  get current(): ProjectInfo | null {
    if (!this.root) return null
    return { root: this.root, name: path.basename(this.root) }
  }

  get rootPath(): string | null {
    return this.root
  }

  async open(root: string): Promise<ProjectInfo> {
    const resolved = path.resolve(root)
    const stat = await fs.stat(resolved).catch(() => null)
    if (!stat?.isDirectory()) fail('NOT_A_DIRECTORY')
    await this.close()
    this.root = resolved
    this.startWatcher()
    return { root: resolved, name: path.basename(resolved) }
  }

  async close(): Promise<void> {
    await this.watcher?.close().catch(() => undefined)
    this.watcher = null
    this.root = null
  }

  private startWatcher(): void {
    if (!this.root) return
    this.watcher = chokidar.watch(this.root, {
      ignoreInitial: true,
      ignored: (candidate) => {
        const segments = candidate.split(/[\\/]/)
        return (
          segments.some((segment) => IGNORED_DIRECTORIES.has(segment)) ||
          isInternalTemp(path.basename(candidate))
        )
      },
      depth: WATCH_DEPTH
    })
    const emit = (type: FsChangedEvent['type']) => (file: string) => {
      if (this.root && isInsideOrEqual(this.root, file)) {
        this.onChanged({ type, path: path.resolve(file) })
      }
    }
    this.watcher.on('add', emit('created'))
    this.watcher.on('change', emit('changed'))
    this.watcher.on('unlink', emit('deleted'))
    this.watcher.on('addDir', emit('created'))
    this.watcher.on('unlinkDir', emit('deleted'))
  }

  private requireRoot(): string {
    if (!this.root) fail('NO_PROJECT')
    return this.root
  }

  async tree(): Promise<FileTreeResult> {
    const root = this.requireRoot()
    let count = 0
    let truncated = false
    const walk = async (directory: string, depth: number): Promise<FileNode[]> => {
      if (count >= MAX_TREE_NODES) {
        truncated = true
        return []
      }
      if (depth > MAX_TREE_DEPTH) {
        truncated = true
        return []
      }
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
      const nodes: FileNode[] = []
      const sorted = entries
        .filter(
          (entry) => !IGNORED_DIRECTORIES.has(entry.name) && !isInternalTemp(entry.name)
        )
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        })
      for (const entry of sorted) {
        if (count >= MAX_TREE_NODES) {
          truncated = true
          break
        }
        count += 1
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: full,
            kind: 'directory',
            children: await walk(full, depth + 1)
          })
        } else {
          nodes.push({ name: entry.name, path: full, kind: 'file' })
        }
      }
      return nodes
    }
    return { nodes: await walk(root, 0), truncated }
  }

  async read(filePath: string): Promise<FileReadResult> {
    const root = this.requireRoot()
    const resolved = resolveInside(root, filePath)
    const stat = await fs.stat(resolved).catch(() => null)
    if (!stat?.isFile()) fail('NOT_A_FILE')
    const mime = mimeForPath(resolved)
    if (stat.size > MAX_BINARY_SIZE) fail('FILE_TOO_LARGE')

    const buffer = await fs.readFile(resolved)
    if (looksBinary(resolved, buffer)) {
      return {
        path: resolved,
        content: buffer.toString('base64'),
        encoding: 'base64',
        eol: 'lf',
        binary: true,
        mime,
        size: stat.size,
        mtime: stat.mtimeMs
      }
    }
    if (stat.size > MAX_TEXT_SIZE) fail('FILE_TOO_LARGE')
    const text = buffer.toString('utf8')
    const eol = text.includes('\r\n') ? 'crlf' : 'lf'
    return {
      path: resolved,
      content: text,
      encoding: 'utf8',
      eol,
      binary: false,
      mime,
      size: stat.size,
      mtime: stat.mtimeMs
    }
  }

  /**
   * Writes a file. Creating files is normally `create`'s job, so a save that
   * races with a delete or rename cannot resurrect the old path. `createMissing`
   * is only set by an explicit "save file" action for an externally deleted
   * buffer. `expectedMtime` turns an external edit into a conflict instead of
   * silently overwriting it.
   */
  async write(
    filePath: string,
    content: string,
    eol: 'lf' | 'crlf',
    expectedMtime?: number,
    createMissing = false
  ): Promise<FileWriteResult> {
    const root = this.requireRoot()
    const resolved = resolveInside(root, filePath)
    const before = await fs.stat(resolved).catch(() => null)
    if (!before?.isFile() && !createMissing) fail('NOT_A_FILE')
    if (
      before?.isFile() &&
      typeof expectedMtime === 'number' &&
      Math.abs(before.mtimeMs - expectedMtime) > 1
    ) {
      fail('FILE_CHANGED')
    }
    const normalized = content.replace(/\r\n/g, '\n')
    const output = eol === 'crlf' ? normalized.replace(/\n/g, '\r\n') : normalized
    const directory = path.dirname(resolved)
    const temporary = path.join(directory, `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`)
    try {
      await fs.writeFile(temporary, output, 'utf8')
      // Deleting the file while the save is in flight must win: never let the
      // final rename recreate a path the person just removed (unless this save
      // is explicitly restoring an orphaned buffer).
      if (!createMissing) {
        const stillThere = await fs.stat(resolved).catch(() => null)
        if (!stillThere?.isFile()) fail('NOT_A_FILE')
      }
      try {
        await fs.rename(temporary, resolved)
      } catch {
        await fs.copyFile(temporary, resolved)
      }
    } finally {
      // A read-only target makes both rename and copyFile fail; without this
      // the temporary file was left behind and later showed up in the tree.
      await fs.unlink(temporary).catch(() => undefined)
    }
    const after = await fs.stat(resolved).catch(() => null)
    return { path: resolved, savedAt: Date.now(), mtime: after?.mtimeMs ?? before?.mtimeMs ?? 0 }
  }

  async create(parent: string, name: string, kind: 'file' | 'directory'): Promise<FileNode> {
    const root = this.requireRoot()
    const safeName = validateName(name)
    const directory = resolveInside(root, parent, true)
    const target = path.join(directory, safeName)
    if (!isInside(root, target)) fail('PATH_OUTSIDE_PROJECT')
    if (await pathExists(target)) fail('ALREADY_EXISTS')
    if (kind === 'directory') {
      await fs.mkdir(target)
    } else {
      await fs.writeFile(target, '', { flag: 'wx' })
    }
    return { name: safeName, path: target, kind, children: kind === 'directory' ? [] : undefined }
  }

  async rename(filePath: string, newName: string): Promise<FileNode> {
    const root = this.requireRoot()
    const resolved = resolveInside(root, filePath)
    if (path.resolve(resolved) === path.resolve(root)) fail('CANNOT_MODIFY_ROOT')
    const safeName = validateName(newName)
    const directory = path.dirname(resolved)
    const target = path.join(directory, safeName)
    if (!isInside(root, target)) fail('PATH_OUTSIDE_PROJECT')

    const describe = async (candidate: string): Promise<FileNode> => {
      const stat = await fs.stat(candidate)
      return {
        name: path.basename(candidate),
        path: candidate,
        kind: stat.isDirectory() ? 'directory' : 'file',
        children: stat.isDirectory() ? [] : undefined
      }
    }

    const source = await fs.stat(resolved).catch(() => null)
    if (!source) fail('NOT_A_FILE')
    if (target === resolved) return describe(resolved)

    if (target.toLowerCase() === resolved.toLowerCase()) {
      // Windows is case-insensitive, so the target "exists" already. Rename
      // through a temporary name to change the letter case for real.
      const temporary = path.join(directory, `.webyou-rename-${process.pid}-${Date.now()}`)
      await fs.rename(resolved, temporary)
      try {
        await fs.rename(temporary, target)
      } catch (error) {
        await fs.rename(temporary, resolved).catch(() => undefined)
        throw error
      }
      return describe(target)
    }

    if (await pathExists(target)) fail('ALREADY_EXISTS')
    await fs.rename(resolved, target)
    return describe(target)
  }

  async remove(filePath: string): Promise<void> {
    const root = this.requireRoot()
    const resolved = resolveInside(root, filePath)
    if (path.resolve(resolved) === path.resolve(root)) fail('CANNOT_MODIFY_ROOT')
    await shell.trashItem(resolved)
  }

  async copyIntoProject(source: string, targetDirectory: string): Promise<{ absolute: string; relative: string }> {
    const root = this.requireRoot()
    if (isInside(root, source)) {
      return {
        absolute: path.resolve(source),
        relative: path.relative(root, path.resolve(source)).split(path.sep).join('/')
      }
    }
    const directory = resolveInside(root, targetDirectory, true)
    const stat = await fs.stat(source)
    if (!stat.isFile()) fail('NOT_A_FILE')
    await fs.mkdir(directory, { recursive: true })
    const extension = path.extname(source)
    const stem = path.basename(source, extension)
    let candidate = path.join(directory, `${stem}${extension}`)
    let index = 2
    while (await pathExists(candidate)) {
      candidate = path.join(directory, `${stem}-${index}${extension}`)
      index += 1
    }
    await fs.copyFile(source, candidate)
    return { absolute: candidate, relative: path.relative(root, candidate).split(path.sep).join('/') }
  }

  async reveal(filePath: string): Promise<void> {
    const root = this.requireRoot()
    const resolved = resolveInside(root, filePath, true)
    shell.showItemInFolder(resolved)
  }
}

export function templateRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(app.getAppPath(), 'resources', 'templates')
}

/** Copy a localized template into a fresh project folder. */
export async function createProjectFromTemplate(
  templateId: string,
  parentDirectory: string,
  projectName: string,
  language: string
): Promise<ProjectInfo> {
  if (!['blank', 'business-card', 'php-form'].includes(templateId)) fail('UNKNOWN_TEMPLATE')
  const safeName = validateName(projectName)
  const parent = path.resolve(parentDirectory)
  const parentStat = await fs.stat(parent).catch(() => null)
  if (!parentStat?.isDirectory()) fail('NOT_A_DIRECTORY')
  const target = path.join(parent, safeName)
  if (await pathExists(target)) fail('ALREADY_EXISTS')

  const root = templateRoot()
  const localized = path.join(root, templateId, language)
  const fallback = path.join(root, templateId, 'en')
  const source = (await pathExists(localized)) ? localized : fallback
  const sourceStat = await fs.stat(source).catch(() => null)
  if (!sourceStat?.isDirectory()) fail('TEMPLATE_MISSING')

  await fs.mkdir(target, { recursive: false })
  await fs.cp(source, target, { recursive: true })
  return { root: target, name: safeName }
}
