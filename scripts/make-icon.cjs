// Renders scripts/icon.html into build/icon.png with Electron's Chromium.
// Run once after changing the artwork: `npx electron scripts/make-icon.cjs`.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.commandLine.appendSwitch('force-device-scale-factor', '1')

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  })
  try {
    await window.loadFile(path.join(__dirname, 'icon.html'))
    await new Promise((resolve) => setTimeout(resolve, 700))
    const image = await window.webContents.capturePage()
    const target = path.join(__dirname, '..', 'build', 'icon.png')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, image.resize({ width: 512, height: 512 }).toPNG())
    process.stdout.write(`[icon] Wrote ${target}\n`)
  } catch (error) {
    process.stderr.write(`[icon] ${error instanceof Error ? error.stack : error}\n`)
    process.exitCode = 1
  } finally {
    window.destroy()
    app.quit()
  }
})
