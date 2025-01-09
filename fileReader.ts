import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export class FileReader {
  constructor(private directory: string, private filename: string) {}

  readBuffer(): Buffer {
    if (!this.directory || !this.filename) {
      return Buffer.alloc(0)
    }
    return readFileSync(join(this.directory, this.filename))
  }

  writeBuffer(buffer: Buffer): void {
    if (!this.directory || !this.filename) {
      return
    }
    writeFileSync(join(this.directory, this.filename), buffer)
  }
}
