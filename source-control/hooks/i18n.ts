/**
 * Every word the mod shows, in English and German. English is the default;
 * German where the person's language is German (the plugin's `language`
 * option, Claude Code's `language` setting, the locale, in that order).
 */

export type Language = 'en' | 'de'

/**
 * `1 commit`, `3 commits`: the count and the form that fits it.
 */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const en = {
  // how long ago
  justNow: 'just now',
  minutesAgo: (n: number) => `${n} min ago`,
  hoursAgo: (n: number) => `${n} h ago`,
  daysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),

  commits: (n: number) => count(n, 'commit', 'commits'),
  conflicts: (n: number) => count(n, 'conflict', 'conflicts'),
  oneConflict: 'conflict',

  // what is going on
  checkingRemote: 'checking remote…',
  offline: 'offline',
  neverChecked: 'never checked',
  checked: (ago: string) => `checked ${ago}`,
  unpublished: 'not published',
  noUpstream: 'no upstream',
  noCommitsYet: 'no commits yet',
  operationRunning: (operation: string) => `${operation} in progress`,
  allConflictsResolved: 'all conflicts resolved',
  fetchFailed: (reason: string) => `Fetch failed: ${reason}`,
  worktreeOf: (path: string) => `Worktree of ${path}`,
  hooksHint: 'Note: repository hooks do not run for actions from this panel.',

  // the band's button
  resolve: 'Resolve…',
  resolveShort: 'Resolve',
  finish: 'Finish…',
  finishShort: 'Finish',
  publish: 'Publish',
  sync: (counts: string) => `Sync ${counts}`,
  commitEllipsis: 'Commit…',

  // the panel
  title: 'Source Control',
  titleNarrow: 'Git',
  fetch: 'Fetch',
  pull: 'Pull',
  push: 'Push',
  noRepository: 'No Git repository in this folder.',
  messagePlaceholder: (branch: string) => `Message (Enter to commit on “${branch}”)`,
  askClaude: 'Ask Claude to resolve',
  abortOperation: (operation: string) => `Abort ${operation}`,
  finishOperation: (operation: string) => `Finish ${operation}`,
  commitStaged: (n: number) => `Commit (${n})`,
  commitAll: (n: number) => `Commit (all ${n})`,
  commit: 'Commit',
  publishBranch: 'Publish Branch',
  syncChanges: (counts: string) => `Sync Changes ${counts}`,
  pullAutostash: 'Pull with autostash',
  conflictsSection: 'Conflicts',
  conflictsHint: 'Resolve a file, then stage it with + to mark it resolved.',
  stagedSection: 'Staged',
  changesSection: 'Changes',
  historySection: 'History',
  branchesSection: 'Branches',
  worktreesSection: 'Worktrees',
  stashesSection: 'Stashes',
  all: 'all',
  noChanges: 'No changes',
  noOtherChanges: 'No other changes',
  allStaged: 'Everything staged',
  loading: 'loading…',
  noCommits: 'No commits yet',
  incoming: 'Incoming Changes',
  outgoing: 'Outgoing Changes',
  more: (n: number) => `… ${n} more`,
  goneOnRemote: 'deleted on remote',
  localOnly: 'local only',
  missing: 'missing',
  clean: 'clean',

  // running
  running: {
    fetch: 'Fetching…',
    pull: 'Pulling…',
    pullAutostash: 'Pulling…',
    push: 'Pushing…',
    sync: 'Syncing…',
    publish: 'Publishing…',
    commit: 'Committing…',
    stage: 'Staging…',
    unstage: 'Unstaging…',
    stageAll: 'Staging…',
    unstageAll: 'Unstaging…',
    continueOperation: 'Finishing…',
    abortOperation: 'Aborting…',
  },

  // outcomes
  fetchedNew: (n: number, upstream: string | null) =>
    `Fetch: ${count(n, 'new commit', 'new commits')} on ${upstream ?? 'the remote'}`,
  fetchedNothing: 'Fetch done: nothing new',
  pulledNothing: 'Pull done: already up to date',
  pulled: (n: number) => `Pull: ${count(n, 'commit', 'commits')} received`,
  published: (target: string) => `Branch published: ${target}`,
  pushed: (n: number, upstream: string) => `Push: ${count(n, 'commit', 'commits')} to ${upstream}`,
  pushedNothing: 'Push done: nothing to push',
  synced: (n: number) => `Sync done: ${count(n, 'commit', 'commits')} pushed`,
  mergeDone: 'Merge finished',
  operationDone: (operation: string) => `${operation} finished`,
  operationAborted: (operation: string) => `${operation} aborted: previous state restored`,
  committed: (what: string) => `Committed: ${what}`,
  enterMessage: 'Please enter a commit message.',
  enterMessageFirst: 'Please enter a commit message first.',
  nothingToCommit: 'Nothing to commit.',
  noOperation: 'No merge or rebase in progress.',
  resolveFirst: 'Resolve and stage all conflicts first.',
  noRemote: 'No remote set up.',
  noUpstreamPublish: 'The branch has no upstream: publish it first.',
  detachedHead: 'No branch checked out (detached HEAD).',
  gitFailed: 'Git ended with an error.',
  busy: 'A Git action is already running.',

  // git's errors, explained
  explain: {
    identity: 'Git does not know your name: set `git config --global user.name` and `user.email`.',
    diverged: 'Cannot pull: the branches have diverged.',
    overwrite: 'Pull stopped: local changes would be overwritten. Commit or stash them first.',
    conflict: 'Merge conflict: resolve the files under “Conflicts”, stage them and commit.',
    rejected: 'Push rejected: the remote has new commits. Pull first (Sync).',
    auth: 'Sign-in failed. Run `git fetch` once in a terminal to store your credentials.',
    unreachable: 'Remote not reachable (offline?).',
    timeout: 'Timed out: Git did not answer in time.',
    noUpstream: 'The branch has no upstream: publish it first.',
    noRemote: 'No remote set up.',
    locked: 'Git is busy (index.lock). Try again in a moment.',
    nothingToCommit: 'Nothing to commit.',
    unmerged: 'Resolve and stage all conflicts first.',
  },

  // toasts and /git
  behindToast: (n: number, upstream: string) =>
    `${count(n, 'commit', 'commits')} on ${upstream} not here yet. Sync above the chat box.`,
  claudeOnIt: 'Claude is on the conflicts.',
  paneNotShown: (reason: string) => `Panel not shown: ${reason}`,
  notReady: 'not ready',
  commandDescription: 'Source Control: toggle the panel, or sync, pull, push, fetch, publish, status, commit <message>',
  commandHint: '[sync|pull|push|fetch|publish|status|commit <message>]',
  notReadyYet: 'Source Control is not ready yet.',
  couldNotShow: (reason: string) => `Source Control could not be shown: ${reason}`,
  opened: 'Source Control opened',
  closed: 'Source Control closed',
  commitUsage: 'Usage: /git commit <message>',
  usage: 'Available: /git · /git sync|pull|push|fetch|publish|status · /git commit <message>',
  summaryBranch: (name: string) => `Branch ${name}`,
  summaryUpstream: (name: string) => `Upstream ${name}`,
  inSync: 'in sync',
  changedFiles: (n: number) => count(n, 'changed file', 'changed files'),

  // what Claude is asked to do with conflicts
  conflictPrompt: (operation: string, files: string, finish: string) =>
    `There are conflicts in this Git repository (${operation}) in: ${files}. ` +
    'Please resolve them sensibly, keeping both sides where that fits, remove all conflict markers, ' +
    `stage the files and ${finish}. Ask me if a decision is unclear.`,
  conflictFinishMerge: 'finish the merge with `git commit --no-edit`',
  conflictFinishOther: (operation: string) => `continue with \`git ${operation} --continue\``,

  // /config, as the menu lists the plugin's options
  config: {
    fetchIntervalMinutes: ['Fetch interval (minutes)', 'How often `git fetch` runs in the background, so ↓ counts are right. 0 turns it off.'],
    pollSeconds: ['Status poll (seconds)', 'How often the local Git status is read (no network). Claude’s commands and your actions refresh at once anyway.'],
    staleAfterHours: ['Stale after (hours)', 'When the last fetch counts as old and is marked yellow.'],
    language: ['Language', '`auto` follows Claude Code’s language; `en` or `de` sets it.'],
  },
}

