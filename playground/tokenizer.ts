import util from 'util';
import { createInterface } from 'readline';
import { Tokenizer } from '../tokenizer';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Tokenizer Playground > '
});

rl.prompt();

const tokenizer = new Tokenizer();


rl.on('line', (line) => {
    // Convert simple command to RESP format
    const args = line.trim().split(/\s+/);
    const resp = `*${args.length}\r\n${args.map(arg => `$${arg.length}\r\n${arg}\r\n`).join('')}`;
    const tokens = tokenizer.tokenize(resp)
    console.log(util.inspect(tokens, true, null))
});
  
rl.on('close', () => {
    process.exit(0);
}); 