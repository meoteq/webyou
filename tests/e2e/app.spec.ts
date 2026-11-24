import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'

const appDir = process.cwd()

interface Session {
  app: ElectronApplication
  page: Page
  dataDir: string
  projectsDir: string
}

async function launch(): Promise<Session> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webyou-data-'))
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webyou-projects-'))
  const app = await electron.launch({
    // A private user-data dir keeps the single-instance lock and the disk cache
    // away from a copy of WebYou the developer may already have open.
    args: [`--user-data-dir=${dataDir}`, '.'],
    cwd: appDir,
    env: { ...process.env, WEBYOU_DATA_DIR: dataDir }
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => console.error('[renderer]', error))
  await page.waitForSelector('.start-screen')
  await page.evaluate(() => localStorage.clear())
  await page.evaluate(async () => {
    const api = (window as unknown as { webyou: { settings: { set: (patch: object) => Promise<unknown> } } }).webyou
    await api.settings.set({ language: 'en', theme: 'light' })
  })
  await page.reload()
  await page.waitForSelector('.start-screen')
  await stubFolderDialog(app, projectsDir)
  return { app, page, dataDir, projectsDir }
}

async function stubFolderDialog(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(async ({ dialog }, chosen: string) => {
    ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
      canceled: false,
      filePaths: [chosen]
    })
  }, folder)
}

async function close(session: Session): Promise<void> {
  await session.app.close().catch(() => undefined)
  await fs.rm(session.dataDir, { recursive: true, force: true }).catch(() => undefined)
  await fs.rm(session.projectsDir, { recursive: true, force: true }).catch(() => undefined)
}

async function createProject(
  session: Session,
  templateName: string,
  projectName: string
): Promise<void> {
  const { page, projectsDir } = session
  await page.getByRole('button', { name: 'Create from template', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('radio', { name: new RegExp(templateName) }).click()
  await dialog.locator('input.md-field__input:not([readonly])').fill(projectName)
  await dialog.getByRole('button', { name: 'Browse…' }).click()
  await expect(dialog.locator('input.md-field__input--mono')).toHaveValue(projectsDir)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  await expect(page.locator('.project-chip__name')).toHaveText(projectName)
}

async function previewText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const webview = document.querySelector('webview') as
      | (HTMLElement & { executeJavaScript?: (code: string) => Promise<unknown> })
      | null
    if (!webview?.executeJavaScript) return ''
    try {
      const value = await webview.executeJavaScript('document.body ? document.body.innerText : ""')
      return typeof value === 'string' ? value : ''
    } catch {
      return ''
    }
  })
}

async function replaceEditorContent(page: Page, html: string): Promise<void> {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(html)
}

