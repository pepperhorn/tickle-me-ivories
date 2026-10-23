// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BUILTIN_TEMPLATE_IDS, BUILTIN_TEMPLATES } from './builtins'
import { TEMPLATE_RANGES } from './decode'

type Node = { type?: string; properties?: Record<string, Node>; additionalProperties?: unknown; required?: string[]
  enum?: unknown[]; pattern?: string; minItems?: number; maxItems?: number; minimum?: number; maximum?: number }
const schema = JSON.parse(readFileSync(new URL('../../template.schema.json', import.meta.url), 'utf8')) as Node
const props = schema.properties!

describe('template.schema.json', () => {
  it('has the envelope the codec requires', () => {
    expect(schema.required).toEqual(['v', 'kind', 'id', 'name'])
    expect(props.extends.enum).toEqual([...BUILTIN_TEMPLATE_IDS])
    expect(props.id.pattern).toBe('^[a-z0-9-]{1,48}$')
    const palette = props.colour.properties!.palette
    expect(palette.minItems).toBe(12)
    expect(palette.maxItems).toBe(12)
  })

  it('closes every block and lists every key of the chord-cards template', () => {
    const cc = BUILTIN_TEMPLATES['chord-cards'] as unknown as Record<string, Record<string, unknown>>
    for (const block of ['stage', 'keys', 'bars', 'colour', 'flash', 'labels'] as const) {
      expect(props[block].additionalProperties, block).toBe(false)
    }
    for (const block of ['stage', 'keys', 'bars', 'colour', 'flash'] as const) {
      for (const k of Object.keys(cc[block] ?? {})) expect(props[block].properties, `${block}.${k}`).toHaveProperty(k)
    }
    for (const sub of ['raised', 'plate'] as const) {
      const node = props.keys.properties![sub]
      expect(node.additionalProperties, sub).toBe(false)
      for (const k of Object.keys((cc.keys[sub] ?? {}) as object)) expect(node.properties, `${sub}.${k}`).toHaveProperty(k)
    }
    expect(props.labels.properties!.font.additionalProperties).toBe(false)
  })

  it('numeric limits equal the codec clamp ranges', () => {
    const check = (node: Node, ranges: Record<string, readonly [number, number]>, label: string) => {
      for (const [k, [lo, hi]] of Object.entries(ranges)) {
        expect(node.properties![k].minimum, `${label}.${k} min`).toBe(lo)
        expect(node.properties![k].maximum, `${label}.${k} max`).toBe(hi)
      }
    }
    const R = TEMPLATE_RANGES
    check(props.keys, R.keys, 'keys')
    check(props.keys.properties!.raised, R.raised, 'raised')
    check(props.keys.properties!.plate, R.plate, 'plate')
    check(props.bars, R.bars, 'bars')
    check(props.labels.properties!.font, R.labels, 'labels')
  })
})
