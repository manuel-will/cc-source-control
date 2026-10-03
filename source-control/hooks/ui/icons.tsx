/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { GLYPH } from './theme'
import type { Kit } from './theme'

/**
 * Line icons in the desktop app's own style (thin, round caps, 24-unit
 * grid as Lucide draws them), for the motifs VS Code's Source Control uses.
 */
const PATHS = {
  branch:
    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10"/><path d="M18 9c0 5-6 4-11.5 8.5"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
  pull: '<path d="M12 4v14"/><path d="m6 12 6 6 6-6"/><path d="M5 21h14"/>',
  push: '<path d="M12 20V6"/><path d="m6 12 6-6 6 6"/><path d="M5 3h14"/>',
  fetch: '<path d="M7 18a5 5 0 0 1-.6-9.96A6.5 6.5 0 0 1 19 9.5a4.5 4.5 0 0 1-.5 8.5"/><path d="M12 12v8"/><path d="m9 17 3 3 3-3"/>',
  publish: '<path d="M7 18a5 5 0 0 1-.6-9.96A6.5 6.5 0 0 1 19 9.5a4.5 4.5 0 0 1-.5 8.5"/><path d="M12 20v-8"/><path d="m9 15 3-3 3 3"/>',
  commit: '<circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5"/><path d="M15.5 12H21"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  conflict: '<path d="M12 3 2.5 20h19Z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/>',
  edit: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
} as const

export type IconName = keyof typeof PATHS

/**
 * Colors an icon can take: `muted` follows the app's light or dark scheme,
 * the rest are fixed (they sit on their own backgrounds or carry meaning).
 */
const STROKES = {
  muted: { light: '#71717a', dark: '#a1a1aa' },
  text: { light: '#27272a', dark: '#e4e4e7' },
  white: { light: '#ffffff', dark: '#ffffff' },
  blue: { light: '#2563eb', dark: '#8ea2ff' },
  purple: { light: '#7c3aed', dark: '#b18cff' },
  green: { light: '#16a34a', dark: '#4ade80' },
  red: { light: '#dc2626', dark: '#f87171' },
} as const

export type IconColor = keyof typeof STROKES

/**
 * An icon color's stroke in the light and the dark scheme.
 */
export function strokesOf(color: IconColor): { light: string; dark: string } {
  return STROKES[color]
}

/**
 * The icon's SVG document; its stroke follows `prefers-color-scheme`, which
 * an image's markup reads from the page drawing it.
 */
export function iconSource(name: IconName, color: IconColor): string {
  const stroke = STROKES[color]

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    `<style>g{stroke:${stroke.light}}@media (prefers-color-scheme: dark){g{stroke:${stroke.dark}}}</style>` +
    `<g>${PATHS[name]}</g></svg>`
  )
}

const FALLBACK: Readonly<Record<IconName, string>> = {
  branch: GLYPH.branch,
  sync: GLYPH.sync,
  pull: GLYPH.behind,
  push: GLYPH.ahead,
  fetch: GLYPH.sync,
  publish: GLYPH.publish,
  commit: GLYPH.commit,
  check: GLYPH.clean,
  conflict: '',
  edit: GLYPH.changes,
  cloud: '',
}

/**
 * An icon in one fixed color (a graph lane's), given as an attribute as the
 * graph's are, for the surfaces that draw SVG.
 */
export function tintedIcon(kit: Kit, name: IconName, hex: string): RenderElement | null {
  const { Box, Svg } = kit

  if (Svg === null) {
    return null
  }

  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${hex}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`

  return (
    <Box marginRight={1} alignItems="center">
      <Svg source={source} alt={name} width={13} height={13} />
    </Box>
  )
}

/**
 * The icon's single-width stand-in on the terminal.
 */
export function glyphOf(name: IconName): string {
  return FALLBACK[name]
}

/**
 * The icon where the surface draws SVG (desktop, editor, phone), followed
 * by a space's room; on the terminal its single-width glyph and a space.
 *
 * @param kit the surface's elements
 * @param name which icon
 * @param color its color on an SVG surface
 * @param glyphColor the terminal glyph's theme color, if any
 */
export function icon(kit: Kit, name: IconName, color: IconColor = 'muted', glyphColor?: string): RenderElement {
  const { Box, Svg, Text } = kit

  if (Svg === null) {
    return <Text {...(glyphColor ? { color: glyphColor } : { dimColor: true })}>{`${FALLBACK[name]} `}</Text>
  }

  return (
    <Box marginRight={1} alignItems="center">
      <Svg source={iconSource(name, color)} alt={name} width={14} height={14} />
    </Box>
  )
}
