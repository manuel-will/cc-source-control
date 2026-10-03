/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { ScBranch, ScCommit, ScFile, ScSnapshot, ScStash, ScView, ScWorktree } from '../../types'
import { OPERATION_NAMES } from '../actions'
import { t } from '../i18n'
import { clean, cutEnd, cutStart, shortPathOf } from '../format'
import { primaryButton } from './band'
import { icon, tintedIcon } from './icons'
import { graphCells, graphSource, LANE_COLORS, LANE_THEME, LANE_WIDTH, layoutGraph, ROW_HEIGHT } from './graph'
import type { GraphEntry, GraphRow } from './graph'
import type { Handlers } from './handlers'
import { branchTextOf, canPublish, changeCountOf, countsOf, freshnessOf, operationTextOf } from './model'
import { COLOR, GLYPH, LETTER_COLOR } from './theme'
import type { Kit } from './theme'

/**
 * The panel's id, its `requestId` in `ui.render`.
 */
export const PANE_ID = 'source-control'

/**
 * The panel's title, shown on its tab while several panes are open.
 */
export const PANE_TITLE = 'Source Control'

/**
 * How tall the panel asks to be when the surface seats it inline above the
 * prompt (a docked pane takes the transcript's height anyway).
 */
export const PANE_ROWS = 24

/**
 * Inline, the engine draws its close mark at the first row's right edge.
 */
const INLINE_MARK_COLUMNS = 2

function rule(kit: Kit): RenderElement {
  const { Text } = kit

  return (
    <Text dimColor wrap="truncate-end">
      {GLYPH.rule.repeat(Math.max(1, kit.columns))}
    </Text>
  )
}

function dimLine(kit: Kit, text: string): RenderElement {
  const { Text } = kit

  return (
    <Text dimColor wrap="truncate-end">
      {text}
    </Text>
  )
}

/**
 * A section's foldable header: VS Code's capitals on the terminal, the
 * app's sentence case with a quiet count where it draws native controls.
 */
function sectionHeader(
  kit: Kit,
  handlers: Handlers,
  id: string,
  title: string,
  count: number | null,
  isFolded: boolean,
  tail: RenderElement | null = null,
): RenderElement {
  const { Box, Button, Text } = kit
  const fold = isFolded ? GLYPH.closed : GLYPH.open

  if (kit.surface === 'terminal') {
    return (
      <Box flexDirection="row" marginTop={1}>
        <Button key={`fold:${id}`} plain dimColor onPress={() => handlers.toggleFold(id)}>
          {`${fold} ${title.toUpperCase()}${count === null ? '' : ` ${count}`}`}
        </Button>
        <Box flexGrow={1} />
        {tail}
      </Box>
    )
  }

  return (
    <Box flexDirection="row" alignItems="center" marginTop={1}>
      <Button key={`fold:${id}`} plain onPress={() => handlers.toggleFold(id)}>
        {`${fold} ${title}`}
      </Button>
      {count !== null && (
        <Box marginLeft={1}>
          <Text dimColor>{String(count)}</Text>
        </Box>
      )}
      <Box flexGrow={1} />
      {tail}
    </Box>
  )
}

