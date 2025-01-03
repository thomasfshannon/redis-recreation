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
      this.position = 0
      this.parseHeader()
      this.parseDatabase()
      this.isInitialized = true
    } catch (error) {
      console.error('Error reading RDB file:', error)
    }
  }

  setData(data: Buffer) {
    this.data = data
    this.position = 0
    this.isInitialized = true
  }

  public parseDatabase() {
    logger.info('Starting to parse database at position:', this.position)
    while (this.position < this.data.length) {
      const opcode = this.data[this.position]
      logger.info(
        `Processing opcode: 0x${opcode.toString(16)} at position ${
          this.position
        }`,
      )
      this.position++

      try {
        switch (opcode) {
          case RDB_TYPE.RDB_OPCODE_EXPIRETIME:
          case RDB_TYPE.RDB_OPCODE_EXPIRETIME_MS:
            const expiry = this.readExpiry(opcode)
            logger.info(`Read expiry time: ${expiry}`)
            const valueType = this.readByte()
            // Read the type byte that follows expiry
            if (valueType === RDB_TYPE.STRING) {
              const key = this.readEncodedString()
              const value = this.readEncodedString()
              if (key && !value) {
                throw new Error('Key without value')
              }
              if (key && value) {
                logger.info(`Set key with expiry: "${key}" -> "${value}"`)
                this.cache.set(key, value)
                this.expiryTimes.set(key, expiry)
              }
            }
            break

          case RDB_TYPE.STRING:
            const plainKey = this.readEncodedString()
            const plainValue = this.readEncodedString()
            if (plainKey && plainValue) {
              this.cache.set(plainKey, plainValue)
              logger.info(`Set key: ${plainKey} -> ${plainValue}`)
            }
            break

          case RDB_TYPE.RDB_OPCODE_AUX:
            const auxKey = this.readString()
            if (auxKey === 'redis-bits') {
              const byte = this.readByte() || 0
              if (byte === 0xc0) {
                this.position++ // Skip the value
                logger.info('Skipped redis-bits special encoding')
              }
            } else {
              const auxValue = this.readString()
              logger.info(`Skipping AUX field: ${auxKey} = ${auxValue}`)
            }
            break

          case RDB_TYPE.RDB_OPCODE_SELECTDB:
            const dbnum = this.readLength()
            logger.info(`Selecting DB: ${dbnum}`)
            break

          case RDB_TYPE.RDB_OPCODE_RESIZEDB:
            const hashTableSize = this.readLength()
            const expiryHashTableSize = this.readLength()
            logger.info(
              `DB sizes - main: ${hashTableSize}, expiry: ${expiryHashTableSize}`,
            )
            break

          case RDB_TYPE.RDB_OPCODE_EOF:
            logger.info('Found EOF marker')
            return

          default:
            logger.info(`Unknown opcode: 0x${opcode.toString(16)}`)
            // Try to recover by finding next valid opcode
            while (this.position < this.data.length) {
              const nextByte = this.data[this.position]
              if (
                [
                  RDB_TYPE.RDB_OPCODE_EOF,
                  RDB_TYPE.RDB_OPCODE_EXPIRETIME,
                  RDB_TYPE.RDB_OPCODE_EXPIRETIME_MS,
                  RDB_TYPE.STRING,
                ].includes(nextByte)
              ) {
                break
              }
              this.position++
            }
        }
      } catch (error) {
        logger.error('Error processing opcode:', error)
        break
      }
    }
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
    console.log('Key:', key)
    console.log('Expiry:', expiry)
    console.log('Current time:', Date.now())
    if (this.expiryTimes.has(key)) {
      const expiry = this.expiryTimes.get(key)
      const now = Date.now()
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
    return RESPFormatter.formatBulkString(value)
  }

  setKey(key: string, value: string, expiryMs?: number) {
    // Update in-memory cache
    this.cache.set(key, value)
    if (expiryMs) {
      const unixTime = Date.now() + expiryMs
      this.expiryTimes.set(key, unixTime)
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
    const byte = this.data[this.position++]
    const type = (byte & 0xc0) >> 6 // Get the first 2 bits

    if (type === 0) {
      return byte & 0x3f
    } else if (type === 1) {
      const next = this.data[this.position++]
      return ((byte & 0x3f) << 8) | next
    } else if (type === 2) {
      const length = this.data.readUInt32LE(this.position)
      this.position += 4
      return length
    } else {
      const specialByte = byte & 0x3f
      if (specialByte === 0) {
        return this.data[this.position++]
      } else if (specialByte === 1) {
        const val = this.data.readUInt16LE(this.position)
        this.position += 2
        return val
      } else if (specialByte === 2) {
        const val = this.data.readUInt32LE(this.position)
        this.position += 4
        return val
      }
      throw new Error(`Unsupported special encoding: ${specialByte}`)
    }
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
