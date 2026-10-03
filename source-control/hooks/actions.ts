import type { ScSnapshot } from '../types'
import { firstLineOf } from './format'
import { t } from './i18n'
import type { Catalog } from './i18n'
import { ACTION_ENV, QUIET_ENV } from './git'
import type { Git, GitResult } from './git'

export type ActionName =
  | 'fetch'
  | 'pull'
  | 'pullAutostash'
  | 'push'
  | 'sync'
  | 'publish'
  | 'commit'
  | 'stage'
  | 'unstage'
  | 'stageAll'
  | 'unstageAll'
  | 'continueOperation'
  | 'abortOperation'

/**
 * What the person sees while an action runs (`Pulling…`).
 */
export function runningLabelOf(name: ActionName): string {
  return t().running[name]
}

/**
 * The operation in progress as the git command that drives it.
 */
const OPERATION_COMMANDS: Readonly<Record<NonNullable<ScSnapshot['operation']>, string>> = {
  merge: 'merge',
  rebase: 'rebase',
  'cherry-pick': 'cherry-pick',
  revert: 'revert',
}

/**
 * The operation in progress in words (`Merge`, `Rebase`, …).
 */
export const OPERATION_NAMES: Readonly<Record<NonNullable<ScSnapshot['operation']>, string>> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-Pick',
  revert: 'Revert',
}

/**
 * How an action ended: whether it worked, the line to show (empty for the
 * quiet ones, stage and unstage), and a follow-up worth offering.
 */
export type ActionOutcome = { ok: boolean; text: string; retry?: 'autostash' }

/**
 * What an action works with: the runner, the repository as last read, a
 * fresh reading on demand, and the environment for a quiet fetch.
 */
export type ActionContext = {
  git: Git
  snapshot: ScSnapshot
  reread: () => Promise<ScSnapshot | null>
  quietEnv: Readonly<Record<string, string>>
}

const NETWORK_MS = 180_000
const QUIET_NETWORK_MS = 45_000

