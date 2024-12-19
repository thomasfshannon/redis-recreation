import { unlinkSync, writeFileSync } from 'fs'
import os from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { RDBReader } from './rdbReader'
describe('RDBReader', () => {
  let rdbReader: RDBReader
  let tempDir: string
  let tempFile: string

  // Test data buffer from previous message
  const testRDBBuffer = Buffer.from([
    // REDIS0011 header
    0x52,
    0x45,
    0x44,
    0x49,
    0x53,
    0x30,
    0x30,
    0x31,
    0x31,

    // AUX field - redis-ver
    0xfa,
    0x09,
    0x72,
    0x65,
    0x64,
    0x69,
    0x73,
    0x2d,
    0x76,
    0x65,
    0x72,
    0x05,
    0x37,
    0x2e,
    0x32,
    0x2e,
    0x30,

    // AUX field - redis-bits
    0xfa,
    0x0a,
    0x72,
    0x65,
    0x64,
    0x69,
    0x73,
    0x2d,
    0x62,
    0x69,
    0x74,
    0x73,
    0xc0,
    0x40,

    // Database selector
    0xfe,
    0x00,

    // Database size info
    0xfb,
    0x04,
    0x04,

    // Key-value pairs with expiry times
    0xfc,
    0x00,
    0x0c,
    0x28,
    0x8a,
    0xc7,
    0x01,
    0x00,
    0x00,
    0x00, // Expiry time
    0x09,
    0x72,
    0x61,
    0x73,
    0x70,
    0x62,
    0x65,
    0x72,
    0x72,
    0x79, // "raspberry"
    0x05,
    0x61,
    0x70,
    0x70,
    0x6c,
    0x65, // "apple"

    // More key-value pairs...
    0xfc,
    0x00,
    0x0c,
    0x28,
    0x8a,
    0xc7,
    0x01,
    0x00,
    0x00,
    0x00, // Expiry time
    0x06,
    0x6f,
    0x72,
    0x61,
    0x6e,
    0x67,
    0x65, // "orange"
    0x04,
    0x70,
    0x65,
    0x61,
    0x72, // "pear"

    // ... more pairs ...

    // EOF marker
    0xff,
  ])

  function uuidv4() {
    return crypto.randomUUID()
  }

  beforeEach(() => {
    // Create a temporary file for each test
    tempDir = os.tmpdir()
    tempFile = `test-redis-${uuidv4()}.rdb`
    writeFileSync(join(tempDir, tempFile), testRDBBuffer)

    rdbReader = new RDBReader()
    rdbReader.setFileLocation(tempDir, tempFile)
  })

  afterEach(() => {
    // Cleanup temporary file
    try {
      unlinkSync(join(tempDir, tempFile))
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  test('should initialize and read RDB file successfully', () => {
    rdbReader.read()
    expect(rdbReader.isInitialized).toBe(true)
  })

  test('should read key-value pairs correctly', () => {
    rdbReader.read()

    // Test regular key retrieval
    expect(rdbReader.getKey('raspberry')).toBe('$5\r\napple\r\n')
    expect(rdbReader.getKey('orange')).toBe('$4\r\npear\r\n')
    expect(rdbReader.getKey('grape')).toBe('$6\r\norange\r\n')
    expect(rdbReader.getKey('banana')).toBe('$10\r\nstrawberry\r\n')
  })

  test('should handle non-existent keys', () => {
    rdbReader.read()
    expect(rdbReader.getKey('nonexistent')).toBe('$-1\r\n')
  })

  test('should handle expiry times', () => {
    rdbReader.read()

    // Since the expiry times in the test data are in the past,
    // these keys should return as expired
    expect(rdbReader.getKey('raspberry')).toBe('$-1\r\n')
    expect(rdbReader.getKey('orange')).toBe('$-1\r\n')
  })

  test('should return all keys', () => {
    rdbReader.read()
    const keys = rdbReader.getKeys()
    console.log(keys)
    expect(keys).toContain('raspberry')
    expect(keys).toContain('orange')
    expect(keys).toContain('grape')
    expect(keys).toContain('banana')
  })

  test('should handle setting new keys', () => {
    rdbReader.read()
    rdbReader.setKey('newkey', 'newvalue')
    expect(rdbReader.getKey('newkey')).toBe('$8\r\nnewvalue\r\n')
  })

  test('should handle setting keys with expiry', () => {
    rdbReader.read()

    // Set a key with 1 second expiry
    rdbReader.setKey('expiring', 'value', 1000)

    // Should exist immediately
    expect(rdbReader.getKey('expiring')).toBe('$5\r\nvalue\r\n')

    // Wait for expiry
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(rdbReader.getKey('expiring')).toBe('$-1\r\n')
        resolve(true)
      }, 1100)
    })
  })
})
