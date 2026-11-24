# WebYou — контекст для следующего ИИ-агента

Обновлено: 24 ноября 2026. Версия: **1.0.0**. Состояние: приложение
реализовано, протестировано и собрано в портативный zip; репозиторий подготовлен
к публикации на GitHub.

Этот файл — краткая карта проекта и набор правил, которые сэкономят время и
помогут не сломать уже принятые решения. Полное ТЗ лежит в
`D:\321\WebYou\PLAN.md` и имеет приоритет над этим файлом.

---

## 1. Где что лежит

| Путь | Что это |
| --- | --- |
| `D:\321\WebYou\PLAN.md` | Авторитетная спецификация v1. |
| `D:\321\WebYou\app` | Корень приложения, вся работа ведётся здесь. |
| `D:\321\WebYou\app\dist\WebYou-1.0.0-win-x64.zip` | Готовый портативный архив. |
| `D:\321\WebYou\app\README.md` | Пользовательская и developer-документация (EN + кратко RU). |
| `D:\321\WebYou\app\context.md` | Этот файл. |

Важно: все команды и правки выполняй в `D:\321\WebYou\app`. Уровнем выше
лежит только `PLAN.md`; папка доступна на запись, но держать её чистым проще —
временные файлы и артефакты складывай внутри `app`.

Проект перенесён: прежние пути `C:\Projects\WebYou\...` больше не существуют,
все ссылки в документации указывают на `D:\321\WebYou\...`.

Git-репозитория пока нет: файлы для публикации (`.gitignore`,
`.gitattributes`, `.editorconfig`, `.nvmrc`, `.github/workflows/build.yml`)
готовы, но `git init` и первый коммит делает владелец. Репозиторий — это папка
`app`, уровень выше в него не входит.

---

## 2. Окружение и как запускать команды

- Windows 10/11 x64, Node.js 24, npm 11.
- PowerShell блокирует `npm.ps1`, поэтому npm-скрипты запускай так:

  ```powershell
  cmd /c "npm run typecheck"
  cmd /c "npm test"
  cmd /c "npm run test:e2e"
  cmd /c "npm run dist"
  ```

- В PowerShell не используй `&&` — запускай команды по одной.
- Electron установлен вручную через `node node_modules\electron\install.js`,
  если обычный postinstall был заблокирован.

### Команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Electron + Vite с горячей перезагрузкой. |
| `npm run typecheck` | Строгий TypeScript для node и web конфигов. |
| `npm run build` | Сборка в `out/` **без** проверки типов. |
| `npm test` | Vitest, 97 unit-тестов. |
| `npm run test:e2e` | Сборка + 24 Playwright-теста Electron. |
| `npm run fetch-php` | Скачивает и проверяет закреплённый PHP. |
| `npm run licenses` | Пересобирает `resources/licenses/THIRD-PARTY-NOTICES.txt`. |
| `npm run theme` | Генерирует M3-токены из исходного цвета. |
| `npm run dist` | build + licenses + electron-builder zip (алиас `dist:win`). |
| `npm run dist:win` | Windows-архив `dist/WebYou-1.0.0-win-x64.zip`. |
| `npm run dist:linux` | Linux-артефакты AppImage и tar.gz в `dist/`. |

Перед `npm run dist` в чистом окружении обязателен `npm run fetch-php`:
`resources/php` не хранится в git. Скрипт работает только на Windows — на Linux
PHP берётся из `PATH`.

---

## 3. Стек и версии

- Electron **45.4.1**, electron-vite **6.0.0**, Vite **8.3.8**.
- React **19.3.1**, TypeScript **5.9.3** (strict, `noUnusedLocals`,
  `noUnusedParameters`).
- CodeMirror 6, HTMLHint, i18next + react-i18next, chokidar.
- PHP **8.4.27-1 NTS Win32 vs17 x64** (официальная сборка windows.php.net).
- Тесты: Vitest 4, Playwright 1.56.
- UI: Material 3 Expressive, токены из `SchemeVibrant`, исходный цвет
  `#215D8C`. Шрифты `Roboto Flex` и `Roboto Mono` лежат в пакете (офлайн).

---

## 4. Архитектура

Три процесса, связь только через preload + типизированный IPC.