/** Raise the autosave delay so only an explicit flush can persist the edit. */
async function setAutoSaveDelay(page: Page): Promise<void> {
  await page.locator('.rail__item', { hasText: 'Settings' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const range = dialog.getByRole('slider', { name: 'Auto-save delay' })
  // Keyboard focus can be stolen by the dialog's autofocus timer, so set the
  // value the way a controlled range input expects it.
  await range.evaluate((element) => {
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '3000')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(range).toHaveValue('3000')
  // The setting is written on a 160 ms debounce; let it land before closing.
  await page.waitForTimeout(250)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
}

async function fileExists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false)
}

async function setReadOnly(target: string, readOnly: boolean): Promise<void> {
  await fs.chmod(target, readOnly ? 0o444 : 0o666)
}

async function setWindowSize(
  session: Session,
  width: number,
  height: number
): Promise<void> {
  await session.app.evaluate(
    ({ BrowserWindow }, size: { width: number; height: number }) => {
      BrowserWindow.getAllWindows()[0]?.setBounds({ width: size.width, height: size.height })
    },
    { width, height }
  )
}

/** Drag the splitter all the way right so the preview keeps only its minimum width. */
async function shrinkPreview(page: Page): Promise<void> {
  const panes = await page.locator('.workspace__panes').boundingBox()
  const splitter = await page.locator('.splitter').boundingBox()
  if (!panes || !splitter) throw new Error('split layout is not rendered')
  const y = splitter.y + splitter.height / 2
  await page.mouse.move(splitter.x + splitter.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(panes.x + panes.width - 2, y, { steps: 20 })
  await page.mouse.up()
}

test('creates a site from a template and updates the live preview', async () => {
  const session = await launch()
  try {
    const { page } = session
    await createProject(session, 'Blank page', 'e2e-site')

    await expect(page.getByRole('tab', { name: /index\.html/ })).toBeVisible()
    const webview = page.locator('webview.preview-frame')
    await expect(webview).toHaveAttribute('src', /^http:\/\/127\.0\.0\.1:\d+\/index\.html/)
    await expect.poll(() => previewText(page)).toContain('Hi! I am learning to build websites.')

    await replaceEditorContent(
      page,
      [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="utf-8">',
        '    <title>Live preview</title>',
        '  </head>',
        '  <body>',
        '    <h1>Live preview works</h1>',
        '  </body>',
        '</html>'
      ].join('\n')
    )

    await expect.poll(() => previewText(page), { timeout: 25_000 }).toContain('Live preview works')

    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.getByRole('button', { name: 'Text', exact: true }).click()
    await page.locator('.tag-button', { hasText: '<p>' }).click()
    await expect(page.locator('.cm-content')).toContainText('<p></p>')

    // Typing after a tag insert is a separate undo step: one Ctrl+Z removes the
    // text but keeps the tag (P2-9).
    await page.keyboard.type('hello')
    await page.keyboard.press('Control+Z')
    await expect(page.locator('.cm-content')).not.toContainText('hello')
    await expect(page.locator('.cm-content')).toContainText('<p></p>')
  } finally {
    await close(session)
  }
})

test('offers text editing actions with shortcut hints and copies the selection', async () => {
  const session = await launch()
  const { page } = session
  try {
    await createProject(session, 'Blank page', 'e2e-text-menu')
    const editor = page.locator('.cm-content')
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.insertText('COPY-MARKER')
    await page.keyboard.press('Control+A')

    await editor.click({ button: 'right' })
    const menu = page.getByRole('menu', { name: 'Text actions' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveCount(5)
    await expect(menu.locator('.md-menu__shortcut')).toHaveText([
      'Ctrl + X',
      'Ctrl + C',
      'Ctrl + V',
      'Delete',
      'Ctrl + A'
    ])

    await menu.getByRole('menuitem', { name: 'Copy', exact: true }).click()
    await expect(menu).toHaveCount(0)
    expect(await session.app.evaluate(({ clipboard }) => clipboard.readText())).toBe('COPY-MARKER')
    await expect(editor).toBeFocused()

    // Actions that need a selection stay visible but become disabled.
    await page.keyboard.press('ArrowRight')
    await editor.click({ button: 'right' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Cut', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await expect(menu.getByRole('menuitem', { name: 'Copy', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await expect(menu.getByRole('menuitem', { name: 'Paste', exact: true })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )

    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(editor).toBeFocused()
  } finally {
    await close(session)
  }
})

test('expands the preview to almost the full width', async () => {
  const session = await launch()
  try {
    const { page } = session
    await createProject(session, 'Blank page', 'e2e-split')
    await expect(page.locator('.workspace__preview-column')).toBeVisible()

    const panes = await page.locator('.workspace__panes').boundingBox()
    const splitter = await page.locator('.splitter').boundingBox()
    if (!panes || !splitter) throw new Error('split layout is not rendered')
    const y = splitter.y + splitter.height / 2

    await page.mouse.move(splitter.x + splitter.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(panes.x + 2, y, { steps: 20 })
    await page.mouse.up()

    const dragged = await page.evaluate(() => {
      const rect = (selector: string): number =>
        document.querySelector(selector)?.getBoundingClientRect().width ?? -1
      return {
        panes: rect('.workspace__panes'),
        preview: rect('.workspace__preview-column'),
        editor: rect('.workspace__editor-column')
      }
    })
    expect(dragged.preview / dragged.panes).toBeGreaterThan(0.9)
    expect(dragged.editor).toBeLessThan(2)

    const collapsed = await page.locator('.splitter').boundingBox()
    if (!collapsed) throw new Error('splitter is missing')
    await page.mouse.dblclick(collapsed.x + collapsed.width / 2, y)

    await expect
      .poll(async () => {
        const preview = await page.locator('.workspace__preview-column').boundingBox()
        const container = await page.locator('.workspace__panes').boundingBox()
        if (!preview || !container) return 0
        return preview.width / container.width
      })
      .toBeLessThan(0.7)

    // A drag into the 100–319 px editor range snaps to zero instead of clipping
    // the tab strip at an unreadable width (P2-6).
    const restored = await page.locator('.splitter').boundingBox()
    if (!restored) throw new Error('splitter is missing after restore')
    await page.mouse.move(restored.x + restored.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(panes.x + 200, y, { steps: 10 })
    await page.mouse.up()
    await expect
      .poll(() => page.evaluate(() => document.querySelector('.workspace__editor-column')?.getBoundingClientRect().width ?? -1))
      .toBeLessThan(2)
  } finally {
    await close(session)
  }
})

test('keeps the real device widths in the preview', async () => {
  const session = await launch()
  try {
    const { page } = session
    await createProject(session, 'Blank page', 'e2e-widths')
    const webview = page.locator('webview.preview-frame')
    const width = (): Promise<number> =>
      webview.evaluate((element) => (element as HTMLElement).offsetWidth)

    await page.getByRole('button', { name: 'Phone', exact: true }).click()
    await expect.poll(width).toBe(375)

    await page.getByRole('button', { name: 'Tablet', exact: true }).click()
    await expect.poll(width).toBe(768)
  } finally {
    await close(session)
  }
})

test('switches the interface language and theme', async () => {
  const session = await launch()
  try {
    const { page } = session
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Русский' }).click()
    await expect(dialog.getByRole('heading', { name: 'Настройки' })).toBeVisible()

    await dialog.getByRole('radio', { name: /Тёмная/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.keyboard.press('Escape')
    await expect(page.locator('.start-screen')).toContainText('Ваш первый сайт начинается здесь.')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.start-screen')).toContainText('Ваш первый сайт начинается здесь.')
  } finally {
    await close(session)
  }
})

test('runs a PHP template and reports syntax errors', async () => {
  const session = await launch()
  try {
    const { page } = session
    await createProject(session, 'PHP contact form', 'e2e-php')
    await expect(page.getByRole('tab', { name: /index\.php/ })).toBeVisible()
    await expect(page.locator('.status-chip')).toContainText('Preview running')
    await expect.poll(() => previewText(page)).toContain('Write to me')
    await expect.poll(() => previewText(page)).not.toContain('<?php')

    await replaceEditorContent(
      page,
      ['<?php', 'echo "hello"', 'echo "world";', '?>', '<h1>Broken page</h1>'].join('\n')
    )

    const panel = page.locator('.problems-panel')
    await expect(panel.locator('.count-pill--error')).toContainText('1 error', { timeout: 25_000 })

    const toggle = panel.locator('.problems-panel__toggle')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(panel.locator('.problem-row').first()).toBeVisible()
    await panel.locator('.problem-row').first().click()
    await expect(page.locator('.cm-activeLine')).toBeVisible()
  } finally {
    await close(session)
  }
})

test('flushes unsaved edits when the window closes', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const file = path.join(projectsDir, 'e2e-close', 'index.html')
  try {
    await createProject(session, 'Blank page', 'e2e-close')
    await setAutoSaveDelay(page)
    await replaceEditorContent(
      page,
      '<!doctype html>\n<html><body><p>QUIT-MARKER</p></body></html>'
    )
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()

    // Closing through the main process runs the flush handshake; the renderer
    // must write the dirty tab before the window is destroyed.
    await session.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close()
    })
    await session.app.waitForEvent('close', { timeout: 30_000 })

    const content = await fs.readFile(file, 'utf8')
    expect(content).toContain('QUIT-MARKER')
  } finally {
    await close(session)
  }
})

test('does not resurrect a deleted dirty file', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const file = path.join(projectsDir, 'e2e-delete', 'index.html')
  try {
    await createProject(session, 'Blank page', 'e2e-delete')
    await setAutoSaveDelay(page)
    await replaceEditorContent(page, '<p>DELETE-MARKER</p>')
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()

    await page.locator('.tree-row', { hasText: 'index.html' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click()

    await expect(page.locator('.tree-row', { hasText: 'index.html' })).toHaveCount(0)
    // Give the old autosave timer time to fire; it must not recreate the file.
    await page.waitForTimeout(1600)
    expect(await fileExists(file)).toBe(false)
  } finally {
    await close(session)
  }
})

test('keeps edits when a dirty file is renamed', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const directory = path.join(projectsDir, 'e2e-rename')
  const original = path.join(directory, 'index.html')
  const renamed = path.join(directory, 'about.html')
  try {
    await createProject(session, 'Blank page', 'e2e-rename')
    await setAutoSaveDelay(page)
    await replaceEditorContent(page, '<p>RENAME-MARKER</p>')
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()

    await page.locator('.tree-row', { hasText: 'index.html' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const input = dialog.locator('input.md-field__input')
    await expect(input).toHaveValue('index.html')
    await expect
      .poll(() =>
        input.evaluate((element) => {
          const field = element as HTMLInputElement
          return [field.selectionStart, field.selectionEnd]
        })
      )
      .toEqual([0, 5])

    await input.fill('about.html')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByRole('tab', { name: /about\.html/ })).toBeVisible()
    await expect(page.locator('.file-tab.is-dirty')).toHaveCount(0)
    expect(await fs.readFile(renamed, 'utf8')).toContain('RENAME-MARKER')
    expect(await fileExists(original)).toBe(false)

    // Case-only rename goes through a temporary name instead of ALREADY_EXISTS.
    await page.locator('.tree-row', { hasText: 'about.html' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    await page.getByRole('dialog').locator('input.md-field__input').fill('ABOUT.html')
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.tree-row', { hasText: 'ABOUT.html' })).toBeVisible()
    expect(await fs.readdir(directory)).toContain('ABOUT.html')
  } finally {
    await close(session)
  }
})

test('asks what to do when a dirty file changed on disk', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const file = path.join(projectsDir, 'e2e-conflict', 'index.html')
  try {
    await createProject(session, 'Blank page', 'e2e-conflict')
    await setAutoSaveDelay(page)
    await replaceEditorContent(page, '<p>LOCAL-MARKER</p>')
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()

    await fs.writeFile(file, '<p>EXTERNAL-MARKER</p>', 'utf8')

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'File changed on disk' })).toBeVisible({
      timeout: 20_000
    })
    await dialog.getByRole('button', { name: 'Reload from disk' }).click()

    await expect(page.locator('.cm-content')).toContainText('EXTERNAL-MARKER')
    await expect(page.locator('.file-tab.is-dirty')).toHaveCount(0)
  } finally {
    await close(session)
  }
})

test('blocks closing the project when a save fails', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const directory = path.join(projectsDir, 'e2e-close-blocked')
  const file = path.join(directory, 'index.html')
  try {
    await createProject(session, 'Blank page', 'e2e-close-blocked')
    await setAutoSaveDelay(page)
    await replaceEditorContent(page, '<p>CLOSE-MARKER</p>')
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()
    await setReadOnly(file, true)

    await page.getByRole('button', { name: 'Close project' }).click()
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('heading', { name: 'Some files could not be saved' })
    ).toBeVisible({ timeout: 20_000 })
    // P3-12: the failure names the file and explains why.
    await expect(dialog.locator('.save-failure-list')).toContainText('index.html')
    await expect(dialog.locator('.save-failure-list')).toContainText(/denied|in use/i)
    // P2-4: a failed write must not leave a temporary file behind.
    const leftovers = (await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toEqual([])

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.workspace')).toBeVisible()

    // Discarding is the only way out, and it has to be explicit.
    await page.getByRole('button', { name: 'Close project' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard and close' }).click()
    await expect(page.locator('.start-screen')).toBeVisible()
  } finally {
    await setReadOnly(file, false).catch(() => undefined)
    await close(session)
  }
})

test('keeps a dirty tab open when its save fails', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const file = path.join(projectsDir, 'e2e-tab-blocked', 'index.html')
  try {
    await createProject(session, 'Blank page', 'e2e-tab-blocked')
    await setAutoSaveDelay(page)
    await replaceEditorContent(page, '<p>TAB-MARKER</p>')
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()
    await setReadOnly(file, true)

    await page.getByRole('button', { name: 'Close index.html' }).click()
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('heading', { name: 'Some files could not be saved' })
    ).toBeVisible({ timeout: 20_000 })
    await expect(dialog.locator('.save-failure-list')).toContainText('index.html')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('tab', { name: /index\.html/ })).toBeVisible()
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()

    await page.getByRole('button', { name: 'Close index.html' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard and close' }).click()
    await expect(page.getByRole('tab')).toHaveCount(0)
  } finally {
    await setReadOnly(file, false).catch(() => undefined)
    await close(session)
  }
})

test('does not undo over an external reload', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const file = path.join(projectsDir, 'e2e-undo', 'index.html')
  const external = '<!doctype html>\n<html><body><p>EXTERNAL-MARKER</p></body></html>'
  try {
    await createProject(session, 'Blank page', 'e2e-undo')
    await setAutoSaveDelay(page)
    await replaceEditorContent(
      page,
      '<!doctype html>\n<html><body><p>LOCAL-MARKER</p></body></html>'
    )
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+S')
    await expect(page.locator('.file-tab.is-dirty')).toHaveCount(0)

    // Let the save's own watcher event settle before the external edit arrives.
    await page.waitForTimeout(1800)
    await fs.writeFile(file, external, 'utf8')
    await expect(page.locator('.cm-content')).toContainText('EXTERNAL-MARKER', {
      timeout: 20_000
    })

    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+Z')
    // A mistaken undo would autosave after 3000 ms and overwrite the file.
    await page.waitForTimeout(3500)
    expect(await fs.readFile(file, 'utf8')).toContain('EXTERNAL-MARKER')
    await expect(page.locator('.cm-content')).toContainText('EXTERNAL-MARKER')
    await expect(page.locator('.file-tab.is-dirty')).toHaveCount(0)
  } finally {
    await close(session)
  }
})

test('queues two external conflicts instead of replacing one', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const directory = path.join(projectsDir, 'e2e-conflict-queue')
  const first = path.join(directory, 'index.html')
  const second = path.join(directory, 'style.css')
  try {
    await createProject(session, 'Blank page', 'e2e-conflict-queue')
    await setAutoSaveDelay(page)
    await replaceEditorContent(page, '<p>LOCAL-A</p>')
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()

    await page.locator('.tree-row', { hasText: 'style.css' }).click()
    await expect(page.getByRole('tab', { name: /style\.css/ })).toBeVisible()
    await replaceEditorContent(page, 'body { color: rgb(1, 2, 3); }')
    await expect(page.locator('.file-tab.is-dirty')).toHaveCount(2)

    // Both external writes must land before the 3000 ms autosave timers fire.
    await fs.writeFile(first, '<p>EXTERNAL-A</p>', 'utf8')
    await fs.writeFile(second, 'body { color: rgb(9, 9, 9); }', 'utf8')

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'File changed on disk' })).toBeVisible({
      timeout: 20_000
    })
    await expect(dialog.locator('.dialog-queue-note')).toContainText('1 more file')

    await dialog.getByRole('button', { name: 'Reload from disk' }).click()
    // The second conflict stays queued instead of disappearing.
    await expect(dialog.getByRole('heading', { name: 'File changed on disk' })).toBeVisible()
    await expect(dialog.locator('.dialog-queue-note')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Keep my version' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.file-tab.is-dirty')).toHaveCount(0)

    const firstContent = await fs.readFile(first, 'utf8')
    const secondContent = await fs.readFile(second, 'utf8')
    const firstExternal = firstContent.includes('EXTERNAL-A')
    const secondExternal = secondContent.includes('rgb(9, 9, 9)')
    // One side was reloaded from disk, the other kept the local buffer.
    expect(firstExternal).not.toBe(secondExternal)
    if (!firstExternal) {
      expect(firstContent).toContain('LOCAL-A')
      expect(secondContent).toContain('rgb(9, 9, 9)')
    } else {
      expect(secondContent).toContain('rgb(1, 2, 3)')
    }
  } finally {
    await close(session)
  }
})

