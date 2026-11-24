#!/usr/bin/env node
/**
 * Generate Material 3 color roles from a single source color.
 *
 * Usage: npm run theme
 * Source:  #215D8C (a calm ocean blue); scheme: vibrant.
 * Output:  src/renderer/src/styles/tokens.css
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Hct,
  SchemeVibrant,
  argbFromHex,
  hexFromArgb
} from '@material/material-color-utilities'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT = path.join(ROOT, 'src', 'renderer', 'src', 'styles', 'tokens.css')

const SOURCE = '#215D8C'

const ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'background',
  'onBackground',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'outline',
  'outlineVariant',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'shadow',
  'scrim'
]

function kebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function roleLines(scheme, indent = '  ') {
  if (!scheme) return []
  return ROLES.map(
    (role) => `${indent}--md-sys-color-${kebab(role)}: ${hexFromArgb(scheme[role])};`
  )
}

function scaleBlock() {
  return [
    '',
    '  /* Shape scale (M3 Expressive adds 20 / 32 / 48). */',
    '  --md-sys-shape-none: 0px;',
    '  --md-sys-shape-xs: 4px;',
    '  --md-sys-shape-sm: 8px;',
    '  --md-sys-shape-md: 12px;',
    '  --md-sys-shape-lg: 16px;',
    '  --md-sys-shape-xl: 20px;',
    '  --md-sys-shape-xxl: 28px;',
    '  --md-sys-shape-3xl: 32px;',
    '  --md-sys-shape-4xl: 48px;',
    '  --md-sys-shape-full: 999px;',
    '',
    '  /* Type families: bundled locally so the app works offline. */',
    "  --md-sys-typescale-brand: 'Roboto Flex Variable', 'Segoe UI', system-ui, sans-serif;",
    "  --md-sys-typescale-plain: 'Roboto Flex Variable', 'Segoe UI', system-ui, sans-serif;",
    "  --md-sys-typescale-code: 'Roboto Mono', 'Cascadia Code', 'Consolas', monospace;",
    '',
    '  /* Type scale: size / line-height / weight / tracking. */',
    '  --md-sys-typescale-display-large-size: 57px;',
    '  --md-sys-typescale-display-large-line: 64px;',
    '  --md-sys-typescale-display-large-weight: 400;',
    '  --md-sys-typescale-display-large-tracking: -0.25px;',
    '  --md-sys-typescale-display-medium-size: 45px;',
    '  --md-sys-typescale-display-medium-line: 52px;',
    '  --md-sys-typescale-display-medium-weight: 400;',
    '  --md-sys-typescale-display-medium-tracking: 0px;',
    '  --md-sys-typescale-display-small-size: 36px;',
    '  --md-sys-typescale-display-small-line: 44px;',
    '  --md-sys-typescale-display-small-weight: 400;',
    '  --md-sys-typescale-display-small-tracking: 0px;',
    '  --md-sys-typescale-headline-large-size: 32px;',
    '  --md-sys-typescale-headline-large-line: 40px;',
    '  --md-sys-typescale-headline-large-weight: 400;',
    '  --md-sys-typescale-headline-large-tracking: 0px;',
    '  --md-sys-typescale-headline-medium-size: 28px;',
    '  --md-sys-typescale-headline-medium-line: 36px;',
    '  --md-sys-typescale-headline-medium-weight: 400;',
    '  --md-sys-typescale-headline-medium-tracking: 0px;',
    '  --md-sys-typescale-headline-small-size: 24px;',
    '  --md-sys-typescale-headline-small-line: 32px;',
    '  --md-sys-typescale-headline-small-weight: 400;',
    '  --md-sys-typescale-headline-small-tracking: 0px;',
    '  --md-sys-typescale-title-large-size: 22px;',
    '  --md-sys-typescale-title-large-line: 28px;',
    '  --md-sys-typescale-title-large-weight: 500;',
    '  --md-sys-typescale-title-large-tracking: 0px;',
    '  --md-sys-typescale-title-medium-size: 16px;',
    '  --md-sys-typescale-title-medium-line: 24px;',
    '  --md-sys-typescale-title-medium-weight: 500;',
    '  --md-sys-typescale-title-medium-tracking: 0.15px;',
    '  --md-sys-typescale-title-small-size: 14px;',
    '  --md-sys-typescale-title-small-line: 20px;',
    '  --md-sys-typescale-title-small-weight: 500;',
    '  --md-sys-typescale-title-small-tracking: 0.1px;',
    '  --md-sys-typescale-body-large-size: 16px;',
    '  --md-sys-typescale-body-large-line: 24px;',
    '  --md-sys-typescale-body-large-weight: 400;',
    '  --md-sys-typescale-body-large-tracking: 0.5px;',
    '  --md-sys-typescale-body-medium-size: 14px;',
    '  --md-sys-typescale-body-medium-line: 20px;',
    '  --md-sys-typescale-body-medium-weight: 400;',
    '  --md-sys-typescale-body-medium-tracking: 0.25px;',
    '  --md-sys-typescale-body-small-size: 12px;',
    '  --md-sys-typescale-body-small-line: 16px;',
    '  --md-sys-typescale-body-small-weight: 400;',
    '  --md-sys-typescale-body-small-tracking: 0.4px;',
    '  --md-sys-typescale-label-large-size: 14px;',
    '  --md-sys-typescale-label-large-line: 20px;',
    '  --md-sys-typescale-label-large-weight: 500;',
    '  --md-sys-typescale-label-large-tracking: 0.1px;',
    '  --md-sys-typescale-label-medium-size: 12px;',
    '  --md-sys-typescale-label-medium-line: 16px;',
    '  --md-sys-typescale-label-medium-weight: 500;',
    '  --md-sys-typescale-label-medium-tracking: 0.5px;',
    '  --md-sys-typescale-label-small-size: 11px;',
    '  --md-sys-typescale-label-small-line: 16px;',
    '  --md-sys-typescale-label-small-weight: 500;',
    '  --md-sys-typescale-label-small-tracking: 0.5px;',
    '',
    '  /* Emphasized styles: same size, heavier weight. Used sparingly. */',
    '  --md-sys-typescale-emphasized-title-large-weight: 600;',
    '  --md-sys-typescale-emphasized-title-medium-weight: 600;',
    '  --md-sys-typescale-emphasized-label-large-weight: 600;',
    '  --md-sys-typescale-emphasized-headline-small-weight: 600;',
    '',
    '  /* Expressive motion. Spatial springs may overshoot; effects never do. */',
    '  --md-sys-motion-spatial-default: 500ms cubic-bezier(0.38, 1.21, 0.22, 1);',
    '  --md-sys-motion-spatial-fast: 350ms cubic-bezier(0.42, 1.67, 0.21, 0.9);',
    '  --md-sys-motion-spatial-slow: 650ms cubic-bezier(0.38, 1.21, 0.22, 1);',
    '  --md-sys-motion-effects-default: 150ms cubic-bezier(0.31, 0.94, 0.34, 1);',
    '  --md-sys-motion-effects-slow: 250ms cubic-bezier(0.31, 0.94, 0.34, 1);',
    '',
    '  /* State layers. */',
    '  --md-sys-state-hover: 0.08;',
    '  --md-sys-state-focus: 0.1;',
    '  --md-sys-state-pressed: 0.1;',
    '  --md-sys-state-dragged: 0.16;',
    '',
    '  /* Elevation for menus, dialogs, and the floating rail. */',
    '  --md-sys-elevation-1: 0 1px 2px rgb(0 0 0 / 0.18), 0 1px 3px 1px rgb(0 0 0 / 0.08);',
    '  --md-sys-elevation-2: 0 2px 6px 2px rgb(0 0 0 / 0.12), 0 1px 2px rgb(0 0 0 / 0.18);',
    '  --md-sys-elevation-3: 0 6px 18px 4px rgb(0 0 0 / 0.14), 0 2px 4px rgb(0 0 0 / 0.18);',
    ''
  ].join('\n')
}

function themeBlock(selector, scheme) {
  return [`${selector} {`, ...roleLines(scheme), '}'].join('\n')
}

const light = new SchemeVibrant(Hct.fromInt(argbFromHex(SOURCE)), false, 0)
const dark = new SchemeVibrant(Hct.fromInt(argbFromHex(SOURCE)), true, 0)

const css = [
  '/*',
  ' * Generated by scripts/generate-theme.mjs — do not edit by hand.',
  ` * Source color: ${SOURCE} · SchemeVibrant · contrast 0`,
  ' */',
  '',
  ':root {',
  ...roleLines(light),
  ...scaleBlock().split('\n').slice(1),
  '}',
  '',
  themeBlock("[data-theme='dark']", dark),
  '',
  '@media (prefers-color-scheme: dark) {',
  themeBlock("  :root[data-theme='system']", dark)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n'),
  '}',
  ''
].join('\n')

await mkdir(path.dirname(OUT), { recursive: true })
await writeFile(OUT, css, 'utf8')
console.log(`Wrote ${path.relative(ROOT, OUT)}`)