const EXPLANATIONS: readonly (readonly [RegExp, keyof Catalog['explain']])[] = [
  [/Please tell me who you are|empty ident name|unable to auto-detect email/i, 'identity'],
  [/Need to specify how to reconcile|Not possible to fast-forward|diverging branches/i, 'diverged'],
  [/would be overwritten by|Please commit your changes or stash them|cannot pull with rebase: You have unstaged changes/i, 'overwrite'],
  [/CONFLICT|Automatic merge failed|could not apply|fix conflicts/i, 'conflict'],
  [/\[rejected\]|non-fast-forward|fetch first|Updates were rejected/i, 'rejected'],
  [/Authentication failed|terminal prompts disabled|could not read Username|Permission denied \(publickey|Host key verification failed|invalid credentials/i, 'auth'],
  [/Could not resolve host|unable to access|Connection timed out|Network is unreachable|Could not read from remote repository|Connection refused|Operation timed out/i, 'unreachable'],
  [/timed out|timeout/i, 'timeout'],
  [/has no upstream branch|no upstream configured|no tracking information/i, 'noUpstream'],
  [/No configured push destination|does not appear to be a git repository|No such remote|No remote repository specified/i, 'noRemote'],
  [/index\.lock|Unable to create .*\.lock/i, 'locked'],
  [/nothing to commit|no changes added to commit/i, 'nothingToCommit'],
  [/unmerged files|You have not concluded your merge|Committing is not possible because you have unmerged/i, 'unmerged'],
]

/**
 * A failed run in words: the matching explanation, else git's first line.
 */
export function explain(result: Pick<GitResult, 'out' | 'err'>): string {
  const said = `${result.err}\n${result.out}`
  const found = EXPLANATIONS.find(([pattern]) => pattern.test(said))

  return found ? t().explain[found[1]] : firstLineOf(result.err) || firstLineOf(result.out) || t().gitFailed
}

const OVERWRITE = /would be overwritten by|Please commit your changes or stash them|cannot pull with rebase: You have unstaged changes/i

const failed = (result: GitResult): ActionOutcome => ({
  ok: false,
  text: explain(result),
  ...(OVERWRITE.test(`${result.err}\n${result.out}`) ? { retry: 'autostash' as const } : {}),
})

async function headOf(git: Git): Promise<string | null> {
  const head = await git(['rev-parse', '--verify', '-q', 'HEAD'])

  return head.ok ? head.out.trim() : null
}

async function countSince(git: Git, from: string | null): Promise<number | null> {
  if (!from) {
    return null
  }

  const counted = await git(['rev-list', '--count', `${from}..HEAD`])

  return counted.ok ? Number(counted.out.trim()) : null
}

async function fetchRemote(ctx: ActionContext, isQuiet: boolean): Promise<ActionOutcome> {
  const { git, snapshot } = ctx

  if (!snapshot.remoteName) {
    return { ok: false, text: t().noRemote }
  }

  const fetched = await git(['fetch', '--prune', snapshot.remoteName], {
    env: isQuiet ? { ...QUIET_ENV, ...ctx.quietEnv } : ACTION_ENV,
    timeoutMs: isQuiet ? QUIET_NETWORK_MS : NETWORK_MS,
  })

  if (!fetched.ok) {
    return failed(fetched)
  }

  const after = await ctx.reread()
  const fresh = after ? after.behind - snapshot.behind : 0

  return {
    ok: true,
    text:
      fresh > 0
        ? t().fetchedNew(fresh, after?.upstream ?? null)
        : t().fetchedNothing,
  }
}

async function pull(ctx: ActionContext, isAutostash = false): Promise<ActionOutcome> {
  const { git, snapshot } = ctx

  if (!snapshot.upstream) {
    return { ok: false, text: t().noUpstreamPublish }
  }

  const configured = await git(['config', '--get', 'pull.rebase'])
  const before = await headOf(git)
  const strategy = configured.ok ? [] : ['--no-rebase']

  const pulled = await git(['pull', ...strategy, ...(isAutostash ? ['--autostash'] : [])], {
    env: ACTION_ENV,
    timeoutMs: NETWORK_MS,
  })

  if (!pulled.ok) {
    return failed(pulled)
  }

  const count = await countSince(git, before)

  return {
    ok: true,
    text:
      count === null || count === 0
        ? t().pulledNothing
        : t().pulled(count),
  }
}

async function publish(ctx: ActionContext): Promise<ActionOutcome> {
  const { git, snapshot } = ctx

  if (!snapshot.remoteName) {
    return { ok: false, text: t().noRemote }
  }

  if (!snapshot.branch) {
    return { ok: false, text: t().detachedHead }
  }

  const pushed = await git(['push', '-u', snapshot.remoteName, 'HEAD'], {
    env: ACTION_ENV,
    timeoutMs: NETWORK_MS,
  })

  return pushed.ok
    ? { ok: true, text: t().published(`${snapshot.remoteName}/${snapshot.branch}`) }
    : failed(pushed)
}

async function push(ctx: ActionContext): Promise<ActionOutcome> {
  const { git, snapshot } = ctx

  if (!snapshot.upstream) {
    return publish(ctx)
  }

  const pushed = await git(['push'], { env: ACTION_ENV, timeoutMs: NETWORK_MS })

  if (!pushed.ok) {
    return failed(pushed)
  }

  return {
    ok: true,
    text:
      snapshot.ahead > 0
        ? t().pushed(snapshot.ahead, snapshot.upstream ?? '')
        : t().pushedNothing,
  }
}

async function sync(ctx: ActionContext): Promise<ActionOutcome> {
  if (!ctx.snapshot.upstream) {
    return publish(ctx)
  }

  const pulled = await pull(ctx)

  if (!pulled.ok) {
    return pulled
  }

  const after = await ctx.reread()

  if (!after || after.ahead === 0) {
    return { ok: true, text: pulled.text.replace(/^Pull/, 'Sync') }
  }

  const pushed = await push({ ...ctx, snapshot: after })

  return pushed.ok
    ? { ok: true, text: t().synced(after.ahead) }
    : pushed
}

async function commit(ctx: ActionContext, message: string): Promise<ActionOutcome> {
  const { git, snapshot } = ctx
  const text = message.trim()
  const isMerging = snapshot.operation === 'merge' && snapshot.conflicts.length === 0

  if (text === '' && isMerging) {
    const merged = await git(['commit', '--no-edit'], { env: ACTION_ENV, timeoutMs: 60_000 })

    return merged.ok ? { ok: true, text: t().mergeDone } : failed(merged)
  }

  if (text === '') {
    return { ok: false, text: t().enterMessage }
  }

  const hasStaged = snapshot.staged.length > 0

  if (!hasStaged && snapshot.unstaged.length === 0 && snapshot.operation !== 'merge') {
    return { ok: false, text: t().nothingToCommit }
  }

  if (!hasStaged && snapshot.unstaged.length > 0) {
    const added = await git(['add', '-A'], { env: ACTION_ENV })

    if (!added.ok) {
      return failed(added)
    }
  }

  const committed = await git(['commit', '-m', text], { env: ACTION_ENV, timeoutMs: 60_000 })

  if (!committed.ok) {
    return failed(committed)
  }

  const made = await git(['log', '-1', '--format=%h %s'])

  return { ok: true, text: t().committed(made.ok ? made.out.trim() : text) }
}

const PATH_ENV = { ...ACTION_ENV, GIT_LITERAL_PATHSPECS: '1' }

async function stage(ctx: ActionContext, paths: readonly string[]): Promise<ActionOutcome> {
  const added = await ctx.git(['add', '-A', '--', ...paths], { env: PATH_ENV })

  return added.ok ? { ok: true, text: '' } : failed(added)
}

async function unstage(ctx: ActionContext, paths: readonly string[]): Promise<ActionOutcome> {
  const { git, snapshot } = ctx

  const argv = snapshot.isUnborn
    ? ['rm', '-r', '--cached', '-q', '--', ...paths]
    : ['restore', '--staged', '--', ...paths]

  let removed = await git(argv, { env: PATH_ENV })

  if (!removed.ok && !snapshot.isUnborn) {
    removed = await git(['reset', '-q', 'HEAD', '--', ...paths], { env: PATH_ENV })
  }

  return removed.ok ? { ok: true, text: '' } : failed(removed)
}

async function continueOperation(ctx: ActionContext, message: string): Promise<ActionOutcome> {
  const { git, snapshot } = ctx
  const operation = snapshot.operation

  if (operation === null) {
    return { ok: false, text: t().noOperation }
  }

  if (snapshot.conflicts.length > 0) {
    return { ok: false, text: t().resolveFirst }
  }

  if (operation === 'merge') {
    return commit(ctx, message)
  }

  const continued = await git([OPERATION_COMMANDS[operation], '--continue'], { env: ACTION_ENV, timeoutMs: 120_000 })

  return continued.ok ? { ok: true, text: t().operationDone(OPERATION_NAMES[operation]) } : failed(continued)
}

async function abortOperation(ctx: ActionContext): Promise<ActionOutcome> {
  const { git, snapshot } = ctx
  const operation = snapshot.operation

  if (operation === null) {
    return { ok: false, text: t().noOperation }
  }

  const aborted = await git([OPERATION_COMMANDS[operation], '--abort'], { env: ACTION_ENV, timeoutMs: 60_000 })

  return aborted.ok
    ? { ok: true, text: t().operationAborted(OPERATION_NAMES[operation]) }
    : failed(aborted)
}

/**
 * Runs one action against the repository.
 *
 * @param ctx the runner, the snapshot and a fresh reading on demand
 * @param name which action
 * @param arg the commit message, or the paths to stage or unstage
 * @param isQuiet a fetch nobody asked for: no prompts, a shorter timeout
 * @returns whether it worked and what to tell the person
 */
export function runAction(
  ctx: ActionContext,
  name: ActionName,
  arg: { message?: string; paths?: readonly string[] } = {},
  isQuiet = false,
): Promise<ActionOutcome> {
  switch (name) {
    case 'fetch':
      return fetchRemote(ctx, isQuiet)
    case 'pull':
      return pull(ctx)
    case 'pullAutostash':
      return pull(ctx, true)
    case 'push':
      return push(ctx)
    case 'sync':
      return sync(ctx)
    case 'publish':
      return publish(ctx)
    case 'commit':
      return commit(ctx, arg.message ?? '')
    case 'stage':
      return stage(ctx, arg.paths ?? [])
    case 'unstage':
      return unstage(ctx, arg.paths ?? [])
    case 'stageAll':
      return stage(ctx, ['.'])
    case 'unstageAll':
      return unstage(ctx, ['.'])
    case 'continueOperation':
      return continueOperation(ctx, arg.message ?? '')
    case 'abortOperation':
      return abortOperation(ctx)
  }
}
