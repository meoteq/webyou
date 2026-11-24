# WebYou

WebYou is a friendly desktop IDE for people learning to build websites. Write
HTML, CSS, JavaScript, and PHP on the left; see the result immediately on the
right. No accounts, no cloud, no setup: unpack the archive, run the executable,
and start from a template. Release archives are built for Windows (portable zip)
and Linux (AppImage and tar.gz).

The interface is available in **English and Russian** and follows Material 3
Expressive: calm surfaces, one accent color, soft shapes, and restrained motion.

## Features

- **Two-pane workspace** — collapsible file tree, tag shelf, editor tabs, problem
  panel, and a live preview with a draggable splitter.
- **CodeMirror 6 editor** — HTML, CSS, JavaScript, JSON, and PHP highlighting,
  autocomplete, word wrap, font-size control, and a light/dark theme.
- **Autosave** after a short pause (adjustable in Settings), plus `Ctrl+S`.
- **Text context menu** — right-click in the editor or any text field for Cut,
  Copy, Paste, Delete, and Select all, with their keyboard shortcuts shown
  beside each item.
- **Tag shelf** — insert or wrap common HTML tags without memorising syntax.
  Forms generate a label, an `id`, and a matching `name`.
- **Live preview** — a sandboxed `<webview>` with phone/tablet/desktop widths,
  back/forward/reload, scroll restoration, and disabled caching. External links
  open in the system browser.
- **Bundled PHP 8.4** — a portable NTS x64 build runs a local server on
  `127.0.0.1` with a WebYou `php.ini`. If PHP cannot start, a static Node server
  keeps HTML/CSS/JS previews working and the UI explains the fallback.
- **Friendly problems** — HTMLHint checks markup, `php -l` checks syntax, and PHP
  runtime errors from the server arrive in the same panel with file and line.
  Clicking a problem jumps to it.
- **Project templates** — blank page, business card site, and a working PHP
  contact form, in both interface languages.
- **Recent projects** and a start screen for the first three clicks.

## Using the portable build (Windows)

1. Download and unpack `WebYou-1.0.0-win-x64.zip` into any folder (for example
   `C:\WebYou`). Keep the folder together: `resources/php` and
   `resources/templates` must stay next to the executable.
2. Run `WebYou.exe`.
3. Windows SmartScreen may warn about an unsigned application. Choose **More
   info → Run anyway**. The application is not signed; this is expected.
4. Create a project from a template, or open an existing folder.

The archive also contains `README.txt` with bilingual quick-start notes,
`LICENSE.txt`, and third-party notices under `resources/licenses`.

Settings and the recent-project list are stored in a `data` folder next to
`WebYou.exe`. If that folder is not writable (for example in `Program Files`),
WebYou falls back to `%APPDATA%\webyou`. Projects themselves are never moved:
they stay wherever you created or opened them.

### PHP and the Visual C++ runtime

