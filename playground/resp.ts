import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Resp Playground > '
});

rl.prompt();


rl.on('line', (line) => {
    // Convert simple command to RESP format
    const args = line.trim().split(/\s+/);
    const resp = `*${args.length}\\r\\n${args.map(arg => `$${arg.length}\\r\\n${arg}\\r\\n`).join('')}`;
    // const resp = `*${args.length}\r\n${args.map(arg => `$${arg.length}\r\n${arg}\r\n`).join('')}`;
    console.log(resp);
});
  
rl.on('close', () => {
    process.exit(0);
}); 