import { describe, expect, it } from 'vitest'
import { errorKey } from '../../src/shared/errors'

describe('errorKey', () => {
  it('keeps the IPC error codes used by the app', () => {
    expect(errorKey(new Error('FILE_CHANGED'))).toBe('errors.FILE_CHANGED')
    expect(errorKey(new Error("Error invoking remote method 'fs:write': ALREADY_EXISTS"))).toBe(
      'errors.ALREADY_EXISTS'
    )
    expect(errorKey(new Error('NOT_A_FILE'))).toBe('errors.NOT_A_FILE')
  })

  it('explains common Windows file-system errors', () => {
    expect(errorKey(new Error('EACCES: permission denied, rename'))).toBe(
      'errors.PERMISSION_DENIED'
    )
    expect(errorKey(new Error('EPERM: operation not permitted'))).toBe('errors.PERMISSION_DENIED')
    expect(errorKey(new Error('EBUSY: resource busy or locked'))).toBe('errors.FILE_BUSY')
    expect(errorKey(new Error('EROFS: read-only file system'))).toBe('errors.READ_ONLY')
    expect(errorKey(new Error('ENOSPC: no space left on device'))).toBe('errors.DISK_FULL')
  })

  it('falls back to the generic explanation for unknown failures', () => {
    expect(errorKey(new Error('something unexpected'))).toBe('errors.generic')
    expect(errorKey('EUNKNOWN')).toBe('errors.generic')
    expect(errorKey(null)).toBe('errors.generic')
  })
})
