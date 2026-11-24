import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { HTMLHint } from 'htmlhint'
import { IPC } from '@shared/ipc'
import type {
  AppInfo,
  CreateProjectResult,
  FileNode,
  FileTreeResult,
  FsChangedEvent,
  Language,
  LintResult,
  Problem,
  ProjectInfo,
  RecentProject,
  ServerLogEvent,
  ServerStatus,
  Settings,
  TemplateId,
  TextEditAction
} from '@shared/types'
import { isHttpUrl } from '@shared/preview'
import { parsePhpRuntimeOutput } from '@shared/php-errors'
import { isInsideOrEqual } from '@shared/paths'
import { ProjectManager, createProjectFromTemplate } from '../project'
import { PhpServer, lintPhpFile } from '../php-server'
import {
  getRecentProjects,
  getSettings,
  removeRecentProject,
  resolveDataDir,
  setSettings,
  touchRecentProject
} from '../settings'

const TEMPLATE_IDS: TemplateId[] = ['blank', 'business-card', 'php-form']
const TEXT_EDIT_ACTIONS: TextEditAction[] = ['cut', 'copy', 'paste', 'delete', 'selectAll']
const MAX_TEXT_BYTES = 12 * 1024 * 1024
const APP_BAR_HEIGHT = 64

function invalid(message: string): never {
  const error = new Error(message) as NodeJS.ErrnoException
  error.code = 'INVALID_ARGUMENT'
  throw error
}

function asString(value: unknown, name: string, max = 4096): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) invalid(`INVALID_${name}`)
  return value
}

function asText(value: unknown, name: string, max = 4096): string {
  if (typeof value !== 'string' || value.length > max) invalid(`INVALID_${name}`)
  return value
}

function asOptionalString(value: unknown, name: string, max = 4096): string | undefined {
  if (value === undefined || value === null) return undefined
  return asString(value, name, max)
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`INVALID_${name}`)
  return value as Record<string, unknown>
}

function asKind(value: unknown): 'file' | 'directory' {
  if (value !== 'file' && value !== 'directory') invalid('INVALID_KIND')
  return value
}

function asTextEditAction(value: unknown): TextEditAction {
  if (!TEXT_EDIT_ACTIONS.includes(value as TextEditAction)) invalid('INVALID_ACTION')
  return value as TextEditAction
}

function asEol(value: unknown): 'lf' | 'crlf' {
  if (value !== 'lf' && value !== 'crlf') invalid('INVALID_EOL')
  return value
}

function asLanguage(value: unknown): Language {
  if (value !== 'ru' && value !== 'en') invalid('INVALID_LANGUAGE')
  return value
}

function asTemplate(value: unknown): TemplateId {
  if (!TEMPLATE_IDS.includes(value as TemplateId)) invalid('INVALID_TEMPLATE')
  return value as TemplateId
}

function hexColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) {
    invalid('INVALID_COLOR')
  }
  return value
}

export interface IpcContext {
  window: BrowserWindow
}

