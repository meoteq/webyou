import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isInside,
  isInsideOrEqual,
  looksBinary,
  mimeForPath,
  relativePosix,
  resolveInside,
  toUrlPath
} from '@shared/paths'

const root = path.resolve('demo-project')

describe('isInside', () => {
  it('accepts files below the root', () => {
    expect(isInside(root, 'index.html')).toBe(true)
    expect(isInside(root, 'images/me.png')).toBe(true)
    expect(isInside(root, path.join(root, 'css', 'style.css'))).toBe(true)
  })

  it('rejects the root itself', () => {
    expect(isInside(root, '.')).toBe(false)
  })

  it('rejects escaping paths', () => {
    expect(isInside(root, '..')).toBe(false)
    expect(isInside(root, '../secret.txt')).toBe(false)
    expect(isInside(root, 'css/../../secret.txt')).toBe(false)
  })

  it('rejects sibling directories sharing the same prefix', () => {
    const sibling = path.resolve('demo-project-evil', 'file.txt')
    expect(isInside(root, sibling)).toBe(false)
  })
})

describe('isInsideOrEqual', () => {
  it('accepts the root itself', () => {
    expect(isInsideOrEqual(root, '.')).toBe(true)
    expect(isInsideOrEqual(root, root)).toBe(true)
  })

  it('still rejects escapes', () => {
    expect(isInsideOrEqual(root, '../file')).toBe(false)
  })
})

describe('resolveInside', () => {
  it('returns an absolute path for project files', () => {
    expect(resolveInside(root, 'index.html')).toBe(path.join(root, 'index.html'))
  })

  it('rejects the root unless explicitly allowed', () => {
    expect(() => resolveInside(root, '.')).toThrowError('PATH_OUTSIDE_PROJECT')
    expect(resolveInside(root, '.', true)).toBe(root)
  })

  it('attaches a stable error code', () => {
    try {
      resolveInside(root, '../outside.txt')
      expect.unreachable('resolveInside should have thrown')
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('PATH_OUTSIDE_PROJECT')
    }
  })
})

describe('toUrlPath', () => {
  it('converts Windows separators and encodes each segment', () => {
    expect(toUrlPath('images\\Мой файл.png')).toBe('images/%D0%9C%D0%BE%D0%B9%20%D1%84%D0%B0%D0%B9%D0%BB.png')
    expect(toUrlPath('/css/style.css')).toBe('css/style.css')
  })
})

describe('relativePosix', () => {
  it('returns forward-slash paths even on Windows', () => {
    expect(relativePosix(root, path.join(root, 'images', 'me.png'))).toBe('images/me.png')
  })
})

describe('looksBinary', () => {
  it('detects binary extensions', () => {
    expect(looksBinary('photo.PNG')).toBe(true)
    expect(looksBinary('movie.mp4')).toBe(true)
  })

  it('detects NUL bytes in the sample', () => {
    expect(looksBinary('data.bin', new Uint8Array([65, 0, 66]))).toBe(true)
    expect(looksBinary('notes.txt', new TextEncoder().encode('hello'))).toBe(false)
  })
})

describe('mimeForPath', () => {
  it('maps common web file types', () => {
    expect(mimeForPath('index.html')).toBe('text/html')
    expect(mimeForPath('style.CSS')).toBe('text/css')
    expect(mimeForPath('app.js')).toBe('text/javascript')
    expect(mimeForPath('index.php')).toBe('application/x-httpd-php')
    expect(mimeForPath('logo.svg')).toBe('image/svg+xml')
  })

  it('falls back to a generic binary type', () => {
    expect(mimeForPath('archive.bin')).toBe('application/octet-stream')
  })
})
