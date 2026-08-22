// Repara SOLO las secuencias de doble-codificacion verificables (UTF-8 leido como cp1252).
// Un run de chars 0x80-0xFF se re-codifica a bytes y se decodifica como UTF-8;
// si el resultado es valido se emite, si no (acento legitimo suelto, emoji real) se deja igual.
const fs = require('fs');
const path = require('path');

const CP1252_REV = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
  '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A,
  '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92,
  '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C,
  '\u017E': 0x9E, '\u0178': 0x9F
};

function charToByte(ch) {
  const code = ch.codePointAt(0);
  if (code <= 0xFF) return code;
  if (CP1252_REV[ch] !== undefined) return CP1252_REV[ch];
  return -1; // no representa un byte cp1252 -> no puede ser mojibake
}

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|html|json|css)$/.test(f)) out.push(p);
  }
  return out;
}

function repair(src) {
  let out = '';
  let i = 0;
  let fixed = 0, kept = 0;
  while (i < src.length) {
    const code = src.charCodeAt(i);
    if (code < 0x80 || (code > 0xFF && CP1252_REV[src[i]] === undefined)) {
      out += src[i]; i++; continue;
    }
    // char en 0x80-0xFF: intentar formar un run convertible
    let j = i;
    let bytesOk = true;
    const bytes = [];
    while (j < src.length) {
      const cj = src.charCodeAt(j);
      if (cj < 0x80) break;
      // corta solo en chars anchos SIN representacion cp1252 (emojis reales)
      if (cj > 0xFF && CP1252_REV[src[j]] === undefined) break;
      const b = charToByte(src[j]);
      if (b === -1) { bytesOk = false; break; }
      bytes.push(b);
      j++;
    }
    const decoded = Buffer.from(bytes).toString('utf8');
    const valid = bytesOk && bytes.length >= 2 && !decoded.includes('\uFFFD');
    if (valid) {
      out += decoded;
      fixed += bytes.length;
    } else {
      out += src.slice(i, j);
      kept += bytes.length;
    }
    i = j;
  }
  return { text: out, fixed, kept };
}

const roots = process.argv.slice(2);
let files = [];
roots.forEach(r => {
  const st = fs.statSync(r);
  if (st.isDirectory()) files.push(...walk(r, []));
  else files.push(r);
});

for (const p of files) {
  const src = fs.readFileSync(p, 'utf8');
  const { text, fixed, kept } = repair(src);
  if (fixed === 0) continue;
  fs.writeFileSync(p, text, 'utf8');
  console.log(`${p}: bytes-reparados=${fixed} intactos=${kept}`);
}
console.log('listo');