function fileRow(kit: Kit, handlers: Handlers, file: ScFile, action: 'stage' | 'unstage'): RenderElement {
  const { Box, Button, Text } = kit
  const room = Math.max(8, kit.columns - 2 - 3)
  const paths = file.from !== null && action === 'unstage' ? [file.path, file.from] : [file.path]
  const shown = file.from !== null ? `${file.path} ← ${file.from}` : file.path

  // where the surface has a pointer, + and − show on the hovered row, as
  // VS Code's do; the terminal keeps them in sight for the keyboard
  const hasPointer = kit.Svg !== null

  return (
    <Box key={`row:${action}:${file.path}`} flexDirection="row">
      <Text color={LETTER_COLOR[file.letter] ?? COLOR.muted}>{`${file.letter} `}</Text>
      <Text wrap="truncate-start">{cutStart(clean(shown), room)}</Text>
      <Box flexGrow={1} />
      <Box marginLeft={2} {...(hasPointer ? { display: 'none' as const, hover: { display: 'flex' as const } } : {})}>
        <Button
          key={`${action}:${file.path}`}
          plain
          dimColor
          onPress={() => handlers.act(action, { paths })}
        >
          {action === 'stage' ? GLYPH.stage : GLYPH.unstage}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * The remote's line: its name, then its address, a link to the web page
 * where the address is a plain host and path (GitHub, GitLab, …).
 */
function remoteRow(kit: Kit, name: string, address: string): RenderElement {
  const { Box, Text } = kit
  const href = /^[a-z0-9.-]+\.[a-z]{2,}\/[\w.\/-]+$/i.test(address) ? new URL(`https://${address}`).href : null
  const { Link } = kit

  return (
    <Box flexDirection="row">
      <Box flexShrink={0}>
        <Text dimColor>{`${clean(name)} ·`}</Text>
      </Box>
      <Box marginLeft={1} flexShrink={1}>
        {href !== null && Link !== null ? (
          <Link href={href} label={clean(address)} />
        ) : (
          <Text dimColor wrap="truncate-end">
            {clean(address)}
          </Text>
        )}
      </Box>
    </Box>
  )
}

/**
 * A branch on a history row. The terminal draws VS Code's colored pill;
 * the app, whose controls are round, the branch's icon (a cloud for a
 * remote one) and its name in the color, without a block behind.
 */
function badge(kit: Kit, name: string, color: { text: string; hex: string }, side: 'local' | 'remote'): RenderElement {
  const { Box, Text } = kit
  const mark = tintedIcon(kit, side === 'local' ? 'branch' : 'cloud', color.hex)

  if (mark === null) {
    return (
      <Text backgroundColor={color.text} color={COLOR.badgeText}>
        {` ${clean(name)} `}
      </Text>
    )
  }

  return (
    <Box flexDirection="row" alignItems="center">
      {mark}
      <Text color={color.text}>{clean(name)}</Text>
    </Box>
  )
}

/**
 * The graph's cells in front of a history row: a row of the lanes as SVG
 * where the surface draws it, else `git log --graph`-like glyphs.
 */
function lanes(kit: Kit, row: GraphRow, width: number): RenderElement {
  const { Box, Svg, Text } = kit

  if (Svg !== null) {
    return (
      <Box marginRight={1}>
        <Svg source={graphSource(row, width)} alt="│" width={width * LANE_WIDTH} height={ROW_HEIGHT} />
      </Box>
    )
  }

  return (
    <Text>
      {graphCells(row, width).map(cell =>
        cell.color === null ? `${cell.glyph} ` : <Text color={LANE_THEME[cell.color]}>{`${cell.glyph} `}</Text>,
      )}
    </Text>
  )
}

/**
 * How many cells the graph takes in front of a row.
 */
function lanesColumns(kit: Kit, width: number): number {
  return kit.Svg === null ? width * 2 : Math.ceil((width * LANE_WIDTH) / 8) + 1
}

/**
 * A branch pill's color: its lane's, as VS Code colors them, where a merge
 * opened the lane; on the main lanes blue for a local branch, purple for a
 * remote one.
 */
function pillColorOf(kit: Kit, row: GraphRow, side: 'local' | 'remote'): { text: string; hex: string } {
  const lane = row.nodeColor

  if (lane === 'grey' || lane === 'blue' || lane === 'purple') {
    return side === 'local'
      ? { text: COLOR.local, hex: LANE_COLORS.blue }
      : { text: COLOR.remote, hex: LANE_COLORS.purple }
  }

  // the terminal takes theme colors, the app the lane's own
  return { text: kit.surface === 'terminal' ? LANE_THEME[lane] : rgbOf(LANE_COLORS[lane]), hex: LANE_COLORS[lane] }
}

function rgbOf(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)

  return `rgb(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255})`
}

function commitRow(kit: Kit, commit: ScCommit, row: GraphRow, width: number): RenderElement {
  const { Box, Text } = kit

  const names = [
    ...commit.heads.map(name => ({ name, side: 'local' as const, color: pillColorOf(kit, row, 'local') })),
    ...commit.remotes.map(name => ({ name, side: 'remote' as const, color: pillColorOf(kit, row, 'remote') })),
  ]

  const badgeRoom = Math.floor(kit.columns / 2)
  const shownNames: typeof names = []
  let used = 0

  for (const named of names) {
    const nameWidth = named.name.length + 3

    if (used + nameWidth > badgeRoom) {
      break
    }

    shownNames.push(named)
    used += nameWidth
  }

  const room = Math.max(8, kit.columns - lanesColumns(kit, width) - used)

  return (
    <Box flexDirection="row" alignItems="center">
      {lanes(kit, row, width)}
      <Text bold={commit.isHead} dimColor={commit.side === 'shared' && !commit.isHead} wrap="truncate-end">
        {cutEnd(clean(commit.subject), room)}
      </Text>
      <Box flexGrow={1} />
      {shownNames.map(named => (
        <Box marginLeft={kit.surface === 'terminal' ? 1 : 2}>{badge(kit, named.name, named.color, named.side)}</Box>
      ))}
    </Box>
  )
}

function virtualRow(kit: Kit, label: string, color: string, tail: string, row: GraphRow, width: number): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="row" alignItems="center">
      {lanes(kit, row, width)}
      <Text color={color}>{label}</Text>
      <Box flexGrow={1} />
      <Text dimColor>{tail}</Text>
    </Box>
  )
}

