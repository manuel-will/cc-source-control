/**
 * The history graph's lanes, laid out as VS Code's graph does: each commit
 * sits on a lane, a merge opens a lane for its other parent, lanes that wait
 * for the same commit run into it there.
 */

/**
 * The lane colors: blue and purple for the outgoing and incoming side, grey
 * for the shared history, the rest for the lanes merges open. Mid tones, so
 * they read on the desktop's light and dark scheme alike.
 */
export const LANE_COLORS = {
  blue: '#4f8ff7',
  purple: '#a371f7',
  grey: '#8b8b8b',
  orange: '#e3a23b',
  pink: '#e5508a',
  teal: '#2fb5a5',
  green: '#3fb950',
} as const

export type LaneColor = keyof typeof LANE_COLORS

/**
 * The colors lanes opened by merges take in turn.
 */
const BRANCH_COLORS: readonly LaneColor[] = ['orange', 'pink', 'teal', 'green']

/**
 * More lanes than this are laid out but not drawn.
 */
export const MAX_LANES = 6

/**
 * One lane's piece of a row, in the color it has there.
 */
export type LaneSegment = { lane: number; color: LaneColor }

/**
 * One row of the graph: where its dot sits and how every lane crosses it.
 */
export type GraphRow = {
  /** the dot's lane; null for a row that only carries the lanes on */
  node: number | null
  /** the dot's color */
  nodeColor: LaneColor
  /** a hollow dot (the incoming and outgoing headers) */
  isHollow: boolean
  /** the node's lane comes in from the row above */
  hasAbove: boolean
  /** that lane's color above the dot */
  aboveColor: LaneColor
  /** the lane runs on below the dot (straight down) */
  hasBelow: boolean
  /** lanes passing straight through the row */
  through: LaneSegment[]
  /** lanes from above that end in the dot */
  endsIn: LaneSegment[]
  /** lanes the dot opens below it, for a merge's other parents */
  startsOut: LaneSegment[]
  /** dashed: lanes carried past commits not listed */
  isGap: boolean
}

/**
 * What the graph lays out, top to bottom: commits with their parents, the
 * hollow header rows, and a row standing for commits not listed one by one.
 */
export type GraphEntry =
  | { kind: 'commit'; hash: string; parents: readonly string[]; side: 'incoming' | 'outgoing' | 'shared' }
  | { kind: 'header'; next: string | null; side: 'incoming' | 'outgoing' }
  | { kind: 'gap'; hidden: readonly { hash: string; parents: readonly string[] }[] }

type Lane = { expects: string; color: LaneColor } | null

const SIDE_COLORS = { incoming: 'purple', outgoing: 'blue' } as const

/**
 * The colors of the main lanes (not one a merge opened).
 */
const SIDE_LANE_COLORS = { blue: true, purple: true, grey: true } as const

/**
 * Lays out the graph for the rows.
 *
 * @param entries the rows, top to bottom
 * @param known every commit hash some row stands for (a lane waiting for one
 *   outside them, past the end of a cut-off list, is led to `fallback`)
 * @param fallback where such lanes lead: the first shared commit
 * @returns one GraphRow per entry and how many lanes the widest row has
 */
