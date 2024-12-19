import * as net from 'net'
import { Parser } from './parser'
import { RDBReader } from './rdbReader'
import type RedisServer from './server'
import { Tokenizer } from './tokenizer'
import type { RedisValue } from './types'

const redisCache = new Map<string, string>()
const redisTimeCache = new Map<string, number>()

type CommandSet = {
  type: 'BulkString'
  value: string
}[]

const LOGGED_ENABLED = false

const logger = {
  info: (message: string) => {
    if (LOGGED_ENABLED) {
      console.log(message)
    }
  },
  error: (message: string) => {
    if (LOGGED_ENABLED) {
      console.error(message)
    }
  },
}

export default class RedisInterpreter {
  private ast: RedisValue[] = []
  parser: Parser
  tokenizer: Tokenizer
  rdbReader: RDBReader
  constructor() {
    this.parser = new Parser()
    this.tokenizer = new Tokenizer()
    this.rdbReader = new RDBReader()
  }

  private executeCommand(
    command: {
      type: 'Command'
      name: string
      args: RedisValue[]
    },
    state: RedisServer['state'],
  ) {
    // Handle unknown commands
    if (
      !['STATE', 'KEYS', 'SET', 'CONFIG', 'GET', 'ECHO', 'PING'].includes(
        command.name,
      )
    ) {
      return `-ERR unknown command '${command.name}'\r\n`
    }

    switch (command.name) {
      case 'STATE': {
        return JSON.stringify(state)
      }
      case 'KEYS': {
        const [key] = command.args as CommandSet
        if (key?.value === '*' || key?.value === '"*"') {
          const keys = this.rdbReader.getKeys()
          return keys
        }
        return key?.value
          ? `-ERR unknown command '${key.value}'\r\n`
          : 'argument is required'
      }
      case 'SET': {
        const [key, val] = command.args as CommandSet
        logger.info(`\n[Command]: SET ${key.value} ${val.value}\n`)
        redisCache.set(key.value, val.value)
        // todo: handle px and command arguments more gracefully
        if (
          command.args.find(
            (arg) => arg.type === 'BulkString' && arg.value === 'px',
          )
        ) {
          const [, , , ms] = command.args as CommandSet
          const unixTime = Date.now() + Number(ms.value)
          redisTimeCache.set(key.value, unixTime)
        }
        logger.info(`\n[Response]: +OK\r\n`)
        return `+OK\r\n`
      }
      case 'CONFIG': {
        if (command.args.find((arg) => arg.value === 'GET')) {
          const dir = command.args.find((arg) => arg.value === 'dir')
          const dbFilename = command.args.find(
            (arg) => arg.value === 'dbfilename',
          )
          if (dir) {
            return `*2\r\n$3\r\ndir\r\n$${state.directory.length}\r\n${state.directory}\r\n`
          }
          if (dbFilename) {
            return `*2\r\ndbfilename\r\n$${state.databaseFilename.length}\r\n${state.databaseFilename}\r\n`
          }
        }
        return `+OK\r\n`
      }
      case 'GET': {
        const [key] = command.args as CommandSet
        logger.info(`\n[Command]: GET ${key.value}\n`)
        if (redisTimeCache.has(key.value)) {
          const unixTime = redisTimeCache.get(key.value)
          if (unixTime && unixTime < Date.now()) {
            redisCache.delete(key.value)
            redisTimeCache.delete(key.value)
            logger.info(`\n[Response]: $-1\r\n`)
            return `$-1\r\n`
          }
        }
        const value = redisCache.get(key.value)
        if (!value) {
          const valueInDb = this.rdbReader.getKey(key.value)
          return valueInDb
        }
        logger.info(`\n[Response]: $${value?.length}\r\n${value}\r\n`)
        return `$${value?.length}\r\n${value}\r\n`
      }
      case 'ECHO': {
        const [key] = command.args as CommandSet
        logger.info(`\n[Command]: ECHO ${key.value}\n`)
        logger.info(`\n[Response]: $${key.value.length}\r\n${key.value}\r\n`)
        return `$${key.value.length}\r\n${key.value}\r\n`
      }
      case 'PING': {
        logger.info(`\n[Command]: PING\n`)
        logger.info(`\n[Response]: +PONG\r\n`)
        return `+PONG\r\n`
      }
    }
  }
  // todo: look into avoiding passing connection here to write to avoid coupling to implementation
  execute(connection: net.Socket, state: RedisServer['state']) {
    try {
      // assumes the ast is a list of commands atm
      for (const command of this.ast) {
        const response = this.executeCommand(
          command as {
            type: 'Command'
            name: string
            args: RedisValue[]
          },
          state,
        )

        // Ensure we always have a valid response
        if (response === undefined) {
          connection.write(`-ERR internal error\r\n`)
        } else {
          connection.write(response)
        }
      }
    } catch (error) {
      // Handle any unexpected errors
      connection.write(`-ERR ${error.message}\r\n`)
    }
  }

  /**
   * Interpret the input and execute the commands
   * @param input - The input to interpret
   * @param connection - The connection to write the response to
   * @returns The response from the server
   */
  interpretAndExecute(
    input: string,
    connection: net.Socket,
    state: RedisServer['state'],
  ) {
    if (!this.rdbReader.isInitialized) {
      this.rdbReader.setFileLocation(state.directory, state.databaseFilename)
      this.rdbReader.read()
    }
    const tokens = this.tokenizer.tokenize(input)
    this.parser.setup(tokens)
    this.ast = this.parser.parse()
    const response = this.execute(connection, state)
    return response
  }
}
