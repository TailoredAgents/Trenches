import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

function findUp(startDir: string, filename: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.resolve(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envPath = process.env.DOTENV_CONFIG_PATH || findUp(process.cwd(), '.env');
if (envPath) {
  dotenv.config({ path: envPath });
}

