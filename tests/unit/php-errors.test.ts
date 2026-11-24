import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsePhpLint,
  parsePhpOutput,
  parsePhpRuntimeOutput
} from '@shared/php-errors'

const root = path.resolve('tests-fixture')
const file = path.join(root, 'index.php')

describe('parsePhpOutput', () => {
  it('ignores a clean lint result', () => {
    expect(parsePhpOutput('No syntax errors detected in index.php')).toEqual([])
  })

  it('parses a parse error with file and line', () => {
    const output = `PHP Parse error:  syntax error, unexpected token ";" in ${file} on line 12`
    const [problem] = parsePhpOutput(output)

    expect(problem).toMatchObject({
      severity: 'error',
      file,
      line: 12,
      message: 'syntax error, unexpected token ";"'
    })
  })

  it('parses fatal errors ending with a colon and line number', () => {
    const output = `PHP Fatal error:  Uncaught Error: Call to undefined function in ${file}:7`
    const [problem] = parsePhpOutput(output)

    expect(problem).toMatchObject({
      severity: 'error',
      file,
      line: 7,
      message: 'Uncaught Error: Call to undefined function'
    })
  })

  it('marks warnings and notices as warnings', () => {
    const output = [
      `PHP Warning:  Undefined array key "name" in ${file} on line 3`,
      `PHP Notice:  Trying to access array offset on value of type null in ${file} on line 4`,
      'PHP Deprecated:  Something old in ' + file + ' on line 5'
    ].join('\n')

    const problems = parsePhpOutput(output)
    expect(problems).toHaveLength(3)
    expect(problems.every((problem) => problem.severity === 'warning')).toBe(true)
  })

  it('normalizes Windows line endings', () => {
    const output = `PHP Warning:  Oops in ${file} on line 2\r\nPHP Warning:  Again in ${file} on line 3\r\n`
    expect(parsePhpOutput(output)).toHaveLength(2)
  })

  it('ignores unrelated server log lines', () => {
    expect(
      parsePhpOutput(
        [
          'Development Server (http://127.0.0.1:8000) started',
          '[Tue Nov 18 12:00:00 2026] 127.0.0.1:5123 Accepted',
          'Some random warning'
        ].join('\n')
      )
    ).toEqual([])
  })
})

describe('parsePhpLint', () => {
  it('maps errors to project-relative forward-slash paths', () => {
    const output = `PHP Parse error:  syntax error, unexpected end of file in ${file} on line 9`
    const [problem] = parsePhpLint(output, root, 'index.php')

    expect(problem).toMatchObject({
      file: 'index.php',
      line: 9,
      column: 1,
      severity: 'error',
      source: 'php-syntax'
    })
    expect(problem.originalMessage).toContain('PHP Parse error')
  })

  it('falls back when PHP reports a path outside the project', () => {
    const outside = path.resolve('elsewhere', 'other.php')
    const output = `PHP Parse error:  bad in ${outside} on line 1`
    const [problem] = parsePhpLint(output, root, 'pages/form.php')

    expect(problem.file).toBe('pages/form.php')
  })
})

describe('parsePhpRuntimeOutput', () => {
  it('keeps project errors and normalizes nested paths', () => {
    const nested = path.join(root, 'pages', 'contact.php')
    const output = `PHP Warning:  Missing field in ${nested} on line 4`
    const [problem] = parsePhpRuntimeOutput(output, root, 'index.php')

    expect(problem).toMatchObject({
      file: 'pages/contact.php',
      line: 4,
      source: 'php-runtime',
      severity: 'warning'
    })
  })

  it('drops startup errors that have no file', () => {
    const output = [
      'PHP Warning:  Module "mbstring" already loaded',
      'PHP Fatal error:  Failed opening required file'
    ].join('\n')

    expect(parsePhpRuntimeOutput(output, root, 'index.php')).toEqual([])
  })
})
