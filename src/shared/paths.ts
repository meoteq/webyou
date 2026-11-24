import path from 'node:path'

/**
 * True when `candidate` is strictly inside `root`.
 * Relative paths are resolved against `root`.
 */
export function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, candidate)
  const relative = path.relative(resolvedRoot, resolved)
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Same as {@link isInside}, but the project root itself is allowed. */
export function isInsideOrEqual(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, candidate)
  return resolved === resolvedRoot || isInside(resolvedRoot, resolved)
}

/** Resolve a path and throw a stable error code if it escapes the project. */
export function resolveInside(root: string, candidate: string, allowRoot = false): string {
  const resolved = path.resolve(root, candidate)
  const ok = allowRoot ? isInsideOrEqual(root, resolved) : isInside(root, resolved)
  if (!ok) {
    const error = new Error('PATH_OUTSIDE_PROJECT')
    ;(error as NodeJS.ErrnoException).code = 'PATH_OUTSIDE_PROJECT'
    throw error
  }
  return resolved
}

/** Convert a native path to a URL-safe, forward-slash relative path. */
export function toUrlPath(relativePath: string): string {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

/** A path relative to the project root, using forward slashes. */
export function relativePosix(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

/** True when the path looks like a binary file that the editor must not open as text. */
export function looksBinary(filePath: string, sample?: Uint8Array): boolean {
  const ext = path.extname(filePath).toLowerCase()
  if (
    [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.ico',
      '.bmp',
      '.avif',
      '.pdf',
      '.zip',
      '.mp3',
      '.mp4',
      '.webm',
      '.wav',
      '.ogg',
      '.woff',
      '.woff2',
      '.ttf',
      '.otf',
      '.exe',
      '.dll'
    ].includes(ext)
  ) {
    return true
  }
  if (!sample) return false
  for (const byte of sample.subarray(0, 512)) {
    if (byte === 0) return true
  }
  return false
}

export function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.php': 'application/x-httpd-php',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.pdf': 'application/pdf',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
  }
  return map[ext] ?? 'application/octet-stream'
}