```text
src/
  main/                 Electron main
    index.ts            окно, CSP, заголовки, харденинг webview
    ipc/index.ts        все IPC-обработчики и валидация аргументов
    project/index.ts    файлы, дерево, шаблоны, path containment
    php-server/index.ts PHP -S, php.ini, php -l, статический fallback
    settings/index.ts   data dir, settings.json, recent-projects.json
  preload/index.ts      contextBridge → window.webyou
  renderer/
    src/state/          AppContext: всё состояние, автосохранение, lint
    src/screens/        StartScreen, Workspace, диалоги
    src/editor/         CodeMirror, вкладки
    src/tags/           каталог тегов, панель, формы
    src/preview/        <webview>, навигация, размеры экрана
    src/problems/       панель ошибок
    src/i18n/           ru.json, en.json
    src/styles/app.css  дизайн-система
  shared/               api.ts, ipc.ts, types.ts и чистые утилиты
resources/
  php/                  генерируется fetch-php, gitignored
  templates/<id>/<lang> blank, business-card, php-form
  licenses/             PHP license + THIRD-PARTY-NOTICES
  README-portable.txt   инструкция внутри zip
scripts/                fetch-php, theme, licenses, icon
tests/unit, tests/e2e
```

Алиасы: `@shared` → `src/shared`, `@renderer` → `src/renderer`.
В renderer **нельзя импортировать `node:path`**; для путей используй
`@shared/path-text` (`joinPathText`, `basenameText`, `extnameText` и т.п.).
Ошибки IPC/ОС в ключи переводов превращает `@shared/errors` (`errorKey`).
Цвета нативной рамки — `@shared/theme` (`windowColors`).

`package.json` намеренно **без** `"type": "module"`: electron-vite собирает
main/preload в CommonJS, иначе ломается sandboxed preload.

---

## 5. Ключевые решения и ловушки

### Окно и UI

- `titleBarStyle: 'hidden'` + `titleBarOverlay` высотой `APP_BAR_HEIGHT = 64`.
  Высота задана и в `src/main/index.ts`, и в `.app-bar` в CSS — менять вместе.
- У `.app-bar` `padding-right: 152px`, чтобы контент не заезжал под кнопки
  окна Windows. Кнопки — non-client area, в скриншотах Playwright их нет.
- Тема, язык и layout (ширины панелей) хранятся в `localStorage` renderer;
  настройки — в `data/settings.json` через main.
- Тема: light / dark / system. Язык по умолчанию — системный, если `ru*`,
  иначе `en`.
- Нативная рамка окна следует теме приложения, а не теме ОС: main выставляет
  `nativeTheme.themeSource` из настроек при старте и при каждом
  `settings:set`. Иначе светлый интерфейс на тёмной Windows оставлял чёрные
  кнопки свернуть/развернуть/закрыть. Цвета overlay берутся из
  `@shared/theme` и совпадают с токенами surface; renderer дополнительно
  присылает их через `ui:title-bar` (канал слушается `ipcMain.on`, потому что
  preload использует `ipcRenderer.send`).
- На ширине ≤1180 px статус сервера оставляет текстовую подпись («Просмотр
  работает»), скрывается только номер порта; `title` содержит подпись и адрес.
- Контекстное меню текста (редактор, поля ввода, диалоги) — `TextContextMenu`:
  Cut / Copy / Paste / Delete / Select all с подсказками биндов справа.
  Недоступные пункты остаются видимыми с `aria-disabled`; команды выполняет
  main через `webContents.cut/copy/paste/delete/selectAll`, а фокус сначала
  возвращается в поле. `Escape` закрывает меню раньше диалога под ним.
- Иконки — Material Symbols Outlined (24dp, weight 400), геометрия скопирована
  из `google/material-design-icons` (Apache 2.0). Один `viewBox`
  `0 -960 960 960` и `fill="currentColor"` на весь набор, поэтому настройки,
  папки и остальные значки не выбиваются из M3.

### Файлы и редактор

- Автосохранение по умолчанию 500 мс, задержка настраивается.
- Запись атомарная: временный файл в той же папке → `rename`. `write` пишет
  только существующий файл (`NOT_A_FILE`), не создаёт папки и перепроверяет
  цель перед `rename` — autosave не может воскресить удалённый файл.
  Временный файл удаляется в `finally`, поэтому неудачное сохранение (read-only,
  занятый файл) не оставляет `.name.pid.ts.tmp`; такие имена и
  `.webyou-rename-*` скрыты из дерева и watcher.
- В `FileReadResult`/`FileWriteResult` есть `mtime`; перед записью renderer
  передаёт `expectedMtime`. Расхождение → `FILE_CHANGED` и диалог конфликта
  («оставить моё» / «загрузить с диска»), а не тихая перезапись. Конфликты
  хранятся очередью: диалог показывает первый, под ним — счётчик оставшихся;
  `flushAll` считает все неразрешённые вкладки несохранёнными.
