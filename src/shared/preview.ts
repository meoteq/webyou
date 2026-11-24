import { basenameText, extnameText, relativePosixText, toUrlPath } from './path-text'

const PAGE_EXT = new Set(['.html', '.htm', '.php'])

export function isPreviewablePage(filePath: string | null | undefined): boolean {
  if (!filePath) return false
  return PAGE_EXT.has(extnameText(filePath))
}

/**
 * The preview keeps showing the last page when the person edits CSS/JS.
 * A newly opened HTML/PHP file always wins.
 */
export function pickPreviewPage(
  activeFile: string | null,
  lastPreviewed: string | null
): string | null {
  if (isPreviewablePage(activeFile)) return activeFile
  if (isPreviewablePage(lastPreviewed)) return lastPreviewed
  return null
}

/** Pick the page shown when a project opens: index.html, index.php, then the first page found. */
export function pickEntryPage(files: string[]): string | null {
  const pages = files.filter(isPreviewablePage)
  const byName = (name: string): string | undefined =>
    pages.find((file) => basenameText(file).toLowerCase() === name)
  return byName('index.html') ?? byName('index.php') ?? byName('index.htm') ?? pages[0] ?? null
}

/** Build the dev-server URL for a file inside the project. */
export function buildPreviewUrl(port: number, projectRoot: string, filePath: string, nonce?: number): string {
  const relative = relativePosixText(projectRoot, filePath)
  const url = new URL(`http://127.0.0.1:${port}/${toUrlPath(relative)}`)
  if (nonce !== undefined) url.searchParams.set('_webyou', String(nonce))
  return url.toString()
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Links inside the project stay in the preview; external links are handed to the OS browser. */
export function isExternalUrl(url: string, origin: string): boolean {
  try {
    const target = new URL(url, origin)
    const base = new URL(origin)
    return target.origin !== base.origin
  } catch {
    return true
  }
}