test('moves diagnostics to the renamed file', async () => {
  const session = await launch()
  const { page } = session
  try {
    await createProject(session, 'PHP contact form', 'e2e-problem-rename')
    await expect(page.getByRole('tab', { name: /index\.php/ })).toBeVisible()
    await replaceEditorContent(
      page,
      ['<?php', 'echo "a"', 'echo "b";', '?>', '<h1>Broken</h1>'].join('\n')
    )

    const panel = page.locator('.problems-panel')
    await expect(panel.locator('.count-pill--error')).toContainText('1 error', {
      timeout: 25_000
    })
    const toggle = panel.locator('.problems-panel__toggle')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(panel.locator('.problem-row__place')).toContainText('index.php')

    await page.locator('.tree-row', { hasText: 'index.php' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    await page.getByRole('dialog').locator('input.md-field__input').fill('page.php')
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByRole('tab', { name: /page\.php/ })).toBeVisible()
    await expect(panel.locator('.problem-row__place')).toContainText('page.php', {
      timeout: 25_000
    })
    await expect(panel.locator('.problem-row__place')).not.toContainText('index.php')

    // Clicking the problem must open the renamed file, not fail with NOT_A_FILE.
    await panel.locator('.problem-row').first().click()
    await expect(page.locator('.cm-activeLine')).toBeVisible()
    await expect(page.locator('.md-snackbar')).not.toContainText('not a file')
  } finally {
    await close(session)
  }
})

test('keeps an orphaned buffer when a dirty file is deleted outside', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const file = path.join(projectsDir, 'e2e-orphan', 'index.html')
  try {
    await createProject(session, 'Blank page', 'e2e-orphan')
    await setAutoSaveDelay(page)
    await replaceEditorContent(page, '<p>ORPHAN-MARKER</p>')
    await expect(page.locator('.file-tab.is-dirty')).toBeVisible()

    await fs.rm(file)
    const banner = page.locator('.editor-banner')
    await expect(banner).toContainText('This file was deleted on disk.', {
      timeout: 20_000
    })
    await expect(page.getByRole('tab', { name: /index\.html/ })).toBeVisible()
    await page.waitForTimeout(1600)
    expect(await fileExists(file)).toBe(false)

    await banner.getByRole('button', { name: 'Save file' }).click()
    await expect(banner).toHaveCount(0)
    await expect(page.locator('.file-tab.is-dirty')).toHaveCount(0)
    expect(await fs.readFile(file, 'utf8')).toContain('ORPHAN-MARKER')
  } finally {
    await close(session)
  }
})