export function layoutGraph(
  entries: readonly GraphEntry[],
  known: ReadonlySet<string>,
  fallback: string | null,
): { rows: GraphRow[]; width: number } {
  const lanes: Lane[] = []
  let width = 0
  let branchColor = 0

  const free = (skip = -1) => {
    const index = lanes.findIndex((lane, at) => lane === null && at !== skip)

    return index === -1 ? lanes.length : index
  }

  const active = (except: ReadonlySet<number>) =>
    lanes.flatMap((lane, at) => (lane !== null && !except.has(at) ? [{ lane: at, color: lane.color }] : []))

  const trim = () => {
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }
  }

  // a commit's effect on the lanes, drawn or not
  const place = (hash: string, parents: readonly string[], side: 'incoming' | 'outgoing' | 'shared') => {
    let node = lanes.findIndex(lane => lane?.expects === hash)
    const hasAbove = node !== -1

    if (node === -1) {
      node = free()
    }

    // a lane a merge opened keeps its color down to where it joins, as in
    // VS Code; the main lanes are the side's color, grey once shared
    const before = lanes[node]
    const isSideLane = before === null || before === undefined || before.color in SIDE_LANE_COLORS
    const color: LaneColor = !isSideLane ? before.color : side === 'shared' ? 'grey' : SIDE_COLORS[side]

    const endsIn: LaneSegment[] = []

    lanes.forEach((lane, at) => {
      if (at !== node && lane?.expects === hash) {
        endsIn.push({ lane: at, color: lane.color })
        lanes[at] = null
      }
    })

    const through = active(new Set([node, ...endsIn.map(segment => segment.lane)]))
    const [first, ...others] = parents
    const startsOut: LaneSegment[] = []

    lanes[node] = first === undefined ? null : { expects: first, color }

    for (const parent of others) {
      const waiting = lanes.findIndex(lane => lane?.expects === parent)

      if (waiting !== -1) {
        startsOut.push({ lane: waiting, color: lanes[waiting]?.color ?? color })
        continue
      }

      const opened = free(node)
      const laneColor = BRANCH_COLORS[branchColor++ % BRANCH_COLORS.length] ?? 'orange'

      lanes[opened] = { expects: parent, color: laneColor }
      startsOut.push({ lane: opened, color: laneColor })
    }

    trim()

    const row: GraphRow = {
      node,
      nodeColor: color,
      isHollow: false,
      hasAbove,
      aboveColor: before?.color ?? color,
      hasBelow: first !== undefined,
      through,
      endsIn,
      startsOut,
      isGap: false,
    }

    return row
  }

  // lanes waiting for a commit no row stands for go to the fallback
  const settle = () => {
    lanes.forEach((lane, at) => {
      if (lane !== null && !known.has(lane.expects)) {
        lanes[at] = fallback === null ? null : { ...lane, expects: fallback }
      }
    })
    trim()
  }

  const rows = entries.map(entry => {
    if (entry.kind === 'commit') {
      const row = place(entry.hash, entry.parents, entry.side)

      width = Math.max(width, lanes.length, (row.node ?? 0) + 1, ...row.endsIn.map(segment => segment.lane + 1))

      return row
    }

    if (entry.kind === 'header') {
      // the hollow dot on the lane the next commit takes, leading into it
      settle()

      const waiting = entry.next === null ? -1 : lanes.findIndex(lane => lane?.expects === entry.next)
      const node = waiting === -1 ? free() : waiting
      const color: LaneColor = SIDE_COLORS[entry.side]
      const row: GraphRow = {
        node,
        nodeColor: color,
        isHollow: true,
        hasAbove: waiting !== -1,
        aboveColor: lanes[node]?.color ?? color,
        hasBelow: entry.next !== null,
        through: active(new Set([node])),
        endsIn: [],
        startsOut: [],
        isGap: false,
      }

      if (entry.next !== null) {
        lanes[node] = { expects: entry.next, color }
      }

      width = Math.max(width, lanes.length, node + 1)

      return row
    }

    for (const commit of entry.hidden) {
      place(commit.hash, commit.parents, 'incoming')
      width = Math.max(width, lanes.length)
    }

    settle()

    const row: GraphRow = {
      node: null,
      nodeColor: 'grey',
      isHollow: false,
      hasAbove: false,
      aboveColor: 'grey',
      hasBelow: false,
      through: active(new Set()),
      endsIn: [],
      startsOut: [],
      isGap: true,
    }

    return row
  })

  return { rows, width: Math.min(Math.max(width, 1), MAX_LANES) }
}

/**
 * How tall a row of the graph is, in CSS pixels: one line of the panel's
 * text, so the rows stay as close as the other sections'.
 */
