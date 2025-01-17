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
      if (this.data.length === 0) {
        logger.info('[RDBReader:read]: No data to parse')
        return
      }
      logger.info('Buffer length:', this.data.length) // Debug line
      this.position = 0
      this.parseHeader()
      logger.info('After header parse, position:', this.position) // Debug line
      this.parseDatabase()
      logger.info('Cache size:', this.cache.size) // Debug line
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
    logger.info('Starting database parse at position:', this.position) // Debug line

    while (this.position < this.data.length) {
      const opcode = this.data[this.position]
      logger.info(
        `At position ${this.position}, found opcode: 0x${opcode.toString(16)}`,
      ) // Debug line

      if (opcode === RDB_TYPE.RDB_OPCODE_EOF) {
        logger.info('Found EOF marker') // Debug line
        break
      }

      this.position++
      this.processOpcode(opcode)
    }

    logger.info('Finished parsing database') // Debug line
  }

  private processOpcode(opcode: number) {
    try {
      logger.info('Processing opcode:', opcode.toString(16))
      if (opcode === RDB_TYPE.RDB_OPCODE_EXPIRETIME_MS) {
        logger.info('Processing expiry time entry')
        this.processExpiryTimeEntry()
      } else if (opcode === RDB_TYPE.STRING) {
        logger.info('Processing string entry')
        this.processStringEntry()
      } else if (opcode === 0xfa) {
        // AUX field
        logger.info('Processing AUX field')
        // Read key length and skip key
        const keyLen = this.readLength()
        this.position += keyLen
        // Read value length and skip value
        const valueLen = this.readLength()
        this.position += valueLen
      } else if (opcode === 0xfe) {
        // Database selector
        logger.info('Processing database selector')
        // Skip the database number
        this.position++
      } else if (opcode === 0xfb) {
        // Database size
        logger.info('Processing database size')
        // Skip the size information (2 integers)
        this.position += 8
      } else {
        logger.info(`Unknown opcode: 0x${opcode.toString(16)}`)
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

  getKey(key: string): string {
    const expiry = this.expiryTimes.get(key)
    logger.info({ expiry })
    if (this.expiryTimes.has(key)) {
      const now = Date.now()
      logger.info({ now })
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
    logger.info(this.cache.keys())
    return RESPFormatter.formatArray(Array.from(this.cache.keys()))
  }

  getAuxFields() {
    return []
  }
}
