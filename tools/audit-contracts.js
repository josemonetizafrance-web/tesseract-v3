const fs = require('fs'), path = require('path');
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
const js = walk('dist').filter(f => f.endsWith('.js'));
const sent = new Map(), handled = new Set(), wref = new Map(), wdef = new Map();
for (const f of js) {
  const t = fs.readFileSync(f, 'utf8'); const rel = f.split(path.sep).join('/');
  for (const m of t.matchAll(/action\s*:\s*['"]([A-Z_]+)['"]/g)) {
    if (!sent.has(m[1])) sent.set(m[1], new Set());
    sent.get(m[1]).add(rel);
  }
  for (const m of t.matchAll(/(?:message|msg|request)\.action\s*===?\s*['"]([A-Z_]+)['"]/g)) handled.add(m[1]);
  for (const m of t.matchAll(/window\.(_?[A-Za-z_$][\w$]*)/g)) {
    if (!wref.has(m[1])) wref.set(m[1], new Set());
    wref.get(m[1]).add(rel);
  }
  for (const m of t.matchAll(/window\.(_?[A-Za-z_$][\w$]*)\s*=/g)) {
    if (!wdef.has(m[1])) wdef.set(m[1], new Set());
    wdef.get(m[1]).add(rel);
  }
}
console.log('== MENSAJES ENVIADOS (content/pages -> runtime) ==');
[...sent.keys()].sort().forEach(k => console.log(k + '   [' + [...sent.get(k)].map(s => s.replace('dist/', '')).join(', ') + ']'));
console.log('\n== HANDLERS onMessage ==');
console.log([...handled].sort().join(', '));
console.log('\n== window._X referenciado pero NUNCA definido ==');
const missing = [...wref.keys()].filter(k => !wdef.has(k) && k.startsWith('_'));
if (!missing.length) console.log('(ninguno)');
missing.forEach(k => console.log(k + '   usado en: ' + [...wref.get(k)].map(s => s.replace('dist/', '')).join(', ')));