- Закрытие окна: main перехватывает `close`, просит renderer через
  `app:flush-request` сохранить грязные вкладки и ждёт `app:flush-done`
  (таймаут 6 с). Если что-то не сохранилось — нативный диалог
  «Закрыть без сохранения / Отмена».
- «Закрыть проект» и «×» на вкладке тоже блокируются, если запись не удалась:
  проект/вкладка остаются открытыми, показывается диалог со списком файлов и
  причиной, действия — «Отмена» / «Отбросить и закрыть». Молчаливой потери
  буфера нет.
- Удаление и переименование сначала снимают pending-таймеры: удаление
  выбрасывает вкладки без flush, переименование сначала сохраняет буфер,
  затем переносит пути вкладок, `goto`, конфликты и ключи диагностики
  (`phpProblems`/`htmlProblems`/`runtimeProblems`, включая папки и case-only).
  Case-only rename идёт через временное имя.
- Имена файлов/папок проверяет `@shared/names` (`isValidEntryName`):
  запрещены `CON`/`AUX`/`NUL`/`COM1–9`/`LPT1–9`, trailing dot/space,
  управляющие символы и разделители. Пробелы по краям обрезаются до
  валидации, и диалог явно предупреждает об этом.
- Игнорируются только `.git`, `node_modules`, `.webyou`; папка `data`
  видима в дереве и watcher.
- Дерево читается до глубины 24 (лимит 6000 узлов). При обрезке показывается
  уведомление «часть файлов скрыта», у имён есть `title`, а панель
  прокручивается по горизонтали.
- Шапка панели файлов не переполняется: блок заголовка (`pane__heading`)
  сжимается и обрезает подпись многоточием, действия (`pane__actions`) не
  выталкиваются, а dense-кнопки в шапке — 32 px. Пять действий помещаются в
  246 px и в русском, и в английском.
- Переводы строк сохраняются: при чтении определяется `lf`/`crlf`, при записи
  восстанавливается.
- Бинарные файлы (картинки) открываются как предпросмотр, не как текст.
- Вкладки и активный файл сохраняются per-project в `localStorage`
  (`webyou.tabs:<root>`).
- Внешние изменения подхватываются chokidar. Если вкладка грязная, внешнее
  изменение сразу поднимает диалог конфликта. Внешнее удаление грязного файла
  больше не выбрасывает буфер: вкладка помечается `orphaned`, показывается
  баннер «файл удалён на диске» с «Сохранить файл» / «Закрыть». Autosave такой
  файл не воссоздаёт — только явное сохранение (`createMissing`).
- После внешней перезагрузки `CodeEditor` пересоздаёт `EditorState`, поэтому
  `Ctrl+Z` не возвращает старую версию и не перезаписывает ею файл.
- Вставка тега из полки — отдельная транзакция CodeMirror
  (`isolateHistory.of('after')`), поэтому первый `Ctrl+Z` после ввода убирает
  только набранный текст, а не тег вместе с ним.
- `.tabstrip__tabs` слушает `ResizeObserver`: активная вкладка остаётся
  в видимой области и после сужения окна, а не только при смене `activePath`.
  Скролл выравнивается по границе вкладки, а `--tab-tail` добавляет ровно
  столько места справа, сколько нужно, чтобы слева не оставалось обрезанной
  вкладки (в том числе для последней вкладки).
- Все файловые операции main проверяют, что путь после нормализации внутри
  корня проекта. Не обходи эту проверку.

### PHP

- На каждый проект запускается `php.exe -S 127.0.0.1:<свободный порт> -t <root>`
  со сгенерированным `php.ini` (`display_errors=On`, `error_reporting=E_ALL`,
  `mbstring`, `fileinfo`, `pdo_sqlite`).
- `php.ini` создаётся в `<data>/php/php.ini`.
- При падении — один автоматический перезапуск, затем сообщение в UI.
- Если PHP не найден/не стартует — включается статический Node-сервер, в UI
  показывается понятное сообщение. PHP-файлы в этом режиме не выполняются.
- `php -l` вызывается после сохранения `.php`; stderr сервера парсится в
  runtime-ошибки. Оба парсера — `src/shared/php-errors.ts`.
- Runtime-проблемы очищаются при сохранении PHP-файла, чтобы не висели старые.
- В dev на не-Windows допускается системный `php`.

### Предпросмотр

