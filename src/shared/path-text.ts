/**
 * Small, dependency-free path helpers.
 *
 * The renderer runs in a sandbox without Node built-ins, so anything it imports
 * from `@shared` must avoid `node:path`. These helpers cover the handful of
 * string operations the preview needs on Windows and POSIX paths.
 */

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

/** File name including extension, without the directory part. */
export function basenameText(value: string): string {
  const normalized = normalizeSlashes(value).replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

/** Lower-case extension including the dot, or an empty string. */
export function extnameText(value: string): string {
  const name = basenameText(value)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

/** Relative path using forward slashes. Project files always live under `root`. */
export function relativePosixText(root: string, file: string): string {
  const normalizedRoot = normalizeSlashes(root).replace(/\/+$/, '')
  const normalizedFile = normalizeSlashes(file)
  if (normalizedFile.toLowerCase() === normalizedRoot.toLowerCase()) return ''
  const prefix = `${normalizedRoot.toLowerCase()}/`
  if (normalizedFile.toLowerCase().startsWith(prefix)) {
    return normalizedFile.slice(normalizedRoot.length + 1)
  }
  return normalizedFile
}

/** Convert a relative path into an encoded URL path. */
export function toUrlPath(relativePath: string): string {
  return normalizeSlashes(relativePath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

/** Join a native root and a forward-slash relative path without Node's path module. */
export function joinPathText(root: string, relativePath: string): string {
  const separator = root.includes('\\') ? '\\' : '/'
  const trimmed = root.replace(/[\\/]+$/, '')
  const tail = normalizeSlashes(relativePath)
    .split('/')
    .filter(Boolean)
    .join(separator)
  return `${trimmed}${separator}${tail}`
}

/** Directory part of a forward-slash relative path, without a trailing slash. */
export function dirnameRelative(relativePath: string): string {
  const normalized = normalizeSlashes(relativePath).replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}