test('shows deeply nested files and scrolls the tree sideways', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const root = path.join(projectsDir, 'e2e-deep')
  const deepName = 'deep-file-with-a-long-name-for-scrolling.html'
  const levels = Array.from({ length: 12 }, (_, index) => `level-${index + 1}`)
  const deepDir = path.join(root, ...levels)
  try {
    await createProject(session, 'Blank page', 'e2e-deep')
    await fs.mkdir(deepDir, { recursive: true })
    await fs.writeFile(path.join(deepDir, deepName), '<p>deep</p>', 'utf8')

    await page.getByRole('button', { name: 'Refresh' }).click()
    const row = page.locator('.tree-row__name', { hasText: deepName })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await expect(row).toHaveAttribute('title', deepName)

    const scroll = await page.locator('.tree-pane__body').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }))
    expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth)
  } finally {
    await close(session)
  }
})

test('keeps phone and tablet previews distinct at the minimum window size', async () => {
  const session = await launch()
  const { page } = session
  try {
    await createProject(session, 'Blank page', 'e2e-scale')
    const webview = page.locator('webview.preview-frame')
    await expect(webview).toHaveAttribute('src', /index\.html/)

    await setWindowSize(session, 1080, 680)
    await page.waitForTimeout(400)
    await shrinkPreview(page)
    await page.waitForTimeout(400)

    const badge = page.locator('.preview-scale-badge')
    const slotWidth = (): Promise<number> =>
      page.locator('.preview-device-slot').evaluate((element) => element.getBoundingClientRect().width)

    await page.getByRole('button', { name: 'Phone', exact: true }).click()
    await expect(badge).toHaveText('375 px · 70%')
    await expect.poll(() => webview.evaluate((element) => element.offsetWidth)).toBe(375)
    const phoneWidth = await slotWidth()

    await page.getByRole('button', { name: 'Tablet', exact: true }).click()
    await expect(badge).toHaveText('768 px · 70%')
    await expect.poll(() => webview.evaluate((element) => element.offsetWidth)).toBe(768)
    const tabletWidth = await slotWidth()

    expect(phoneWidth).toBeGreaterThan(260)
    expect(phoneWidth).toBeLessThan(290)
    expect(tabletWidth).toBeGreaterThan(530)
    expect(tabletWidth - phoneWidth).toBeGreaterThan(200)
  } finally {
    await close(session)
  }
})

