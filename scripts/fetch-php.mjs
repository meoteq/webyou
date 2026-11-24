#!/usr/bin/env node
/**
 * Download the pinned portable PHP build used by WebYou.
 *
 * The zip is fetched from the official windows.php.net release folder, checked
 * against the published SHA-256, and unpacked into `resources/php`. Binaries are
 * never committed; run `npm run fetch-php` after a fresh clone or before
 * packaging.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PHP_VERSION = '8.4.28'
const PHP_ARCHIVE = `php-${PHP_VERSION}-nts-Win32-vs17-x64.zip`
const PHP_SHA256 = 'c1f9280588b7b6ad7b518969022f0b0175f106fab9d0639ad0e4ce7cd47ac1ed'
const DOWNLOAD_URLS = [
  `https://downloads.php.net/~windows/releases/${PHP_ARCHIVE}`,
  `https://windows.php.net/downloads/releases/${PHP_ARCHIVE}`,
  `https://downloads.php.net/~windows/releases/archives/${PHP_ARCHIVE}`,
  `https://windows.php.net/downloads/releases/archives/${PHP_ARCHIVE}`
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(root, 'resources', 'php')
const marker = path.join(destination, '.webyou-php.json')
const force = process.argv.includes('--force')

function log(message) {
  process.stdout.write(`[fetch-php] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[fetch-php] ${message}\n`)
  if (process.env.GITHUB_ACTIONS === 'true') {
    const escaped = message
      .replace(/%/g, '%25')
      .replace(/\r/g, '%0D')
      .replace(/\n/g, '%0A')
    process.stdout.write(`::error::${escaped}\n`)
  }
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) {
    try {
      fs.appendFileSync(summary, `### fetch-php failed\n\n\`\`\`\n${message}\n\`\`\`\n`)
    } catch {
      // The annotation above is enough if the summary cannot be written.
    }
  }
  process.exit(1)
}

async function sha256(file) {
  const hash = createHash('sha256')
  const handle = await fsp.open(file)
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk)
  } finally {
    await handle.close()
  }
  return hash.digest('hex')
}

async function alreadyInstalled() {
  if (force) return false
  try {
    const info = JSON.parse(await fsp.readFile(marker, 'utf8'))
    if (info.version !== PHP_VERSION || info.sha256 !== PHP_SHA256) return false
    await fsp.access(path.join(destination, 'php.exe'))
    return true
  } catch {
    return false
  }
}

async function downloadOnce(url, target) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'WebYou-build/1.0 (+https://github.com/meoteq/webyou)' }
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.text()).replace(/\s+/g, ' ').trim()
      if (body) detail = ` — ${body.slice(0, 200)}`
    } catch {
      // The status alone is enough when the error body cannot be read.
    }
    throw new Error(`HTTP ${response.status} ${response.statusText}${detail}`)
  }
  const total = Number(response.headers.get('content-length') ?? 0)
  const file = await fsp.open(target, 'w')
  let received = 0
  let lastPercent = -10
  try {
    for await (const chunk of response.body) {
      await file.write(chunk)
      received += chunk.length
      if (total > 0) {
        const percent = Math.floor((received / total) * 100)
        if (percent >= lastPercent + 10) {
          lastPercent = percent
          log(`  ${percent}% (${(received / 1024 / 1024).toFixed(1)} MB)`)
        }
      }
    }
  } finally {
    await file.close()
  }
  if (total > 0 && received !== total) {
    throw new Error(`incomplete download: expected ${total} bytes, received ${received}`)
  }
}

async function download(target) {
  const errors = []
  for (const url of DOWNLOAD_URLS) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      log(`Downloading ${url}${attempt > 1 ? ` (attempt ${attempt})` : ''}`)
      try {
        await downloadOnce(url, target)
        return
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        errors.push(`${url} -> ${reason}`)
        log(`  failed: ${reason}`)
        await fsp.rm(target, { force: true }).catch(() => undefined)
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }
  fail(`Download failed:\n${errors.join('\n')}`)
}

function outputTail(result) {
  const parts = [result.error?.message, result.stderr, result.stdout]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
    .trim()
  return parts.length > 800 ? `…${parts.slice(-800)}` : parts
}

function systemTar() {
  if (process.platform !== 'win32') return 'tar'
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const candidate = path.join(systemRoot, 'System32', 'tar.exe')
  return fs.existsSync(candidate) ? candidate : 'tar'
}

function extract(archive, target) {
  log('Extracting…')
  if (process.platform === 'win32') {
    // bsdtar ships with Windows 10+ and handles zip archives. It is much more
    // reliable on CI runners than Windows PowerShell 5.1 Expand-Archive.
    const tar = spawnSync(systemTar(), ['-xf', archive, '-C', target], { encoding: 'utf8' })
    if (tar.status === 0) return
    log(`tar failed${outputTail(tar) ? `: ${outputTail(tar)}` : ''}`)

    const escaped = (value) => value.replace(/'/g, "''")
    const command = [
      "$ErrorActionPreference = 'Stop'",
      `Expand-Archive -LiteralPath '${escaped(archive)}' -DestinationPath '${escaped(target)}' -Force`
    ].join('; ')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8'
    })
    if (result.status !== 0) {
      const detail = [outputTail(tar), outputTail(result)].filter(Boolean).join('\n')
      fail(`Could not extract ${PHP_ARCHIVE}.${detail ? `\n${detail}` : ''}`)
    }
    return
  }
  const result = spawnSync('unzip', ['-q', '-o', archive, '-d', target], { encoding: 'utf8' })
  if (result.status !== 0) {
    const detail = outputTail(result)
    fail(`unzip failed. Install unzip or extract the archive manually.${detail ? `\n${detail}` : ''}`)
  }
}

async function main() {
  if (process.platform !== 'win32') {
    fail('The pinned build is for Windows x64. Use the system PHP in development on other platforms.')
  }
  if (await alreadyInstalled()) {
    log(`PHP ${PHP_VERSION} is already in resources/php.`)
    return
  }

  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'webyou-php-'))
  const archive = path.join(temporary, PHP_ARCHIVE)
  const unpacked = path.join(temporary, 'php')
  try {
    await download(archive)
    const digest = await sha256(archive)
    if (digest !== PHP_SHA256) {
      fail(
        `SHA-256 mismatch!\n  expected ${PHP_SHA256}\n  received ${digest}\nRefusing to unpack an unverified archive.`
      )
    }
    log('SHA-256 verified.')

    await fsp.mkdir(unpacked, { recursive: true })
    extract(archive, unpacked)
    if (!fs.existsSync(path.join(unpacked, 'php.exe'))) {
      fail('php.exe was not found in the archive.')
    }

    await fsp.rm(destination, { recursive: true, force: true })
    await fsp.mkdir(destination, { recursive: true })
    await fsp.cp(unpacked, destination, { recursive: true })
    await fsp.writeFile(
      marker,
      JSON.stringify({ version: PHP_VERSION, sha256: PHP_SHA256, archive: PHP_ARCHIVE }, null, 2),
      'utf8'
    )

    const license = ['LICENSE', 'license.txt', 'LICENSE.txt'].find((name) =>
      fs.existsSync(path.join(destination, name))
    )
    log(`PHP ${PHP_VERSION} installed to resources/php${license ? ` (${license})` : ''}.`)
  } finally {
    await fsp.rm(temporary, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