/** Register every renderer-facing channel once. All arguments are validated here. */
export function registerIpc({ window }: IpcContext): void {
  let lastActiveFile: string | null = null

  const broadcast = (channel: string, payload: unknown): void => {
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed()) target.webContents.send(channel, payload)
    }
  }

  const project = new ProjectManager((event: FsChangedEvent) => {
    broadcast(IPC.fsChanged, event)
  })

  const server = new PhpServer(
    (status: ServerStatus) => broadcast(IPC.serverStatusChanged, status),
    (event: ServerLogEvent) => {
      broadcast(IPC.serverLog, event)
      const root = project.rootPath
      if (!root || !lastActiveFile) return
      const problems = parsePhpRuntimeOutput(event.line, root, lastActiveFile)
      if (problems.length > 0) broadcast(IPC.serverProblems, problems)
    }
  )

  const openProject = async (root: string): Promise<ProjectInfo> => {
    const info = await project.open(root)
    lastActiveFile = null
    await touchRecentProject({ path: info.root, name: info.name, openedAt: Date.now() })
    await server.start(info.root)
    return info
  }

  ipcMain.handle(IPC.appInfo, async (): Promise<AppInfo> => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      phpVersion: await server.phpVersion(),
      dataDir: await resolveDataDir(),
      resourcesDir: app.isPackaged
        ? process.resourcesPath
        : path.join(app.getAppPath(), 'resources'),
      documentsDir: app.getPath('documents'),
      isPackaged: app.isPackaged
    }
  })

  ipcMain.handle(IPC.settingsGet, (): Promise<Settings> => getSettings())

  ipcMain.handle(IPC.settingsSet, async (_event, patch: unknown): Promise<Settings> => {
    const next = await setSettings(asRecord(patch, 'SETTINGS') as Partial<Settings>)
    // The native title-bar overlay follows the app theme, not the OS theme.
    nativeTheme.themeSource = next.theme
    return next
  })

  ipcMain.handle(IPC.projectOpen, async (): Promise<ProjectInfo | null> => {
    const result = await dialog.showOpenDialog(window, {
      title: 'WebYou',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('documents')
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return openProject(result.filePaths[0])
  })

  ipcMain.handle(IPC.projectOpenPath, async (_event, target: unknown): Promise<ProjectInfo> => {
    const root = asString(target, 'PATH')
    const stat = await fs.stat(root).catch(() => null)
    if (!stat?.isDirectory()) {
      await removeRecentProject(root)
      const error = new Error('PROJECT_NOT_FOUND') as NodeJS.ErrnoException
      error.code = 'PROJECT_NOT_FOUND'
      throw error
    }
    return openProject(root)
  })

  ipcMain.handle(IPC.projectPickFolder, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(window, {
      title: 'WebYou',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('documents')
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    IPC.projectCreateFromTemplate,
    async (_event, input: unknown): Promise<CreateProjectResult> => {
      const data = asRecord(input, 'PROJECT')
      const templateId = asTemplate(data.templateId)
      const parentDirectory = asString(data.parentDirectory, 'DIRECTORY')
      const projectName = asString(data.name, 'NAME', 120)
      const language = asLanguage(data.language)
      const created = await createProjectFromTemplate(
        templateId,
        parentDirectory,
        projectName,
        language
      )
      const info = await openProject(created.root)
      return { project: info, canceled: false }
    }
  )

  ipcMain.handle(IPC.projectClose, async (): Promise<void> => {
    await server.stop()
    await project.close()
    lastActiveFile = null
  })

  ipcMain.handle(IPC.projectRecent, (): Promise<RecentProject[]> => getRecentProjects())

  ipcMain.handle(IPC.projectRecentRemove, (_event, target: unknown): Promise<RecentProject[]> => {
    return removeRecentProject(asString(target, 'PATH'))
  })

  ipcMain.handle(IPC.fsTree, (): Promise<FileTreeResult> => project.tree())

  ipcMain.handle(IPC.fsRead, async (_event, filePath: unknown) => {
    const file = asString(filePath, 'PATH')
    const result = await project.read(file)
    lastActiveFile = result.path
    return result
  })

  ipcMain.handle(IPC.fsWrite, async (_event, input: unknown) => {
    const data = asRecord(input, 'WRITE')
    const file = asString(data.path, 'PATH')
    const content = asText(data.content, 'CONTENT', MAX_TEXT_BYTES)
    const eol = asEol(data.eol)
    const expectedMtime =
      typeof data.expectedMtime === 'number' && Number.isFinite(data.expectedMtime)
        ? data.expectedMtime
        : undefined
    const createMissing = data.createMissing === true
    const result = await project.write(file, content, eol, expectedMtime, createMissing)
    lastActiveFile = result.path
    return result
  })

  ipcMain.handle(IPC.fsCreate, (_event, input: unknown): Promise<FileNode> => {
    const data = asRecord(input, 'CREATE')
    return project.create(
      asString(data.parent, 'PARENT'),
      asString(data.name, 'NAME', 120),
      asKind(data.kind)
    )
  })

  ipcMain.handle(IPC.fsRename, (_event, input: unknown): Promise<FileNode> => {
    const data = asRecord(input, 'RENAME')
    return project.rename(asString(data.path, 'PATH'), asString(data.newName, 'NAME', 120))
  })

  ipcMain.handle(IPC.fsDelete, async (_event, target: unknown): Promise<void> => {
    await project.remove(asString(target, 'PATH'))
  })

  ipcMain.handle(IPC.fsReveal, async (_event, target: unknown): Promise<void> => {
    await project.reveal(asString(target, 'PATH'))
  })

  ipcMain.handle(IPC.fsCopyIntoProject, (_event, input: unknown) => {
    const data = asRecord(input, 'COPY')
    return project.copyIntoProject(
      asString(data.source, 'SOURCE'),
      asOptionalString(data.targetDirectory, 'TARGET') ?? '.'
    )
  })

  ipcMain.handle(IPC.fsPickImage, async (_event, input: unknown): Promise<string | null> => {
    const data = asRecord(input, 'IMAGE')
    const targetDirectory = asOptionalString(data.targetDirectory, 'TARGET') ?? '.'
    const result = await dialog.showOpenDialog(window, {
      title: 'WebYou',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const copied = await project.copyIntoProject(result.filePaths[0], targetDirectory)
    return copied.relative
  })

  ipcMain.handle(IPC.serverStart, async (): Promise<ServerStatus> => {
    const root = project.rootPath
    if (!root) {
      return { state: 'failed', port: null, phpAvailable: false, message: 'NO_PROJECT' }
    }
    return server.start(root)
  })

  ipcMain.handle(IPC.serverStop, async (): Promise<ServerStatus> => {
    await server.stop()
    return server.status
  })

  ipcMain.handle(IPC.serverStatus, (): ServerStatus => server.status)

  ipcMain.handle(IPC.lintPhp, async (_event, target: unknown): Promise<LintResult> => {
    const root = project.rootPath
    const file = asString(target, 'PATH')
    if (!root) return { problems: [], phpAvailable: false, error: 'NO_PROJECT' }
    const resolved = path.resolve(root, file)
    if (!isInsideOrEqual(root, resolved)) {
      const error = new Error('PATH_OUTSIDE_PROJECT') as NodeJS.ErrnoException
      error.code = 'PATH_OUTSIDE_PROJECT'
      throw error
    }
    if (path.extname(resolved).toLowerCase() !== '.php') {
      return { problems: [], phpAvailable: true }
    }
    lastActiveFile = resolved
    return lintPhpFile(root, resolved)
  })

  ipcMain.handle(IPC.lintHtml, (_event, input: unknown): Problem[] => {
    const data = asRecord(input, 'HTML')
    const file = asString(data.path, 'PATH')
    const content = asText(data.content, 'CONTENT', MAX_TEXT_BYTES)
    const root = project.rootPath
    if (!root) return []
    const resolved = path.resolve(root, file)
    if (!isInsideOrEqual(root, resolved)) {
      const error = new Error('PATH_OUTSIDE_PROJECT') as NodeJS.ErrnoException
      error.code = 'PATH_OUTSIDE_PROJECT'
      throw error
    }
    const relative = path.relative(root, resolved).split(path.sep).join('/')
    return HTMLHint.verify(content, {}).map((item) => ({
      file: relative,
      line: item.line,
      column: item.col,
      severity: item.type === 'warning' ? 'warning' : 'error',
      source: 'html' as const,
      message: item.message ?? item.rule?.description ?? 'HTML',
      originalMessage: item.raw ?? item.message ?? '',
      code: item.rule?.id
    }))
  })

  ipcMain.handle(IPC.shellOpenExternal, async (_event, target: unknown): Promise<void> => {
    const url = asString(target, 'URL', 8192)
    if (!isHttpUrl(url)) invalid('UNSAFE_URL')
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC.shellShowItem, async (_event, target: unknown): Promise<void> => {
    await project.reveal(asString(target, 'PATH'))
  })

  // The renderer sends colors with `ipcRenderer.send`, so this must be `on`,
  // not `handle`: an `invoke` handler never receives a plain send.
  ipcMain.on(IPC.uiTitleBar, (_event, input: unknown): void => {
    try {
      const data = asRecord(input, 'TITLE_BAR')
      const color = hexColor(data.color)
      const symbolColor = hexColor(data.symbolColor)
      if (window.isDestroyed()) return
      window.setTitleBarOverlay({ color, symbolColor, height: APP_BAR_HEIGHT })
    } catch {
      // A malformed pair must not crash the main process; the next theme change
      // sends a valid one.
    }
  })

  ipcMain.handle(IPC.uiClipboardState, async (): Promise<{ hasText: boolean }> => {
    // Check formats only: the renderer never receives clipboard contents.
    const [text, html] = await Promise.all([
      clipboard.has('text/plain'),
      clipboard.has('text/html')
    ])
    return { hasText: text || html }
  })

  // Editing commands run in the window that asked for them, against whatever
  // element currently has focus there. The renderer restores focus to the
  // right-clicked field before calling this.
  ipcMain.handle(IPC.uiEdit, (event, action: unknown): void => {
    const target = BrowserWindow.fromWebContents(event.sender) ?? window
    if (target.isDestroyed()) return
    const contents = target.webContents
    switch (asTextEditAction(action)) {
      case 'cut':
        contents.cut()
        break
      case 'copy':
        contents.copy()
        break
      case 'paste':
        contents.paste()
        break
      case 'delete':
        contents.delete()
        break
      case 'selectAll':
        contents.selectAll()
        break
    }
  })

  app.on('before-quit', () => {
    void server.stop()
  })
}
