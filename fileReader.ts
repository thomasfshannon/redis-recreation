import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export class FileReader {
  constructor(private directory: string, private filename: string) {}

  readBuffer(): Buffer {
    return readFileSync(join(this.directory, this.filename))
  }

  writeBuffer(buffer: Buffer): void {
    writeFileSync(join(this.directory, this.filename), buffer)
  }
}