test('snaps the tab strip so no half tab remains on the left', async () => {
  const session = await launch()
  const { page, projectsDir } = session
  const root = path.join(projectsDir, 'e2e-tabs')
  const names = Array.from(
    { length: 10 },
    (_, index) => `page-${String(index + 1).padStart(2, '0')}.html`
  )
  try {
    await createProject(session, 'Blank page', 'e2e-tabs')
    for (const name of names) {
      await fs.writeFile(path.join(root, name), '<p>tab</p>', 'utf8')
    }
    await page.getByRole('button', { name: 'Refresh' }).click()
    for (const name of names) {
      await page.locator('.tree-row__name', { hasText: name }).click()
    }
    await expect(page.getByRole('tab')).toHaveCount(names.length + 1)

    await setWindowSize(session, 1080, 680)
    await page.waitForTimeout(700)

    const layout = await page.evaluate(() => {
      const strip = document.querySelector('.tabstrip__tabs') as HTMLElement | null
      if (!strip) return { partial: ['missing'], activeVisible: false, scrollLeft: 0 }
      const bounds = strip.getBoundingClientRect()
      const tabs = Array.from(strip.querySelectorAll<HTMLElement>('.file-tab'))
      const partial = tabs
        .filter((tab) => {
          const rect = tab.getBoundingClientRect()
          const intersects = rect.right > bounds.left + 0.5 && rect.left < bounds.right - 0.5
          return intersects && rect.left < bounds.left - 1
        })
        .map((tab) => tab.textContent ?? '')
      const active = strip.querySelector<HTMLElement>('[data-active="true"]')
      const activeRect = active?.getBoundingClientRect()
      const activeVisible = Boolean(
        activeRect && activeRect.left >= bounds.left - 1 && activeRect.right <= bounds.right + 1
      )
      return {
        partial,
        activeVisible,
        scrollLeft: strip.scrollLeft
      }
    })

    expect(layout.partial).toEqual([])
    expect(layout.activeVisible).toBe(true)
    expect(layout.scrollLeft).toBeGreaterThan(0)
  } finally {
    await close(session)
  }
})

