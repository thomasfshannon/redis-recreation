import type { RedisValue } from './types'
import { type Token } from './types'

interface RedisParser {
  parse(): RedisValue[]
}

export class Parser implements RedisParser {
  private tokens: Token[]
  private current: number = 0

  /**
   * @param tokens - The tokens to parse
   */
  constructor() {}

  public setup(tokens: Token[]) {
    this.tokens = tokens
    this.current = 0
  }

  /**
   * Peek at the next token without consuming it
   * @returns The next token
   */
  private peek(): Token {
    return this.tokens[this.current]
  }

  /**
   * Consume the current token and move to the next one
   * @returns The current token
   */
  private consume(): Token {
    return this.tokens[this.current++]
  }

  /**
   * Expect a token of a specific type
   * @param type - The type of the token to expect
   * @returns The token
   */
  private expect(type: Token['type']): Token {
    const token = this.consume()
    if (token.type !== type) {
      throw new Error(`Expected token type ${type}, but got ${token.type}`)
    }
    return token
  }

  /**
   * Parse a bulk string value
   * @returns The value of the bulk string
   */
  private parseBulkStringValue(): string {
    const token = this.parseBulkString()
    if (token.type !== 'BulkString') {
      throw new Error('Expected BulkString')
    }
    return token.value!
  }

  /**
   * Parse a bulk string value
   * @returns The value of the bulk string
   */
  private parseBulkString(): RedisValue {
    this.expect('BulkMarker')
    const lengthToken = this.expect('BulkString')
    const expectedLength = parseInt(lengthToken.value)
    this.expect('CRLF')

    const stringToken = this.expect('BulkString')
    if (
      stringToken.value !== null &&
      stringToken.value.length !== expectedLength
    ) {
      throw new Error(
        `Bulk string length mismatch. Expected ${expectedLength} but got ${stringToken.value.length}`,
      )
    }
    this.expect('CRLF')

    return {
      type: 'BulkString',
      value: stringToken.value,
    }
  }

  /**
   * Parse a command value
   * @returns The value of the command with name and arguments
   */
  private parseCommand(): RedisValue {
    // Consume the ArrayMarker (already consumed in parse())
    // Get array size (number of bulk strings including command name)
    const token = this.expect('BulkString')
    const size = parseInt(token.value)
    this.expect('CRLF')

    // First bulk string is the command name
    const name = this.parseBulkStringValue()

    // Parse remaining bulk strings as arguments
    const args: RedisValue[] = []
    for (let i = 0; i < size - 1; i++) {
      args.push(this.parseBulkString())
    }

    return {
      type: 'Command',
      name,
      args,
    }
  }

  parse(): RedisValue[] {
    const ast: RedisValue[] = []

    while (this.current < this.tokens.length) {
      const token = this.peek()
      // TODO: handle other types of input
      if (token.type === 'ArrayMarker') {
        this.consume() // consume the ArrayMarker
        // only assume command for now
        ast.push(this.parseCommand())
      } else {
        throw new Error(`Unexpected token type: ${token.type}`)
      }
    }
    return ast
  }
}
