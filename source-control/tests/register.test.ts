import { describe, expect, test } from 'claude-code/testing'

import { BAND_PROPS, BEHIND_STATUS, ENGINE_BAND, gitCommand, inRepository, NOW, PANE_PROPS, REPOSITORY, started } from './fixtures'
import type { Script } from './fixtures'

const PLUGIN = 'source-control'
const SURFACES = ['terminal', 'desktop'] as const
const BAND = { plugin: PLUGIN, component: 'AbovePrompt', props: BAND_PROPS } as const
const PANE = { plugin: PLUGIN, component: 'Pane', requestId: 'source-control', props: PANE_PROPS } as const

/**
 * A repository's files as a fresh clone leaves them, fetched a minute ago.
 */
const GIT_FILES: [string, number][] = [
  ['/work/.git', NOW],
  ['/work/.git/HEAD', NOW],
  ['/work/.git/index', NOW],
  ['/work/.git/FETCH_HEAD', NOW - 60_000],
]

/**
 * How often `/git debug` says the band or the panel was drawn.
 */
const drawsOf = (text: string | undefined, site: 'band' | 'pane') => Number(new RegExp(`${site}: (\\d+) draws`).exec(text ?? '')?.[1] ?? NaN)

describe('register', () => {
  test('the band shows branch, counts and a Sync button on every surface', async ($, on) => {
    const world = inRepository(on, REPOSITORY, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))

    await started($, world)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...BAND, surface })

      expect((await ui.find({ type: 'Text', text: /main/ }))?.text).toContain('main 2↓')
      expect((await ui.find({ type: 'Text', text: /vor 1 min/ }))?.text).toBeDefined()

      const primary = await ui.find({ type: 'Button', key: 'primary' })
      const drawn = JSON.stringify(await ui.drawn())

      expect(primary?.text).toBe(surface === 'terminal' ? '↻ Sync 2↓' : 'Sync 2↓')
      expect(await ui.find({ type: 'Button', key: 'panel' })).toBeDefined()

      // VS Code's blue on the terminal, the app's own primary button elsewhere
      if (surface === 'terminal') {
        expect(drawn).toContain('rgb(0,120,212)')
      } else {
        expect(primary?.props.variant).toBe('primary')
        expect(drawn).not.toContain('rgb(0,120,212)')
      }

      if (surface === 'desktop') {
        expect(await ui.find({ type: 'Svg' })).toBeDefined()
      }

      await ui.unmount()
    }
  })

  test('outside a repository the band is left to the engine', async ($, on) => {
    const world = inRepository(on, {})

    on('ui.render', { component: 'AbovePrompt' }, () => ENGINE_BAND)
    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect((await ui.find({ type: 'Text', text: 'engine band' }))?.text).toBe('engine band')
    expect(await ui.find({ type: 'Button', key: 'primary' })).toBeUndefined()

    const { text } = await $.command.run(gitCommand(''))

    expect(text).toBe('Kein Git-Repository in diesem Ordner.')
  })

  test('a start that never fetched fetches quietly, without prompts', async ($, on) => {
    const world = inRepository(on)

    await started($, world)

    const fetch = world.runs.find(run => run.line.startsWith('fetch --prune origin'))

    expect(fetch?.env).toMatchObject({
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=15',
    })
    expect(world.toasts.some(toast => toast.includes('2 Commits auf origin/main'))).toBe(true)
  })

  test('the blue button pulls with --no-rebase, then reads again', async ($, on) => {
    const script: Script = {
      ...REPOSITORY,
      'pull --no-rebase': () => {
        script['status --porcelain=v2'] = { stdout: BEHIND_STATUS.replace('+0 -2', '+0 -0') }

        return {}
      },
    }

    const world = inRepository(on, script, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))

    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await ui.press({ key: 'primary' })
    await world.clock.advance(100)

    expect(world.runs.some(run => run.line === 'pull --no-rebase')).toBe(true)
    expect(world.runs.some(run => run.line.startsWith('push'))).toBe(false)
    expect(world.toasts.at(-1)).toBe('Sync: 2 Commits geholt')
    expect((await ui.find({ type: 'Button', key: 'primary' }))?.text).toBe('✓ Commit…')
  })

  test('an action ends with its outcome and the new reading in one drawing', async ($, on) => {
    const script: Script = {
      ...REPOSITORY,
      'pull --no-rebase': () => {
        script['status --porcelain=v2'] = { stdout: BEHIND_STATUS.replace('+0 -2', '+0 -0') }

        return {}
      },
    }

    const world = inRepository(on, script, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))
    const writes: string[] = []

    on('state.set', ($, e, next) => {
      const { key, value } = e as unknown as { key: string; value: { busy?: string | null; notice?: { text: string } | null; behind?: number } | null }

      if (key === 'view') {
        writes.push(value?.busy ? 'busy' : `idle${value?.notice ? `: ${value.notice.text}` : ''}`)
      } else if (key === 'snapshot') {
        writes.push(`${value?.behind ?? '-'}↓`)
      }

      return next(e)
    })

    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    writes.length = 0
    await ui.press({ key: 'primary' })
    await world.clock.advance(100)

    // the old Sync button never comes back between the end of busy and the
    // new reading
    expect(writes).toEqual(['busy', '0↓', 'idle: Sync: 2 Commits geholt'])
  })

  test('/git opens the panel focused; the panel stages a file and commits', async ($, on) => {
    const script: Script = {
      ...REPOSITORY,
      'add -A': {},
      'commit -m': {},
      'log -1 --format=%h %s': { stdout: '3333333 Betriebsstunden ergänzt\n' },
    }

    const world = inRepository(on, script, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))

    await started($, world)

    const opened = await $.command.run(gitCommand(''))

    expect(opened.text).toBe('Source Control geöffnet')
    expect(world.opened.at(-1)).toMatchObject({ id: 'source-control', focus: true })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    expect((await ui.find({ type: 'Button', key: 'fold:changes' }))?.text).toBe('▾ ÄNDERUNGEN 1')
    expect((await ui.find({ type: 'Text', text: 'app.js' }))?.text).toBe('app.js')
    expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({
      href: 'https://github.com/manuel-will/demo',
      label: 'github.com/manuel-will/demo',
    })

    await ui.press({ key: 'stage:app.js' })

    const staged = world.runs.find(run => run.line === 'add -A -- app.js')

    expect(staged?.env.GIT_LITERAL_PATHSPECS).toBe('1')

    await ui.input({ key: 'message-0', text: 'Betriebsstunden ergänzt' })

    expect(world.runs.map(run => run.line)).toEqual(expect.arrayContaining(['add -A', 'commit -m Betriebsstunden ergänzt']))
    expect(world.toasts.at(-1)).toBe('Commit erstellt: 3333333 Betriebsstunden ergänzt')
    expect(await ui.find({ type: 'Input', key: 'message-1' })).toBeDefined()
  })

  test('/git commit refuses an empty message and /git status sums up', async ($, on) => {
    const world = inRepository(on, REPOSITORY, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))

    await started($, world)

    const empty = await $.command.run(gitCommand('commit'))
    const status = await $.command.run(gitCommand('status'))

    expect(empty.text).toBe('Bitte so aufrufen: /git commit <Nachricht>')
    expect(status.text).toBe('Branch main · Upstream origin/main · 2↓ · 1 geänderte Datei')
    expect(world.runs.some(run => run.line.startsWith('commit'))).toBe(false)
  })

  test('a branch without upstream offers to publish it', async ($, on) => {
    const script: Script = {
      ...REPOSITORY,
      'status --porcelain=v2': { stdout: '# branch.oid 2222222222222222222222222222222222222222\0# branch.head feature/x\0' },
      'push -u origin HEAD': {},
    }

    const world = inRepository(on, script, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))

    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect((await ui.find({ type: 'Button', key: 'primary' }))?.text).toBe('⇡ Veröffentlichen')

    await ui.press({ key: 'primary' })

    expect(world.runs.some(run => run.line === 'push -u origin HEAD')).toBe(true)
    expect(world.toasts.at(-1)).toBe('Branch veröffentlicht: origin/feature/x')
  })

  test('conflicts hand over to Claude or abort the merge', async ($, on) => {
    const script: Script = {
      ...REPOSITORY,
      'status --porcelain=v2': {
        stdout: BEHIND_STATUS.replace('+0 -2', '+1 -2') + 'u UU N... 100644 100644 100644 100644 a b c app.js\0',
      },
      'merge --abort': {},
    }

    const world = inRepository(
      on,
      script,
      new Map([
        ['/work/.git/FETCH_HEAD', NOW - 60_000],
        ['/work/.git/MERGE_HEAD', NOW],
      ]),
    )

    await started($, world)

    const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect((await band.find({ type: 'Button', key: 'primary' }))?.text).toBe('Auflösen…')

    await $.command.run(gitCommand(''))

    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

    expect((await ui.find({ type: 'Text', text: /Merge läuft/ }))?.text).toBe('Merge läuft · 1 Konflikt')

    await ui.press({ key: 'pane-primary' })

    expect(world.prompts.at(-1)).toContain('app.js')
    expect(world.prompts.at(-1)).toContain('git commit --no-edit')

    await ui.press({ key: 'pane-abort' })

    expect(world.runs.some(run => run.line === 'merge --abort')).toBe(true)
  })

  test('a failed fetch shows offline, never a green check', async ($, on) => {
    const script: Script = {
      ...REPOSITORY,
      'status --porcelain=v2': { stdout: BEHIND_STATUS.replace('+0 -2', '+0 -0').replace(/1 \.M[^\0]*\0/, '') },
      'fetch --prune origin': { exitCode: 128, stderr: 'fatal: unable to access: Could not resolve host: github.com' },
    }

    const world = inRepository(on, script)

    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const status = (await ui.findAll({ type: 'Text' })).map(text => text.text).join(' ')

    expect(status).toContain('offline')
    expect(status).not.toContain('✓')
  })

  test("Claude's git command refreshes the band right after it", async ($, on) => {
    const world = inRepository(on, { ...REPOSITORY }, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))

    on('tool.call', () => ({ result: 'done' }))
    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect((await ui.find({ type: 'Button', key: 'primary' }))?.text).toBe('↻ Sync 2↓')

    world.script['status --porcelain=v2'] = { stdout: BEHIND_STATUS.replace('+0 -2', '+0 -0') }

    const before = world.runs.length

    await $.tool.call({ tool: 'Bash', command: 'git pull', description: 'Pull' })
    await world.clock.advance(1000)

    expect(world.runs.slice(before).some(run => run.line.startsWith('status --porcelain=v2'))).toBe(true)
    expect((await ui.find({ type: 'Button', key: 'primary' }))?.text).toBe('✓ Commit…')
  })

  test('the desktop panel draws icons, the history rail and at most five incoming commits', async ($, on) => {
    const commits = Array.from({ length: 8 }, (_, index) =>
      `h${index}\x1fa${index}\x1f1700000000\x1fh${index + 1}\x1f${index === 0 ? 'refs/remotes/origin/main' : ''}\x1fPC: Änderung ${index}\x1e\n`,
    ).join('')

    const world = inRepository(
      on,
      {
        ...REPOSITORY,
        'status --porcelain=v2': { stdout: BEHIND_STATUS.replace('+0 -2', '+0 -7') },
        'log --topo-order': { stdout: commits },
      },
      new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]),
    )

    await started($, world)
    await $.command.run(gitCommand(''))

    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svgs = await ui.findAll({ type: 'Svg' })

    expect(svgs.length).toBeGreaterThan(10)

    // drawn as the icons the desktop shows are: no classes, no <line>, an alt
    for (const svg of svgs) {
      expect(String(svg.props.source)).not.toMatch(/class=|<line/)
      expect(String(svg.props.alt)).not.toBe('')
    }

    expect(await ui.find({ type: 'Text', text: 'Source Control' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /weitere/ }))?.text).toBe('… 2 weitere')
    expect((await ui.find({ type: 'Button', key: 'tool:fetch' }))?.text).toBe('Fetch')

    const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })

    expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
    expect((await terminal.find({ type: 'Button', key: 'tool:fetch' }))?.text).toBe('↻ Fetch')
  })

  test('a clean repository shows no commit field; the panel button is the app\'s primary one', async ($, on) => {
    const world = inRepository(
      on,
      { ...REPOSITORY, 'status --porcelain=v2': { stdout: BEHIND_STATUS.replace(/1 \.M[^\0]*\0/, '') } },
      new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]),
    )

    await started($, world)
    await $.command.run(gitCommand(''))

    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

    expect(await ui.find({ type: 'Input' })).toBeUndefined()
    expect((await ui.find({ type: 'Button', key: 'pane-primary' }))?.text).toBe('Sync Changes 2↓')
    expect((await ui.find({ type: 'Button', key: 'pane-primary' }))?.props.variant).toBe('primary')
  })

  test('a change git makes anywhere is noticed within seconds, without running git', async ($, on) => {
    const world = inRepository(on, REPOSITORY, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]))

    await started($, world)
    await world.clock.advance(2_100)

    const before = world.runs.length

    await world.clock.advance(4_000)

    expect(world.runs.slice(before).some(run => run.line.startsWith('status'))).toBe(false)

    world.files.set('/work/.git/index', NOW + 5_000)
    await world.clock.advance(2_100)

    expect(world.runs.slice(before).some(run => run.line.startsWith('status'))).toBe(true)
  })

  test('a repository rebuilt in place is found again within seconds', async ($, on) => {
    const world = inRepository(on, { ...REPOSITORY }, new Map(GIT_FILES))

    on('ui.render', { component: 'AbovePrompt' }, () => ENGINE_BAND)
    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    expect(await ui.find({ type: 'Button', key: 'primary' })).toBeDefined()

    // the folder is emptied: no .git, git finds no repository
    const saved = { rev: world.script['rev-parse --path-format=absolute'], status: world.script['status --porcelain=v2'] }

    delete world.script['rev-parse --path-format=absolute']
    delete world.script['status --porcelain=v2']
    world.files.clear()
    await world.clock.advance(2_100)

    expect(await ui.find({ type: 'Button', key: 'primary' })).toBeUndefined()

    // a fresh clone lands in the same folder, well before the next poll
    world.script['rev-parse --path-format=absolute'] = saved.rev!
    world.script['status --porcelain=v2'] = saved.status!

    for (const [path] of GIT_FILES) {
      world.files.set(path, NOW + 10_000)
    }

    await world.clock.advance(4_100)

    expect(await ui.find({ type: 'Button', key: 'primary' })).toBeDefined()
  })

  test('an unchanged repository is not drawn again', async ($, on) => {
    // without a remote: no background fetch, no fetch age that moves on
    const world = inRepository(on, { ...REPOSITORY, remote: { stdout: '' } }, new Map(GIT_FILES))

    on('tool.call', () => ({ result: 'done' }))
    await started($, world)
    await $.command.run(gitCommand(''))
    await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.ui.mount({ ...PANE, surface: 'desktop' })
    await world.clock.advance(1_000)

    const before = (await $.command.run(gitCommand('debug'))).text

    // two status polls and a refresh after a tool call, nothing changed
    await $.tool.call({ tool: 'Bash', command: 'ls', description: 'List' })
    await world.clock.advance(65_000)

    const after = (await $.command.run(gitCommand('debug'))).text
    expect(drawsOf(after, 'band')).toBe(drawsOf(before, 'band'))
    expect(drawsOf(after, 'pane')).toBe(drawsOf(before, 'pane'))
  })

  test('the age of the last fetch still moves on', async ($, on) => {
    const world = inRepository(on, { ...REPOSITORY }, new Map(GIT_FILES))

    await started($, world)

    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    expect(await ui.find({ type: 'Text', text: /vor 1 min/ })).toBeDefined()

    await world.clock.advance(65_000)

    expect(await ui.find({ type: 'Text', text: /vor 2 min/ })).toBeDefined()
  })

  test('a playground repository gets the state the tour waits for', async ($, on) => {
    const world = inRepository(
      on,
      REPOSITORY,
      new Map([
        ['/work/.git/FETCH_HEAD', NOW - 60_000],
        ['/work/.git/sc-tour', NOW],
      ]),
    )

    await started($, world)

    const report = world.writes.find(write => write.path === '/work/.git/sc-tour-state.json')

    expect(JSON.parse(report?.text ?? '{}')).toMatchObject({ version: '9.9.9', branch: 'main', behind: 2, ahead: 0 })
  })
})

describe('language', () => {
  test('English unless the session says German', async ($, on) => {
    const world = inRepository(on, REPOSITORY, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]), { LANG: 'en_US.UTF-8' })

    await started($, world)

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    expect(await ui.find({ type: 'Button', text: /CHANGES 1/ })).toBeDefined()
    expect((await $.command.run(gitCommand('status'))).text).toBe('Branch main · Upstream origin/main · 2↓ · 1 changed file')
  })

  test("Claude Code's language setting makes it German", async ($, on) => {
    const world = inRepository(on, REPOSITORY, new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]]), {})

    on('settings.read', () => ({ value: { language: 'Deutsch' } }))
    await started($, world)

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    expect(await ui.find({ type: 'Button', text: /ÄNDERUNGEN 1/ })).toBeDefined()
  })
})
