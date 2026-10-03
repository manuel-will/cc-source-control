/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { ScSnapshot, ScView } from '../../types'
import { clean, cutEnd } from '../format'
import type { Handlers } from './handlers'
import {
  branchTextOf,
  changeCountOf,
  freshnessOf,
  isConfirmedSettled,
  operationTextOf,
  primaryOf,
} from './model'
import type { Primary } from './model'
import { t } from '../i18n'
import { glyphOf, icon } from './icons'
import type { IconName } from './icons'
import { COLOR, GLYPH, VSCODE_BLUE } from './theme'
import type { Kit } from './theme'

/**
 * Below this many cells the band drops its words and the fetch age.
 */
export const NARROW_COLUMNS = 60

/**
 * The terminal draws its own `[-]` (collapse the band) over the band's last
 * cells; the band keeps them free.
 */
const ENGINE_MARK_COLUMNS = 4

/**
 * The main button. On the terminal VS Code's blue: a blue box holding a
 * plain Button, a glyph in front. Where the app draws native buttons
 * (desktop, editor, phone) the app's own primary button, so it sits among
 * the app's other buttons as one of them.
 *
 * @param kit the surface's elements
 * @param key the Button's address
 * @param iconName the glyph before the label on the terminal, or null
 * @param label what the button says
 * @param onPress what it does
 * @param isBusy drawn dim while an action runs
 * @param isWide on the terminal as wide as its row (the panel's, as VS Code's
 *   action button); the app's button keeps its own size
 */
export function primaryButton(
  kit: Kit,
  key: string,
  iconName: IconName | null,
  label: string,
  onPress: () => void,
  isBusy: boolean,
  isWide = false,
): RenderElement {
  const { Box, Button } = kit

  // the app's own button keeps the app's size, next to its neighbours
  if (kit.surface !== 'terminal') {
    return (
      <Box flexDirection="row">
        <Button key={key} variant="primary" dimColor={isBusy} onPress={onPress}>
          {label === '' ? ' ' : label}
        </Button>
      </Box>
    )
  }

  const shown = iconName !== null ? [glyphOf(iconName), label].filter(part => part !== '').join(' ') : label

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      backgroundColor={VSCODE_BLUE}
      paddingX={1}
      {...(isWide ? { flexGrow: 1, justifyContent: 'center' as const } : {})}
    >
      <Button key={key} plain dimColor={isBusy} onPress={onPress}>
        {shown === '' ? ' ' : shown}
      </Button>
    </Box>
  )
}

/**
 * The status half of the band: branch, counts, changes, what is going on,
 * and how fresh the remote side is.
 */
function statusText(kit: Kit, snapshot: ScSnapshot, view: ScView, staleAfterMs: number): RenderElement {
  const { Text } = kit
  const isNarrow = kit.columns < NARROW_COLUMNS
  const changes = changeCountOf(snapshot)
  const operation = operationTextOf(snapshot)
  const freshness = isNarrow ? null : freshnessOf(snapshot, view, staleAfterMs)
  const isUnpublished = snapshot.upstream === null && snapshot.branch !== null && snapshot.remoteName !== null && !snapshot.isUnborn
  const branchRoom = Math.max(8, Math.floor(kit.columns / 3))

  const { Box } = kit

  // the desktop draws the pencil as an icon (the glyph is an emoji there),
  // so the line breaks into the text before it and the text after it
  const hasIcons = kit.Svg !== null

  return (
    <Box flexDirection="row" alignItems="center">
      {icon(kit, 'branch', 'muted', COLOR.muted)}
      <Text wrap="truncate-end">
        <Text bold>{cutEnd(clean(branchTextOf(snapshot)), branchRoom)}</Text>
        {snapshot.behind > 0 && <Text color={COLOR.behind}>{` ${snapshot.behind}${GLYPH.behind}`}</Text>}
        {snapshot.ahead > 0 && <Text color={COLOR.ahead}>{` ${snapshot.ahead}${GLYPH.ahead}`}</Text>}
        {changes > 0 && !hasIcons && <Text>{`  ${GLYPH.changes} ${changes}`}</Text>}
      </Text>
      {changes > 0 && hasIcons && (
        <Box flexDirection="row" alignItems="center" marginLeft={2}>
          {icon(kit, 'edit', 'muted')}
          <Text>{`${changes}`}</Text>
        </Box>
      )}
      <Text wrap="truncate-end">
        {isConfirmedSettled(snapshot, view, staleAfterMs) && <Text color={COLOR.ok}>{` ${GLYPH.clean}`}</Text>}
        {operation !== null && <Text color={COLOR.error}>{` · ${operation}`}</Text>}
        {isUnpublished && !isNarrow && <Text color={COLOR.muted}>{` · ${t().unpublished}`}</Text>}
        {view.busy !== null && <Text color={COLOR.muted}>{` · ${view.busy}`}</Text>}
        {view.busy === null && freshness !== null && (
          <Text color={freshness.isWarning ? COLOR.warn : COLOR.muted}>{` · ${freshness.text}`}</Text>
        )}
      </Text>
    </Box>
  )
}

/**
 * The band above the prompt: status on the left; the blue button for the
 * one thing to do now and the panel toggle on the right.
 *
 * @param kit the surface's elements and the band's width
 * @param snapshot the repository as last read
 * @param view the drawings' own state
 * @param handlers what the buttons do
 * @param staleAfterMs when the last fetch counts as old
 * @returns the band's tree
 */
export function bandView(
  kit: Kit,
  snapshot: ScSnapshot,
  view: ScView,
  handlers: Handlers,
  staleAfterMs: number,
): RenderElement {
  const { Box, Button } = kit
  const primary: Primary | null = primaryOf(snapshot)
  const isNarrow = kit.columns < NARROW_COLUMNS
  const isBusy = view.busy !== null

  const primaryLabel = primary === null ? '' : isNarrow ? primary.short : primary.label
  const busyLabel = view.busy ?? ''

  return (
    <Box flexDirection="row" width="100%" paddingRight={kit.surface === 'terminal' ? ENGINE_MARK_COLUMNS : 0}>
      <Box flexShrink={1}>{statusText(kit, snapshot, view, staleAfterMs)}</Box>
      <Box flexGrow={1} />
      {primary !== null && (
        <Box marginLeft={1}>
          {primaryButton(kit, 'primary', isBusy ? null : primary.icon, isBusy ? busyLabel : primaryLabel, () => {
            if (!isBusy) {
              handlers.primary(primary.kind)
            }
          }, isBusy)}
        </Box>
      )}
      <Box marginLeft={1}>
        <Button key="panel" plain dimColor={!view.isPaneOpen} onPress={() => handlers.togglePane()}>
          {GLYPH.panel}
        </Button>
      </Box>
    </Box>
  )
}
