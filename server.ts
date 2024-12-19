import * as net from 'net'
import RedisInterpreter from './interpreter'

export default class RedisServer {
  redisInterpreter: RedisInterpreter
  state: {
    directory: string
    databaseFilename: string
  }
  server: net.Server
  connection: net.Socket | null = null
  constructor() {
    this.state = {
      directory: '',
      databaseFilename: '',
    }
    this.redisInterpreter = new RedisInterpreter()
    this.server = net.createServer((connection: net.Socket) => {
      this.connection = connection
      connection.setEncoding('utf8')
      connection.on('data', (d: string) => {
        this.redisInterpreter.interpretAndExecute(d, connection, this.state)
      })
    })
  }
  setDirectory(dir: string) {
    this.state.directory = dir
  }
  setDatabaseFilename(filename: string) {
    this.state.databaseFilename = filename
  }
  init() {
    const args = process.argv.slice(2)
    const flags = new Map()
    // Parse flags
    for (let i = 0; i < args.length; i += 2) {
      if (args[i].startsWith('--')) {
        flags.set(args[i].slice(2), args[i + 1])
      }
    }
    if (flags.get('dir')) {
      this.setDirectory(flags.get('dir'))
    }
    if (flags.get('dbfilename')) {
      this.setDatabaseFilename(flags.get('dbfilename'))
    }
    this.server.listen(6379, '127.0.0.1', () => {
      console.log('Redis server listening on port 6379')
    })
  }
}