function moreRow(kit: Kit, text: string, row: GraphRow, width: number): RenderElement {
  const { Box, Text } = kit

  return (
    <Box flexDirection="row" alignItems="center">
      {lanes(kit, row, width)}
      <Text dimColor>{text}</Text>
    </Box>
  )
}

function branchRow(kit: Kit, branch: ScBranch, isConfirmed: boolean): RenderElement {
  const { Box, Text } = kit
  const counts = countsOf(branch)

  const tail = branch.isGone ? (
    <Text dimColor>{t().goneOnRemote}</Text>
  ) : branch.upstream === null ? (
    <Text dimColor>{t().localOnly}</Text>
  ) : counts !== '' ? (
    <Text>
      {branch.behind > 0 && <Text color={COLOR.behind}>{`${branch.behind}${GLYPH.behind}`}</Text>}
      {branch.behind > 0 && branch.ahead > 0 && ' '}
      {branch.ahead > 0 && <Text color={COLOR.ahead}>{`${branch.ahead}${GLYPH.ahead}`}</Text>}
    </Text>
  ) : (
    <Text color={isConfirmed ? COLOR.ok : COLOR.muted}>{GLYPH.clean}</Text>
  )

  return (
    <Box flexDirection="row">
      <Text color={branch.isCurrent ? COLOR.local : COLOR.muted}>{branch.isCurrent ? '* ' : '  '}</Text>
      <Text bold={branch.isCurrent} wrap="truncate-end">
        {cutEnd(clean(branch.name), Math.max(8, kit.columns - 24))}
      </Text>
      <Box flexGrow={1} />
      {tail}
    </Box>
  )
}

function worktreeRow(kit: Kit, tree: ScWorktree): RenderElement {
  const { Box, Text } = kit

  const state = tree.isPrunable ? (
    <Text dimColor>{t().missing}</Text>
  ) : tree.dirty === null ? (
    <Text dimColor>–</Text>
  ) : tree.dirty > 0 ? (
    <Box flexDirection="row" alignItems="center">
      {icon(kit, 'edit', 'muted')}
      <Text>{`${tree.dirty}`}</Text>
    </Box>
  ) : (
    <Text dimColor>{t().clean}</Text>
  )

  const branch = tree.branch ?? `${tree.head} (detached)`
  const pathRoom = Math.max(8, kit.columns - 4 - Math.min(branch.length, 18) - 10)

  return (
    <Box flexDirection="row">
      <Text color={tree.isCurrent ? COLOR.local : COLOR.muted}>{tree.isCurrent ? '* ' : '  '}</Text>
      <Text bold={tree.isCurrent} wrap="truncate-start">
        {cutStart(clean(shortPathOf(tree.path)), pathRoom)}
      </Text>
      <Box flexGrow={1} />
      <Text color={COLOR.local}>{cutEnd(clean(branch), 18)}</Text>
      <Box marginLeft={1}>{state}</Box>
    </Box>
  )
}