The bundled PHP is the official Windows build from
[windows.php.net](https://windows.php.net/download/). PHP 8.4 is built with
Visual Studio 2022 and needs the **Microsoft Visual C++ 2015–2022
Redistributable (x64)**. Windows 10/11 usually has it already, but on a clean
machine install
[vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe) if the
preview reports that PHP was not found. The static preview continues to work
without PHP.

### Linux builds

The release page also publishes two x64 Linux archives:

- `WebYou-1.0.0-linux-x64.AppImage` — make it executable
  (`chmod +x WebYou-1.0.0-linux-x64.AppImage`) and run it.
- `WebYou-1.0.0-linux-x64.tar.gz` — unpack it and run the `webyou` executable
  inside.

The bundled PHP is a Windows build, so the Linux package does not include it.
WebYou looks for `php` on `PATH` and uses it when present; otherwise the static
Node preview server keeps HTML, CSS, and JavaScript projects working and the UI
explains the fallback. Settings live in a `data` folder next to the executable
when that folder is writable (the case for the tarball), and in
`~/.config/webyou` otherwise (the case for the AppImage).

## Development

Requirements: Node.js 22 or newer (tested with Node 24). Windows 10/11 x64 is
needed for the bundled PHP and the portable zip; the Linux build runs the same
code and uses the system `php` when it is installed.

On Windows:

```cmd
npm install
npm run fetch-php
npm run dev
```

On Linux, skip `npm run fetch-php` (the pinned build is Windows-only) and
install PHP separately if you want PHP previews:

```bash
npm install
npm run dev
```

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Electron + Vite with hot reload |
| `npm run build` | Production build into `out/` (run `npm run typecheck` separately) |
| `npm run typecheck` | Strict TypeScript for main, preload, and renderer |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Builds, then runs Playwright against the Electron app |
| `npm run fetch-php` | Downloads and verifies the pinned PHP build (Windows only) |
| `npm run licenses` | Regenerates third-party notices |
| `npm run theme` | Regenerates M3 tokens from the source color |
| `npm run dist` | Windows portable zip: `dist/WebYou-1.0.0-win-x64.zip` (alias for `dist:win`) |
| `npm run dist:win` | Builds the Windows zip |
| `npm run dist:linux` | Builds the Linux AppImage and tar.gz into `dist/` |

`npm run fetch-php` pins **PHP 8.4.27-1 NTS Win32 vs17 x64**, checks the
official SHA-256 before unpacking, and refuses to run on other platforms.
Binaries are never committed (`resources/php/` is ignored). Run the script after
a fresh clone on Windows and before packaging the zip.

The Electron binary is installed by the normal `electron` postinstall. If your
environment blocks install scripts, run `node node_modules/electron/install.js`
manually.

### Project layout

```text
src/
  main/        Electron window, IPC, settings, project manager, PHP server
  preload/     contextBridge API (`window.webyou`)
  renderer/    React UI, CodeMirror editor, preview, tag shelf, i18n
  shared/      Types, IPC channel names, pure helpers used by both sides
resources/
  templates/   Localized project templates (blank, business-card, php-form)
  php/         Generated by scripts/fetch-php.mjs (ignored by git)
  licenses/    PHP license and generated third-party notices
scripts/       fetch-php, theme generator, license collector
build/         Application icon (512×512 PNG)
.github/       CI workflow: checks, e2e, Windows and Linux packages
tests/
  unit/        Vitest tests for pure helpers
  e2e/         Playwright Electron tests
```

`context.md` is a handoff summary for AI agents and contributors: current state,
decisions, commands, and known pitfalls.

### Security model

- The main window runs with `contextIsolation: true`, `nodeIntegration: false`,
  and `sandbox: true`. The renderer sees only the typed `window.webyou` bridge.
- The preview uses the separate `persist:webyou-preview` session, with no
  preload, no Node integration, permissions denied, and cache cleared. New
  windows and navigation are intercepted; only `http(s)` links go to the system
  browser.
- Every file operation resolves the path in the main process and rejects
  anything outside the open project root.
- A Content-Security-Policy header is applied to the application window. The
  development build relaxes it for Vite; the packaged build does not allow
  remote frames or external scripts.
- IPC handlers accept only known channels and validate argument types and sizes.

### Tests

Unit tests cover tag insertion/wrapping, generated tag markup, path containment,
PHP lint/runtime parsing, and preview page selection. The Playwright suite
launches the real Electron app in an isolated temporary data folder, creates a
project from a template, edits the editor, waits for the preview to update,
inserts a tag with the shelf, and verifies that a PHP syntax error appears in
the Problems panel.

### Continuous integration

`.github/workflows/build.yml` runs on every push to `main`, on pull requests, and
on tags:

| Job | Runner | What it does |
| --- | --- | --- |
| Checks | Ubuntu | `npm ci`, typecheck, unit tests |
| End-to-end | Windows | Fetches PHP, builds, runs Playwright (traces saved on failure) |
| Windows package | Windows | Builds `dist/WebYou-1.0.0-win-x64.zip` |
| Linux package | Ubuntu | Builds the AppImage and tar.gz |

Pushing a tag such as `v1.0.0` publishes all archives to a GitHub Release. The
workflow needs no secrets: builds are unsigned and only the release job requests
`contents: write`.

### Known limitations

- The PHP built-in server is single-threaded for page requests; long scripts
  block other preview requests. This is fine for learning projects.
- There is no Git, terminal, database, Composer, debugger, or auto-update.
- The portable archive is unsigned, and some antivirus products may inspect a
  local `php.exe` that listens on `127.0.0.1`.
- The Linux AppImage needs FUSE 2 (`libfuse2` or `libfuse2t64`) on some
  distributions. The tarball has no such dependency.
- The Electron `<webview>` tag is used deliberately for the preview. If a future
  Electron version removes it, the fallback is `WebContentsView`, which would
  give up drawing tag forms above the preview area.

## License

WebYou is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

WebYou is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details. The
full text is in `LICENSE`; if it is missing, see
<https://www.gnu.org/licenses/>.

Copyright (C) 2026 WebYou. The corresponding source is this repository.

The bundled PHP is a separate program distributed under the PHP License 3.01
(`resources/licenses/php-license.txt`); WebYou invokes it as a subprocess, so it
is not covered by WebYou's GPL. Third-party notices are generated into
`resources/licenses/THIRD-PARTY-NOTICES.txt`.

---

## Кратко по-русски

WebYou — переносимая среда для первых шагов в веб-разработке. Распакуйте
`WebYou-1.0.0-win-x64.zip` в любую папку и запустите `WebYou.exe`: установка не
нужна. Слева — код с подсветкой и автосохранением, справа — живой предпросмотр.
Внутри уже есть PHP 8.4 и три шаблона: пустая страница, сайт-визитка и форма
обратной связи. Интерфейс переключается между русским и английским, тема — светлая,
тёмная или системная.

Для Linux публикуются AppImage и tar.gz. PHP в них не входит (сборка PHP —
только для Windows): WebYou использует системный `php`, если он есть, иначе
предпросмотр HTML/CSS/JS работает через встроенный статический сервер.

Настройки лежат в папке `data` рядом с `exe` (или в `%APPDATA%\webyou`, если папка
недоступна для записи). Для PHP на чистой Windows может понадобиться
[Microsoft Visual C++ 2015–2022 x64](https://aka.ms/vs/17/release/vc_redist.x64.exe).
Сборка не подписана, поэтому SmartScreen может показать предупреждение —
«Подробнее → Выполнить в любом случае».

Разработка: `npm install`, `npm run fetch-php`, `npm run dev`. Сборка архива:
`npm run dist`, для Linux — `npm run dist:linux`. Тесты: `npm test` и
`npm run test:e2e`.

Лицензия — GNU GPL v3 или любая более новая (`LICENSE`), исходный код — этот
репозиторий. PHP распространяется отдельно под PHP License 3.01 и в GPL не
входит.