- `<webview>` с `partition: 'persist:webyou-preview'`, без preload и Node.
- Активный `.html`/`.php` показывается; при правке CSS/JS остаётся последняя
  страница.
- URL получает cache-buster `?_webyou=<nonce>`; main дополнительно ставит
  no-cache заголовки в preview-сессии.
- Позиция прокрутки запоминается перед перезагрузкой и восстанавливается.
- Ширины: телефон 375 px, планшет 768 px, компьютер — вся ширина. Ширина
  задаётся рамке вместе с безелем (375 + 16 px), поэтому `<webview>` сохраняет
  ровно 375/768 CSS-px для media queries. Устройство масштабируется
  `transform: scale()`, но не ниже `0.7`: при узкой панели stage прокручивается,
  а не превращает телефон и планшет в два одинаковых миниатюрных превью.
  В тулбаре показывается бейдж `375 px · 70%` / `768 px · 70%`.
- Перезагрузка предпросмотра после сохранения проверяет, что `<webview>` ещё
  прикреплён и готов: при переименовании/смене страницы элемент
  пересоздаётся, и вызов `reload()` на отсоединённом webview больше не роняет
  renderer.
- Разделитель панелей тянется почти до края: доля редактора клампится
  `@shared/layout` (минимум 220 px у предпросмотра). Редактор либо не уже
  320 px, либо сворачивается в 0 (snap-to-collapse), поэтому промежуточных
  «обрезанных» ширин нет. Двойной клик по разделителю переключает
  «во всю ширину» ↔ 52/48, `Home`/`End` делают то же с клавиатуры.
- При перетаскивании разделителя на время драга создаётся `.resize-shield`:
  без него `<webview>` перехватывает `pointermove`, и ресайз застревает.
- Внутренние ссылки остаются в webview, внешние `http(s)` уходят в системный
  браузер. Новые окна перехватываются.
- Кэш отключён.

### Безопасность (не ослаблять)

- Main window: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, `webviewTag: true`.
- Preview: без Node, без preload, permissions denied, отдельная сессия.
- `shell.openExternal` только для `http:` и `https:`.
- CSP для окна; в dev она ослаблена для Vite, в packaged — строгая.
- IPC: только известные каналы, аргументы проверяются по типу и размеру.
- Навигация главного окна заблокирована.

### Тексты

- Все строки интерфейса — в `src/renderer/src/i18n/ru.json` и `en.json`.
  В компонентах не должно быть пользовательских строк.
- Исключение по смыслу: эндонимы языков «English» и «Русский» в селектах.
- Шаблоны проектов продублированы по языкам:
  `resources/templates/<id>/<lang>/`; при создании копируется папка выбранного
  языка, с fallback на `en`.
- Комментарии в шаблонах — на языке интерфейса.

### Данные

- Dev: `app/data`.
- Packaged: `data` рядом с exe, если writable, иначе `%APPDATA%\webyou`.
- `WEBYOU_DATA_DIR` переопределяет всё — используется e2e и smoke-тестами.
- Внутри: `settings.json`, `recent-projects.json`, `php/php.ini`.

---

## 6. Тесты

Unit (Vitest, `tests/unit`):

- `tag-insert.test.ts` — вставка/обёртка тегов, отступы.
- `tag-markup.test.ts` — генерация кода из форм.
- `paths.test.ts` — проверка containment и работа с путями.
- `php-errors.test.ts` — разбор lint и runtime вывода.
- `preview.test.ts` — выбор страницы для предпросмотра.
- `layout.test.ts` — границы ресайза панелей, snap-to-collapse и сворачивание.
- `names.test.ts` — правила имён (зарезервированные имена Windows, точки/пробелы).
- `errors.test.ts` — коды IPC/ОС в ключи переводов.
- `theme.test.ts` — цвета нативной рамки совпадают с токенами surface.
- `text-menu.test.ts` — состав меню текста, disabled-состояния, бинды Win/Mac.

E2E (Playwright, `tests/e2e/app.spec.ts`, workers=1):

1. Создание проекта из шаблона, правка, живой предпросмотр, вставка тега и
   отдельный undo для набранного после тега текста.
2. Растягивание предпросмотра почти на всю ширину, возврат двойным кликом и
   snap-to-collapse при промежуточной ширине.
