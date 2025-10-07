import fs from 'fs';
import path from 'path';

const root = process.cwd();
const servicesDir = path.join(root, 'services');

function stripBOM(s: string) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
function jsonClean(s: string) {
  let t = stripBOM(s);
  t = t.replace(/\/\*[\s\S]*?\*\//g, '')      // /* ... */
       .replace(/(^|[^\:])\/\/.*$/gm, '$1');     // // ...
  t = t.replace(/,\s*([}\]])/g, '$1');           // trailing commas
  return t;
}
function ensureDevScript(pkg: any, servicePath: string) {
  pkg.scripts = pkg.scripts || {};
  const defaultDev = 'tsx -r dotenv/config -r tsconfig-paths/register src/index.ts';
  if (typeof pkg.scripts.dev !== 'string' || !pkg.scripts.dev.includes('tsx')) {
    pkg.scripts.dev = defaultDev;
  }
  pkg.version = pkg.version || '0.1.0';
  pkg.name = pkg.name || '@trenches/' + path.basename(servicePath);
}
function repairOne(pkgPath: string) {
  const raw = fs.readFileSync(pkgPath, 'utf8');
  let cleaned = jsonClean(raw);
  let obj: any;
  try { obj = JSON.parse(cleaned); }
  catch {
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    obj = JSON.parse(cleaned);
  }
  ensureDevScript(obj, path.dirname(pkgPath));
  fs.writeFileSync(pkgPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  return true;
}
function run() {
  const repaired: string[] = [], failed: string[] = [];
  if (!fs.existsSync(servicesDir)) { console.error('services/ not found'); process.exit(1); }
  for (const entry of fs.readdirSync(servicesDir)) {
    const pkgPath = path.join(servicesDir, entry, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    try { repairOne(pkgPath); repaired.push(pkgPath); }
    catch (e: any) { failed.push(pkgPath + ' :: ' + (e?.message || e)); }
  }
  console.log('PKG_REPAIR', JSON.stringify({ repaired, failed }, null, 2));
}
run();

