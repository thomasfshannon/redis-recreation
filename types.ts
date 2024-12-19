export type Token = {
  type:
    | 'Number'
    | 'BulkString'
    | 'CRLF'
    | 'ArrayMarker'
    | 'BulkMarker'
    | 'Quote'
  value: string
}

export type RedisValue =
  | { type: 'SimpleString'; value: string } // For '+' prefixed strings
  | { type: 'Error'; value: string } // For '-' prefixed strings
  | { type: 'Integer'; value: number } // For ':' prefixed numbers
  | { type: 'BulkString'; value: string | null } // For '$' prefixed strings
  | { type: 'Array'; value: RedisValue[] } // For '*' prefixed arrays
  | { type: 'Command'; name: string; args: RedisValue[] }

export type Segment = {
  type: 'AUX' | 'DB_SELECTOR' | 'KEY_VALUE' | 'EOF'
  data: Buffer
}

// Add any other shared types here
export type RDBValue = {
  value: string
  expiryMs?: number
}
