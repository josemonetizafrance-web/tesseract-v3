// Repara mojibake por RUNS: cada secuencia de caracteres no-ASCII se convierte a bytes cp1252;
// si esos bytes forman UTF-8 valido -> reemplaza; si no -> conserva (protege acentos reales).
const fs = require('fs');
const path = require('path');
const files = [
  'dist/background/background.js',
  'dist/content/talky/talky-eater.js',
  'dist/content/talky/talky-mail-cribs.js',
  'routes/ai-proxy.js'
];
const CP1252 = [];
{
  const tbl = [];
  for (let i = 0x80; i <= 0xFF; i++) {
    const s = Buffer.from([i]).toString('latin1');
    const win = Buffer.from(s, 'utf8').toString('latin1');
    tbl.push(win);
  }
}
function latin1Byte(ch) {
  const code = ch.charCodeAt(0);
  if (code <= 0x7F) return Buffer.from([code]);
  const enc = Buffer.from(ch, 'utf8');
  return enc.length === 1 ? enc : null;
}
function runBytes(run) {
  const parts = [];
  for (const ch of run) {
    const code = ch.charCodeAt(0);
    if (code >= 0x80 && code <= 0xFF) { const b = Buffer.from([code]); parts.push(b); }
    else return null;
  }
  return Buffer.concat(parts);
}
let totalFixed = 0;
for (const f of files) {
  const p = path.join(__dirname, '..', f);
  let s = fs.readFileSync(p, 'utf8');
  let fixedCount = 0;
  const out = s.replace(/[^\x00-\x7F]+/g, function (run) {
    const b = runBytes(run);
    if (!b || b.length < 2) return run;
    const dec = b.toString('utf8');
    const back = Buffer.from(dec, 'utf8');
    if (back.equals(b) && !dec.includes('\uFFFD')) { fixedCount++; return dec; }
    return run;
  });
  if (fixedCount > 0) fs.writeFileSync(p, out, 'utf8');
  totalFixed += fixedCount;
  console.log(f + ': ' + fixedCount + ' secuencias reparadas');
}
console.log('total: ' + totalFixed);
