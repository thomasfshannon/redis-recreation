import { beforeEach, describe, expect, it } from 'vitest'
import { Parser } from './parser'
import { Token } from './types'

describe('Parser', () => {
  let parser: Parser

  beforeEach(() => {
    parser = new Parser()
  })

  describe('parse()', () => {
    it('should parse a simple SET command in RESP format', () => {
      const tokens: Token[] = [
        { type: 'ArrayMarker', value: '*' },
        { type: 'BulkString', value: '3' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '3' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkString', value: 'SET' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '3' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkString', value: 'key' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '5' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkString', value: 'value' },
        { type: 'CRLF', value: '\r\n' },
      ]

      parser.setup(tokens)
      const result = parser.parse()

      expect(result).toEqual([
        {
          type: 'Command',
          name: 'SET',
          args: [
            { type: 'BulkString', value: 'key' },
            { type: 'BulkString', value: 'value' },
          ],
        },
      ])
    })

    it('should parse KEYS command with * argument', () => {
      const tokens: Token[] = [
        { type: 'ArrayMarker', value: '*' },
        { type: 'BulkString', value: '2' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '4' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkString', value: 'KEYS' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '1' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'ArrayMarker', value: '*' },
        { type: 'CRLF', value: '\r\n' },
      ]

      parser.setup(tokens)
      const result = parser.parse()

      expect(result).toEqual([
        {
          type: 'Command',
          name: 'KEYS',
          args: [{ type: 'BulkString', value: '*' }],
        },
      ])
    })

    it('should handle multiple commands in sequence', () => {
      const tokens: Token[] = [
        // First command: PING
        { type: 'ArrayMarker', value: '*' },
        { type: 'BulkString', value: '1' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '4' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkString', value: 'PING' },
        { type: 'CRLF', value: '\r\n' },
        // Second command: GET key
        { type: 'ArrayMarker', value: '*' },
        { type: 'BulkString', value: '2' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '3' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkString', value: 'GET' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkMarker', value: '$' },
        { type: 'BulkString', value: '3' },
        { type: 'CRLF', value: '\r\n' },
        { type: 'BulkString', value: 'key' },
        { type: 'CRLF', value: '\r\n' },
      ]

      parser.setup(tokens)
      const result = parser.parse()

      expect(result).toEqual([
        {
          type: 'Command',
          name: 'PING',
          args: [],
        },
        {
          type: 'Command',
          name: 'GET',
          args: [{ type: 'BulkString', value: 'key' }],
        },
      ])
    })

    it('should throw error on unexpected token type', () => {
      const tokens: Token[] = [
        { type: 'BulkMarker', value: '$' }, // Wrong starting token
        { type: 'BulkString', value: '3' },
        { type: 'CRLF', value: '\r\n' },
      ]

      parser.setup(tokens)
      expect(() => parser.parse()).toThrowError(
        'Expected token type ArrayMarker, but got BulkString',
      )
    })
  })
})
