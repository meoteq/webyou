const KNOWN = [
  'INVALID_NAME',
  'INVALID_ARGUMENT',
  'ALREADY_EXISTS',
  'PROJECT_NOT_FOUND',
  'NOT_A_DIRECTORY',
  'NOT_A_FILE',
  'PATH_OUTSIDE_PROJECT',
  'PHP_NOT_FOUND',
  'TEMPLATE_MISSING',
  'FILE_TOO_LARGE',
  'FILE_CHANGED',
  'NO_PROJECT',
  'CANNOT_MODIFY_ROOT',
  'SERVER_FAILED',
  'INVALID_SETTINGS',
  'UNSAFE_URL'
] as const

/** Node/Windows error codes mapped to human explanations. */
const OS_CODES: [string, string][] = [
  ['EACCES', 'PERMISSION_DENIED'],
  ['EPERM', 'PERMISSION_DENIED'],
  ['EBUSY', 'FILE_BUSY'],
  ['EROFS', 'READ_ONLY'],
  ['ENOSPC', 'DISK_FULL']
]

/** Turn an Electron IPC error into a translation key. */
export function errorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const found = KNOWN.find((code) => message.includes(code))
  if (found) return `errors.${found}`
  const os = OS_CODES.find(([code]) => message.includes(code))
  return os ? `errors.${os[1]}` : 'errors.generic'
}
