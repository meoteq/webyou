/** Minimal shape of Electron's `<webview>` element used by the preview. */
export interface WebviewElement extends HTMLElement {
  src: string
  reload(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
  loadURL(url: string): Promise<void>
  executeJavaScript<T = unknown>(code: string): Promise<T>
  stop(): void
  focus(): void
}
