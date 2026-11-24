/**
 * File and folder names the app accepts.
 *
 * Windows refuses or mishandles several names that are perfectly valid on
 * other systems; projects created here must survive a zip, git checkout, or
 * copy to another machine, so the rules are applied everywhere.
 */

const RESERVED_DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const FORBIDDEN_CHARACTERS = /[\\/:*?"<>|]/
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export function isValidEntryName(name: string): boolean {
  if (!name) return false
  if (name !== name.trim()) return false
  if (name === '.' || name === '..') return false
  if (FORBIDDEN_CHARACTERS.test(name)) return false
  if (CONTROL_CHARACTERS.test(name)) return false
  // Windows silently strips trailing dots and spaces, which desyncs paths.
  if (name.endsWith('.') || name.endsWith(' ')) return false
  if (RESERVED_DEVICE_NAMES.test(name)) return false
  return true
}
