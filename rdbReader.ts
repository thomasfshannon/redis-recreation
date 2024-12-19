import { readFileSync } from 'fs'
import { join } from 'path'
import { RESPFormatter } from './respFormatter.ts'

type Segment = {
  type: 'AUX' | 'DB_SELECTOR' | 'KEY_VALUE' | 'EOF'
  data: Buffer
}

// Constants for RDB file format markers
const RDB_TYPE = {
  AUX: 0xfa, // 250
  RESIZEDB: 0xfb, // 251 - Used for hash table resize hint
  DB_SELECTOR: 0xfe, // 254
  EOF: 0xff, // 255

  // Data types
  STRING: 0x00, // 0
  LIST: 0x01, // 1
  SET: 0x02, // 2
  ZSET: 0x03, // 3
  HASH: 0x04, // 4
  ZSET_2: 0x05, // 5
  MODULE: 0x06, // 6
  MODULE_2: 0x07, // 7

  // Encodings
  ENCODING_RAW: 0x00,
  ENCODING_INT: 0x01,
  ENCODING_COMPRESSED: 0x02,
} as const

export class RDBReader {
  private pos: number = 0
  private data: Buffer
  private directory: string = ''
  private databaseFilename: string = ''
  private auxFieldList: {
    key: string
    keyLength: number
    value: string
    valueLength: number
  }[] = []
  private keyValuePairs: {
    key: string
    keyLength: number
    value: string
    valueLength: number
  }[] = []
  public isInitialized: boolean = false
  constructor() {}

  private readBytes(length: number): Buffer {
    const bytes = this.data.subarray(this.pos, this.pos + length)
    this.pos += length
    return bytes
  }

  private readString(length: number): string {
    if (length <= 0) {
      // console.log('Warning: Attempted to read string with length <= 0')
      return ''
    }

    if (this.pos + length > this.data.length) {
      // console.log(
      //   `Warning: String length ${length} would exceed buffer bounds at position ${this.pos}`,
      // )
      return ''
    }

    const bytes = this.readBytes(length)
    const str = bytes.toString('ascii')
    // console.log(
    //   `Read string of length ${length}: "${str}" (hex: ${bytes.toString(
    //     'hex',
    //   )})`,
    // )
    return str
  }

  private readByte(): number | undefined {
    // Check if we're at or past the end of the buffer
    if (this.pos >= this.data.length) {
      // console.log(
      //   `Buffer boundary reached at position: ${this.pos}, buffer length: ${this.data.length}`,
      // )
      return undefined
    }

    const byte = this.data[this.pos]
    this.pos += 1
    return byte
  }

  private isEndOfSection(byte: number | undefined): boolean {
    return byte === undefined || byte.toString(16) === 'fe'
  }

  private peekByte(): number {
    return this.data[this.pos]
  }

  private readLength(): number {
    const firstByte = this.readByte()
    if (firstByte === undefined) {
      return 0
    }

    // Add bounds checking
    if (this.pos >= this.data.length) {
      // console.log('Reached end of buffer while reading length')
      return 0
    }

    const type = (firstByte & 0xc0) >> 6
    const value = firstByte & 0x3f

    // Add validation before reading additional bytes
    switch (type) {
      case 0: // 6 bit length
        return value
      case 1: // 14 bit length
        if (this.pos + 1 > this.data.length) return 0
        const nextByte = this.readByte() || 0
        return (value << 8) | nextByte
      case 2: // 32 bit length
        if (this.pos + 4 > this.data.length) return 0
        const len = this.readBytes(4).readUInt32BE(0)
        // Add sanity check for unreasonable lengths
        if (len > this.data.length - this.pos) {
          // console.log(
          //   `Warning: Length ${len} appears invalid, might be corrupted data`,
          // )
          return 0
        }
        return len
      case 3: // Special format
        switch (value) {
          case 0: // 8 bit integer
            if (this.pos + 1 > this.data.length) return 0
            return this.readByte() || 0
          case 1: // 16 bit integer
            if (this.pos + 2 > this.data.length) return 0
            return this.readBytes(2).readInt16BE(0)
          case 2: // 32 bit integer
            if (this.pos + 4 > this.data.length) return 0
            return this.readBytes(4).readInt32BE(0)
          default:
            // console.log(`Unknown special encoding: ${value}`)
            return 0
        }
      default:
        // console.log(`Unknown length encoding type: ${type}`)
        return 0
    }
  }

  private readKeyValuePair() {
    const keyLength = this.readLength()
    // console.log(
    //   `Reading key-value pair at position ${this.pos}, key length: ${keyLength}`,
    // )

    if (keyLength === 0) {
      // console.log('Zero key length detected, skipping pair')
      return null
    }

    if (this.pos + keyLength > this.data.length) {
      // console.log(
      //   `Buffer overflow prevented: pos=${this.pos}, keyLength=${keyLength}, bufferLength=${this.data.length}`,
      // )
      return null
    }

    const key = this.readString(keyLength)
    // console.log(`Read key: "${key}" (hex: ${Buffer.from(key).toString('hex')})`)

    const valueLength = this.readLength()
    if (valueLength === 0) {
      return null
    }

    if (this.pos + valueLength > this.data.length) {
      return null
    }

    const value = this.readString(valueLength)
    // console.log(
    //   `Read value: "${value}" (hex: ${Buffer.from(value).toString('hex')})`,
    // )

    return { key, value, keyLength, valueLength }
  }

