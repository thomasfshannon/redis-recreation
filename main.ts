import * as net from 'net'
import { RedisInterpreter } from './interpreter'
import { Parser } from './parser'
import { tokenize } from './tokenizer'

const server: net.Server = net.createServer((connection: net.Socket) => {
  connection.setEncoding('utf8')
  connection.on('data', (d: string) => {
    // create a parser with the tokenized input
    const parser = new Parser(tokenize(d))
    // parse the input into an abstract syntax tree (AST)
    const ast = parser.parse()
    // create an interpreter with the AST
    const interpreter = new RedisInterpreter(ast)
    // execute the commands in the AST
    interpreter.execute(connection)
  })
})

server.listen(6379, '127.0.0.1')

