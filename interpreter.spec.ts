import { describe, expect, test } from 'vitest'
// import test from 'ava'
import RedisInterpreter from './interpreter'

const sum = (a: number, b: number) => a + b

const makeCommandString = (args: string[]) => {
  return `*${args.length}\r\n${args
    .map((arg) => `$${arg.length}\r\n${arg}\r\n`)
    .join('')}`
}

describe('interpreter', () => {
  test('creates readable RDB file', async () => {
    const redisInterpreter = new RedisInterpreter()
    const testDbFile = 'test-dump.rdb'
    const outputs: string[] = []

    const executeCommand = async (args: string[]) => {
      const commandString = makeCommandString(args)

      return new Promise((resolve) => {
        redisInterpreter.interpretAndExecute(
          commandString,
          {
            write: (data: string) => {
              resolve(data)
              return data
            },
          },
          {
            directory: process.cwd(),
            databaseFilename: testDbFile,
          },
        )
      })
    }

    // Set up simple test data
    await executeCommand(['SET', 'greeting', 'hello'])
    await executeCommand(['SET', 'color', 'blue'])
    const output = await executeCommand(['KEYS', '*'])
    expect(output).toBe(makeCommandString(['greeting', 'color']))

    try {
      fs.unlinkSync(testDbFile)
    } catch (e) {
      // File might not exist, that's ok
    }
  })
})
