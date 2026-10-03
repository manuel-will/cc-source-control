/**
 * One changed file as the panel lists it: its path, the path it came from
 * for a rename, and the status letter VS Code shows.
 */
export type ScFile = {
  path: string
  from: string | null
  /** M modified, A added, D deleted, R renamed, C conflict, U untracked */
  letter: 'M' | 'A' | 'D' | 'R' | 'C' | 'U'
}

/**
 * One commit of the history: which side of the upstream it is on, and the
 * branch and tag names that point at it.
 */
export type ScCommit = {
  hash: string
  short: string
  parents: string[]
  subject: string
  when: number
  side: 'incoming' | 'outgoing' | 'shared'
  heads: string[]
  remotes: string[]
  tags: string[]
  isHead: boolean
}

export type ScBranch = {
  name: string
  upstream: string | null
  ahead: number
  behind: number
  isGone: boolean
  isCurrent: boolean
}

export type ScWorktree = {
  path: string
  branch: string | null
  head: string
  isCurrent: boolean
  isMain: boolean
  isPrunable: boolean
  isLocked: boolean
  dirty: number | null
}

export type ScStash = { ref: string; subject: string }

/**
 * What the panel adds to the band's reading: history, branches, worktrees,
 * stashes and the remote, read while the panel is open.
 */
export type ScDetails = {
  incoming: ScCommit[]
  history: ScCommit[]
  branches: ScBranch[]
  worktrees: ScWorktree[]
  stashes: ScStash[]
  remote: string | null
  hasHooks: boolean
}

/**
 * The repository as last read: branch, upstream, the counts against it,
 * the changed files and when it was last fetched.
 */
export type ScSnapshot = {
  root: string
  gitDir: string
  commonDir: string
  isLinkedWorktree: boolean
  branch: string | null
  head: string | null
  isUnborn: boolean
  upstream: string | null
  remoteName: string | null
  ahead: number
  behind: number
  staged: ScFile[]
  unstaged: ScFile[]
  conflicts: ScFile[]
  stashCount: number
  operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  fetchedAt: number | null
  readAt: number
  details: ScDetails | null
}

export type ScNotice = {
  tone: 'error' | 'info' | 'success'
  text: string
  at: number
  /** A follow-up the panel offers beside the notice. */
  retry: 'autostash' | null
}

/**
 * What the drawings show besides the repository: whether the panel is open,
 * which action runs, the last fetch's outcome, the last notice, folded
 * sections, and the commit field's generation (a new one clears it).
 */
export type ScView = {
  isPaneOpen: boolean
  busy: string | null
  isFetching: boolean
  fetchError: string | null
  notice: ScNotice | null
  folded: string[]
  commitField: number
}

export type ScProbe = 'unknown' | 'none' | 'repo'

declare module 'claude-code' {
  interface PluginState {
    'source-control': {
      probe: ScProbe
      snapshot: ScSnapshot | null
      view: ScView
    }
  }
}
