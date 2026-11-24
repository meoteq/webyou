import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { WebYouApi } from '@shared/api'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: WebYouApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    onFlushRequest: (callback) => subscribe(IPC.appFlushRequest, callback),
    flushDone: (result) => ipcRenderer.send(IPC.appFlushDone, result)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  project: {
    openDialog: () => ipcRenderer.invoke(IPC.projectOpen),
    openPath: (path) => ipcRenderer.invoke(IPC.projectOpenPath, path),
    pickFolder: () => ipcRenderer.invoke(IPC.projectPickFolder),
    createFromTemplate: (input) => ipcRenderer.invoke(IPC.projectCreateFromTemplate, input),
    close: () => ipcRenderer.invoke(IPC.projectClose),
    recent: () => ipcRenderer.invoke(IPC.projectRecent),
    removeRecent: (path) => ipcRenderer.invoke(IPC.projectRecentRemove, path),
    onChanged: (callback) => subscribe(IPC.fsChanged, callback)
  },
  fs: {
    tree: () => ipcRenderer.invoke(IPC.fsTree),
    read: (path) => ipcRenderer.invoke(IPC.fsRead, path),
    write: (input) => ipcRenderer.invoke(IPC.fsWrite, input),
    create: (input) => ipcRenderer.invoke(IPC.fsCreate, input),
    rename: (input) => ipcRenderer.invoke(IPC.fsRename, input),
    remove: (path) => ipcRenderer.invoke(IPC.fsDelete, path),
    reveal: (path) => ipcRenderer.invoke(IPC.fsReveal, path),
    copyIntoProject: (input) => ipcRenderer.invoke(IPC.fsCopyIntoProject, input),
    pickImage: (targetDirectory) => ipcRenderer.invoke(IPC.fsPickImage, { targetDirectory })
  },
  server: {
    start: () => ipcRenderer.invoke(IPC.serverStart),
    stop: () => ipcRenderer.invoke(IPC.serverStop),
    status: () => ipcRenderer.invoke(IPC.serverStatus),
    onStatusChanged: (callback) => subscribe(IPC.serverStatusChanged, callback),
    onLog: (callback) => subscribe(IPC.serverLog, callback),
    onProblems: (callback) => subscribe(IPC.serverProblems, callback)
  },
  lint: {
    php: (path) => ipcRenderer.invoke(IPC.lintPhp, path),
    html: (input) => ipcRenderer.invoke(IPC.lintHtml, input)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
    showItem: (path) => ipcRenderer.invoke(IPC.shellShowItem, path)
  },
  ui: {
    setTitleBarColors: (colors) => ipcRenderer.send(IPC.uiTitleBar, colors),
    edit: (action) => ipcRenderer.invoke(IPC.uiEdit, action),
    clipboardState: () => ipcRenderer.invoke(IPC.uiClipboardState),
    onSystemThemeChanged: (callback) => subscribe(IPC.systemThemeChanged, callback),
    onMaximized: (callback) => subscribe(IPC.windowMaximized, callback)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('webyou', api)
} else {
  // Only reachable if the window is ever created without context isolation.
  ;(globalThis as unknown as { webyou: WebYouApi }).webyou = api
}
