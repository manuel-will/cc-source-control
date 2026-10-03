import { describe, expect, test } from 'claude-code/testing'

import { explain } from '../hooks/actions'
import { pickLanguage, setLanguage } from '../hooks/i18n'
import { agoOf, cutStart, firstLineOf, remoteShownOf } from '../hooks/format'
import {
  parseBranches,
  parseLog,
  parseRepoPaths,
  parseStashes,
  parseStatus,
  parseWorktrees,
} from '../hooks/parse'

describe('parse', () => {
  test('status reads branch, counts and every kind of change', () => {
    const out = [
      '# branch.oid 0123456789abcdef0123456789abcdef01234567',
      '# branch.head feature/x',
      '# branch.upstream origin/feature/x',
      '# branch.ab +3 -1',
      '# stash 2',
      '1 M. N... 100644 100644 100644 aaaa bbbb staged file.ts',
      '1 .M N... 100644 100644 100644 aaaa bbbb src/app.ts',
      '1 MM N... 100644 100644 100644 aaaa bbbb both.ts',
      '2 R. N... 100644 100644 100644 aaaa bbbb R100 new name.ts',
      'old name.ts',
      'u UU N... 100644 100644 100644 100644 aaaa bbbb cccc conflict.ts',
      '? notes.md',
      '',
    ].join('\0')

    const reading = parseStatus(out)

    expect(reading.branch).toBe('feature/x')
    expect(reading.upstream).toBe('origin/feature/x')
    expect([reading.ahead, reading.behind, reading.stashCount]).toEqual([3, 1, 2])
    expect(reading.oid).toBe('0123456789abcdef0123456789abcdef01234567')

    expect(reading.staged).toEqual([
      { path: 'staged file.ts', from: null, letter: 'M' },
      { path: 'both.ts', from: null, letter: 'M' },
      { path: 'new name.ts', from: 'old name.ts', letter: 'R' },
    ])

    expect(reading.unstaged).toEqual([
      { path: 'src/app.ts', from: null, letter: 'M' },
      { path: 'both.ts', from: null, letter: 'M' },
      { path: 'notes.md', from: null, letter: 'U' },
    ])

    expect(reading.conflicts).toEqual([{ path: 'conflict.ts', from: null, letter: 'C' }])
  })

  test('status reads a repository without commits and a detached HEAD', () => {
    const unborn = parseStatus('# branch.oid (initial)\0# branch.head main\0? a.txt\0')

    expect(unborn.isUnborn).toBe(true)
    expect(unborn.branch).toBe('main')
    expect(unborn.upstream).toBeNull()

    const detached = parseStatus('# branch.oid abcdef1234567\0# branch.head (detached)\0')

    expect(detached.branch).toBeNull()
    expect(detached.isUnborn).toBe(false)
  })

  test('log sorts decorations into local, remote and tags', () => {
    const out =
      'h1\x1fa1\x1f1700000000\x1fh2\x1fHEAD -> refs/heads/main, refs/remotes/origin/main, refs/remotes/origin/HEAD, tag: refs/tags/v1\x1fFeature: Betriebsstunden\x1e\n' +
      'h2\x1fa2\x1f1690000000\x1f\x1f\x1fInitial commit\x1e\n'

    const [first, second] = parseLog(out, 'shared')

    expect(first).toEqual({
      hash: 'h1',
      short: 'a1',
      parents: ['h2'],
      subject: 'Feature: Betriebsstunden',
      when: 1_700_000_000_000,
      side: 'shared',
      heads: ['main'],
      remotes: ['origin/main'],
      tags: ['v1'],
      isHead: true,
    })

    expect(second?.parents).toEqual([])
    expect(second?.heads).toEqual([])
    expect(second?.isHead).toBe(false)
  })

  test('branches read upstream, counts and gone', () => {
    const branches = parseBranches(
      ['*\x1fmain\x1forigin/main\x1fahead 1, behind 2', ' \x1fold\x1forigin/old\x1fgone', ' \x1flocal\x1f\x1f', ''].join('\n'),
    )

    expect(branches).toEqual([
      { name: 'main', upstream: 'origin/main', ahead: 1, behind: 2, isGone: false, isCurrent: true },
      { name: 'old', upstream: 'origin/old', ahead: 0, behind: 0, isGone: true, isCurrent: false },
      { name: 'local', upstream: null, ahead: 0, behind: 0, isGone: false, isCurrent: false },
    ])
  })

  test('worktrees mark the main one, the current one and a missing one', () => {
    const out = [
      'worktree /work',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /work/.claude/worktrees/zen',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/claude/zen',
      '',
      'worktree /gone',
      'HEAD 3333333333333333333333333333333333333333',
      'detached',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n')

    const trees = parseWorktrees(out, '/work/.claude/worktrees/zen/')

    expect(trees.map(tree => [tree.branch, tree.isMain, tree.isCurrent, tree.isPrunable, tree.head])).toEqual([
      ['main', true, false, false, '1111111'],
      ['claude/zen', false, true, false, '2222222'],
      [null, false, false, true, '3333333'],
    ])
  })

  test('stashes and repository paths', () => {
    expect(parseStashes('stash@{0}\x1fWIP on main: abc Fix\n')).toEqual([{ ref: 'stash@{0}', subject: 'WIP on main: abc Fix' }])
    expect(parseRepoPaths('/w\n/w/.git\n/w/.git\n')).toEqual({ root: '/w', gitDir: '/w/.git', commonDir: '/w/.git' })
    expect(parseRepoPaths('D:/code/p\nD:/code/p/.git\nD:/code/p/.git\n')?.root).toBe('D:/code/p')
    expect(parseRepoPaths('--path-format=absolute\n/w\n.git\n.git\n')).toBeNull()
  })

  test('remote addresses never show credentials', () => {
    expect(remoteShownOf('https://user:ghp_secret@github.com/manuel-will/demo.git')).toBe('github.com/manuel-will/demo')
    expect(remoteShownOf('git@github.com:manuel-will/demo.git')).toBe('github.com/manuel-will/demo')
    expect(remoteShownOf('ssh://git@host:2222/team/repo.git')).toBe('host:2222/team/repo')
  })

  test('times, cuts and git messages read the way the band shows them', () => {
    setLanguage('de')

    expect(agoOf(1000, 30_000)).toBe('gerade eben')
    expect(agoOf(0, 4 * 60_000)).toBe('vor 4 min')
    expect(agoOf(0, 3 * 3_600_000)).toBe('vor 3 Std.')
    expect(agoOf(0, 2 * 86_400_000)).toBe('vor 2 Tagen')
    expect(cutStart('src/very/long/path/file.ts', 12)).toBe('…ath/file.ts')
    expect(firstLineOf('remote: Counting objects: 3\nfatal: Authentication failed for x\n')).toBe('Authentication failed for x')
  })

  test('git failures are explained in German', () => {
    setLanguage('de')

    expect(explain({ out: '', err: 'error: Your local changes to the following files would be overwritten by merge:' })).toMatch(/Lokale Änderungen/)
    expect(explain({ out: '', err: ' ! [rejected]        main -> main (fetch first)' })).toMatch(/Push abgelehnt/)
    expect(explain({ out: 'CONFLICT (content): Merge conflict in app.js', err: '' })).toMatch(/Merge-Konflikt/)
    expect(explain({ out: '', err: 'fatal: unable to access: Could not resolve host: github.com' })).toMatch(/nicht erreichbar/)
    expect(explain({ out: '', err: 'fatal: Authentication failed for https://github.com/x' })).toMatch(/Anmeldung/)
    expect(explain({ out: '', err: 'fatal: something new' })).toBe('something new')
  })
})

describe('language', () => {
  test('German only where a hint says so; other languages read English', () => {
    expect(pickLanguage(['auto', 'german'])).toBe('de')
    expect(pickLanguage([undefined, 'Deutsch'])).toBe('de')
    expect(pickLanguage([undefined, undefined, undefined, undefined, 'de_AT.UTF-8'])).toBe('de')
    expect(pickLanguage(['auto', undefined, 'C.UTF-8', undefined, undefined, 'de-DE'])).toBe('de')
    expect(pickLanguage(['en', 'german'])).toBe('en')
    expect(pickLanguage([undefined, 'japanese', 'de_DE'])).toBe('en')
    expect(pickLanguage([undefined, undefined, 'fr_FR.UTF-8'])).toBe('en')
    expect(pickLanguage([])).toBe('en')
  })
})
