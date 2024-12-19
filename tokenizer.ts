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
  
  // Handle quoted strings
  if (char === '"' || char === "'") {
    let value = ''
    let consumed = 1 // Start after the quote

    while (current + consumed < input.length && input[current + consumed] !== char) {
      value += input[current + consumed]
      consumed++
    }

    if (current + consumed < input.length) {
      consumed++ // Skip the closing quote
      return [current + consumed, { type: 'Quote', value }]
    }
  }

  // Handle regular strings
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
  
  return [current, null, char]
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

function tokenizeQuote(input: string, current: number): TokenizerReturn {
  const char = input[current]
  if (char === '"' || char === "'") {
    return [current + 1, { type: 'Quote', value: char }]
  }
  return [current, null]
}

export class Tokenizer {
  private tokenizerFunctions: TokenizerFunction[] = [
    tokenizeCRLF,
    tokenizeMarker,
    tokenizeQuote,
    tokenizeString,
    tokenizeNumber,
  ]

  public tokenize(input: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    
    while (i < input.length) {
      const char = input[i]
      
      if (char === '*' && this.isStartOfLine(input, i)) {
        // Only treat * as ArrayMarker if it's at the start of a line
        tokens.push({ type: 'ArrayMarker', value: char })
        i++
      } else if (char === '$') {
        tokens.push({ type: 'BulkMarker', value: char })
        i++
      } else if (char === '\r' && input[i + 1] === '\n') {
        tokens.push({ type: 'CRLF', value: '\r\n' })
        i += 2
      } else {
        // Handle bulk string content
        let value = ''
        while (i < input.length && input[i] !== '\r') {
          value += input[i]
          i++
        }
        if (value) {
          tokens.push({ type: 'BulkString', value })
        }
      }
    }
    
    return tokens
  }

  private isStartOfLine(input: string, index: number): boolean {
    // Check if this * is at the start of input or after a CRLF
    return index === 0 || (input[index - 2] === '\r' && input[index - 1] === '\n')
  }
}