test('keeps the server label visible on a narrow window', async () => {
  const session = await launch()
  const { page } = session
  try {
    await createProject(session, 'Blank page', 'e2e-status')
    await expect(page.locator('.status-chip')).toContainText('Preview running')

    await setWindowSize(session, 1080, 680)
    await page.waitForTimeout(300)

    await expect(page.locator('.status-chip')).toContainText('Preview running')
    await expect(page.locator('.status-chip')).toBeVisible()
    await expect(page.locator('.status-chip__port')).toBeHidden()
    await expect(page.locator('.status-chip')).toHaveAttribute('title', /Preview running · 127\.0\.0\.1:/)
  } finally {
    await close(session)
  }
})

test('names the file and reason when a rename fails and explains trimming', async () => {
  const session = await launch()
  const { page } = session
  try {
    await createProject(session, 'Blank page', 'e2e-rename-error')

    await page.locator('.tree-row', { hasText: 'index.html' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input.md-field__input').fill('style.css')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.locator('.md-field__error')).toContainText('Could not rename index.html')
    await expect(dialog.locator('.md-field__error')).toContainText('already exists')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()

    await page.getByRole('button', { name: 'New file' }).click()
    const createDialog = page.getByRole('dialog')
    await createDialog.locator('input.md-field__input').fill('  trimmed.html  ')
    await expect(createDialog.locator('.md-field__hint').last()).toContainText(
      'Spaces at the beginning and end will be removed.'
    )
  } finally {
    await close(session)
  }
})

test('applies title-bar colors sent by the renderer', async () => {
  const session = await launch()
  const { app, page } = session
  try {
    // The renderer sends the colors with `ipcRenderer.send`; recording the
    // native call proves the main process listens on the matching channel.
    await app.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0] as unknown as {
        setTitleBarOverlay: (options: unknown) => void
      }
      const calls: unknown[] = []
      ;(globalThis as { __titleBarCalls?: unknown[] }).__titleBarCalls = calls
      const original = target.setTitleBarOverlay.bind(target)
      target.setTitleBarOverlay = (options: unknown) => {
        calls.push(options)
        original(options)
      }
    })

    await page.evaluate(() => {
      const api = (window as unknown as {
        webyou: { ui: { setTitleBarColors: (colors: object) => void } }
      }).webyou
      api.ui.setTitleBarColors({ color: '#112233', symbolColor: '#445566' })
    })

    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as { __titleBarCalls?: unknown[] }).__titleBarCalls ?? [])
      )
      .toContainEqual({ color: '#112233', symbolColor: '#445566', height: 64 })
  } finally {
    await close(session)
  }
})