export const ROW_HEIGHT = 20

/**
 * How wide one lane is, in CSS pixels.
 */
export const LANE_WIDTH = 12

/**
 * One row of the graph as an SVG document, `width` lanes wide. Colors are
 * presentation attributes and every shape a path or circle, as the icons
 * the desktop is known to draw.
 */
export function graphSource(row: GraphRow, width: number): string {
  const mid = ROW_HEIGHT / 2
  const radius = 3.5
  const x = (lane: number) => LANE_WIDTH / 2 + Math.min(lane, MAX_LANES - 1) * LANE_WIDTH
  const shown = (lane: number) => lane < MAX_LANES
  const path = (d: string, color: LaneColor, extra = '') =>
    `<path d="${d}" stroke="${LANE_COLORS[color]}"${extra}/>`
  const dash = row.isGap ? ' stroke-dasharray="2 3"' : ''
  const parts: string[] = []

  for (const segment of row.through.filter(segment => shown(segment.lane))) {
    parts.push(path(`M${x(segment.lane)} 0V${ROW_HEIGHT}`, segment.color, dash))
  }

  if (row.node !== null) {
    const at = x(row.node)

    for (const segment of row.endsIn.filter(segment => shown(segment.lane))) {
      parts.push(path(`M${x(segment.lane)} 0Q${x(segment.lane)} ${mid} ${at} ${mid}`, segment.color))
    }

    for (const segment of row.startsOut.filter(segment => shown(segment.lane))) {
      parts.push(path(`M${at} ${mid}Q${x(segment.lane)} ${mid} ${x(segment.lane)} ${ROW_HEIGHT}`, segment.color))
    }

    if (row.hasAbove) {
      parts.push(path(`M${at} 0V${mid - radius}`, row.aboveColor))
    }

    if (row.hasBelow) {
      parts.push(path(`M${at} ${mid + radius}V${ROW_HEIGHT}`, row.nodeColor))
    }

    const color = LANE_COLORS[row.nodeColor]

    parts.push(`<circle cx="${at}" cy="${mid}" r="${radius}" fill="${row.isHollow ? 'none' : color}" stroke="${color}"/>`)
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width * LANE_WIDTH} ${ROW_HEIGHT}" ` +
    `fill="none" stroke-width="2" stroke-linecap="round">${parts.join('')}</svg>`
  )
}

/**
 * The terminal's theme color for a lane color.
 */
export const LANE_THEME: Readonly<Record<LaneColor, string>> = {
  blue: 'suggestion',
  purple: 'merged',
  grey: 'inactive',
  orange: 'warning',
  pink: 'error',
  teal: 'suggestion',
  green: 'success',
}

/**
 * One row of the graph in terminal cells, two per lane (a glyph and a
 * space), as `git log --graph` draws it: `●` the commit, `○` a header,
 * `│` a lane passing, `╯` one ending in the commit, `╮` one a merge opens,
 * `┆` lanes carried past unlisted commits.
 */
export function graphCells(row: GraphRow, width: number): { glyph: string; color: LaneColor | null }[] {
  const cells: { glyph: string; color: LaneColor | null }[] = Array.from({ length: width }, () => ({ glyph: ' ', color: null }))
  const set = (lane: number, glyph: string, color: LaneColor) => {
    if (lane < width) {
      cells[lane] = { glyph, color }
    }
  }

  for (const segment of row.through) {
    set(segment.lane, row.isGap ? '┆' : '│', segment.color)
  }

  for (const segment of row.endsIn) {
    set(segment.lane, '╯', segment.color)
  }

  for (const segment of row.startsOut) {
    if (cells[segment.lane]?.glyph === ' ' || cells[segment.lane] === undefined) {
      set(segment.lane, '╮', segment.color)
    }
  }

  if (row.node !== null) {
    set(Math.min(row.node, width - 1), row.isHollow ? '○' : '●', row.nodeColor)
  }

  return cells
}
