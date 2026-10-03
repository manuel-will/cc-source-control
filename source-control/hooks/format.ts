import { t } from './i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * How long ago `then` was, as the band and the panel say it.
 *
 * @param then milliseconds since the epoch
 * @param now milliseconds since the epoch
 * @returns `just now`, `4 min ago`, `2 h ago`, `3 days ago` (or German)
 */
export function agoOf(then: number, now: number): string {
  const age = Math.max(0, now - then)

  if (age < MINUTE) {
    return t().justNow
  }

  if (age < HOUR) {
    return t().minutesAgo(Math.floor(age / MINUTE))
  }

  if (age < DAY) {
    return t().hoursAgo(Math.floor(age / HOUR))
  }

  return t().daysAgo(Math.floor(age / DAY))
}

/**
 * Text with control characters (escape sequences, tabs, newlines) turned
 * into spaces, so a branch or file name can never restyle the terminal.
 */
export function clean(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
}

/**
 * Text cut to `width` cells from its start, `…` standing for what was cut,
 * so the end of a path (the file's name) stays visible.
 */
export function cutStart(text: string, width: number): string {
  const chars = [...text]

  if (chars.length <= width) {
    return text
  }

  return width <= 1 ? '…' : `…${chars.slice(chars.length - (width - 1)).join('')}`
}

/**
 * Text cut to `width` cells from its end, `…` standing for what was cut.
 */
export function cutEnd(text: string, width: number): string {
  const chars = [...text]

  if (chars.length <= width) {
    return text
  }

  return width <= 1 ? '…' : `${chars.slice(0, width - 1).join('')}…`
}

/**
 * The first line of git's message worth showing: `error:`, `fatal:` and
 * `hint:` prefixes dropped, blank and progress lines skipped.
 */
export function firstLineOf(text: string): string {
  const lines = text
    .split(/\r?\n|\r/)
    .map(line => line.replace(/^(error|fatal|hint|warning):\s*/i, '').trim())
    .filter(line => line !== '' && !/^(remote: )?(Counting|Compressing|Enumerating|Receiving|Resolving|Writing|Total) /.test(line))

  return clean(lines[0] ?? '')
}

/**
 * A remote's URL fit to show: user names and tokens dropped, the scheme
 * and `.git` left off (`github.com/owner/repo`).
 */
export function remoteShownOf(url: string): string {
  const trimmed = url.trim()

  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(trimmed)

  const shown = scp
    ? `${scp[1]}/${scp[2]}`
    : trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^[^@/]*@/, '')

  return clean(shown.replace(/\.git$/, '').replace(/\/+$/, ''))
}

/**
 * A worktree's path fit to show: the last two segments under `…/`.
 */
export function shortPathOf(path: string): string {
  const parts = path.split(/[\\/]/).filter(part => part !== '')

  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`
}

/**
 * `1 Commit`, `3 Commits`, and so on for any word whose plural adds `s`.
 */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}
