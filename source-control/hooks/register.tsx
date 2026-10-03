/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PaneOpenArgs, Register, RenderSurface, Timer, UiOpenResult, UiPane } from 'claude-code'

import type { ScProbe, ScSnapshot, ScView } from '../types'
import { runAction, runningLabelOf } from './actions'
import type { ActionName, ActionOutcome } from './actions'
import { pickLanguage, setLanguage, t } from './i18n'
import type { Language } from './i18n'
import { gitOf } from './git'
import type { Git, ProcessRun } from './git'
import type { RepoPaths } from './parse'
import { readSnapshot, repoOf, withDetails } from './snapshot'
import type { Files } from './snapshot'
import { bandView } from './ui/band'
import type { Handlers } from './ui/handlers'
import { changeCountOf, countsOf, operationTextOf } from './ui/model'
import { PANE_ID, PANE_ROWS, PANE_TITLE, paneView } from './ui/pane'
import { kitOf } from './ui/theme'

const INITIAL_VIEW: ScView = {
  isPaneOpen: false,
  busy: null,
  isFetching: false,
  fetchError: null,
  notice: null,
  folded: [],
  commitField: 0,
}

const PROBE_REF = { plugin: 'source-control', key: 'probe' } as const
const SNAPSHOT_REF = { plugin: 'source-control', key: 'snapshot' } as const
const PROBE = atom(PROBE_REF, 'unknown' as ScProbe)
const SNAPSHOT = atom(SNAPSHOT_REF, null as ScSnapshot | null)
const VIEW = atom({ plugin: 'source-control', key: 'view' } as const, INITIAL_VIEW)

const COMMAND = 'git'
const WATCH_MS = 2_000
const REFRESH_AFTER_TOOL_MS = 400
const QUIET_SSH = 'ssh -o BatchMode=yes -o ConnectTimeout=15'
const QUIET_ACTIONS: readonly ActionName[] = ['stage', 'unstage', 'stageAll', 'unstageAll']
const REMOTE_ACTIONS: readonly ActionName[] = ['fetch', 'pull', 'push', 'sync', 'publish']

/**
 * The engine as session.start bound it; every timer, press and later hook
 * reaches the engine through it.
 */
type Host = {
  run: ProcessRun
  files: Files
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => Timer
  every: (ms: number, fn: () => void) => Timer
  cwd: () => Promise<string>
  sshEnv: () => Promise<readonly (string | undefined)[]>
  setProbe: (probe: ScProbe) => Promise<unknown>
  setSnapshot: (snapshot: ScSnapshot | null) => Promise<unknown>
  getSnapshot: () => Promise<ScSnapshot | null>
  getView: () => Promise<ScView>
  updateView: (change: (view: ScView) => ScView) => Promise<unknown>
  toast: (text: string) => void
  log: (text: string) => void
  open: (pane: PaneOpenArgs) => Promise<UiOpenResult>
  close: (id: string) => Promise<void>
  panes: () => Promise<readonly UiPane[]>
  surfaces: () => Promise<readonly RenderSurface[]>
  readManifest: () => Promise<string>
  write: (path: string, text: string) => Promise<void>
  focus: (key: string) => Promise<unknown>
  submitPrompt: (text: string) => Promise<unknown>
}

