import 'dotenv/config';
import * as fs from 'fs';
import * as http from 'http';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('file', { type: 'string', demandOption: true })
  .option('port', { type: 'number', default: 4999 })
  .parseSync();

if (!fs.existsSync(argv.file)) {
  console.error('File not found:', argv.file);
  process.exit(1);
}

const lines = fs.readFileSync(argv.file, 'utf8').split(/\r?\n/).filter(Boolean);

const server = http.createServer((req, res) => {
  if (req.url === '/events/plans') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    let i = 0;
    const timer = setInterval(() => {
      if (i >= lines.length) { clearInterval(timer); res.end(); return; }
      const data = lines[i++];
      res.write(`data: ${data}\n\n`);
    }, 50);
    req.on('close', () => clearInterval(timer));
  } else {
    res.statusCode = 404;
    res.end('not found');
  }
});

server.listen(argv.port, '0.0.0.0', () => {
  console.log('plans replay server listening on', argv.port, 'lines=', lines.length);
});

