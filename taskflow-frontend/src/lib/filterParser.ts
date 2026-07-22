import { createToken, Lexer, EmbeddedActionsParser, type IToken } from 'chevrotain'

// Tokens — NegatedAt must come before At so the lexer matches '-@' as one token
const NegatedAt = createToken({ name: 'NegatedAt', pattern: /-@/ })
const At = createToken({ name: 'At', pattern: /@/ })
const Colon = createToken({ name: 'Colon', pattern: /:/ })
const Comma = createToken({ name: 'Comma', pattern: /,/ })
// Word: anything that isn't whitespace, @, :, or comma — includes hyphens/underscores in values
const Word = createToken({ name: 'Word', pattern: /[^\s@:,]+/ })
const WS = createToken({ name: 'WS', pattern: /\s+/, group: Lexer.SKIPPED })

const ALL_TOKENS = [NegatedAt, At, Colon, Comma, Word, WS]

const filterLexer = new Lexer(ALL_TOKENS, { recoveryEnabled: true })

export interface ParsedFilterGroup {
  fieldId: string
  values: string[]
  negate: boolean
}

class FilterParser extends EmbeddedActionsParser {
  constructor() {
    super(ALL_TOKENS, { recoveryEnabled: true })
    this.performSelfAnalysis()
  }

  filterQuery = this.RULE('filterQuery', (): ParsedFilterGroup[] => {
    const groups: ParsedFilterGroup[] = []
    // Skip non-filter tokens (garbage text) so the parser is tolerant of mixed input
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            const g = this.SUBRULE(this.filterExpr)
            if (g?.fieldId && g.values.length > 0) groups.push(g)
          },
        },
        { ALT: () => this.CONSUME(Word) },
        { ALT: () => this.CONSUME(Colon) },
        { ALT: () => this.CONSUME(Comma) },
      ])
    })
    return groups
  })

  filterExpr = this.RULE('filterExpr', (): ParsedFilterGroup => {
    let negate = false
    this.OR([
      { ALT: () => { this.CONSUME(NegatedAt); negate = true } },
      { ALT: () => { this.CONSUME(At) } },
    ])
    const fieldToken = this.CONSUME(Word)
    this.CONSUME(Colon)
    const values = this.SUBRULE(this.valueList)
    return { fieldId: fieldToken.image, values, negate }
  })

  valueList = this.RULE('valueList', (): string[] => {
    const values: string[] = []
    const first = this.CONSUME(Word)
    values.push(first.image)
    this.MANY(() => {
      this.CONSUME(Comma)
      const v = this.CONSUME2(Word)
      values.push(v.image)
    })
    return values
  })
}

// Singleton — Chevrotain parsers are stateful but reset via `.input = tokens`
const parserInstance = new FilterParser()

// ── analyzeInput ─────────────────────────────────────────────────────────────
// Tokenizes the current input fragment and returns the UI mode for the
// SmartFilterBar dropdown. Replaces the old regex state machine entirely.

export type InputAnalysis =
  | { mode: null }
  | { mode: 'field'; negate: boolean; search: string }
  | { mode: 'value'; negate: boolean; fieldId: string; search: string; completedValues: string[] }

function splitByComma(tokens: IToken[]): IToken[][] {
  const segments: IToken[][] = [[]]
  for (const t of tokens) {
    if (t.tokenType === Comma) segments.push([])
    else segments[segments.length - 1].push(t)
  }
  return segments
}

function extractCompletedValues(segments: IToken[][]): string[] {
  const completedValues: string[] = []
  for (let i = 0; i < segments.length - 1; i++) {
    const val = segments[i].map(t => t.image).join('').trim()
    if (val) completedValues.push(val)
  }
  return completedValues
}

export function analyzeInput(input: string): InputAnalysis {
  const { tokens } = filterLexer.tokenize(input.trimStart())
  if (tokens.length === 0) return { mode: null }

  const first = tokens[0]
  const isNegated = first.tokenType === NegatedAt
  if (first.tokenType !== At && first.tokenType !== NegatedAt) return { mode: null }

  // Only @/-@ with nothing or partial field name → field mode
  if (tokens.length === 1) return { mode: 'field', negate: isNegated, search: '' }

  const second = tokens[1]
  if (second.tokenType !== Word) return { mode: null }

  // @word with no colon → still in field mode (partial field name)
  if (tokens.length === 2) return { mode: 'field', negate: isNegated, search: second.image }

  const third = tokens[2]
  if (third.tokenType !== Colon) return { mode: null }

  // @word: → value mode; parse remaining tokens for completed values + current search
  const afterColon = tokens.slice(3)
  const segments = splitByComma(afterColon)
  const completedValues = extractCompletedValues(segments)
  const search = segments[segments.length - 1].map(t => t.image).join('').trim()

  return { mode: 'value', negate: isNegated, fieldId: second.image, search, completedValues }
}

// ── parseQuery ────────────────────────────────────────────────────────────────

export function parseQuery(input: string): ParsedFilterGroup[] {
  try {
    const { tokens } = filterLexer.tokenize(input)
    if (tokens.length === 0) return []

    // Reset parser state for this call
    parserInstance.input = tokens
    const result = parserInstance.filterQuery()

    return (result ?? []).filter(g => g.fieldId && g.values.length > 0)
  } catch {
    return []
  }
}