function bind($: EngineInterface): Host {
  return {
    run: (argv, init) => $.process.run(argv, init),
    files: {
      mtimeOf: path => $.fs.stat(path).then(stat => stat.mtimeMs, () => null),
      exists: path => $.fs.exists(path),
      names: path => $.fs.list(path).then(entries => entries.map(entry => entry.name)),
    },
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    every: (ms, fn) => $.clock.every(ms, fn),
    cwd: () => $.session.cwd(),
    sshEnv: () => Promise.all([$.env.get('GIT_SSH_COMMAND'), $.env.get('GIT_SSH')]),
    setProbe: probe => $.state.set(PROBE_REF, probe),
    setSnapshot: snapshot => $.state.set(SNAPSHOT_REF, snapshot),
    getSnapshot: () => read($, SNAPSHOT),
    getView: () => read($, VIEW),
    updateView: change => update($, VIEW, view => change(view ?? INITIAL_VIEW)),
    toast: text => $.ui.toast(text, { timeoutMs: 6000 }),
    log: text => $.ui.log(text, { to: 'debug' }),
    open: pane => $.ui.open(pane),
    close: id => $.ui.close({ id }),
    panes: () => $.ui.panes(),
    surfaces: () => $.session.surfaces(),
    readManifest: () => $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).then(text => String(text)),
    write: (path, text) => $.fs.write(path, text),
    focus: key => $.ui.focus({ requestId: PANE_ID, key }),
    submitPrompt: text => $.prompt.submit({ text }),
  }
}

const numberOf = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Source Control: the band above the prompt, the panel beside the
 * transcript, `/git`, a refresh after Claude's commands and edits, and a
 * background fetch.
 */
