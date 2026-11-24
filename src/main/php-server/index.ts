import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import type { ServerLogEvent, ServerStatus } from '@shared/types'
import { mimeForPath, resolveInside } from '@shared/paths'
import { parsePhpLint } from '@shared/php-errors'
import type { LintResult } from '@shared/types'
import { resolveDataDir } from '../settings'

interface PhpInstallation {
  executable: string
  directory: string
  version: string
}

let cachedPhp: PhpInstallation | null | undefined

function bundledPhpCandidates(): string[] {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'php')
    : path.join(app.getAppPath(), 'resources', 'php')
  return process.platform === 'win32'
    ? [path.join(base, 'php.exe'), path.join(base, 'php')]
    : [path.join(base, 'php')]
}

async function runCapture(executable: string, args: string[], timeout = 7000): Promise<string> {
  return new Promise((resolve) => {
    execFile(executable, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        resolve('')
        return
      }
      resolve(`${stdout ?? ''}${stderr ?? ''}`)
    })
  })
}

async function inspectPhp(executable: string): Promise<PhpInstallation | null> {
  const output = await runCapture(executable, ['-v'])
  const first = output.split(/\r?\n/)[0]?.trim()
  if (!first || !/^PHP\s/i.test(first)) return null
  return {
    executable,
    directory: path.dirname(executable),
    version: first.replace(/^PHP\s+/, '').split(' ')[0] ?? first
  }
}

export async function findPhp(): Promise<PhpInstallation | null> {
  if (cachedPhp !== undefined) return cachedPhp
  for (const candidate of bundledPhpCandidates()) {
    const stat = await fs.stat(candidate).catch(() => null)
    if (stat?.isFile()) {
      const installation = await inspectPhp(candidate)
      if (installation) {
        cachedPhp = installation
        return installation
      }
    }
  }
  if (!app.isPackaged || process.platform !== 'win32') {
    const installation = await inspectPhp('php')
    if (installation) {
      cachedPhp = installation
      return installation
    }
  }
  cachedPhp = null
  return null
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('NO_PORT')))
      }
    })
  })
}

async function waitForPort(port: number, timeoutMs = 6000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port })
      const done = (value: boolean): void => {
        socket.destroy()
        resolve(value)
      }
      socket.setTimeout(500)
      socket.once('connect', () => done(true))
      socket.once('error', () => done(false))
      socket.once('timeout', () => done(false))
    })
    if (ok) return true
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  return false
}

async function writePhpIni(installation: PhpInstallation): Promise<string> {
  const dataDir = await resolveDataDir()
  const directory = path.join(dataDir, 'php')
  await fs.mkdir(directory, { recursive: true })
  const iniPath = path.join(directory, 'php.ini')
  const extensionDirectory = path.join(installation.directory, 'ext').replace(/\\/g, '/')
  const contents = [
    '; WebYou — local development PHP configuration',
    'display_errors = On',
    'display_startup_errors = On',
    'error_reporting = E_ALL',
    'log_errors = Off',
    'html_errors = Off',
    'expose_php = Off',
    'date.timezone = UTC',
    'default_charset = "UTF-8"',
    `extension_dir = "${extensionDirectory}"`,
    'extension = mbstring',
    'extension = fileinfo',
    'extension = pdo_sqlite',
    ''
  ].join('\r\n')
  await fs.writeFile(iniPath, contents, 'utf8')
  return iniPath
}

interface StaticServer {
  close: () => Promise<void>
}

function createStaticServer(root: string): Promise<{ server: StaticServer; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        let pathname = decodeURIComponent(url.pathname)
        if (pathname.endsWith('/')) pathname += 'index.html'
        const resolved = resolveInside(root, `.${pathname}`, true)
        const stat = await fs.stat(resolved).catch(() => null)
        if (!stat?.isFile()) {
          response.writeHead(404, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
          })
          response.end('<h1>404</h1><p>File not found.</p>')
          return
        }
        if (path.extname(resolved).toLowerCase() === '.php') {
          response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
          })
          response.end(
            `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui;padding:40px;line-height:1.5;max-width:720px;margin:auto;color:#1b1b21}h1{color:#8a4b00}code{background:#f1eff5;padding:2px 6px;border-radius:6px}</style><h1>PHP недоступен / PHP is unavailable</h1><p>Статический сервер не выполняет PHP-файлы. Скачайте PHP скриптом <code>npm run fetch-php</code> или установите PHP в систему.</p><p>The fallback static server cannot execute PHP. Run <code>npm run fetch-php</code> or install PHP on this computer.</p>`
          )
          return
        }
        const data = await fs.readFile(resolved)
        response.writeHead(200, {
          'Content-Type': mimeForPath(resolved),
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        })
        response.end(data)
      } catch {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('WebYou static server error')
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address !== 'object') {
        server.close()
        reject(new Error('NO_PORT'))
        return
      }
      resolve({
        port: address.port,
        server: {
          close: () =>
            new Promise<void>((done) => {
              server.close(() => done())
            })
        }
      })
    })
  })
}