  private readAuxField() {
    const keyLength = this.readLength()
    if (keyLength <= 0) {
      // console.log('Invalid AUX field key length')
      return { key: '', keyLength: 0, value: '', valueLength: 0 }
    }

    const key = this.readString(keyLength)

    // Handle special integer encoding for values
    const valueType = this.peekByte()
    let value: string
    let valueLength: number

    if ((valueType & 0xc0) === 0xc0) {
      // Check if it's a special integer encoding
      this.readByte() // consume the type byte
      if (valueType === 0xc0) {
        // 8-bit integer
        value = this.readByte()?.toString() || ''
        valueLength = 1
      } else if (valueType === 0xc2) {
        // 32-bit integer
        const intValue = this.readBytes(4).readInt32BE(0)
        value = intValue.toString()
        valueLength = 4
      } else {
        // console.log(`Unknown integer encoding: 0x${valueType.toString(16)}`)
        value = ''
        valueLength = 0
      }
    } else {
      valueLength = this.readLength()
      if (valueLength <= 0) {
        // console.log('Invalid AUX field value length')
        return { key, keyLength, value: '', valueLength: 0 }
      }
      value = this.readString(valueLength)
    }

    return { key, keyLength, value, valueLength }
  }

  public setFileLocation(dir: string, filename: string) {
    this.directory = dir
    this.databaseFilename = filename

    // If both dir and filename are explicitly provided, use them directly
    // Otherwise, assume we're using the default db directory structure
    const fullPath =
      dir && filename
        ? join(this.directory, this.databaseFilename)
        : join(this.directory, 'db', 'dump.rdb')

    try {
      this.data = readFileSync(fullPath)
      return true
    } catch (error: any) {
      console.error(`Error reading file: ${error.message}`)
      this.data = Buffer.from('')
      return false
    }
  }

  public read() {
    this.pos = 0
    this.keyValuePairs = []
    this.auxFieldList = []
    // Add guard clause to prevent processing empty buffer
    if (!this.data.length) {
      return
    }

    // Check magic string "REDIS"
    const signature = this.readString(5)
    if (signature !== 'REDIS') {
      throw new Error('Invalid RDB file')
    }

    // Version is stored as 4 bytes representing a version string
    const versionStr = this.readString(4)
    // console.log(`RDB version: ${versionStr}`)

    const auxFieldList: {
      key: string
      keyLength: number
      value: string
      valueLength: number
    }[] = []

    while (this.pos < this.data.length) {
      const opcode = this.readByte()
      if (!opcode) break

      // console.log(`Opcode: 0x${opcode.toString(16)}`)
      switch (opcode) {
        case RDB_TYPE.AUX:
          const auxField = this.readAuxField()
          this.auxFieldList.push(auxField)
          // console.log(`AUX Field: ${auxField.key} = ${auxField.value}`)
          break
        case RDB_TYPE.DB_SELECTOR:
          const dbNumber = this.readLength()
          // console.log(`Switching to DB ${dbNumber}`)

          // Read the RESIZEDB if present
          if (this.peekByte() === RDB_TYPE.RESIZEDB) {
            this.readByte() // consume RESIZEDB byte
            const hashTableSize = this.readLength()
            const expiryHashTableSize = this.readLength()
            // console.log(
            //   `DB ${dbNumber} resize hint - Hash table: ${hashTableSize}, Expiry table: ${expiryHashTableSize}`,
            // )
          }

          // Continue reading key-value pairs until we hit EOF or another DB_SELECTOR
          while (this.pos < this.data.length) {
            const valueType = this.readByte()
            if (valueType === undefined) break

            // Check for special opcodes
            if (valueType === RDB_TYPE.EOF || valueType === RDB_TYPE.DB_SELECTOR) {
                this.pos-- // Move back one byte so it can be processed in the next iteration
                break
            }

            // If it's not a special opcode, we need to back up one byte as it's part of the key
            if (valueType < 0xf0) {
                const pair = this.readKeyValuePair()
                if (!pair) break

                // console.log(
                //   `DB ${dbNumber} - Key: ${pair.key}, Value: ${pair.value}`,
                // )
                this.keyValuePairs.push(pair)
            } else {
                console.log(
                    `Unexpected opcode in DB: 0x${valueType.toString(16)}`,
                )
                break
            }
          }
          break
        case RDB_TYPE.EOF:
          this.auxFieldList = auxFieldList
          this.isInitialized = true
          // console.log('End of file reached')
          return
        case RDB_TYPE.RESIZEDB:
          const hashTableSize = this.readLength()
          const expiryHashTableSize = this.readLength()
          // console.log(
          //   `Resize hint - Hash table: ${hashTableSize}, Expiry table: ${expiryHashTableSize}`,
          // )
          break
        default:
          // If it's not a special opcode, we need to back up one byte as it's part of the key length
          this.pos--
          const pair = this.readKeyValuePair()
          if (pair) {
            // console.log(`DB ${0} - Key: ${pair.key}, Value: ${pair.value}`)
            this.keyValuePairs.push(pair)
          }
      }
    }
  }

  getKeys() {
    this.read()
    return RESPFormatter.formatArray(this.keyValuePairs.map((pair) => pair.key))
  }

  getKey(key: string) {
    const pair = this.keyValuePairs.find((pair) => pair.key === key)
    if (!pair) {
      return RESPFormatter.formatBulkString(null)
    }
    return RESPFormatter.formatBulkString(pair.value)
  }

  getAuxFields() {
    return this.auxFieldList
  }
}

// const rdbReader = new RDBReader()
// rdbReader.setFileLocation(process.cwd(), 'dump.rdb')
// rdbReader.read()