function stashRow(kit: Kit, stash: ScStash): RenderElement {
  const { Text } = kit

  return (
    <Text wrap="truncate-end">
      <Text dimColor>{`${stash.ref} `}</Text>
      {cutEnd(clean(stash.subject), Math.max(8, kit.columns - stash.ref.length - 1))}
    </Text>
  )
}

function headerRow(kit: Kit, handlers: Handlers, isBusy: boolean, isDocked: boolean): RenderElement {
  const { Box, Button, Text } = kit
  const isNarrow = kit.columns < 44

  const hasChrome = kit.Svg !== null

  const tool = (key: string, iconName: 'fetch' | 'pull' | 'push', label: string, onPress: () => void) => (
    <Box flexDirection="row" alignItems="center" marginLeft={hasChrome ? 2 : 1}>
      {hasChrome && icon(kit, iconName)}
      <Button key={key} plain dimColor onPress={() => (isBusy ? undefined : onPress())}>
        {hasChrome ? label : `${iconName === 'fetch' ? GLYPH.sync : iconName === 'pull' ? GLYPH.behind : GLYPH.ahead} ${label}`}
      </Button>
    </Box>
  )

  return (
    <Box flexDirection="row" paddingRight={isDocked ? 0 : INLINE_MARK_COLUMNS}>
      {!hasChrome && <Text bold>{isNarrow ? t().titleNarrow : t().title}</Text>}
      <Box flexGrow={1} />
      {tool('tool:fetch', 'fetch', t().fetch, () => handlers.act('fetch'))}
      {tool('tool:pull', 'pull', t().pull, () => handlers.act('pull'))}
      {tool('tool:push', 'push', t().push, () => handlers.act('push'))}
    </Box>
  )
}

function infoRow(kit: Kit, snapshot: ScSnapshot, view: ScView, staleAfterMs: number): RenderElement {
  const { Box, Text } = kit
  const freshness = freshnessOf(snapshot, view, staleAfterMs)

  return (
    <Box flexDirection="row" alignItems="center">
    {icon(kit, 'branch', 'muted', COLOR.muted)}
    <Text wrap="truncate-end">
      <Text bold>{clean(branchTextOf(snapshot))}</Text>
      {snapshot.upstream !== null ? (
        <Text>
          <Text color={COLOR.muted}>{' → '}</Text>
          <Text color={COLOR.remote}>{clean(snapshot.upstream)}</Text>
        </Text>
      ) : (
        <Text color={COLOR.muted}>{` · ${snapshot.isUnborn ? t().noCommitsYet : t().noUpstream}`}</Text>
      )}
      {snapshot.behind > 0 && <Text color={COLOR.behind}>{` ${snapshot.behind}${GLYPH.behind}`}</Text>}
      {snapshot.ahead > 0 && <Text color={COLOR.ahead}>{` ${snapshot.ahead}${GLYPH.ahead}`}</Text>}
      {freshness !== null && (
        <Text color={freshness.isWarning ? COLOR.warn : COLOR.muted}>
          {` · ${freshness.isAge ? t().checked(freshness.text) : freshness.text}`}
        </Text>
      )}
    </Text>
    </Box>
  )
}