export class PhpServer {
  private child: ChildProcess | null = null
  private staticServer: StaticServer | null = null
  private root: string | null = null
  private restarts = 0
  private php: PhpInstallation | null = null
  status: ServerStatus = { state: 'stopped', port: null, phpAvailable: false }

  constructor(
    private readonly onStatus: (status: ServerStatus) => void,
    private readonly onLog: (event: ServerLogEvent) => void
  ) {}

  private setStatus(status: ServerStatus): void {
    this.status = status
    this.onStatus(status)
  }

  async phpVersion(): Promise<string | null> {
    const php = await findPhp()
    return php?.version ?? null
  }

  async start(root: string): Promise<ServerStatus> {
    await this.stop(false)
    this.root = path.resolve(root)
    this.restarts = 0
    this.php = await findPhp()
    if (!this.php) {
      return this.startFallback('PHP_NOT_FOUND')
    }
    return this.startPhp()
  }

  private async startPhp(): Promise<ServerStatus> {
    if (!this.root || !this.php) return this.startFallback('PHP_NOT_FOUND')
    this.setStatus({ state: 'starting', port: null, phpAvailable: true })
    try {
      const port = await freePort()
      const iniPath = await writePhpIni(this.php)
      const child = spawn(
        this.php.executable,
        ['-c', iniPath, '-S', `127.0.0.1:${port}`, '-t', this.root],
        {
          cwd: this.root,
          windowsHide: true,
          env: {
            ...process.env,
            PHP_CLI_SERVER_WORKERS: '2',
            PHP_INI_SCAN_DIR: ''
          }
        }
      )
      this.child = child

      const forward = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) this.onLog({ line, stream })
        }
      }
      child.stdout?.on('data', forward('stdout'))
      child.stderr?.on('data', forward('stderr'))

      let ready = await waitForPort(port)
      if (!ready && child.exitCode !== null) {
        ready = false
      }
      if (!ready) {
        this.child = null
        child.kill()
        return this.startFallback('PHP_START_FAILED')
      }

      this.setStatus({ state: 'running', port, phpAvailable: true })
      child.on('exit', (code) => {
        if (this.child !== child) return
        this.child = null
        if (!this.root) return
        if (this.restarts < 1) {
          this.restarts += 1
          this.setStatus({
            state: 'starting',
            port: null,
            phpAvailable: true,
            message: 'PHP_RESTARTING'
          })
          void (async () => {
            const result = await this.startPhp()
            if (result.state === 'failed') {
              await this.startFallback('PHP_CRASHED')
            }
          })()
        } else if (code !== 0) {
          void this.startFallback('PHP_CRASHED')
        }
      })
      return this.status
    } catch (error) {
      return this.startFallback(error instanceof Error ? error.message : 'PHP_START_FAILED')
    }
  }

  private async startFallback(messageKey: string): Promise<ServerStatus> {
    await this.stopChild()
    if (!this.root) {
      this.setStatus({ state: 'failed', port: null, phpAvailable: false, message: messageKey })
      return this.status
    }
    try {
      const { server, port } = await createStaticServer(this.root)
      this.staticServer = server
      this.setStatus({
        state: 'running',
        port,
        phpAvailable: false,
        message: messageKey
      })
    } catch {
      this.setStatus({ state: 'failed', port: null, phpAvailable: false, message: 'SERVER_FAILED' })
    }
    return this.status
  }

  private async stopChild(): Promise<void> {
    const child = this.child
    this.child = null
    if (child && child.exitCode === null) {
      child.kill()
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 1500)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    if (this.staticServer) {
      await this.staticServer.close().catch(() => undefined)
      this.staticServer = null
    }
  }

  async stop(clearRoot = true): Promise<void> {
    await this.stopChild()
    if (clearRoot) this.root = null
    this.setStatus({ state: 'stopped', port: null, phpAvailable: this.php !== null })
  }
}

let lintInstallation: PhpInstallation | null | undefined

export async function lintPhpFile(
  projectRoot: string,
  filePath: string
): Promise<LintResult> {
  if (lintInstallation === undefined) lintInstallation = await findPhp()
  if (!lintInstallation) {
    return { problems: [], phpAvailable: false, error: 'PHP_NOT_FOUND' }
  }
  const resolved = resolveInside(projectRoot, filePath)
  return new Promise((resolve) => {
    execFile(
      lintInstallation!.executable,
      ['-l', resolved],
      { timeout: 12000, windowsHide: true },
      (error, stdout, stderr) => {
        const output = `${stdout ?? ''}${stderr ?? ''}`
        if (error && !output) {
          resolve({ problems: [], phpAvailable: true, error: error.message })
          return
        }
        const problems = parsePhpLint(output, projectRoot, resolved)
        resolve({ problems, phpAvailable: true })
      }
    )
  })
}

export async function resetPhpCache(): Promise<void> {
  cachedPhp = undefined
  lintInstallation = undefined
}
