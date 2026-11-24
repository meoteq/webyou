#!/usr/bin/env node
/**
 * Collect license texts for every production dependency into
 * `resources/licenses/THIRD-PARTY-NOTICES.txt`, so the portable archive ships
 * the notices required by MIT/BSD/Apache-style licenses.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'))
const output = path.join(root, 'resources', 'licenses', 'THIRD-PARTY-NOTICES.txt')
const LICENSE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'license',
  'license.md',
  'license.txt',
  'COPYING',
  'COPYING.md',
  'NOTICE'
]

function packageName(key) {
  const marker = 'node_modules/'
  const index = key.lastIndexOf(marker)
  return index >= 0 ? key.slice(index + marker.length) : key
}

const entries = []
for (const [key, value] of Object.entries(lock.packages ?? {})) {
  if (!key || value?.dev === true || !value?.version) continue
  const name = value.name ?? packageName(key)
  const directory = path.join(root, key)
  let license = value.license ?? ''
  let text = ''
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
    license = license || manifest.license || (manifest.licenses ?? []).map((item) => item.type).join(', ')
  } catch {
    // The package may have been pruned; the lockfile entry is still useful.
  }
  for (const candidate of LICENSE_NAMES) {
    try {
      text = await fs.readFile(path.join(directory, candidate), 'utf8')
      break
    } catch {
      // Try the next common file name.
    }
  }
  entries.push({ name, version: value.version, license: license || 'see package', text })
}

entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

const seen = new Set()
const sections = [
  'WebYou — third-party notices',
  '============================',
  '',
  'WebYou is free software under the GNU GPL v3 or later (see LICENSE).',
  'This file lists the production dependencies bundled with the application',
  'and reproduces their license texts where the package provides one.',
  '',
  'PHP is distributed under the PHP License 3.01; see php-license.txt.',
  '',
  'Icon geometry in src/renderer/src/components/Icon.tsx is from',
  'google/material-design-icons (Material Symbols), Apache License 2.0.',
  '',
  'Electron and Chromium are distributed with their own licenses; see the',
  'LICENSES.chromium.html file inside the packaged application.',
  ''
]

for (const entry of entries) {
  const id = `${entry.name}@${entry.version}`
  if (seen.has(id)) continue
  seen.add(id)
  sections.push('', '-'.repeat(78), `${id} — ${entry.license}`, '-'.repeat(78), '')
  sections.push(entry.text.trim() || 'No license text was included in the package.')
}

await fs.mkdir(path.dirname(output), { recursive: true })
await fs.writeFile(output, `${sections.join('\n')}\n`, 'utf8')
process.stdout.write(`[licenses] Wrote ${seen.size} packages to ${path.relative(root, output)}\n`)
