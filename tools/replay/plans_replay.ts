import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const cli = yargs(hideBin(process.argv))
  .option('file', { type: 'string' })
  .option('port', { type: 'number' })
  .parseSync();

const fileArg = cli.file ?? process.env.REPLAY_FILE ?? './tmp/plans.ndjson';
const portArg = (cli.port ?? (process.env.REPLAY_PORT ? Number(process.env.REPLAY_PORT) : undefined) ?? 4999);
const fileAbs = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);

if (!fs.existsSync(fileAbs)) {
  console.error('File not found:', fileAbs);
  process.exit(1);
}

const lines = fs.readFileSync(fileAbs, 'utf8').split(/\r?\n/).filter(Boolean);

// very simple SSE server: one line per second
const server = http.createServer((req, res) => {
  if (!req.url || !req.url.includes('/events/plans')) {
    res.statusCode = 404; res.end('not found'); return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  let i = 0;
  const t = setInterval(() => {
    if (i >= lines.length) { clearInterval(t); res.end(); return; }
    res.write(`data: ${lines[i++]}` + '\n\n');
  }, 10); // fast feed for soak
  req.on('close', () => clearInterval(t));
});

server.listen(portArg, '0.0.0.0', () => {
  console.log(`serving file=${fileAbs} port=${portArg} lines=${lines.length}`);
});
