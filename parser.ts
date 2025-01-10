import type { RedisValue } from './types'
import { type Token } from './types'

interface RedisParser {
  parse(): RedisValue[]
}

export class Parser implements RedisParser {
  private tokens: Token[] = []
  private current = 0

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
   * Parse a command value, handling both quoted and RESP format inputs
   * @returns The value of the command with name and arguments
   */
  private parseCommand(): RedisValue {
    // Expect array marker and length for command
    this.expect('ArrayMarker')
    const length = this.expect('BulkString')
    this.expect('CRLF')

    // Parse command name
    this.expect('BulkMarker')
    this.expect('BulkString') // Length of command name
    this.expect('CRLF')
    const commandName = this.expect('BulkString')
    this.expect('CRLF')

    // Parse arguments
    const args: RedisValue[] = []
    for (let i = 0; i < Number(length.value) - 1; i++) {
      this.expect('BulkMarker')
      const argLength = this.expect('BulkString')
      this.expect('CRLF')

      // Special handling for KEYS command with * argument
      if (commandName.value === 'KEYS' && this.peek().type === 'ArrayMarker') {
        args.push({ type: 'BulkString', value: '*' })
        this.consume() // Consume the ArrayMarker
      } else {
        const arg = this.expect('BulkString')
        args.push(arg)
      }
      this.expect('CRLF')
    }

    return {
      type: 'Command',
      name: commandName.value,
      args,
    }
  }

  parse(): RedisValue[] {
    const ast: RedisValue[] = []

    while (this.current < this.tokens.length) {
      const token = this.peek()

      // console.log('Processing token:', token)

      // Skip CRLF tokens between commands
      if (token.type === 'CRLF') {
        this.consume()
        continue
      }

      if (token.type === 'ArrayMarker') {
        ast.push(this.parseCommand())
      } else if (token.type === 'BulkString' || token.type === 'Quote') {
        ast.push(this.parseCommand())
      } else {
        // throw new Error(`Unexpected token type: ${token.type}`)
        this.consume() // Skip unexpected tokens
      }
    }
    return ast
  }
}
