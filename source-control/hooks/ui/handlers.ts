import type { ActionName } from '../actions'
import type { Primary } from './model'

/**
 * What the drawings' controls do; register binds them to the engine.
 */
export type Handlers = {
  /** Runs one action (fetch, pull, push, stage, …). */
  act: (name: ActionName, arg?: { message?: string; paths?: readonly string[] }) => void
  /** The blue button's press for its kind. */
  primary: (kind: Primary['kind']) => void
  /** Opens the panel, or closes it when open. */
  togglePane: () => void
  /** Folds or unfolds one of the panel's sections. */
  toggleFold: (id: string) => void
  /** Commits with the message the field holds, or the one typed so far. */
  commit: (message?: string) => void
  /** Keeps the commit field's text as the person types. */
  draft: (text: string) => void
  /** Hands the conflicts to Claude as a prompt of its own. */
  askClaude: () => void
}
