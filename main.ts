import * as net from 'net'
import RedisInterpreter from './interpreter'

const redisInterpreter = new RedisInterpreter()

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.setEncoding('utf8')
  connection.on('data', (d: string) => {
    redisInterpreter.interpretAndExecute(d, connection)
  })
})

server.listen(6379, '127.0.0.1')
