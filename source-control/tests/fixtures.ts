import type { Args, CommandRunInput, On, RenderElement, RenderPropsOf } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

/**
 * One git answer: exit code and output; a function answers from the argv.
 */
export type Answer = { exitCode?: number; stdout?: string; stderr?: string }

export type Script = Record<string, Answer | ((argv: readonly string[]) => Answer)>

/**
 * What a session in /work did beneath the mod: each git run (argv after
 * `git`) with its env, toasts, panes opened and closed, prompts submitted.
 */
export type World = {
  runs: { line: string; env: Record<string, string> }[]
  toasts: string[]
  opened: Args<'ui.open'>[]
  closed: string[]
  prompts: string[]
  writes: { path: string; text: string }[]
  clock: MockClock
  script: Script
  files: Map<string, number>
}

export const NOW = 1_800_000_000_000

/**
 * A git status of /work on main, two commits behind origin/main, with one
 * modified file.
 */
export const BEHIND_STATUS = [
  '# branch.oid 1111111111111111111111111111111111111111',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +0 -2',
  '1 .M N... 100644 100644 100644 aaaa bbbb app.js',
  '',
].join('\0')

/**
 * The answers every repository session needs: where the repository is, its
 * remote, an unset pull.rebase and ssh command.
 */
export const REPOSITORY: Script = {
  'rev-parse --path-format=absolute': { stdout: '/work\n/work/.git\n/work/.git\n' },
  'status --porcelain=v2': { stdout: BEHIND_STATUS },
  remote: { stdout: 'origin\n' },
  'remote get-url origin': { stdout: 'https://user:secret@github.com/manuel-will/demo.git\n' },
  'config --get pull.rebase': { exitCode: 1 },
  'config --get core.sshCommand': { exitCode: 1 },
  'config --file': { exitCode: 1 },
  'config --global': { exitCode: 1 },
  'fetch --prune origin': {},
  'rev-parse --verify -q HEAD': { stdout: '1111111\n' },
  'rev-list --count': { stdout: '2\n' },
  'log --topo-order': { stdout: '' },
  'for-each-ref': { stdout: '*\x1fmain\x1forigin/main\x1fbehind 2\n' },
  'worktree list': { stdout: 'worktree /work\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n\n' },
  'stash list': { stdout: '' },
  'rev-list --max-count': { stdout: '' },
}

/**
 * A session in /work whose git answers from `script` (longest matching key
 * wins; anything unknown fails as git does outside a repository), keeping
 * what the mod does there.
 *
 * @param on the test's `on`
 * @param script git's answers by a piece of the command line
 * @param files paths that exist, with their change times
 * @param env the session's environment (German unless a test says otherwise)
 */
export function inRepository(
  on: On,
  script: Script = REPOSITORY,
  files = new Map<string, number>(),
  env: Record<string, string> = { LANG: 'de_DE.UTF-8' },
): World {
  const world: World = {
    runs: [],
    toasts: [],
    opened: [],
    closed: [],
    prompts: [],
    writes: [],
    clock: mock.clock(on, { now: NOW }),
    script,
    files,
  }

  const panes = new Set<string>()

  mock.env(on, env)
  mock.store(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))

  on('process.run', ($, e) => {
    const line = e.argv.slice(1).filter(arg => arg !== '--no-optional-locks').join(' ')

    world.runs.push({ line, env: { ...(e.init?.env ?? {}) } })

    const key = Object.keys(world.script)
      .filter(piece => line.includes(piece))
      .sort((a, b) => b.length - a.length)[0]

    const found = key === undefined ? undefined : world.script[key]
    const answer: Answer = found === undefined ? { exitCode: 128, stderr: 'fatal: not a git repository' } : typeof found === 'function' ? found(e.argv) : found

    return {
      value: {
        exitCode: answer.exitCode ?? 0,
        stdout: answer.stdout ?? '',
        stderr: answer.stderr ?? '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })

  on('fs.stat', ($, e) => {
    const mtimeMs = world.files.get(e.path)

    if (mtimeMs === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: { kind: 'file', size: 1, mtimeMs, isLink: false } }
  })

  on('fs.exists', ($, e) => ({ value: world.files.has(e.path) }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '{"version":"9.9.9"}' }))
  on('fs.write', ($, e) => {
    world.writes.push({ path: e.path, text: e.text })

    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.focus', () => ({}))
  on('ui.panes', () => ({
    value: [...panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.open', ($, e) => {
    world.opened.push(e)
    panes.add(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    world.closed.push(e.id)
    panes.delete(e.id)

    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    world.prompts.push(e.text)

    return { text: e.text }
  })

  return world
}

/**
 * The band's props on a 120-column terminal with nothing else in it.
 */
export const BAND_PROPS: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

/**
 * The panel docked beside the transcript, 70 columns of body.
 */
export const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Source Control',
  isFocused: false,
  bodyColumns: 70,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

/**
 * `/git` with `args`, typed at the prompt of a 160-column fullscreen terminal.
 */
export function gitCommand(args: string): CommandRunInput {
  return { command: 'git', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }
}

/**
 * What the engine draws in the band when no plugin does.
 */
export const ENGINE_BAND: RenderElement = { type: 'Text', children: ['engine band'] }

/**
 * Starts the session in /work and lets its first reading land.
 */
export async function started($: { session: { start: (e: { surface: 'terminal'; isInteractive: boolean; cwd: string }) => Promise<unknown> } }, world: World) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await world.clock.advance(100)
}