test('keeps the native frame on the app theme instead of the OS theme', async () => {
  const session = await launch()
  const { app, page } = session
  try {
    const setTheme = (theme: 'light' | 'dark'): Promise<void> =>
      page.evaluate(async (value) => {
        const api = (window as unknown as {
          webyou: { settings: { set: (patch: object) => Promise<unknown> } }
        }).webyou
        await api.settings.set({ theme: value })
      }, theme)

    await setTheme('light')
    await expect
      .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe('light')
    await expect
      .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors))
      .toBe(false)

    await setTheme('dark')
    await expect
      .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe('dark')
    await expect
      .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors))
      .toBe(true)
  } finally {
    await close(session)
  }
})

test('keeps the files panel actions inside the panel in both languages', async () => {
  const session = await launch()
  const { page } = session
  const measure = (): Promise<{
    outside: number
    actionsOverflow: number
    count: number
    headingWidth: number
  } | null> =>
    page.evaluate(() => {
      const pane = document.querySelector('.tree-pane')
      const header = pane?.querySelector('.pane__header')
      const heading = header?.querySelector('.pane__heading')
      const actions = header?.querySelector('.pane__actions')
      if (!pane || !header || !heading || !actions) return null
      const paneRect = pane.getBoundingClientRect()
      const headerRect = header.getBoundingClientRect()
      const paddingRight = Number.parseFloat(getComputedStyle(header).paddingRight)
      const buttons = Array.from(header.querySelectorAll('.pane__actions button'))
      const outside = buttons.filter((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left < paneRect.left - 0.5 || rect.right > paneRect.right + 0.5
      })
      return {
        // Tooltips are absolutely positioned and hidden with opacity, so the
        // header's scrollWidth is not a reliable overflow signal.
        outside: outside.length,
        actionsOverflow: actions.getBoundingClientRect().right - (headerRect.right - paddingRight),
        count: buttons.length,
        headingWidth: heading.getBoundingClientRect().width
      }
    })

  try {
    await createProject(session, 'Blank page', 'e2e-header')
    let layout = await measure()
    expect(layout?.count).toBe(5)
    expect(layout?.outside).toBe(0)
    expect(layout?.actionsOverflow ?? 99).toBeLessThanOrEqual(0.5)
    expect(layout?.headingWidth ?? 0).toBeGreaterThan(30)

    // The Russian title is wider; it used to push Close out of the pane.
    await page.locator('.rail__item').last().click()
    await page.locator('.md-dialog .segmented__button').first().click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.tree-pane h2')).toHaveText('Файлы')
    layout = await measure()
    expect(layout?.count).toBe(5)
    expect(layout?.outside).toBe(0)
    expect(layout?.actionsOverflow ?? 99).toBeLessThanOrEqual(0.5)
    expect(layout?.headingWidth ?? 0).toBeGreaterThan(30)

    await setWindowSize(session, 1080, 680)
    await page.waitForTimeout(300)
    layout = await measure()
    expect(layout?.count).toBe(5)
    expect(layout?.outside).toBe(0)
    expect(layout?.actionsOverflow ?? 99).toBeLessThanOrEqual(0.5)
    expect(layout?.headingWidth ?? 0).toBeGreaterThan(30)
  } finally {
    await close(session)
  }
})