function actionRow(kit: Kit, snapshot: ScSnapshot, view: ScView, handlers: Handlers): RenderElement | null {
  const { Box, Button } = kit
  const isBusy = view.busy !== null
  const changes = changeCountOf(snapshot)
  const counts = countsOf(snapshot)
  const canSync = snapshot.upstream !== null && counts !== ''
  const elements: RenderElement[] = []

  const operation = snapshot.operation
  const abort = (label: string) => (
    <Box marginLeft={1}>
      <Button key="pane-abort" onPress={() => handlers.act('abortOperation')}>
        {label}
      </Button>
    </Box>
  )

  if (isBusy) {
    elements.push(primaryButton(kit, 'pane-primary', null, view.busy ?? '', () => undefined, true, true))
  } else if (snapshot.conflicts.length > 0) {
    elements.push(primaryButton(kit, 'pane-primary', 'conflict', t().askClaude, () => handlers.askClaude(), false, true))

    if (operation !== null) {
      elements.push(abort(t().abortOperation(OPERATION_NAMES[operation])))
    }
  } else if (operation !== null) {
    elements.push(
      primaryButton(
        kit,
        'pane-primary',
        'commit',
        t().finishOperation(OPERATION_NAMES[operation]),
        () => (operation === 'merge' ? handlers.commit() : handlers.act('continueOperation')),
        false,
        true,
      ),
    )
    elements.push(abort(t().abortOperation(OPERATION_NAMES[operation])))
  } else if (changes > 0) {
    const label =
      snapshot.staged.length > 0
        ? t().commitStaged(snapshot.staged.length)
        : snapshot.unstaged.length > 0
          ? t().commitAll(snapshot.unstaged.length)
          : t().commit

    elements.push(primaryButton(kit, 'pane-primary', 'commit', label, () => handlers.commit(), false, true))

    if (canSync) {
      elements.push(
        <Box marginLeft={1}>
          <Button key="pane-sync" onPress={() => handlers.act('sync')}>
            {kit.Svg === null ? `${GLYPH.sync} ${t().sync(counts)}` : t().sync(counts)}
          </Button>
        </Box>,
      )
    }
  } else if (canPublish(snapshot)) {
    elements.push(primaryButton(kit, 'pane-primary', 'publish', t().publishBranch, () => handlers.act('publish'), false, true))
  } else if (canSync) {
    elements.push(primaryButton(kit, 'pane-primary', 'sync', t().syncChanges(counts), () => handlers.act('sync'), false, true))
  }

  return elements.length === 0 ? null : <Box flexDirection="row" marginTop={kit.Svg === null ? 0 : 1}>{elements}</Box>
}

/**
 * How many incoming commits the history lists before it sums up the rest.
 */
const INCOMING_SHOWN = 5

function historyRows(kit: Kit, snapshot: ScSnapshot): RenderElement[] {
  const details = snapshot.details

  if (details === null) {
    return [dimLine(kit, t().loading)]
  }

  type Entry =
    | { kind: 'header'; label: string; color: string; tail: string; graph: GraphEntry }
    | { kind: 'commit'; commit: ScCommit; graph: GraphEntry }
    | { kind: 'more'; text: string; graph: GraphEntry }

  const asGraph = (commit: ScCommit): GraphEntry => ({ kind: 'commit', hash: commit.hash, parents: commit.parents, side: commit.side })
  const entries: Entry[] = []
  const shownIncoming = details.incoming.slice(0, INCOMING_SHOWN)

  if (details.incoming.length > 0 || snapshot.behind > 0) {
    entries.push({
      kind: 'header',
      label: t().incoming,
      color: COLOR.remote,
      tail: t().commits(snapshot.behind),
      graph: { kind: 'header', next: details.incoming[0]?.hash ?? null, side: 'incoming' },
    })
    entries.push(...shownIncoming.map(commit => ({ kind: 'commit' as const, commit, graph: asGraph(commit) })))

    const rest = snapshot.behind - shownIncoming.length

    if (rest > 0) {
      const hidden = details.incoming.slice(INCOMING_SHOWN).map(commit => ({ hash: commit.hash, parents: commit.parents }))

      entries.push({ kind: 'more', text: t().more(rest), graph: { kind: 'gap', hidden } })
    }
  }

  if (snapshot.ahead > 0) {
    entries.push({
      kind: 'header',
      label: t().outgoing,
      color: COLOR.local,
      tail: t().commits(snapshot.ahead),
      graph: { kind: 'header', next: details.history[0]?.hash ?? null, side: 'outgoing' },
    })
  }

  entries.push(...details.history.map(commit => ({ kind: 'commit' as const, commit, graph: asGraph(commit) })))

  if (entries.length === 0) {
    return [dimLine(kit, t().noCommits)]
  }

  const known = new Set([...details.incoming, ...details.history].map(commit => commit.hash))
  const fallback = details.history.find(commit => commit.side === 'shared')?.hash ?? null
  const { rows, width } = layoutGraph(entries.map(entry => entry.graph), known, fallback)

  return entries.map((entry, index) => {
    const row = rows[index] as GraphRow

    if (entry.kind === 'header') {
      return virtualRow(kit, entry.label, entry.color, entry.tail, row, width)
    }

    if (entry.kind === 'more') {
      return moreRow(kit, entry.text, row, width)
    }

    return commitRow(kit, entry.commit, row, width)
  })
}

