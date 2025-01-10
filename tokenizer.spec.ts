import { Tokenizer } from './tokenizer'
import { type Token } from './types'
import { describe, expect, it, beforeEach, beforeAll } from 'vitest'
describe('Tokenizer', () => {
  let tokenizer: Tokenizer

  beforeEach(() => {
    tokenizer = new Tokenizer()
  })

  beforeAll(() => {
    tokenizer = new Tokenizer()
    console.log(tokenizer.tokenize('*2\r\n$4\r\nECHO\r\n$3\r\nhey\r\n'))
  })

  it('should tokenize an empty string', () => {
    expect(tokenizer.tokenize('')).toEqual([])
  })

  it('should tokenize array markers at start of lines', () => {
    const input = '*2\r\n*3'
    expect(tokenizer.tokenize(input)).toEqual([
      { type: 'ArrayMarker', value: '*' },
      { type: 'BulkString', value: '2' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'ArrayMarker', value: '*' },
      { type: 'BulkString', value: '3' }
    ])
  })

  it('should not tokenize array markers in the middle of lines', () => {
    const input = 'hello*world'
    expect(tokenizer.tokenize(input)).toEqual([
      { type: 'BulkString', value: 'hello*world' }
    ])
  })

  it('should tokenize bulk markers', () => {
    const input = '$5\r\nhello'
    expect(tokenizer.tokenize(input)).toEqual([
      { type: 'BulkMarker', value: '$' },
      { type: 'BulkString', value: '5' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'BulkString', value: 'hello' }
    ])
  })

  it('should handle CRLF line endings', () => {
    const input = 'first\r\nsecond\r\nthird'
    expect(tokenizer.tokenize(input)).toEqual([
      { type: 'BulkString', value: 'first' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'BulkString', value: 'second' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'BulkString', value: 'third' }
    ])
  })

  it('should handle complex RESP array input', () => {
    const input = '*2\r\n$5\r\nhello\r\n$5\r\nworld'
    expect(tokenizer.tokenize(input)).toEqual([
      { type: 'ArrayMarker', value: '*' },
      { type: 'BulkString', value: '2' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'BulkMarker', value: '$' },
      { type: 'BulkString', value: '5' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'BulkString', value: 'hello' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'BulkMarker', value: '$' },
      { type: 'BulkString', value: '5' },
      { type: 'CRLF', value: '\r\n' },
      { type: 'BulkString', value: 'world' }
    ])
  })
}) 