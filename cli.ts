import * as net from 'net';
import { createInterface } from 'readline';

const client = new net.Socket();
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '127.0.0.1:6379> '
});

client.connect(6379, '127.0.0.1', () => {
  console.log('Connected to Redis server');
  rl.prompt();
});

client.on('data', (data) => {
  console.log(data.toString());
  rl.prompt();
});

rl.on('line', (line) => {
  // Convert simple command to RESP format
  const args = line.trim().split(/\s+/);
  const resp = `*${args.length}\r\n${args.map(arg => `$${arg.length}\r\n${arg}\r\n`).join('')}`;
  client.write(resp);
});

rl.on('close', () => {
  client.end();
  process.exit(0);
}); 