import path from 'node:path'
import type { Problem } from './types'

const PHP_ERROR_LINE = /(?:PHP\s+)?(Parse|Fatal|Warning|Notice|Deprecated)(?:\s+error)?:\s*(.+?)(?:\s+in\s+(.+?)(?:\s+on\s+line\s+|:)(\d+))?(?:\r?\n|$)/i

export interface ParsedPhpError {
  severity: 'error' | 'warning'
  file: string | null
  line: number
  message: string
  original: string
}

function severityFor(kind: string): 'error' | 'warning' {
  return /^(parse|fatal)$/i.test(kind) ? 'error' : 'warning'
}

/** Parse one or more lines coming from `php -l` or the PHP dev server stderr. */
export function parsePhpOutput(output: string): ParsedPhpError[] {
  const results: ParsedPhpError[] = []
  const lines = output.replace(/\r\n/g, '\n').split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^No syntax errors detected/i.test(line)) continue
    const match = PHP_ERROR_LINE.exec(line)
    if (!match) continue
    const [, kind, message, file, lineNumber] = match
    results.push({
      severity: severityFor(kind),
      file: file ? file.trim() : null,
      line: lineNumber ? Number(lineNumber) : 1,
      message: message.replace(/\s+/g, ' ').trim(),
      original: line
    })
  }
  return results
}

/** Parse `php -l file.php` output into a Problem list relative to the project root. */
export function parsePhpLint(output: string, projectRoot: string, fallbackFile: string): Problem[] {
  const problems: Problem[] = []
  for (const parsed of parsePhpOutput(output)) {
    const absolute = parsed.file ? path.resolve(parsed.file) : path.resolve(fallbackFile)
    const relative = path.relative(projectRoot, absolute)
    problems.push({
      file: (relative.startsWith('..') ? fallbackFile : relative).split(path.sep).join('/'),
      line: parsed.line,
      column: 1,
      severity: parsed.severity,
      source: 'php-syntax',
      message: parsed.message,
      originalMessage: parsed.original
    })
  }
  return problems
}

/** Parse PHP dev-server stderr and keep only entries that belong to the project. */
export function parsePhpRuntimeOutput(
  output: string,
  projectRoot: string,
  fallbackFile: string
): Problem[] {
  return parsePhpOutput(output)
    .filter((item) => item.file !== null)
    .map((parsed) => {
      const absolute = path.resolve(parsed.file as string)
      let relative = path.relative(projectRoot, absolute)
      if (relative.startsWith('..')) relative = fallbackFile
      return {
        file: relative.split(path.sep).join('/'),
        line: parsed.line,
        column: 1,
        severity: parsed.severity,
        source: 'php-runtime' as const,
        message: parsed.message,
        originalMessage: parsed.original
      }
    })
}
