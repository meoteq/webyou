import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS, type RecentProject, type Settings, type ThemePreference, type Language } from '@shared/types'

const SETTINGS_FILE = 'settings.json'
const RECENT_FILE = 'recent-projects.json'
const MAX_RECENT = 10

function safeLanguage(): Language {
  const locale = app.getLocale().toLowerCase()
  return locale.startsWith('ru') ? 'ru' : 'en'
}

function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS, language: safeLanguage() }
}

async function canWrite(directory: string): Promise<boolean> {
  try {
    await fs.mkdir(directory, { recursive: true })
    const probe = path.join(directory, `.write-test-${process.pid}`)
    await fs.writeFile(probe, 'ok', 'utf8')
    await fs.unlink(probe)
    return true
  } catch {
    return false
  }
}

let cachedDataDir: string | null = null

/** Settings live in `data/` next to the exe when writable, otherwise in %APPDATA%. */
export async function resolveDataDir(): Promise<string> {
  if (cachedDataDir) return cachedDataDir
  const override = process.env.WEBYOU_DATA_DIR
  if (override) {
    await fs.mkdir(override, { recursive: true })
    cachedDataDir = override
    return override
  }
  if (!app.isPackaged) {
    const local = path.join(app.getAppPath(), 'data')
    if (await canWrite(local)) {
      cachedDataDir = local
      return local
    }
  } else {
    const portable = path.join(path.dirname(app.getPath('exe')), 'data')
    if (await canWrite(portable)) {
      cachedDataDir = portable
      return portable
    }
  }
  const fallback = app.getPath('userData')
  await fs.mkdir(fallback, { recursive: true })
  cachedDataDir = fallback
  return fallback
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const text = await fs.readFile(file, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const directory = path.dirname(file)
  await fs.mkdir(directory, { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(temporary, file)
}

function sanitizeSettings(raw: Partial<Settings>): Settings {
  const defaults = defaultSettings()
  const language = raw.language === 'ru' || raw.language === 'en' ? raw.language : defaults.language
  const theme: ThemePreference =
    raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : defaults.theme
  const fontSize =
    typeof raw.fontSize === 'number' && raw.fontSize >= 10 && raw.fontSize <= 32
      ? Math.round(raw.fontSize)
      : defaults.fontSize
  const wordWrap = typeof raw.wordWrap === 'boolean' ? raw.wordWrap : defaults.wordWrap
  const autoSaveDelay =
    typeof raw.autoSaveDelay === 'number' && raw.autoSaveDelay >= 150 && raw.autoSaveDelay <= 3000
      ? Math.round(raw.autoSaveDelay)
      : defaults.autoSaveDelay
  return { language, theme, fontSize, wordWrap, autoSaveDelay }
}

export async function getSettings(): Promise<Settings> {
  const dir = await resolveDataDir()
  const raw = await readJson<Partial<Settings>>(path.join(dir, SETTINGS_FILE), {})
  return sanitizeSettings(raw)
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = sanitizeSettings({ ...current, ...patch })
  const dir = await resolveDataDir()
  await writeJson(path.join(dir, SETTINGS_FILE), next)
  return next
}

function sanitizeRecent(raw: unknown): RecentProject[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (item): item is RecentProject =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as RecentProject).path === 'string' &&
        typeof (item as RecentProject).name === 'string' &&
        typeof (item as RecentProject).openedAt === 'number'
    )
    .slice(0, MAX_RECENT)
}

export async function getRecentProjects(): Promise<RecentProject[]> {
  const dir = await resolveDataDir()
  return sanitizeRecent(await readJson(path.join(dir, RECENT_FILE), []))
}

export async function touchRecentProject(project: RecentProject): Promise<RecentProject[]> {
  const existing = await getRecentProjects()
  const next = [project, ...existing.filter((item) => item.path !== project.path)].slice(0, MAX_RECENT)
  const dir = await resolveDataDir()
  await writeJson(path.join(dir, RECENT_FILE), next)
  return next
}

export async function removeRecentProject(projectPath: string): Promise<RecentProject[]> {
  const next = (await getRecentProjects()).filter((item) => item.path !== projectPath)
  const dir = await resolveDataDir()
  await writeJson(path.join(dir, RECENT_FILE), next)
  return next
}