3. Реальные ширины устройств в предпросмотре (375/768 CSS-px).
4. Переключение языка и темы.
5. Выполнение PHP и появление синтаксической ошибки в Problems.
6. Сохранение несохранённых правок при закрытии окна.
7. Удаление грязного файла без воскрешения.
8. Переименование грязного файла (содержимое и путь вкладки) и case-only rename.
9. Конфликт внешнего изменения и «Загрузить с диска».
10. Блокировка «Закрыть проект» при ошибке записи: диалог с именем файла и
    причиной, «Отмена» оставляет проект, «Отбросить и закрыть» выходит; после
    неудачной записи не остаётся `.tmp`.
11. Блокировка закрытия грязной вкладки при ошибке записи.
12. `Ctrl+Z` после внешней перезагрузки не возвращает старую версию и не
    перезаписывает файл.
13. Два одновременных конфликта: диалог показывает первый и счётчик, после
    решения появляется второй.
14. Переименование PHP-файла переносит Problems на новый путь; клик по ошибке
    открывает файл, а не падает с `NOT_A_FILE`.
15. Внешнее удаление грязного файла оставляет буфер с баннером; autosave не
    воссоздаёт файл, явное «Сохранить файл» — воссоздаёт.
16. Глубокое дерево (12 уровней) показывает файл, имя имеет `title`,
    панель прокручивается по горизонтали.
17. На минимальном окне телефон и планшет остаются различимыми: масштаб не
    ниже 70 %, ширины слотов различаются больше чем на 200 px.
18. Скролл вкладок выравнивается по границе: слева нет обрезанной вкладки,
    активная полностью видна.
19. На ширине 1080 px подпись статуса сервера видна, скрыт только порт.
20. Ошибка переименования называет файл и причину; диалог создания подсказывает
    об обрезке пробелов по краям.
21. Цвета title-bar из renderer доходят до main и вызывают
    `setTitleBarOverlay` (канал `send` ↔ `ipcMain.on`).
22. `nativeTheme.themeSource` следует выбранной теме приложения, а не теме ОС.
23. Кнопки шапки панели файлов остаются внутри панели в EN и RU, на 1460 и
    1080 px; заголовок при нехватке места обрезается, а не выталкивает Close.
24. Контекстное меню текста: 5 пунктов с биндами, Copy кладёт выделение в
    буфер, без выделения Cut/Copy/Delete получают `aria-disabled`, Escape
    возвращает фокус в редактор.

Особенности:

- Запускай файлом, а не Windows-путём:
  `npx playwright test app.spec.ts`.
- E2E сами задают `WEBYOU_DATA_DIR` во временную папку.
- Между сценариями очищается `localStorage`, чтобы layout не протекал.
- При падении сохраняются trace и screenshot (см. `playwright.config.ts`).

---

## 7. Сборка и артефакт

`electron-builder.yml`:

- Windows x64, target `zip`, `artifactName: ${productName}-${version}-win-${arch}.zip`.
- Linux x64 (собирается в CI или на Linux-машине), targets `AppImage` и
  `tar.gz`, `category: Development`, `icon: build/icon.png`,
  `artifactName: ${productName}-${version}-linux-${arch}.${ext}`.
- `files`: `out/**/*`, `package.json`.
- Общие `extraResources`: `resources/templates` → `templates`,
  `resources/licenses` → `licenses`.
- `win.extraResources`: `resources/php` → `php` — PHP только для Windows.
- `win.extraFiles`: `LICENSE` → `LICENSE.txt`, `resources/README-portable.txt` →
  `README.txt` в корень архива. Для Linux — только `LICENSE.txt`.
- `asar: true`, `requestedExecutionLevel: asInvoker`.

Лицензия проекта — **GPL-3.0-or-later**: полный текст в `LICENSE`, в
`package.json` поле `"license": "GPL-3.0-or-later"`. PHP — отдельная программа
под PHP License 3.01, в GPL не входит; в архив кладётся `php-license.txt`.

`resources/php` живёт в `win.extraResources`, а не в общих: electron-builder
складывает общие и платформенные matchers (`getFileMatchers`), поэтому Windows
получает и шаблоны, и PHP, а Linux — только шаблоны и лицензии. На Linux
`findPhp()` ищет системный `php` в `PATH`, иначе остаётся статический сервер.

Текущий артефакт:

```text
dist/WebYou-1.0.0-win-x64.zip
~189,5 MB, 197 записей
PHP: 88 файлов, шаблоны: 30, лицензии: 3
SHA-256: 2BFE74DF462E71C3411F93E50C4D74766709CFCF23EF1E862DFE8EA261AF4EE9
```

SHA-256 изменится после любой пересборки — не считай его вечной константой.

