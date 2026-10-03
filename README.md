# Source Control for Claude Code

**English** · [Deutsch](README.de.md)

A mod for Claude Code (desktop app and terminal) that makes Git as visible and as easy to drive as VS Code's Source Control. It is built for working on one repository from several machines: you see at a glance whether there is something to pull or push before the copies drift apart.

**The band above the chat box**: always there, minimal:

```
⎇ main 2↓ 1↑  ✎ 3 · 4 min ago                               [ ↻ Sync 2↓ 1↑ ]  ◨
```

- `⎇ main`: the current branch (or `abc1234 (detached)`)
- `2↓`: commits on the remote that are not here yet (**pull**)
- `1↑`: local commits not on the remote yet (**push**)
- `✎ 3`: changed files
- `4 min ago`: when the remote was last checked (fetched). **Yellow** means stale or `offline`. A green `✓` shows only when everything is clean, in sync and freshly checked.
- The **main button** does what is due now, as VS Code's does. In the desktop app it is the app's own primary button, in the terminal VS Code's blue:

  | State | Button |
  |---|---|
  | behind or ahead of the remote | `↻ Sync` (pull, then push) |
  | branch without upstream | `⇡ Publish` |
  | local changes only | `✓ Commit…` (opens the panel at the message field) |
  | conflict, or a merge/rebase in progress | `Resolve…` / `Finish…` (opens the panel) |

- `◨` opens or closes the **Source Control panel** beside the chat.

**The Source Control panel** (docked on the right; above the prompt in narrow terminals):

```
Source Control                          ↻ Fetch  ↓ Pull  ↑ Push
⎇ main → origin/main 1↓ 1↑ · checked just now
origin · github.com/manuel-will/cc-source-control
────────────────────────────────────────────────────────────────
Message (Enter to commit on “main”)
 ✓ Commit (all 1)  [ ↻ Sync 1↓ 1↑ ]
▾ CHANGES 1                                                + all
M app.js                                                     +
▾ HISTORY
○ Incoming Changes                                      1 commit
● PC: Readme                                     ⟨origin/main⟩
│ ○ Outgoing Changes                                    1 commit
│ ● Laptop: notes                                       ⟨main⟩
● ╯ Docs: section 3
▾ BRANCHES 3 · ▾ WORKTREES 2 · ▾ STASHES 1
```

