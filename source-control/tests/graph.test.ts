import { describe, expect, test } from 'claude-code/testing'

import { graphCells, graphSource, layoutGraph } from '../hooks/ui/graph'
import type { GraphEntry } from '../hooks/ui/graph'

const commit = (hash: string, parents: string[], side: 'incoming' | 'outgoing' | 'shared' = 'shared'): GraphEntry => ({
  kind: 'commit',
  hash,
  parents,
  side,
})

const drawn = (entries: GraphEntry[], fallback: string | null = null) => {
  const known = new Set(entries.flatMap(entry => (entry.kind === 'commit' ? [entry.hash] : [])))
  const { rows, width } = layoutGraph(entries, known, fallback)

  return { rows, width, text: rows.map(row => graphCells(row, width).map(cell => cell.glyph).join('').trimEnd()) }
}

describe('graph', () => {
  test('a straight history is one lane', () => {
    const { width, text } = drawn([commit('c', ['b']), commit('b', ['a']), commit('a', [])])

    expect(width).toBe(1)
    expect(text).toEqual(['●', '●', '●'])
  })

  test('a merge opens a lane for its other parent, which joins at the fork', () => {
    // m merges f2 (feature: f2 → f1) into main (m → x); both come from base
    const { width, rows, text } = drawn([
      commit('m', ['x', 'f2']),
      commit('f2', ['f1']),
      commit('f1', ['base']),
      commit('x', ['base']),
      commit('base', []),
    ])

    expect(width).toBe(2)
    expect(text).toEqual(['●╮', '│●', '│●', '●│', '●╯'])
    // the feature lane keeps the color the merge gave it
    expect(rows[1]?.nodeColor).toBe(rows[0]?.startsOut[0]?.color)
    expect(rows[1]?.nodeColor).not.toBe('grey')
  })

  test('incoming and outgoing commits run in two lanes into the shared base', () => {
    const { text, rows } = drawn([
      { kind: 'header', next: 'i1', side: 'incoming' },
      commit('i1', ['base'], 'incoming'),
      { kind: 'header', next: 'o1', side: 'outgoing' },
      commit('o1', ['base'], 'outgoing'),
      commit('base', ['root']),
      commit('root', []),
    ])

    expect(text).toEqual(['○', '●', '│○', '│●', '●╯', '●'])
    expect(rows[1]?.nodeColor).toBe('purple')
    expect(rows[3]?.nodeColor).toBe('blue')
    expect(rows[4]?.nodeColor).toBe('grey')
  })

  test('a lane past a cut-off list is led to the first shared commit', () => {
    // i2's parent i3 is not listed: the lane goes on to base, not forever
    const known = new Set(['i1', 'i2', 'base'])
    const { rows } = layoutGraph(
      [
        { kind: 'header', next: 'i1', side: 'incoming' },
        commit('i1', ['i2'], 'incoming'),
        { kind: 'gap', hidden: [{ hash: 'i2', parents: ['i3'] }] },
        commit('base', []),
      ],
      known,
      'base',
    )

    expect(rows[2]?.isGap).toBe(true)
    expect(rows[3]?.hasAbove).toBe(true)
    expect(rows[3]?.node).toBe(0)
  })

  test('the SVG uses only paths and circles with colors as attributes', () => {
    const { rows, width } = drawn([commit('m', ['x', 'f']), commit('f', ['x']), commit('x', [])])
    const sources = rows.map(row => graphSource(row, width))

    for (const source of sources) {
      expect(source).not.toMatch(/class=|<line|<style/)
    }

    expect(sources[0]).toContain('<circle')
    expect(sources[0]).toContain('Q')
  })
})
