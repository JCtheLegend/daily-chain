import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GraphFile } from '../../../src/engine/graphFormat'
import type { PuzzleEdge } from '../../../src/engine/types'
import { buildAdjacency, type RawNode } from './graph'

const GRAPHS_ROOT = join(import.meta.dirname, '..', '..', '..', 'public', 'graphs')

/**
 * Writes the whole graph as public/graphs/<name>.json and returns its site
 * path. Output is deterministic (sorted), so an unchanged graph produces an
 * identical file and git stores nothing new.
 */
export function writeGraph(
  name: string,
  nodes: Record<string, RawNode>,
  edges: PuzzleEdge[],
  extraNames?: Map<string, string[]>,
): string {
  const adj = buildAdjacency(edges)
  const ids = Object.keys(nodes).filter((id) => adj.has(id)).sort()
  const index = new Map(ids.map((id, i) => [id, i]))

  const file: GraphFile = {
    version: 1,
    nodes: ids.map((id) => {
      const n = nodes[id]
      const optional: [string, number, string[]] = [n.subtitle ?? '', n.year ?? 0, n.aliases ?? []]
      const isEmpty = (v: string | number | string[]) => !v || (Array.isArray(v) && v.length === 0)
      let keep = optional.length
      while (keep > 0 && isEmpty(optional[keep - 1])) keep--
      return [id, n.name, n.type === 'person' ? 'p' : 'w', ...optional.slice(0, keep)] as GraphFile['nodes'][number]
    }),
    links: ids
      .filter((id) => nodes[id].type === 'work')
      .map((id) => [index.get(id)!, ...adj.get(id)!.map((p) => index.get(p)!).sort((a, b) => a - b)]),
  }

  const extras: Record<string, string[]> = {}
  for (const id of ids) {
    const names = extraNames?.get(id)
    if (!names?.length) continue
    const inGraph = new Set(adj.get(id)!.map((n) => nodes[n].name))
    const list = [...new Set(names)].filter((n) => !inGraph.has(n)).sort()
    if (list.length) extras[index.get(id)!] = list
  }
  if (Object.keys(extras).length) file.extras = extras

  mkdirSync(GRAPHS_ROOT, { recursive: true })
  const json = JSON.stringify(file)
  writeFileSync(join(GRAPHS_ROOT, `${name}.json`), json + '\n')
  console.log(`  graphs/${name}.json: ${ids.length} nodes, ${edges.length} links, ${(json.length / 1024).toFixed(0)} KB`)
  return `graphs/${name}.json`
}
