export type Token = {
  type:
  | 'ArrayMarker' // For '*'
  | 'BulkMarker' // For '$'
  | 'Number' // For numbers
  | 'BulkString' // For the actual string content
  | 'CRLF' // For '\r\n' the RESP protocol terminator
  value: string
}

export type RedisValue =
  | { type: 'SimpleString'; value: string } // For '+' prefixed strings
  | { type: 'Error'; value: string } // For '-' prefixed strings
  | { type: 'Integer'; value: number } // For ':' prefixed numbers
  | { type: 'BulkString'; value: string | null } // For '$' prefixed strings
  | { type: 'Array'; value: RedisValue[] } // For '*' prefixed arrays
  | { type: 'Command'; name: string; args: RedisValue[] }

