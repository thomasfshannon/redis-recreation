import { writeFileSync } from 'fs'
import { join } from 'path'
import { RDB_TYPE } from './constants'
import { FileReader } from './fileReader'
import { RESPFormatter } from './respFormatter'

// Enable logging temporarily to debug
const LOGGED_ENABLED = false

const logger = {
  info: (...message: any[]) => {
    if (LOGGED_ENABLED) {
      console.info(message.join(' '))
    }
  },
  error: (...message: any[]) => {
    if (LOGGED_ENABLED) {
      console.error(message.join(' '))
    }
  },
}

export class RDBReader {
  private data: Buffer = Buffer.alloc(0)
  private position: number = 0
  private directory: string = ''
  private filename: string = ''
  private cache: Map<string, string> = new Map()
  private expiryTimes: Map<string, number> = new Map()
  private fileReader: FileReader
  isInitialized: boolean = false

  constructor() {
    // note: could be a default location in the future
    this.fileReader = new FileReader('', '')
  }

  read() {
    try {
      this.data = this.fileReader.readBuffer()
      console.log('Buffer length:', this.data.length) // Debug line
      this.position = 0
      this.parseHeader()
      console.log('After header parse, position:', this.position) // Debug line
      this.parseDatabase()
      console.log('Cache size:', this.cache.size) // Debug line
      this.isInitialized = true
    } catch (error) {
      console.error('[RDBReader]: Error reading RDB file:', error)
      throw error // Rethrow to make test fail with actual error
    }
  }

  setData(data: Buffer) {
    this.data = data
    this.position = 0
    this.isInitialized = true
  }

  public parseDatabase() {
    console.log('Starting database parse at position:', this.position) // Debug line

    while (this.position < this.data.length) {
      const opcode = this.data[this.position]
      console.log(
        `At position ${this.position}, found opcode: 0x${opcode.toString(16)}`,
      ) // Debug line

      if (opcode === RDB_TYPE.RDB_OPCODE_EOF) {
        console.log('Found EOF marker') // Debug line
        break
      }

      this.position++
      this.processOpcode(opcode)
    }

    console.log('Finished parsing database') // Debug line
  }

  private processOpcode(opcode: number) {
    try {
      console.log('Processing opcode:', opcode.toString(16))
      if (opcode === RDB_TYPE.RDB_OPCODE_EXPIRETIME_MS) {
        console.log('Processing expiry time entry')
        this.processExpiryTimeEntry()
      } else if (opcode === RDB_TYPE.STRING) {
        console.log('Processing string entry')
        this.processStringEntry()
      } else if (opcode === 0xfa) {
        // AUX field
        console.log('Processing AUX field')
        // Read key length and skip key
        const keyLen = this.readLength()
        this.position += keyLen
        // Read value length and skip value
        const valueLen = this.readLength()
        this.position += valueLen
      } else if (opcode === 0xfe) {
        // Database selector
        console.log('Processing database selector')
        // Skip the database number
        this.position++
      } else if (opcode === 0xfb) {
        // Database size
        console.log('Processing database size')
        // Skip the size information (2 integers)
        this.position += 8
      } else {
        console.log(`Unknown opcode: 0x${opcode.toString(16)}`)
      }
    } catch (error) {
      console.error('Error processing opcode:', error)
      throw error
    }
  }

  private processExpiryTimeEntry() {
    const expiry = this.readExpiryTimestamp()
    this.position++ // Skip string type byte
    const { key, value } = this.readKeyValuePair()

    if (key && value) {
      this.cache.set(key, value) // Store raw value
      this.expiryTimes.set(key, expiry)
    }
  }

  private processStringEntry(): void {
    // Read the key length and key
    const keyLength = this.readLength()
    const key = this.data
      .slice(this.position, this.position + keyLength)
      .toString()
    this.position += keyLength

    // Read the value length and value
    const valueLength = this.readLength()
    const value = this.data
      .slice(this.position, this.position + valueLength)
      .toString()
    this.position += valueLength

    // Store raw value in the cache (without RESP formatting)
    this.cache.set(key, value) // Remove the RESP formatting here
  }

  private readExpiryTimestamp(): number {
    const expiryBuffer = this.data.slice(this.position, this.position + 8)
    const expiry = Number(expiryBuffer.readBigUInt64LE())
    this.position += 8
    logger.info(`Read expiry time: ${expiry}`)
    return expiry
  }

  private readKeyValuePair(): { key: string; value: string } {
    // Read the key length and key using proper length encoding
    const keyLength = this.readLength()
    const key = this.data
      .slice(this.position, this.position + keyLength)
      .toString('utf8')
    this.position += keyLength

    // Read the value length and value using proper length encoding
    const valueLength = this.readLength()
    const value = this.data
      .slice(this.position, this.position + valueLength)
      .toString('utf8')
    this.position += valueLength

    return { key, value }
  }

  private readExpiry(opcode: number): number {
    let timestamp: number

    if (opcode === RDB_TYPE.RDB_OPCODE_EXPIRETIME) {
      timestamp = this.data.readUInt32LE(this.position)
      this.position += 4
      return timestamp * 1000 + Date.now() // Convert to ms and add to current time
    } else {
      timestamp = Number(this.data.readBigUInt64LE(this.position))
      this.position += 8
      return timestamp + Date.now()
    }
  }

