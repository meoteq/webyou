import { describe, expect, it } from 'vitest'
import {
  basenameText,
  dirnameRelative,
  extnameText,
  joinPathText,
  normalizeSlashes,
  relativePosixText,
  toUrlPath
} from '@shared/path-text'
import {
  buildPreviewUrl,
  isExternalUrl,
  isHttpUrl,
  isPreviewablePage,
  pickEntryPage,
  pickPreviewPage
} from '@shared/preview'

describe('path text helpers', () => {
  it('normalizes separators and reads names', () => {
    expect(normalizeSlashes('C:\\site\\index.html')).toBe('C:/site/index.html')
    expect(basenameText('C:\\site\\index.html')).toBe('index.html')
    expect(basenameText('C:/site/folder/')).toBe('folder')
    expect(extnameText('C:/site/INDEX.HTML')).toBe('.html')
    expect(extnameText('C:/site/.htaccess')).toBe('')
  })

  it('builds relative posix paths case-insensitively', () => {
    expect(relativePosixText('C:\\Site', 'c:/site/images/Me.png')).toBe('images/Me.png')
    expect(relativePosixText('C:/site/', 'C:/site')).toBe('')
    expect(relativePosixText('C:/site', 'C:/other/file.txt')).toBe('C:/other/file.txt')
  })

  it('encodes URL paths and joins native paths', () => {
    expect(toUrlPath('images/Мой файл.png')).toBe('images/%D0%9C%D0%BE%D0%B9%20%D1%84%D0%B0%D0%B9%D0%BB.png')
    expect(joinPathText('C:\\site', 'css/style.css')).toBe('C:\\site\\css\\style.css')
    expect(joinPathText('/home/site/', 'css/style.css')).toBe('/home/site/css/style.css')
    expect(dirnameRelative('images/icons/logo.svg')).toBe('images/icons')
    expect(dirnameRelative('index.html')).toBe('')
  })
})

describe('preview page selection', () => {
  it('recognizes previewable pages', () => {
    expect(isPreviewablePage('index.html')).toBe(true)
    expect(isPreviewablePage('index.PHP')).toBe(true)
    expect(isPreviewablePage('style.css')).toBe(false)
    expect(isPreviewablePage(null)).toBe(false)
  })

  it('prefers index.html, then index.php, then any page', () => {
    expect(pickEntryPage(['about.html', 'index.php', 'index.html'])).toBe('index.html')
    expect(pickEntryPage(['about.html', 'index.php'])).toBe('index.php')
    expect(pickEntryPage(['style.css', 'about.html', 'contact.html'])).toBe('about.html')
    expect(pickEntryPage(['style.css'])).toBeNull()
  })

  it('keeps the last page when a stylesheet becomes active', () => {
    expect(pickPreviewPage('css/style.css', 'about.html')).toBe('about.html')
    expect(pickPreviewPage('index.php', 'about.html')).toBe('index.php')
    expect(pickPreviewPage('app.js', null)).toBeNull()
  })
})

describe('buildPreviewUrl', () => {
  it('builds a localhost URL with encoded path and cache buster', () => {
    const url = buildPreviewUrl(41234, 'C:\\site', 'C:\\site\\Мой сайт\\index.html', 99)

    expect(url).toBe(
      'http://127.0.0.1:41234/%D0%9C%D0%BE%D0%B9%20%D1%81%D0%B0%D0%B9%D1%82/index.html?_webyou=99'
    )
  })

  it('omits the cache buster when no nonce is given', () => {
    expect(buildPreviewUrl(8080, '/site', '/site/about.html')).toBe(
      'http://127.0.0.1:8080/about.html'
    )
  })
})

describe('link safety', () => {
  it('accepts only http(s) URLs for the OS browser', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('http://127.0.0.1:3000/a')).toBe(true)
    expect(isHttpUrl('file:///C:/Windows')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
  })

  it('treats other origins as external', () => {
    const origin = 'http://127.0.0.1:5000'
    expect(isExternalUrl('/about.html', origin)).toBe(false)
    expect(isExternalUrl('style.css', origin)).toBe(false)
    expect(isExternalUrl('https://example.com', origin)).toBe(true)
    expect(isExternalUrl('http://localhost:5000/about.html', origin)).toBe(true)
    expect(isExternalUrl('mailto:hi@example.com', origin)).toBe(true)
  })
})
