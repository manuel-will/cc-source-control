import type { ScSnapshot, ScView } from '../../types'
import { agoOf } from '../format'
import { t } from '../i18n'
import type { IconName } from './icons'

/**
 * The blue button's job, as VS Code's action button picks it: resolve a
 * conflict, publish a branch, sync, or commit.
 */
export type Primary = {
  kind: 'resolve' | 'publish' | 'sync' | 'commit'
  icon: IconName
  label: string
  short: string
}

/**
 * How many files have changes of any kind.
 */
export function changeCountOf(snapshot: ScSnapshot): number {
  return snapshot.staged.length + snapshot.unstaged.length + snapshot.conflicts.length
}

/**
 * `3↓ 1↑`, leaving out a side at zero; empty when in step.
 */
export function countsOf(snapshot: Pick<ScSnapshot, 'ahead' | 'behind'>): string {
  return [
    snapshot.behind > 0 ? `${snapshot.behind}↓` : '',
    snapshot.ahead > 0 ? `${snapshot.ahead}↑` : '',
  ]
    .filter(part => part !== '')
    .join(' ')
}

/**
 * Whether the branch can be published: a named branch with commits, no
 * upstream, and a remote to push to.
 */
export function canPublish(snapshot: ScSnapshot): boolean {
  return snapshot.upstream === null && snapshot.branch !== null && !snapshot.isUnborn && snapshot.remoteName !== null
}

/**
 * The band's blue button for this state, or null when there is nothing to do.
 */
export function primaryOf(snapshot: ScSnapshot): Primary | null {
  if (snapshot.conflicts.length > 0) {
    return { kind: 'resolve', icon: 'conflict', label: t().resolve, short: t().resolveShort }
  }

  if (snapshot.operation !== null) {
    return { kind: 'resolve', icon: 'commit', label: t().finish, short: t().finishShort }
  }

  if (canPublish(snapshot)) {
    return { kind: 'publish', icon: 'publish', label: t().publish, short: '' }
  }

  const counts = countsOf(snapshot)

  if (snapshot.upstream !== null && counts !== '') {
    return { kind: 'sync', icon: 'sync', label: t().sync(counts), short: counts }
  }

  if (changeCountOf(snapshot) > 0) {
    return { kind: 'commit', icon: 'commit', label: t().commitEllipsis, short: '' }
  }

  return null
}

/**
 * The operation in progress, in words.
 */
export function operationTextOf(snapshot: ScSnapshot): string | null {
  if (snapshot.conflicts.length > 0) {
    return snapshot.conflicts.length === 1 ? t().oneConflict : t().conflicts(snapshot.conflicts.length)
  }

  switch (snapshot.operation) {
    case 'merge':
      return t().operationRunning('Merge')
    case 'rebase':
      return t().operationRunning('Rebase')
    case 'cherry-pick':
      return t().operationRunning('Cherry-Pick')
    case 'revert':
      return t().operationRunning('Revert')
    default:
      return null
  }
}

/**
 * How fresh the remote side is: being fetched, failed, never fetched, or
 * how long ago (`isAge`), flagged once older than `staleAfterMs`.
 */
export function freshnessOf(
  snapshot: ScSnapshot,
  view: ScView,
  staleAfterMs: number,
): { text: string; isWarning: boolean; isAge: boolean } | null {
  if (view.isFetching) {
    return { text: t().checkingRemote, isWarning: false, isAge: false }
  }

  if (snapshot.remoteName === null) {
    return null
  }

  if (view.fetchError !== null) {
    return { text: t().offline, isWarning: true, isAge: false }
  }

  const age = fetchAgeOf(snapshot, staleAfterMs)

  if (age === null) {
    return { text: t().neverChecked, isWarning: true, isAge: false }
  }

  return { ...age, isAge: true }
}

/**
 * How long before the reading the last fetch was, in words, flagged once
 * older than `staleAfterMs`; null when it never ran or there is no remote
 * (nothing is shown then). All a drawing shows of the reading's time.
 */
export function fetchAgeOf(snapshot: ScSnapshot, staleAfterMs: number): { text: string; isWarning: boolean } | null {
  if (snapshot.fetchedAt === null || snapshot.remoteName === null) {
    return null
  }

  return {
    text: agoOf(snapshot.fetchedAt, snapshot.readAt),
    isWarning: snapshot.readAt - snapshot.fetchedAt > staleAfterMs,
  }
}

/**
 * Whether the band may say all is well: settled, and the remote side known
 * and fresh (an unknown state is never shown as good).
 */
export function isConfirmedSettled(snapshot: ScSnapshot, view: ScView, staleAfterMs: number): boolean {
  const freshness = freshnessOf(snapshot, view, staleAfterMs)

  return isSettled(snapshot) && view.busy === null && (freshness === null || (freshness.isAge && !freshness.isWarning))
}

/**
 * Whether the repository is in step and clean: nothing to commit, pull or
 * push, no conflict.
 */
export function isSettled(snapshot: ScSnapshot): boolean {
  return (
    changeCountOf(snapshot) === 0 &&
    snapshot.operation === null &&
    snapshot.ahead === 0 &&
    snapshot.behind === 0 &&
    (snapshot.upstream !== null || snapshot.remoteName === null || snapshot.isUnborn)
  )
}

/**
 * The branch as the band names it: its name, or the commit for a detached
 * HEAD, or `main (neu)` style for a repository without commits.
 */
export function branchTextOf(snapshot: ScSnapshot): string {
  if (snapshot.branch !== null) {
    return snapshot.branch
  }

  return snapshot.head ? `${snapshot.head} (detached)` : '(detached)'
}