export type Catalog = typeof en

const de: Catalog = {
  justNow: 'gerade eben',
  minutesAgo: n => `vor ${n} min`,
  hoursAgo: n => `vor ${n} Std.`,
  daysAgo: n => (n === 1 ? 'vor 1 Tag' : `vor ${n} Tagen`),

  commits: n => count(n, 'Commit', 'Commits'),
  conflicts: n => count(n, 'Konflikt', 'Konflikte'),
  oneConflict: 'Konflikt',

  checkingRemote: 'prüfe Remote…',
  offline: 'offline',
  neverChecked: 'nie geprüft',
  checked: ago => `geprüft ${ago}`,
  unpublished: 'nicht veröffentlicht',
  noUpstream: 'kein Upstream',
  noCommitsYet: 'noch keine Commits',
  operationRunning: operation => `${operation} läuft`,
  allConflictsResolved: 'alle Konflikte gelöst',
  fetchFailed: reason => `Fetch fehlgeschlagen: ${reason}`,
  worktreeOf: path => `Worktree von ${path}`,
  hooksHint: 'Hinweis: Repo-Hooks laufen bei Aktionen aus diesem Panel nicht.',

  resolve: 'Auflösen…',
  resolveShort: 'Auflösen',
  finish: 'Abschließen…',
  finishShort: 'Abschließen',
  publish: 'Veröffentlichen',
  sync: counts => `Sync ${counts}`,
  commitEllipsis: 'Commit…',

  title: 'Source Control',
  titleNarrow: 'Git',
  fetch: 'Fetch',
  pull: 'Pull',
  push: 'Push',
  noRepository: 'Kein Git-Repository in diesem Ordner.',
  messagePlaceholder: branch => `Nachricht (Enter: Commit auf „${branch}“)`,
  askClaude: 'Claude: Konflikte lösen',
  abortOperation: operation => `${operation} abbrechen`,
  finishOperation: operation => `${operation} abschließen`,
  commitStaged: n => `Commit (${n})`,
  commitAll: n => `Commit (alle ${n})`,
  commit: 'Commit',
  publishBranch: 'Branch veröffentlichen',
  syncChanges: counts => `Sync Changes ${counts}`,
  pullAutostash: 'Mit Autostash pullen',
  conflictsSection: 'Konflikte',
  conflictsHint: 'Datei lösen, dann mit + als gelöst stagen.',
  stagedSection: 'Gestagt',
  changesSection: 'Änderungen',
  historySection: 'Verlauf',
  branchesSection: 'Branches',
  worktreesSection: 'Worktrees',
  stashesSection: 'Stashes',
  all: 'alle',
  noChanges: 'Keine Änderungen',
  noOtherChanges: 'Keine weiteren Änderungen',
  allStaged: 'Alles gestaged',
  loading: 'lädt…',
  noCommits: 'Noch keine Commits',
  incoming: 'Eingehende Änderungen',
  outgoing: 'Ausgehende Änderungen',
  more: n => `… ${n} weitere`,
  goneOnRemote: 'auf Remote gelöscht',
  localOnly: 'nur lokal',
  missing: 'fehlt',
  clean: 'sauber',

  running: {
    fetch: 'Fetch läuft…',
    pull: 'Pull läuft…',
    pullAutostash: 'Pull läuft…',
    push: 'Push läuft…',
    sync: 'Sync läuft…',
    publish: 'Veröffentliche…',
    commit: 'Commit läuft…',
    stage: 'Stage…',
    unstage: 'Unstage…',
    stageAll: 'Stage…',
    unstageAll: 'Unstage…',
    continueOperation: 'Schließe ab…',
    abortOperation: 'Breche ab…',
  },

  fetchedNew: (n, upstream) => `Fetch: ${count(n, 'neuer Commit', 'neue Commits')} auf ${upstream ?? 'dem Remote'}`,
  fetchedNothing: 'Fetch abgeschlossen: nichts Neues',
  pulledNothing: 'Pull abgeschlossen: bereits aktuell',
  pulled: n => `Pull: ${count(n, 'Commit', 'Commits')} geholt`,
  published: target => `Branch veröffentlicht: ${target}`,
  pushed: (n, upstream) => `Push: ${count(n, 'Commit', 'Commits')} nach ${upstream}`,
  pushedNothing: 'Push abgeschlossen: nichts zu pushen',
  synced: n => `Sync abgeschlossen: ${count(n, 'Commit', 'Commits')} gepusht`,
  mergeDone: 'Merge abgeschlossen',
  operationDone: operation => `${operation} abgeschlossen`,
  operationAborted: operation => `${operation} abgebrochen: alter Stand wiederhergestellt`,
  committed: what => `Commit erstellt: ${what}`,
  enterMessage: 'Bitte eine Commit-Nachricht eingeben.',
  enterMessageFirst: 'Bitte zuerst eine Commit-Nachricht eingeben.',
  nothingToCommit: 'Nichts zu committen.',
  noOperation: 'Es läuft kein Merge oder Rebase.',
  resolveFirst: 'Erst alle Konflikte lösen und stagen.',
  noRemote: 'Kein Remote eingerichtet.',
  noUpstreamPublish: 'Der Branch hat keinen Upstream: erst veröffentlichen.',
  detachedHead: 'Kein Branch ausgecheckt (detached HEAD).',
  gitFailed: 'Git ist mit einem Fehler beendet.',
  busy: 'Es läuft bereits eine Git-Aktion.',

  explain: {
    identity: 'Git kennt deinen Namen nicht: `git config --global user.name` und `user.email` setzen.',
    diverged: 'Pull nicht möglich: Die Branches sind auseinandergelaufen.',
    overwrite: 'Pull abgebrochen: Lokale Änderungen würden überschrieben. Erst committen oder stashen.',
    conflict: 'Merge-Konflikt: Dateien unter „Konflikte“ lösen, stagen und committen.',
    rejected: 'Push abgelehnt: Auf dem Remote gibt es neue Commits. Erst pullen (Sync).',
    auth: 'Anmeldung fehlgeschlagen. Einmal im Terminal `git fetch` ausführen, um Zugangsdaten zu hinterlegen.',
    unreachable: 'Remote nicht erreichbar (offline?).',
    timeout: 'Zeitüberschreitung: Git hat nicht rechtzeitig geantwortet.',
    noUpstream: 'Der Branch hat keinen Upstream: erst veröffentlichen.',
    noRemote: 'Kein Remote eingerichtet.',
    locked: 'Git ist gerade beschäftigt (index.lock). Gleich noch einmal versuchen.',
    nothingToCommit: 'Nichts zu committen.',
    unmerged: 'Erst alle Konflikte lösen und stagen.',
  },

  behindToast: (n, upstream) =>
    `${count(n, 'Commit', 'Commits')} auf ${upstream}, die hier noch fehlen. Sync über der Chatbox.`,
  claudeOnIt: 'Claude kümmert sich um die Konflikte.',
  paneNotShown: reason => `Panel nicht angezeigt: ${reason}`,
  notReady: 'nicht bereit',
  commandDescription: 'Source Control: Panel öffnen/schließen, oder sync, pull, push, fetch, publish, status, commit <Nachricht>',
  commandHint: '[sync|pull|push|fetch|publish|status|commit <Nachricht>]',
  notReadyYet: 'Source Control ist noch nicht bereit.',
  couldNotShow: reason => `Source Control konnte nicht angezeigt werden: ${reason}`,
  opened: 'Source Control geöffnet',
  closed: 'Source Control geschlossen',
  commitUsage: 'Bitte so aufrufen: /git commit <Nachricht>',
  usage: 'Möglich: /git · /git sync|pull|push|fetch|publish|status · /git commit <Nachricht>',
  summaryBranch: name => `Branch ${name}`,
  summaryUpstream: name => `Upstream ${name}`,
  inSync: 'synchron',
  changedFiles: n => `${n} geänderte ${n === 1 ? 'Datei' : 'Dateien'}`,

  conflictPrompt: (operation, files, finish) =>
    `Im Git-Repository gibt es Konflikte (${operation}) in: ${files}. ` +
    'Bitte löse sie sinnvoll und behalte dabei beide Seiten, wo es passt, entferne alle Konfliktmarker, ' +
    `stage die Dateien und ${finish}. Frag mich, wenn eine Entscheidung unklar ist.`,
  conflictFinishMerge: 'schließe den Merge mit `git commit --no-edit` ab',
  conflictFinishOther: operation => `setze mit \`git ${operation} --continue\` fort`,

  config: {
    fetchIntervalMinutes: ['Fetch-Intervall (Minuten)', 'Wie oft im Hintergrund `git fetch` läuft, damit ↓-Zähler stimmen. 0 schaltet den Hintergrund-Fetch ab.'],
    pollSeconds: ['Status-Abfrage (Sekunden)', 'Wie oft der lokale Git-Status gelesen wird (ohne Netzwerk). Nach Claudes Befehlen und eigenen Aktionen wird ohnehin sofort aufgefrischt.'],
    staleAfterHours: ['Veraltet nach (Stunden)', 'Ab wann der letzte Fetch als veraltet gilt und gelb markiert wird.'],
    language: ['Sprache', '`auto` folgt der Sprache von Claude Code; `en` oder `de` legt sie fest.'],
  },
}