- **Commit:** type a message and press Enter, or use the main button. With nothing staged, all changes are committed (smart commit, as in VS Code).
- **Stage and unstage** each file with `+` and `−`, or all at once.
- **History** as VS Code's graph draws it: incoming commits purple, outgoing blue, pills for `main` and `origin/main` in their lane's color. Merges and branches get lanes of their own that join where they forked. In the terminal it reads like `git log --graph`.
- **Branches** with ↓/↑, `local only` or `deleted on remote`. Also **worktrees** (Claude's included) with their changes, and **stashes**.
- **Conflicts** have a section of their own. Resolve a file and stage it with `+`. Or hand the work to Claude with **“Ask Claude to resolve”**; **“Abort merge”** restores the previous state.
- If a pull would overwrite local changes, the panel offers **“Pull with autostash”**.

## Installation

Once on every machine, in Claude Code:

```
/plugin marketplace add manuel-will/cc-source-control
/plugin install source-control@cc-source-control
/reload-plugins
```

Or in a terminal:

```
claude plugin marketplace add manuel-will/cc-source-control
claude plugin install source-control@cc-source-control --scope user
```

With `--scope user` the mod is on in every project. When Claude Desktop asks where to install, pick user (all projects). If `/git` works in one folder only, the mod is installed only there: `bash scripts/install-user.sh` installs it for every project. If `/git` is still missing in some projects, `bash scripts/diagnose.sh` names the reason for each, such as `"disableAllHooks": true` in the project's settings (mods are made of hooks) or the plugin turned off there. The note “4 userConfig options not yet set” during installation is harmless: without values of your own the defaults apply (see Settings). If the mod does not show up right away, restart Claude Code or the desktop app. It needs Claude Code 2.1.287 or newer.

**Update** after a push to this repository:

```
claude plugin marketplace update cc-source-control
claude plugin update source-control@cc-source-control
```

Then restart Claude Code.

## Keyboard and commands

| What | How |
|---|---|
| Open the panel (focus in the message field) | `/git` or `◨` |
| Focus the band (terminal) | `ctrl+x tab`, then `Tab` between buttons, `Enter` presses |
| Back to the prompt | `Esc` |
| Close the panel | `◨`, `ctrl+x x`, or `/git` again while it has focus |
| Actions | `/git sync`, `/git pull`, `/git push`, `/git fetch`, `/git publish` |
| Commit | `/git commit <message>` |
| Summary | `/git status` |

## Settings (`/config`)

| Option | Default | Meaning |
|---|---|---|
| Fetch interval (minutes) | 10 | background `git fetch`, so ↓ is right. 0 = off |
| Status poll (seconds) | 30 | local `git status` (no network). Claude's commands refresh at once |
| Stale after (hours) | 12 | when the last fetch is marked yellow |
| Language | `auto` | `auto` follows Claude Code's language; `en` or `de` sets it |

## Good to know

- **Language:** English or German. With `auto`, Claude Code's `language` setting decides first (for example `"language": "german"` in `~/.claude/settings.json`), then the locale (`LC_ALL`, `LC_MESSAGES`, `LANG`), then the system's language. Any other language gets English. More languages are a catalog each in `source-control/hooks/i18n.ts`.
- **Background fetch:** when a session opens and every 10 minutes after, never asking for a password (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, SSH in batch mode). If it fails, the band says `offline`. Several sessions in one repository do not fetch twice: the mod looks at `FETCH_HEAD`.
- **No lock conflicts:** every read runs with `--no-optional-locks`.
- **Only non-destructive actions:** no force push, no reset, no discarding of changes. Pull uses `--no-rebase` (a merge, as VS Code does) unless you configured `pull.rebase` yourself.
- **Repository hooks do not run** when you commit or push from the mod: Claude Code runs Git for mods with hooks turned off. If the repository has hooks (Husky, for example), the panel says so. If you need them, let Claude commit.
- **Credentials** in remote URLs are never shown.
- **Not possible:** anything in the desktop app's left project sidebar. That belongs to the app; mods cannot draw there. The band and the panel take its place.

## License

MIT, see [LICENSE](LICENSE).

## Development

```
cc-source-control/                ← repository = marketplace
├─ .claude-plugin/marketplace.json
└─ source-control/                ← the mod
   ├─ .claude-plugin/plugin.json
   ├─ hooks/                      register.tsx, i18n.ts, git.ts, parse.ts, snapshot.ts, actions.ts, ui/
   ├─ types/index.d.ts            contract for $.state
   └─ tests/                      claude plugin test
```

- **Try it locally:** `claude --plugin-dir ./source-control`. Saved changes reload; if not, restart the session. For the desktop app set `CLAUDE_CODE_PLUGIN_DIRS` and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` in the `env` block of `~/.claude/settings.json`.
- **Playground with every state:** `scripts/playground.sh` sets up a throwaway repository under `~/sc-playground`, with a remote of its own and a second clone playing the other machine. Open `~/sc-playground/work` in Claude Code once and keep the session open. Then `scripts/playground.sh behind` (or `ahead`, `diverged`, `conflict`, `overwrite`, `dirty`, `unpublished`, `stale`, `unfetched`, `offline`, `worktrees`, `detached`, `many`, `merges`, `clean`) puts it in that state, and `scripts/playground.sh tour` runs through them all. The mod refreshes within 30 s, at once with `/git status`.
- **Checks:**
  ```
  claude plugin validate ./source-control
  claude plugin test ./source-control
  tsc -p source-control            # once the mod has been loaded
  ```
- `bash scripts/diagnose.sh` checks, for every project Claude Code knows, whether the mod can load there.
