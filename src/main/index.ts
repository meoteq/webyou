import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, session, shell } from 'electron'
import path from 'node:path'
import { IPC } from '@shared/ipc'
import { isHttpUrl } from '@shared/preview'
import { windowColors } from '@shared/theme'
import { registerIpc } from './ipc'
import { getSettings } from './settings'

const APP_BAR_HEIGHT = 64
const PREVIEW_PARTITION = 'persist:webyou-preview'
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']
const IS_DEV = Boolean(DEV_SERVER_URL)
const FLUSH_TIMEOUT = 6000

let mainWindow: BrowserWindow | null = null

/**
 * Asks the renderer to write every dirty tab. Without this the autosave timers
 * die with the window and the last edits are lost silently.
 */
function requestFlush(window: BrowserWindow): Promise<{ failed: number; responded: boolean }> {
  return new Promise((resolve) => {
    const token = Date.now() + Math.random()
    let settled = false
    const finish = (result: { failed: number; responded: boolean }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ipcMain.removeListener(IPC.appFlushDone, onDone)
      resolve(result)
    }
    const timer = setTimeout(() => finish({ failed: 0, responded: false }), FLUSH_TIMEOUT)
    const onDone = (_event: unknown, payload: { token?: number; failed?: number }): void => {
      if (!payload || payload.token !== token) return
      finish({ failed: Number(payload.failed) || 0, responded: true })
    }
    ipcMain.on(IPC.appFlushDone, onDone)
    window.webContents.send(IPC.appFlushRequest, token)
  })
}

async function closeWithFlush(window: BrowserWindow, close: () => void): Promise<void> {
  const { failed, responded } = await requestFlush(window)
  if (window.isDestroyed()) return

  if (responded && failed > 0) {
    const settings = await getSettings().catch(() => null)
    const russian = settings?.language === 'ru'
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'WebYou',
      message: russian
        ? 'Не удалось сохранить часть файлов.'
        : 'Some files could not be saved.',
      detail: russian
        ? 'Если закрыть сейчас, эти изменения будут потеряны.'
        : 'Closing now will lose those changes.',
      buttons: russian
        ? ['Закрыть без сохранения', 'Отмена']
        : ['Close without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (response !== 0) return
  }

  close()
}

function surfaceColors(): { background: string; foreground: string } {
  return windowColors(nativeTheme.shouldUseDarkColors)
}

function isLocalPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    )
  } catch {
    return false
  }
}

function applySecurityHeaders(): void {
  const devSources = IS_DEV
    ? " 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
    : " 'unsafe-inline'"
  const policy = [
    "default-src 'self'",
    `script-src 'self'${devSources}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:*${IS_DEV ? ' ws://127.0.0.1:*' : ''}`,
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src http://127.0.0.1:* http://localhost:*"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

function hardenPreviewSession(): void {
  const preview = session.fromPartition(PREVIEW_PARTITION)
  preview.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  preview.setPermissionCheckHandler(() => false)
  preview.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    })
  })
  preview.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cache-Control': ['no-store, no-cache, must-revalidate'],
        Pragma: ['no-cache']
      }
    })
  })
  void preview.clearCache()
}

function hardenWebview(window: BrowserWindow): void {
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    webPreferences.partition = PREVIEW_PARTITION
    if (!isLocalPreviewUrl(params.src)) event.preventDefault()
  })

  window.webContents.on('did-attach-webview', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isLocalPreviewUrl(url) && contents.getURL()) {
        void contents.loadURL(url)
      } else if (isHttpUrl(url)) {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      if (isLocalPreviewUrl(url)) return
      event.preventDefault()
      if (isHttpUrl(url)) void shell.openExternal(url)
    })

    contents.on('will-redirect', (event, url) => {
      if (isLocalPreviewUrl(url)) return
      event.preventDefault()
      if (isHttpUrl(url)) void shell.openExternal(url)
    })
  })
}

function lockNavigation(window: BrowserWindow): void {
  const allowedOrigin = DEV_SERVER_URL ? new URL(DEV_SERVER_URL).origin : null

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (allowedOrigin && url.startsWith(allowedOrigin)) return
    if (!allowedOrigin && url.startsWith('file://')) return
    event.preventDefault()
    if (isHttpUrl(url)) void shell.openExternal(url)
  })
}

function createWindow(): void {
  const colors = surfaceColors()

  const window = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: colors.background,
    title: 'WebYou',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: colors.background,
      symbolColor: colors.foreground,
      height: APP_BAR_HEIGHT
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false
    }
  })

  mainWindow = window
  lockNavigation(window)
  hardenWebview(window)

  window.on('ready-to-show', () => {
    window.show()
  })

  // Closing is asynchronous: the renderer flushes dirty tabs first, and a failed
  // save asks the user before anything is destroyed.
  let allowClose = false
  let closePending = false
  window.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    if (closePending) return
    closePending = true
    void closeWithFlush(window, () => {
      allowClose = true
      closePending = false
      window.destroy()
    }).finally(() => {
      closePending = false
    })
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.on('maximize', () => window.webContents.send('window:maximized', true))
  window.on('unmaximize', () => window.webContents.send('window:maximized', false))

  nativeTheme.on('updated', () => {
    if (window.isDestroyed()) return
    const next = surfaceColors()
    window.setBackgroundColor(next.background)
    window.setTitleBarOverlay({
      color: next.background,
      symbolColor: next.foreground,
      height: APP_BAR_HEIGHT
    })
    window.webContents.send('system:theme-changed', nativeTheme.shouldUseDarkColors)
  })

  if (IS_DEV) {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  registerIpc({ window })

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const hasLock = app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.webyou.app')
    Menu.setApplicationMenu(null)
    applySecurityHeaders()
    hardenPreviewSession()
    // Make the native frame follow the app theme, not the OS theme. Without
    // this a light UI on a dark desktop keeps dark caption buttons.
    const settings = await getSettings().catch(() => null)
    if (settings) nativeTheme.themeSource = settings.theme
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
