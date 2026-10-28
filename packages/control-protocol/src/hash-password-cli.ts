import { hashPassword } from './password.js';

// Reads the password from stdin (first line) and prints only the hash.
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { data += c; });
process.stdin.on('end', () => {
  const password = data.split(/\r?\n/)[0] ?? '';
  hashPassword(password).then(h => { process.stdout.write(`${h}\n`); }, (e: unknown) => {
    process.stderr.write(`error: ${e instanceof Error ? e.message : 'failed'}\n`); process.exitCode = 1;
  });
});