const CATALOGS: Readonly<Record<Language, Catalog>> = { en, de }

let current: Language = 'en'

/**
 * The words in the language the session speaks.
 */
export function t(): Catalog {
  return CATALOGS[current]
}

/**
 * Sets the language every later `t()` speaks.
 */
export function setLanguage(language: Language): void {
  current = language
}

/**
 * The language a hint names, if it names one the mod speaks: `de`, `de_DE`,
 * `de-AT`, `german`, `Deutsch` are German, `en…` and `english` English.
 */
export function languageOf(hint: unknown): Language | null {
  if (typeof hint !== 'string') {
    return null
  }

  const said = hint.trim().toLowerCase()

  if (/^(de([_.-]|$)|german|deutsch)/.test(said)) {
    return 'de'
  }

  if (/^(en([_.-]|$)|english)/.test(said)) {
    return 'en'
  }

  return null
}

/**
 * The session's language from its hints, first match wins: the plugin's
 * own option (unless `auto`), Claude Code's `language` setting, the locale
 * variables, the runtime's locale. A language the mod does not speak (a
 * Japanese setting, a French locale) is English.
 */
export function pickLanguage(hints: readonly unknown[]): Language {
  for (const hint of hints) {
    const language = languageOf(hint)

    if (language !== null) {
      return language
    }

    // a set language the mod does not speak still decides: English
    if (typeof hint === 'string' && hint.trim() !== '' && hint.trim().toLowerCase() !== 'auto' && !/^(c|posix)([_.-]|$)/i.test(hint.trim())) {
      return 'en'
    }
  }

  return 'en'
}
