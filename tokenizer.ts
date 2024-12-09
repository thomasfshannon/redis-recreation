import { type Token } from './types'

type TokenizerReturn = [number, Token | null]

type TokenizerFunction = (
  input: string,
  current: number,
) => TokenizerReturn | [number, Token | null, char?: string] // probably expose char

/**
 * Only look for numbers if they follow a marker (* or $)
 * The number is a bulk string or bulk array length
 * Other numbers will be treated as a bulk string
 */
function tokenizeNumber(input: string, current: number): TokenizerReturn {
  if (
    current > 0 &&
    (input[current - 1] === '*' || input[current - 1] === '$')
  ) {
    let value = ''
    let consumed = 0

    while (
      current + consumed < input.length &&
      /^\d+$/.test(input[current + consumed])
    ) {
      value += input[current + consumed]
      consumed++
    }

    if (consumed > 0) {
      return [current + consumed, { type: 'Number', value }]
    }
  }
  return [current, null]
}

function tokenizeString(
  input: string,
  current: number,
): [number, Token | null, char?: string] {
  const char = input[current]
  if (char.match(/^[a-zA-Z0-9]+$/)) {
    let value = ''
    let consumed = 0

    while (
      current + consumed < input.length &&
      input[current + consumed].match(/^[a-zA-Z0-9]+$/)
    ) {
      value += input[current + consumed]
      consumed++
    }

    return [current + consumed, { type: 'BulkString', value }]
  }
  return [current, null, char] // Return the problematic character
}

function tokenizeCRLF(input: string, current: number): TokenizerReturn {
  if (input[current] === '\r') {
    if (input[current + 1] === '\n') {
      return [current + 2, { type: 'CRLF', value: '\r\n' }]
    }
  }
  return [current, null]
}

function tokenizeMarker(input: string, current: number): TokenizerReturn {
  if (input[current] === '*') {
    return [current + 1, { type: 'ArrayMarker', value: '*' }]
  }
  if (input[current] === '$') {
    return [current + 1, { type: 'BulkMarker', value: '$' }]
  }
  return [current, null]
}

const tokenizerFunctions: TokenizerFunction[] = [
  tokenizeCRLF,
  tokenizeMarker,
  tokenizeString,
  tokenizeNumber,
]

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let current = 0
  let char = ''
  while (current < input.length) {
    let foundToken = false
    for (const tokenizer of tokenizerFunctions) {
      const tokenizerResult = tokenizer(input, current)
      const [newCurrent, token, resultChar] = tokenizerResult
      current = newCurrent
      if (resultChar) {
        char = resultChar
      }
      if (token) {
        tokens.push(token)
        foundToken = true
        break
      }
    }
    if (!foundToken) {
      throw new Error(`Unknown character: ${char}`)
    }
  }
  return tokens
}