### CI и публикация

`.github/workflows/build.yml` (Node 24, `npm ci` с кэшем):

- `checks` — ubuntu: `typecheck` + `npm test`.
- `e2e` — windows: `fetch-php` + `test:e2e`; при падении грузит `test-results/`.
- `windows` — windows: `fetch-php` + `dist`, артефакт `dist/*.zip`.
- `linux` — ubuntu: `dist:linux`, артефакты `dist/*.AppImage`, `dist/*.tar.gz`.
- `release` — на тег `v*`: скачивает артефакты и публикует GitHub Release
  через `softprops/action-gh-release@v2`; нужен только `contents: write`,
  секретов нет.

Триггеры: push в `main`/`master`, теги `v*`, pull request, ручной запуск.
Linux-пакеты локально не проверялись (на Windows нет AppImage-тулчейна).

Иконка: `build/icon.png`, генерируется `scripts/make-icon.cjs` +
`scripts/icon.html`. Встроена в exe (проверено извлечением).

---

## 8. Что уже проверено

- `npm run typecheck` — чисто.
- `npm test` — 10 файлов, 97 тестов, все проходят.
- `npm run test:e2e` — 24/24.
- `npm run dist` — архив собран.
- `npm run dist:dir` с новым `electron-builder.yml` — PHP снова попал в
  `dist/win-unpacked/resources/php`, `README.txt` и `LICENSE.txt` на месте.
- `electron-builder.yml` и workflow разобраны `js-yaml`; конфиг принят
  electron-builder без ошибок схемы.
- Packaged smoke: приложение запускается из `dist/win-unpacked`, `app.info()`
  возвращает PHP 8.4.27, `isPackaged: true`, `WEBYOU_DATA_DIR` учитывается.
- PHP-шаблон в предпросмотре реально выполняется.
- Иконка и содержимое zip проверены.

Smoke-тест упакованного приложения можно повторить через Playwright:

```js
const { _electron } = require('D:/321/WebYou/app/node_modules/playwright')
const app = await _electron.launch({
  executablePath: 'D:/321/WebYou/app/dist/win-unpacked/WebYou.exe',
  env: { ...process.env, WEBYOU_DATA_DIR: tempDir }
})
const page = await app.firstWindow()
await page.evaluate(() => window.webyou.app.info()) // именно app.info(), не appInfo()
```

---

## 9. Что осталось внешним блокером

Это нельзя закрыть в текущем окружении:

- Прогон на чистой виртуальной машине Windows 10 и 11.
- Подпись кода; SmartScreen будет предупреждать.
- Проверка на машине без Visual C++ 2015–2022 x64: PHP может не стартовать,
  тогда работает статический fallback. Инструкция есть в README.
- Антивирусы могут реагировать на неподписанный exe и `php.exe` на localhost.

Других известных незавершённых задач по `PLAN.md` нет.

---

## 10. Правила для будущих изменений

1. Сверяйся с `PLAN.md`; не добавляй функции из раздела «Не входит в v1» без
   явной просьбы.
2. Новые пользовательские строки — только в оба JSON, с одинаковыми ключами.
3. Новые файловые операции — только через main и `resolveWithinRoot`.
4. Не ослабляй настройки безопасности окна и webview.
5. Чистые функции (пути, разбор ошибок, генерация тегов, выбор страницы)
   выноси в `src/shared` и покрывай unit-тестами.
6. После изменения зависимостей запускай `npm run licenses` перед `dist`.
7. Меняешь высоту app bar — обнови `APP_BAR_HEIGHT` и CSS.
8. Меняешь исходный цвет темы — `npm run theme`, затем проверь контраст.
9. Не коммить `resources/php`, `resources/licenses/THIRD-PARTY-NOTICES.txt`,
   `out/`, `dist/`, `data/`, `review-shots/` — всё это в `.gitignore`.
   Linux собирай через `npm run dist:linux` и не запускай там `fetch-php`.
10. Финальный порядок проверки:
    `typecheck` → `test` → `test:e2e` → `fetch-php` (если нужно) → `dist` →
    smoke упакованного exe.

## 11. С чего начать чтение

1. `PLAN.md`
2. `package.json` и `electron-builder.yml`
3. `src/main/index.ts`
4. `src/shared/api.ts` и `src/preload/index.ts`
5. `src/renderer/src/state/AppContext.tsx`
6. `src/renderer/src/preview/PreviewPane.tsx`
7. `src/main/php-server/index.ts`
8. `src/renderer/src/styles/app.css`
