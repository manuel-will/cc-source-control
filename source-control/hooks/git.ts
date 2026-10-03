import type { ProcessRunInit, ProcessRunResult } from 'claude-code'

/**
 * `$.process.run`, as session.start bound it.
 */
export type ProcessRun = (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>

/**
 * One git run's outcome; a child that could not start or timed out reads as
 * `code: -1` with the reason in `err`, so a caller never has to catch.
 */
export type GitResult = {
  ok: boolean
  code: number
  out: string
  err: string
}

export type GitOptions = {
  cwd?: string
  timeoutMs?: number
  env?: Record<string, string>
}

/**
 * Runs git with an argv after `git`, in the repository unless told otherwise.
 */
export type Git = (args: readonly string[], options?: GitOptions) => Promise<GitResult>

/**
 * The environment every git child gets: the C locale so messages and
 * numbers parse the same everywhere, and never a terminal prompt (there is
 * no terminal; a prompt would only hang until the timeout).
 */
export const BASE_ENV: Readonly<Record<string, string>> = {
  LC_ALL: 'C',
  LANGUAGE: '',
  GIT_TERMINAL_PROMPT: '0',
}

/**
 * Laid over BASE_ENV for work nobody asked for (the background fetch): no
 * credential window either, and ssh gives up instead of asking.
 */
export const QUIET_ENV: Readonly<Record<string, string>> = {
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
}

/**
 * Laid over BASE_ENV for the actions the person starts: no editor ever opens
 * (a merge commit keeps git's message, a rebase runs non-interactively).
 */
export const ACTION_ENV: Readonly<Record<string, string>> = {
  GIT_EDITOR: 'true',
  GIT_SEQUENCE_EDITOR: 'true',
  GIT_MERGE_AUTOEDIT: 'no',
}

/**
 * The flag every read carries, so a background read never takes the index
 * lock from a git the person or Claude is running.
 */
export const NO_LOCKS = '--no-optional-locks'

/**
 * A git runner over `$.process.run`.
 *
 * @param run `$.process.run`
 * @param defaults the repository's directory once known, and env to lay over
 *   BASE_ENV for every run
 * @returns the runner
 */
export function gitOf(run: ProcessRun, defaults: () => { cwd?: string }): Git {
  return async (args, options = {}) => {
    const cwd = options.cwd ?? defaults().cwd

    try {
      const result = await run(['git', ...args], {
        ...(cwd ? { cwd } : {}),
        env: { ...BASE_ENV, ...options.env },
        timeoutMs: options.timeoutMs ?? 15_000,
      })

      return {
        ok: result.exitCode === 0,
        code: result.exitCode,
        out: result.stdout,
        err: result.stderr,
      }
    } catch (error) {
      return {
        ok: false,
        code: -1,
        out: '',
        err: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
