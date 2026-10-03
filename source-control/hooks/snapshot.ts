import type { ScCommit, ScDetails, ScSnapshot } from '../types'
import { remoteShownOf } from './format'
import { NO_LOCKS } from './git'
import type { Git } from './git'
import {
  BRANCH_FORMAT,
  countLines,
  LOG_FORMAT,
  parseBranches,
  parseLog,
  parseRepoPaths,
  parseStashes,
  parseStatus,
  parseWorktrees,
} from './parse'
import type { RepoPaths } from './parse'

/**
 * The file system calls a reading needs, as session.start bound them.
 */
export type Files = {
  mtimeOf: (path: string) => Promise<number | null>
  exists: (path: string) => Promise<boolean>
  names: (path: string) => Promise<readonly string[]>
}

const HISTORY_LIMIT = 12
const INCOMING_LIMIT = 10
const WORKTREE_STATUS_LIMIT = 8

/**
 * The repository a directory is in, or null outside one.
 *
 * @param git a runner in that directory
 * @param cwd the directory
 */
export async function repoOf(git: Git, cwd: string): Promise<RepoPaths | null> {
  const found = await git(
    [NO_LOCKS, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'],
    { cwd },
  )

  if (found.ok) {
    return parseRepoPaths(found.out)
  }

  const isOldGit = /path-format/.test(found.err)

  if (!isOldGit) {
    return null
  }

  const old = await git([NO_LOCKS, 'rev-parse', '--show-toplevel', '--absolute-git-dir'], { cwd })
  const [root = '', gitDir = ''] = old.out.split(/\r?\n/)

  return old.ok && root && gitDir ? { root, gitDir, commonDir: gitDir } : null
}

async function operationOf(files: Files, gitDir: string): Promise<ScSnapshot['operation']> {
  const marks: [string, ScSnapshot['operation']][] = [
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['MERGE_HEAD', 'merge'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
  ]

  for (const [name, operation] of marks) {
    if (await files.exists(`${gitDir}/${name}`).catch(() => false)) {
      return operation
    }
  }

  return null
}

/**
 * When the repository was last fetched: FETCH_HEAD's change time, which
 * every fetch and pull writes, whoever ran it.
 */
async function fetchedAtOf(files: Files, paths: RepoPaths): Promise<number | null> {
  const times = await Promise.all(
    [...new Set([paths.gitDir, paths.commonDir])].map(dir =>
      files.mtimeOf(`${dir}/FETCH_HEAD`).catch(() => null),
    ),
  )

  const known = times.filter((time): time is number => typeof time === 'number')

  return known.length === 0 ? null : Math.max(...known)
}

/**
 * The band's reading: one `git status`, the operation in progress, the last
 * fetch, and the remote when the branch has no upstream.
 *
 * @param git a runner in the repository
 * @param files the file system calls
 * @param paths the repository
 * @param now the time of the reading
 * @returns the snapshot, or null when git could not read the repository
 */
export async function readSnapshot(
  git: Git,
  files: Files,
  paths: RepoPaths,
  now: number,
): Promise<ScSnapshot | null> {
  let status = await git([NO_LOCKS, 'status', '--porcelain=v2', '--branch', '--show-stash', '-z'])

  if (!status.ok && /show-stash/.test(status.err)) {
    status = await git([NO_LOCKS, 'status', '--porcelain=v2', '--branch', '-z'])
  }

  if (!status.ok) {
    return null
  }

  const reading = parseStatus(status.out)

  const [operation, fetchedAt, remotes] = await Promise.all([
    operationOf(files, paths.gitDir),
    fetchedAtOf(files, paths),
    git(['remote']).then(result => result.out.split(/\r?\n/).filter(name => name !== '')),
  ])

  const upstreamRemote = reading.upstream
    ? (remotes.find(name => reading.upstream?.startsWith(`${name}/`)) ?? null)
    : null

  return {
    root: paths.root,
    gitDir: paths.gitDir,
    commonDir: paths.commonDir,
    isLinkedWorktree: paths.gitDir !== paths.commonDir,
    branch: reading.branch,
    head: reading.oid ? reading.oid.slice(0, 7) : null,
    isUnborn: reading.isUnborn,
    upstream: reading.upstream,
    remoteName: upstreamRemote ?? (remotes.includes('origin') ? 'origin' : (remotes[0] ?? null)),
    ahead: reading.ahead,
    behind: reading.behind,
    staged: reading.staged,
    unstaged: reading.unstaged,
    conflicts: reading.conflicts,
    stashCount: reading.stashCount,
    operation,
    fetchedAt,
    readAt: now,
    details: null,
  }
}

/**
 * Whether the repository runs hooks of its own: a hooks path set in its own
 * or the global config (Husky, lefthook), or a hook beside the samples.
 *
 * Read from the config files themselves: the engine runs a mod's git with
 * its own `core.hooksPath` to keep repository hooks off.
 */
async function hasHooksOf(git: Git, files: Files, snapshot: ScSnapshot): Promise<boolean> {
  const local = await git(['config', '--file', `${snapshot.commonDir}/config`, '--get', 'core.hooksPath'])
  const configured = local.ok ? local : await git(['config', '--global', '--get', 'core.hooksPath'])
  const path = configured.ok ? configured.out.trim() : ''

  if (path !== '') {
    return true
  }

  const names = await files.names(`${snapshot.commonDir}/hooks`).catch((): readonly string[] => [])

  return names.some(name => !name.endsWith('.sample'))
}

/**
 * The panel's reading on top of a snapshot: the history with incoming and
 * outgoing commits marked, branches, worktrees, stashes, the remote's
 * address and whether the repository has hooks.
 *
 * @param git a runner in the repository
 * @param files the file system calls
 * @param snapshot the band's reading this builds on
 * @returns the snapshot with its details filled in
 */
export async function withDetails(git: Git, files: Files, snapshot: ScSnapshot): Promise<ScSnapshot> {
  const hasUpstream = snapshot.upstream !== null && !snapshot.isUnborn

  const [history, outgoing, incoming, branches, worktrees, stashes, remoteUrl, hasHooks] = await Promise.all([
    snapshot.isUnborn ? null : git([NO_LOCKS, 'log', '--topo-order', '--decorate=full', LOG_FORMAT, `-n${HISTORY_LIMIT}`, 'HEAD', '--']),
    hasUpstream ? git([NO_LOCKS, 'rev-list', '--max-count=200', '@{upstream}..HEAD', '--']) : null,
    hasUpstream && snapshot.behind > 0
      ? git([NO_LOCKS, 'log', '--topo-order', '--decorate=full', LOG_FORMAT, `-n${INCOMING_LIMIT}`, 'HEAD..@{upstream}', '--'])
      : null,
    git([NO_LOCKS, 'for-each-ref', BRANCH_FORMAT, 'refs/heads']),
    git([NO_LOCKS, 'worktree', 'list', '--porcelain']),
    git([NO_LOCKS, 'stash', 'list', '--format=%gd%x1f%s', '-n20']),
    snapshot.remoteName ? git(['remote', 'get-url', snapshot.remoteName]) : null,
    hasHooksOf(git, files, snapshot),
  ])

  const outgoingSet = new Set((outgoing?.out ?? '').split(/\r?\n/).filter(hash => hash !== ''))

  const historyCommits: ScCommit[] = parseLog(history?.ok ? history.out : '', 'shared').map(commit =>
    outgoingSet.has(commit.hash) ? { ...commit, side: 'outgoing' } : commit,
  )

  const listed = parseWorktrees(worktrees.ok ? worktrees.out : '', snapshot.root)

  const counted = await Promise.all(
    listed.map(async (tree, index) => {
      if (tree.isPrunable || index >= WORKTREE_STATUS_LIMIT) {
        return tree
      }

      const dirty = await git([NO_LOCKS, 'status', '--porcelain'], { cwd: tree.path, timeoutMs: 8_000 })

      return dirty.ok ? { ...tree, dirty: countLines(dirty.out) } : tree
    }),
  )

  const details: ScDetails = {
    incoming: parseLog(incoming?.ok ? incoming.out : '', 'incoming'),
    history: historyCommits,
    branches: parseBranches(branches.ok ? branches.out : ''),
    worktrees: counted,
    stashes: parseStashes(stashes.ok ? stashes.out : ''),
    remote: remoteUrl?.ok ? remoteShownOf(remoteUrl.out) : null,
    hasHooks,
  }

  return { ...snapshot, details }
}