export const register: Register = (on, options) => {
  const pollMs = Math.max(5, numberOf(options.pollSeconds, 30)) * 1000
  const fetchEveryMs = numberOf(options.fetchIntervalMinutes, 10) * 60_000
  const staleAfterMs = Math.max(1, numberOf(options.staleAfterHours, 12)) * 3_600_000

  let host: Host | null = null
  let paths: RepoPaths | null = null
  let probedCwd: string | null = null
  let isRefreshing = false
  let isRefreshQueued = false
  let refreshTimer: Timer | null = null
  let isActing = false
  let lastQuietFetch = 0
  let quietEnv: Record<string, string> | null = null
  let hasWarnedBehind = false
  let draft = ''
  let lastOpen: string | null = null
  let bandDraws = 0
  let language: Language = 'en'
  let paneDraws = 0
  const bandSurfaces = new Set<RenderSurface>()
  const paneSurfaces = new Set<RenderSurface>()
  let timers: Timer[] = []
  let version = '?'
  let watchedSign = ''
  let fetchErrorAt = 0

  /**
   * The files git touches on every commit, checkout, stage, fetch, pull and
   * merge: stat'ing them every few seconds notices a change made anywhere
   * (a terminal, another tool, a script) without running git.
   */
  async function signOf(engine: Host, repo: RepoPaths): Promise<string> {
    const watched = [
      `${repo.gitDir}/HEAD`,
      `${repo.gitDir}/index`,
      `${repo.gitDir}/logs/HEAD`,
      `${repo.gitDir}/MERGE_HEAD`,
      `${repo.gitDir}/FETCH_HEAD`,
      `${repo.commonDir}/FETCH_HEAD`,
      `${repo.commonDir}/packed-refs`,
    ]

    const times = await Promise.all(watched.map(path => engine.files.mtimeOf(path).catch(() => null)))

    return times.map(time => time ?? '-').join('|')
  }

  async function watch() {
    const engine = host
    const repo = paths

    if (!engine || !repo || isRefreshing) {
      return
    }

    const sign = await signOf(engine, repo)

    if (sign !== watchedSign) {
      watchedSign = sign
      // the repository changed (a pull, a new clone, another fetch): a failed
      // fetch's back-off no longer says anything about the next one
      lastQuietFetch = 0
      scheduleRefresh(0)
    }

    await maybeFetch()
  }

  /**
   * In a playground repository (one holding `.git/sc-tour`) the mod reports
   * what it last showed, so a scripted tour knows when to take its picture.
   */
  async function reportTour(engine: Host, snapshot: ScSnapshot) {
    const marker = `${snapshot.gitDir}/sc-tour`

    if (!(await engine.files.exists(marker).catch(() => false))) {
      return
    }

    const view = await engine.getView()

    await engine
      .write(
        `${snapshot.gitDir}/sc-tour-state.json`,
        JSON.stringify({
          version,
          readAt: snapshot.readAt,
          branch: snapshot.branch,
          ahead: snapshot.ahead,
          behind: snapshot.behind,
          fetchedAt: snapshot.fetchedAt,
          fetchError: view.fetchError,
          isFetching: view.isFetching,
          hasDetails: snapshot.details !== null,
        }),
      )
      .catch(() => undefined)
  }

  const gitFor = (engine: Host): Git => gitOf(engine.run, () => ({ cwd: paths?.root }))

  async function refreshOnce(engine: Host) {
    const cwd = await engine.cwd().catch(() => probedCwd ?? '')

    if (paths === null || cwd !== probedCwd) {
      probedCwd = cwd
      paths = await repoOf(gitFor(engine), cwd)
      await engine.setProbe(paths ? 'repo' : 'none')
    }

    if (paths === null) {
      await engine.setSnapshot(null)

      return
    }

    const git = gitFor(engine)
    const snapshot = await readSnapshot(git, engine.files, paths, await engine.now())

    if (snapshot === null) {
      paths = null
      await engine.setProbe('none')
      await engine.setSnapshot(null)

      return
    }

    let view = await engine.getView()

    // a fetch that landed after the last failed one (anyone's) means the
    // remote is reachable again
    if (view.fetchError !== null && snapshot.fetchedAt !== null && snapshot.fetchedAt > fetchErrorAt) {
      await engine.updateView(current => ({ ...current, fetchError: null }))
      view = await engine.getView()
    }

    const read = view.isPaneOpen ? await withDetails(git, engine.files, snapshot) : snapshot

    await engine.setSnapshot(read)
    await reportTour(engine, read)
  }

  async function refresh() {
    const engine = host

    if (!engine) {
      return
    }

    if (isRefreshing) {
      isRefreshQueued = true

      return
    }

    isRefreshing = true

    try {
      do {
        isRefreshQueued = false
        await refreshOnce(engine)
      } while (isRefreshQueued)
    } catch (error) {
      engine.log(`refresh failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      isRefreshing = false
    }
  }

  function scheduleRefresh(delayMs: number) {
    if (!host || refreshTimer) {
      return
    }

    refreshTimer = host.after(delayMs, () => {
      refreshTimer = null
      void refresh()
    })
  }

  async function quietEnvOf(engine: Host): Promise<Record<string, string>> {
    if (quietEnv) {
      return quietEnv
    }

    const [[ownCommand, ownSsh] = [], configured] = await Promise.all([
      engine.sshEnv().catch((): readonly (string | undefined)[] => []),
      gitFor(engine)(['config', '--get', 'core.sshCommand']),
    ])

    quietEnv = !ownCommand && !ownSsh && !configured.ok ? { GIT_SSH_COMMAND: QUIET_SSH } : {}

    return quietEnv
  }

  async function act(
    name: ActionName,
    arg: { message?: string; paths?: readonly string[] } = {},
    isQuiet = false,
  ): Promise<ActionOutcome | null> {
    const engine = host

    if (!engine || !paths) {
      return null
    }

    if (isActing) {
      if (!isQuiet) {
        engine.toast(t().busy)
      }

      return null
    }

    isActing = true

    const showsBusy = !isQuiet && !QUIET_ACTIONS.includes(name)

    await engine.updateView(view => ({
      ...view,
      busy: showsBusy ? runningLabelOf(name) : view.busy,
      isFetching: isQuiet ? true : view.isFetching,
      notice: isQuiet ? view.notice : null,
    }))

    try {
      const git = gitFor(engine)
      const repo = paths
      const snapshot = (await readSnapshot(git, engine.files, repo, await engine.now())) ?? (await engine.getSnapshot())

      if (!snapshot) {
        return null
      }

      const outcome = await runAction(
        {
          git,
          snapshot,
          reread: async () => readSnapshot(git, engine.files, repo, await engine.now()),
          quietEnv: isQuiet ? await quietEnvOf(engine) : {},
        },
        name,
        arg,
        isQuiet,
      )

      const isNoticed = !isQuiet && outcome.text !== ''
      const hasReachedRemote = outcome.ok && REMOTE_ACTIONS.includes(name)
      const hasFetchFailed = name === 'fetch' && !outcome.ok
      const at = await engine.now()

      if (hasFetchFailed) {
        fetchErrorAt = at
      }

      await engine.updateView(view => ({
        ...view,
        fetchError: hasReachedRemote ? null : hasFetchFailed ? outcome.text : view.fetchError,
        notice: isNoticed
          ? { tone: outcome.ok ? 'success' : 'error', text: outcome.text, at, retry: outcome.retry ?? null }
          : view.notice,
        commitField: name === 'commit' && outcome.ok ? view.commitField + 1 : view.commitField,
      }))

      if (name === 'commit' && outcome.ok) {
        draft = ''
      }

      if (isNoticed) {
        engine.toast(outcome.text)
      }

      return outcome
    } finally {
      isActing = false
      await engine.updateView(view => ({ ...view, busy: null, isFetching: false }))
      await refresh()
    }
  }

  async function maybeFetch(isStart = false) {
    const engine = host

    if (!engine || !paths || isActing || fetchEveryMs <= 0) {
      return
    }

    const snapshot = await engine.getSnapshot()

    if (!snapshot || snapshot.remoteName === null) {
      return
    }

    const now = await engine.now()
    const age = snapshot.fetchedAt === null ? Number.POSITIVE_INFINITY : now - snapshot.fetchedAt
    const retryMs = Math.min(fetchEveryMs, 5 * 60_000)

    if (age < fetchEveryMs || now - lastQuietFetch < retryMs) {
      if (isStart) {
        await warnIfBehind(engine)
      }

      return
    }

    // a failed fetch waits a while before the next try; a good one does not
    lastQuietFetch = now

    const fetched = await act('fetch', {}, true)

    if (fetched?.ok) {
      lastQuietFetch = 0
    }

    if (isStart) {
      await warnIfBehind(engine)
    }
  }

  async function warnIfBehind(engine: Host) {
    const snapshot = await engine.getSnapshot()

    if (hasWarnedBehind || !snapshot || snapshot.behind === 0 || snapshot.upstream === null) {
      return
    }

    hasWarnedBehind = true
    engine.toast(t().behindToast(snapshot.behind, snapshot.upstream))
  }

  async function setPaneOpen(isOpen: boolean) {
    await host?.updateView(view => ({ ...view, isPaneOpen: isOpen }))
  }

  async function openPane(isFocused: boolean): Promise<UiOpenResult | null> {
    const engine = host

    if (!engine) {
      return null
    }

    await setPaneOpen(true)

    const opened = await engine.open({ id: PANE_ID, title: PANE_TITLE, rows: PANE_ROWS, ...(isFocused ? { focus: true as const } : {}) })

    lastOpen = opened.isPlaced ? 'placed' : opened.reason
    await refresh()

    return opened
  }

  /**
   * The panel's open, focus and close in one: closed opens it focused (the
   * terminal gives a pane the keyboard no other way); open but without the
   * keyboard takes it when `isFocusing`; otherwise it closes.
   *
   * @returns whether the panel is open afterwards
   */
  async function togglePane(isFocusing: boolean): Promise<{ isOpen: boolean; reason: string | null }> {
    const engine = host

    if (!engine) {
      return { isOpen: false, reason: t().notReady }
    }

    const pane = (await engine.panes()).find(one => one.id === PANE_ID)

    if (pane && pane.isPlaced && isFocusing && !pane.isFocused) {
      await engine.open({ id: PANE_ID, title: PANE_TITLE, focus: true })

      return { isOpen: true, reason: null }
    }

    if (pane && pane.isPlaced) {
      await engine.close(PANE_ID).catch(() => undefined)
      await setPaneOpen(false)

      return { isOpen: false, reason: null }
    }

    const opened = await openPane(true)

    return { isOpen: true, reason: opened && !opened.isPlaced ? opened.reason : null }
  }

  async function commitWith(message: string | undefined) {
    const engine = host
    const text = (message ?? draft).trim()

    if (!engine) {
      return
    }

    const snapshot = await engine.getSnapshot()
    const isMerging = snapshot?.operation === 'merge' && snapshot.conflicts.length === 0

    if (text === '' && !isMerging) {
      engine.toast(t().enterMessageFirst)

      const view = await engine.getView()

      if (!view.isPaneOpen) {
        await openPane(true)
      }

      await engine.focus(`message-${view.commitField}`).catch(() => undefined)

      return
    }

    await act('commit', { message: text })
  }

  const handlers: Handlers = {
    act: (name, arg) => {
      void act(name, arg)
    },
    primary: kind => {
      if (kind === 'sync' || kind === 'publish') {
        void act(kind)
      } else {
        void openPane(true)
      }
    },
    togglePane: () => {
      void togglePane(false).then(result => {
        if (result.reason !== null) {
          host?.toast(t().paneNotShown(result.reason))
        }
      })
    },
    toggleFold: id => {
      void host?.updateView(view => ({
        ...view,
        folded: view.folded.includes(id) ? view.folded.filter(one => one !== id) : [...view.folded, id],
      }))
    },
    commit: message => {
      void commitWith(message)
    },
    draft: text => {
      draft = text
    },
    askClaude: () => {
      void askClaude()
    },
  }

  async function askClaude() {
    const engine = host
    const snapshot = await engine?.getSnapshot()

    if (!engine || !snapshot || snapshot.conflicts.length === 0) {
      return
    }

    const files = snapshot.conflicts.map(file => file.path).join(', ')
    const operation = snapshot.operation ?? 'merge'

    const finish = operation === 'merge' ? t().conflictFinishMerge : t().conflictFinishOther(operation)
    const text = t().conflictPrompt(operation, files, finish)

    await engine.submitPrompt(text).catch(() => undefined)
    engine.toast(t().claudeOnIt)
  }

  function summaryOf(snapshot: ScSnapshot): string {
    const parts = [
      t().summaryBranch(snapshot.branch ?? `${snapshot.head ?? '?'} (detached)`),
      snapshot.upstream ? t().summaryUpstream(snapshot.upstream) : t().noUpstream,
      countsOf(snapshot) || t().inSync,
      t().changedFiles(changeCountOf(snapshot)),
      operationTextOf(snapshot),
    ].filter((part): part is string => typeof part === 'string' && part !== '')

    return parts.join(' · ')
  }

  on('session.start', async ($, e, next) => {
    const engine = bind($)

    host = engine
    paths = null
    probedCwd = null

    // the language: the plugin's option, Claude Code's own language setting,
    // the locale, the runtime's locale; English where none says German
    const settings = await $.settings.read().catch(() => ({}) as Record<string, unknown>)
    const locale = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().locale
      } catch {
        return undefined
      }
    })()

    language = pickLanguage([
      options.language,
      settings.language,
      await $.env.get('LC_ALL'),
      await $.env.get('LC_MESSAGES'),
      await $.env.get('LANG'),
      locale,
    ])
    setLanguage(language)

    for (const timer of timers) {
      timer.cancel()
    }

    await $.command
      .register({
        name: COMMAND,
        description: t().commandDescription,
        argumentHint: t().commandHint,
      })
      .catch(() => undefined)

    const panes = await $.ui.panes().catch((): readonly UiPane[] => [])

    await engine.updateView(view => ({
      ...view,
      isPaneOpen: panes.some(pane => pane.id === PANE_ID),
      busy: null,
      isFetching: false,
    }))

    version = await engine
      .readManifest()
      .then(text => String((JSON.parse(text) as { version?: unknown }).version ?? '?'))
      .catch(() => '?')

    timers = [
      engine.every(pollMs, () => scheduleRefresh(0)),
      engine.every(WATCH_MS, () => {
        void watch()
      }),
      engine.after(0, () => {
        void refresh().then(() => maybeFetch(true))
      }),
    ]

    return next(e)
  })

  // the menu lists the options in the session's language (the manifest can
  // only hold one, English)
  on('config.describe', async ($, e, next) => {
    const described = await next(e)
    const field = e.key.startsWith('source-control.') ? e.key.slice('source-control.'.length) : null
    const words: readonly string[] | undefined = field === null ? undefined : (t().config as Record<string, readonly string[] | undefined>)[field]
    const [label, description] = words ?? []

    return label === undefined ? described : { ...described, label, ...(description === undefined ? {} : { description }) }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      scheduleRefresh(150)
    }

    return result
  })

  on('tool.call', { tool: /^(Bash|PowerShell|Edit|Write|NotebookEdit)$/ }, async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      scheduleRefresh(REFRESH_AFTER_TOOL_MS)
    }
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    const result = await next(e)

    await setPaneOpen(false)

    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (!host) {
      return { text: t().notReadyYet }
    }

    if (!paths) {
      await refresh()
    }

    if (!paths) {
      return { text: t().noRepository }
    }

    const args = e.args.trim()
    const [verb = ''] = args.split(/\s+/)

    if (verb === '') {
      const toggled = await togglePane(true)

      if (toggled.reason !== null) {
        return { text: t().couldNotShow(toggled.reason) }
      }

      return { text: toggled.isOpen ? t().opened : t().closed }
    }

    if (verb === 'debug') {
      const [surfaces, panes, probe] = await Promise.all([
        host.surfaces().catch(() => []),
        host.panes().catch((): readonly UiPane[] => []),
        host.getSnapshot(),
      ])

      return {
        text: [
          `version: ${version}`,
          `surfaces: ${surfaces.join(', ') || '(none)'}`,
          `band: ${bandDraws} draws${bandSurfaces.size > 0 ? ` on ${[...bandSurfaces].join(', ')}` : ''}`,
          `pane: ${paneDraws} draws${paneSurfaces.size > 0 ? ` on ${[...paneSurfaces].join(', ')}` : ''}, last open: ${lastOpen ?? '–'}`,
          `panes: ${panes.map(one => `${one.id} (shown ${one.isShown}, placed ${one.isPlaced})`).join('; ') || '(none)'}`,
          `repo: ${probe ? `${probe.root} · ${probe.branch ?? 'detached'}` : 'none read'}`,
          `language: ${language}`,
        ].join('\n'),
      }
    }

    if (verb === 'status') {
      await refresh()
      const snapshot = await host.getSnapshot()

      return { text: snapshot ? summaryOf(snapshot) : t().noRepository }
    }

    if (verb === 'commit') {
      const message = args.slice('commit'.length).trim()

      if (message === '') {
        return { text: t().commitUsage }
      }

      const outcome = await act('commit', { message })

      return { text: outcome?.text ?? t().busy }
    }

    const verbs: readonly ActionName[] = ['fetch', 'pull', 'push', 'sync', 'publish']
    const name = verbs.find(one => one === verb)

    if (!name) {
      return { text: t().usage }
    }

    const outcome = await act(name)

    return { text: outcome?.text || t().busy }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    bandDraws += 1
    bandSurfaces.add(e.surface)

    if (e.props.hasSurvey) {
      return next(e)
    }

    const [probe, snapshot, view] = await Promise.all([read($, PROBE), read($, SNAPSHOT), read($, VIEW)])

    if (probe !== 'repo' || snapshot === null) {
      return next(e)
    }

    const kit = kitOf($.ui.resolve(e), e.surface, e.props.bodyColumns)

    return bandView(kit, snapshot, view ?? INITIAL_VIEW, handlers, staleAfterMs)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    paneDraws += 1
    paneSurfaces.add(e.surface)

    const [snapshot, view] = await Promise.all([read($, SNAPSHOT), read($, VIEW)])
    const kit = kitOf($.ui.resolve(e), e.surface, Math.max(10, e.props.bodyColumns - 2))

    return paneView(kit, snapshot, view ?? INITIAL_VIEW, handlers, staleAfterMs, e.props.placement === 'dock')
  })
}
