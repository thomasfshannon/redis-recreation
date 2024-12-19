export const RDB_TYPE = {
  // Data type markers
  AUX: 0xfa,
  RESIZEDB: 0xfb,
  DB_SELECTOR: 0xfe,
  EOF: 0xff,

  // Value types
  STRING: 0x00,
  LIST: 0x01,
  SET: 0x02,
  ZSET: 0x03,
  HASH: 0x04,
  ZSET_2: 0x05,
  MODULE: 0x06,
  MODULE_2: 0x07,

  // Encodings
  ENCODING_RAW: 0x00,
  ENCODING_INT: 0x01,
  ENCODING_COMPRESSED: 0x02,

  // RDB Format specifiers
  RDB_OPCODE_AUX: 0xfa,
  RDB_OPCODE_RESIZEDB: 0xfb,
  RDB_OPCODE_EXPIRETIME: 0xfc,
  RDB_OPCODE_EXPIRETIME_MS: 0xfd,
  RDB_OPCODE_SELECTDB: 0xfe,
  RDB_OPCODE_EOF: 0xff,
} as const
