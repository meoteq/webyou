import { describe, expect, it } from 'vitest'
import { isValidEntryName } from '@shared/names'

describe('isValidEntryName', () => {
  it('accepts ordinary file and folder names', () => {
    expect(isValidEntryName('index.html')).toBe(true)
    expect(isValidEntryName('style.css')).toBe(true)
    expect(isValidEntryName('my page.html')).toBe(true)
    expect(isValidEntryName('data')).toBe(true)
    expect(isValidEntryName('v1.2.3')).toBe(true)
    expect(isValidEntryName('фото.png')).toBe(true)
  })

  it('rejects empty and relative names', () => {
    expect(isValidEntryName('')).toBe(false)
    expect(isValidEntryName('.')).toBe(false)
    expect(isValidEntryName('..')).toBe(false)
  })

  it('rejects names that Windows treats as device names', () => {
    expect(isValidEntryName('con')).toBe(false)
    expect(isValidEntryName('CON.txt')).toBe(false)
    expect(isValidEntryName('aux')).toBe(false)
    expect(isValidEntryName('prn.html')).toBe(false)
    expect(isValidEntryName('nul')).toBe(false)
    expect(isValidEntryName('com1.txt')).toBe(false)
    expect(isValidEntryName('LPT9')).toBe(false)
    // Not reserved: only COM1–COM9 and LPT1–LPT9 are devices.
    expect(isValidEntryName('com0.txt')).toBe(true)
    expect(isValidEntryName('console.html')).toBe(true)
  })

  it('rejects trailing dots and spaces', () => {
    expect(isValidEntryName('trail.')).toBe(false)
    expect(isValidEntryName('trail ')).toBe(false)
    expect(isValidEntryName('a. ')).toBe(false)
  })

  it('rejects surrounding whitespace and separators', () => {
    expect(isValidEntryName(' note.txt')).toBe(false)
    expect(isValidEntryName('note.txt ')).toBe(false)
    expect(isValidEntryName('a/b')).toBe(false)
    expect(isValidEntryName('a\\b')).toBe(false)
    expect(isValidEntryName('a:b')).toBe(false)
    expect(isValidEntryName('a*b')).toBe(false)
    expect(isValidEntryName('a?b')).toBe(false)
    expect(isValidEntryName('a"b')).toBe(false)
    expect(isValidEntryName('a<b')).toBe(false)
    expect(isValidEntryName('a>b')).toBe(false)
    expect(isValidEntryName('a|b')).toBe(false)
  })

  it('rejects control characters', () => {
    expect(isValidEntryName('a\u0000b')).toBe(false)
    expect(isValidEntryName('a\u001fb')).toBe(false)
    expect(isValidEntryName('a\u007fb')).toBe(false)
  })
})