/**
 * The Source Control panel: header and toolbar, branch line, notices, the
 * commit field and the blue button, the changes, the history, branches,
 * worktrees and stashes; each section folds.
 *
 * @param kit the surface's elements and the body's width
 * @param snapshot the repository as last read, null outside one
 * @param view the drawings' own state
 * @param handlers what the controls do
 * @param staleAfterMs when the last fetch counts as old
 * @param isDocked docked beside the transcript, where the engine draws its
 *   close mark in the first row
 * @returns the panel's tree
 */
export function paneView(
  kit: Kit,
  snapshot: ScSnapshot | null,
  view: ScView,
  handlers: Handlers,
  staleAfterMs: number,
  isDocked: boolean,
): RenderElement {
  const { Box, Button, Text } = kit
  const isBusy = view.busy !== null
  const isFolded = (id: string) => view.folded.includes(id)
  const top = headerRow(kit, handlers, isBusy, isDocked)
  // the terminal draws a docked pane's close mark in its first row; the
  // desktop puts it in a title bar of its own
  const hasMarkRow = isDocked && kit.Svg === null

  if (snapshot === null) {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={hasMarkRow ? 1 : 0}>
        {top}
        {dimLine(kit, t().noRepository)}
      </Box>
    )
  }

  const details = snapshot.details
  const conflictCount = snapshot.conflicts.length

  const operation =
    snapshot.operation !== null
      ? `${t().operationRunning(OPERATION_NAMES[snapshot.operation])} · ${conflictCount > 0 ? t().conflicts(conflictCount) : t().allConflictsResolved}`
      : operationTextOf(snapshot)
  const notice = view.notice
  const noticeColor = notice?.tone === 'error' ? COLOR.error : notice?.tone === 'success' ? COLOR.ok : COLOR.muted
  const target = snapshot.branch ?? 'HEAD'
  // the message field only while there is something to commit (or a merge
  // to conclude), so a clean repository shows no commit control at all
  const canCommit = changeCountOf(snapshot) > 0 || snapshot.operation === 'merge'
  const { Input } = kit

  const sections: (RenderElement | null | false)[] = []

  if (snapshot.conflicts.length > 0) {
    sections.push(sectionHeader(kit, handlers, 'conflicts', t().conflictsSection, snapshot.conflicts.length, isFolded('conflicts')))

    if (!isFolded('conflicts')) {
      sections.push(dimLine(kit, t().conflictsHint))
      sections.push(...snapshot.conflicts.map(file => fileRow(kit, handlers, file, 'stage')))
    }
  }

  if (snapshot.staged.length > 0) {
    sections.push(
      sectionHeader(
        kit,
        handlers,
        'staged',
        t().stagedSection,
        snapshot.staged.length,
        isFolded('staged'),
        <Button key="unstage-all" plain dimColor onPress={() => handlers.act('unstageAll')}>
          {`${GLYPH.unstage} ${t().all}`}
        </Button>,
      ),
    )

    if (!isFolded('staged')) {
      sections.push(...snapshot.staged.map(file => fileRow(kit, handlers, file, 'unstage')))
    }
  }

  sections.push(
    sectionHeader(
      kit,
      handlers,
      'changes',
      t().changesSection,
      snapshot.unstaged.length,
      isFolded('changes'),
      snapshot.unstaged.length > 0 ? (
        <Button key="stage-all" plain dimColor onPress={() => handlers.act('stageAll')}>
          {`${GLYPH.stage} ${t().all}`}
        </Button>
      ) : null,
    ),
  )

  if (!isFolded('changes')) {
    sections.push(
      ...(snapshot.unstaged.length > 0
        ? snapshot.unstaged.map(file => fileRow(kit, handlers, file, 'stage'))
        : [dimLine(kit, changeCountOf(snapshot) === 0 ? `${t().noChanges} ${GLYPH.clean}` : conflictCount > 0 ? t().noOtherChanges : t().allStaged)]),
    )
  }

  sections.push(sectionHeader(kit, handlers, 'history', t().historySection, null, isFolded('history')))

  if (!isFolded('history')) {
    sections.push(...historyRows(kit, snapshot))
  }

  if (details !== null) {
    sections.push(sectionHeader(kit, handlers, 'branches', t().branchesSection, details.branches.length, isFolded('branches')))

    if (!isFolded('branches')) {
      sections.push(...details.branches.map(branch => branchRow(kit, branch, view.fetchError === null)))
    }

    if (details.worktrees.length > 1) {
      sections.push(sectionHeader(kit, handlers, 'worktrees', t().worktreesSection, details.worktrees.length, isFolded('worktrees')))

      if (!isFolded('worktrees')) {
        sections.push(...details.worktrees.map(tree => worktreeRow(kit, tree)))
      }
    }

    if (details.stashes.length > 0) {
      sections.push(sectionHeader(kit, handlers, 'stashes', t().stashesSection, details.stashes.length, isFolded('stashes')))

      if (!isFolded('stashes')) {
        sections.push(...details.stashes.map(stash => stashRow(kit, stash)))
      }
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={hasMarkRow ? 1 : 0}>
      {top}
      {infoRow(kit, snapshot, view, staleAfterMs)}
      {details?.remote != null && remoteRow(kit, snapshot.remoteName ?? 'remote', details.remote)}
      {snapshot.isLinkedWorktree && dimLine(kit, t().worktreeOf(shortPathOf(snapshot.commonDir.replace(/[\\/]\.git[\\/]?$/, ''))))}
      {operation !== null && <Text color={conflictCount > 0 ? COLOR.error : COLOR.warn} wrap="wrap">{operation}</Text>}
      {view.fetchError !== null && <Text color={COLOR.warn} wrap="wrap">{t().fetchFailed(view.fetchError)}</Text>}
      {notice !== null && notice.text !== view.fetchError && <Text color={noticeColor} wrap="wrap">{notice.text}</Text>}
      {notice?.retry === 'autostash' && !isBusy && (
        <Box flexDirection="row">
          <Button key="retry-autostash" onPress={() => handlers.act('pullAutostash')}>
            {t().pullAutostash}
          </Button>
        </Box>
      )}
      {kit.Svg === null ? rule(kit) : <Box marginTop={1} />}
      {Input !== null && canCommit && (
        <Input
          key={`message-${view.commitField}`}
          placeholder={t().messagePlaceholder(target)}
          submitLabel={kit.Svg === null ? 'commit' : '↵'}
          autoFocus
          onInput={value => handlers.draft(value)}
          onSubmit={value => handlers.commit(value)}
        />
      )}
      {actionRow(kit, snapshot, view, handlers)}
      {details?.hasHooks === true && dimLine(kit, t().hooksHint)}
      {sections}
    </Box>
  )
}