  getKey(key: string): string {
    const expiry = this.expiryTimes.get(key)
    console.log({ expiry })
    if (this.expiryTimes.has(key)) {
      const now = Date.now()
      console.log({ now })
      if (expiry && expiry < now) {
        this.cache.delete(key)
        this.expiryTimes.delete(key)
        return `$-1\r\n`
      }
    }

    const value = this.cache.get(key)
    if (!value) {
      return `$-1\r\n`
    }
    return `$${value.length}\r\n${value}\r\n`
  }

  setKey(key: string, value: string, expiryMs?: number) {
    // Update in-memory cache
    this.cache.set(key, value)
    if (expiryMs) {
      // Store the absolute timestamp directly, don't add to current time
      this.expiryTimes.set(key, expiryMs)
    }

    // Calculate total buffer size needed
    let totalSize = 9 // REDIS + version (5 + 4 bytes)
    for (const [k, v] of this.cache.entries()) {
      totalSize += 3 // type + key length + value length
      totalSize += Buffer.from(k).length
      totalSize += Buffer.from(v).length
    }
    totalSize += 1 // EOF marker

    // Create buffer
    const buffer = Buffer.alloc(totalSize)
    let position = 0

    // Write REDIS header
    buffer.write('REDIS', position)
    position += 5

    // Write version
    buffer.write('0006', position)
    position += 4

    // Write all key-value pairs
    for (const [k, v] of this.cache.entries()) {
      // Write type
      buffer.writeUInt8(RDB_TYPE.STRING, position++)

      // Write key
      const keyBuffer = Buffer.from(k)
      buffer.writeUInt8(keyBuffer.length, position++)
      keyBuffer.copy(buffer, position)
      position += keyBuffer.length

      // Write value
      const valueBuffer = Buffer.from(v)
      buffer.writeUInt8(valueBuffer.length, position++)
      valueBuffer.copy(buffer, position)
      position += valueBuffer.length
    }

    // Write EOF marker
    buffer.writeUInt8(RDB_TYPE.EOF, position++)

    try {
      writeFileSync(join(this.directory, this.filename), buffer)
    } catch (error) {
      console.error('Error writing to RDB file:', error)
    }
  }

  public parseHeader() {
    // Check for "REDIS" magic string
    const magic = this.data.slice(0, 5).toString('ascii')
    if (magic !== 'REDIS') {
      throw new Error('Invalid RDB file format: missing REDIS signature')
    }

    // Skip the version number (4 bytes) and move position past header
    this.position = 9
  }

  private readString(length?: number): string {
    if (length === undefined) {
      length = this.data[this.position++]
    }
    // Don't return early for length 0, as it might be a valid empty string
    // that we still need to advance the position for

    const str = this.data
      .slice(this.position, this.position + length)
      .toString('utf8')
    this.position += length
    logger.info(`Read string of length ${length}: "${str}"`)
    return str
  }

  private readByte(): number | undefined {
    // Check if we're at or past the end of the buffer
    if (this.position >= this.data.length) {
      // logger.info(
      //   `Buffer boundary reached at position: ${this.position}, buffer length: ${this.data.length}`,
      // )
      return undefined
    }

    const byte = this.data[this.position]
    this.position += 1
    return byte
  }

  private isEndOfSection(byte: number | undefined): boolean {
    return byte === undefined || byte.toString(16) === 'fe'
  }

  private peekByte(): number {
    return this.data[this.position]
  }

  private readLength(): number {
    let length = 0
    const firstByte = this.data[this.position++]

    // Check for special encoding
    const type = (firstByte & 0xc0) >> 6
    if (type === 0) {
      // Length is in the first 6 bits
      length = firstByte & 0x3f
    } else if (type === 1) {
      // Read next byte
      length = ((firstByte & 0x3f) << 8) | this.data[this.position++]
    } else if (type === 2) {
      // Read next 4 bytes
      length = this.data.readUInt32BE(this.position)
      this.position += 4
    }

    return length
  }

  public setFileLocation(dir: string, filename: string) {
    this.directory = dir
    this.filename = filename
    this.fileReader = new FileReader(this.directory, this.filename)
  }

  getKeys() {
    // this.read()
    // Convert the iterator to an array before formatting
    console.log(this.cache.keys())
    return RESPFormatter.formatArray(Array.from(this.cache.keys()))
  }

  getAuxFields() {
    return []
  }

  private readEncodedString(): string {
    const length = this.readLength()
    if (length === 0) return ''

    // Read exactly 'length' bytes and ensure we're reading valid UTF-8
    const stringBuffer = this.data.slice(this.position, this.position + length)
    this.position += length

    // Remove any null bytes from the end of the buffer
    const cleanBuffer = stringBuffer.filter((byte) => byte !== 0)
    return Buffer.from(cleanBuffer).toString('utf8')
  }

  private findNextValidPosition(): number {
    while (this.position < this.data.length) {
      const byte = this.data[this.position]
      if (
        [
          RDB_TYPE.RDB_OPCODE_EOF,
          RDB_TYPE.RDB_OPCODE_EXPIRETIME,
          RDB_TYPE.RDB_OPCODE_EXPIRETIME_MS,
          RDB_TYPE.STRING,
          RDB_TYPE.LIST,
          RDB_TYPE.SET,
          RDB_TYPE.ZSET,
          RDB_TYPE.HASH,
        ].includes(byte)
      ) {
        return this.position
      }
      this.position++
    }
    return this.position
  }
}
