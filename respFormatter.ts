export class RESPFormatter {
  static formatBulkString(str: string | null): string {
    if (str === null) {
      return '$-1\r\n'
    }
    return `$${str.length}\r\n${str}\r\n`
  }

  static formatArray(arr: string[]): string {
    if (arr.length === 0) {
      return '*0\r\n'
    }
    return `*${arr.length}\r\n${arr.map(item => this.formatBulkString(item)).join('')}`
  }

  static formatError(message: string): string {
    return `-ERR ${message}\r\n`
  }

  static formatInteger(num: number): string {
    return `:${num}\r\n`
  }

  static formatSimpleString(str: string): string {
    return `+${str}\r\n`
  }
} 