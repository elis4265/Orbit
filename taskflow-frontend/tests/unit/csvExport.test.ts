// REQ-159 — client-side CSV generation ("Export view")
import { describe, it, expect } from 'vitest'
import { toCsv } from '../../src/lib/csvExport'

interface Row { a: string; b: string | number | null }

const cols = [
  { header: 'Alpha', cell: (r: Row) => r.a },
  { header: 'Beta', cell: (r: Row) => r.b },
]

describe('REQ-159 — toCsv', () => {
  it('writes header + rows', () => {
    const csv = toCsv<Row>([{ a: 'x', b: 1 }, { a: 'y', b: 2 }], cols)
    expect(csv).toBe('Alpha,Beta\nx,1\ny,2\n')
  })

  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv<Row>([{ a: 'hello, world', b: 'say "hi"\ntwice' }], cols)
    expect(csv).toBe('Alpha,Beta\n"hello, world","say ""hi""\ntwice"\n')
  })

  it('renders null/undefined as empty', () => {
    const csv = toCsv<Row>([{ a: '', b: null }], cols)
    expect(csv).toBe('Alpha,Beta\n,\n')
  })

  it('empty rows still emit the header', () => {
    expect(toCsv<Row>([], cols)).toBe('Alpha,Beta\n')
  })
})
