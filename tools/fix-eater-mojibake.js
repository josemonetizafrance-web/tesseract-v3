const fs = require('fs');
const f = 'dist/content/talky/talky-eater.js';
let t = fs.readFileSync(f, 'utf8');
const reps = [
  ['\u00C3\u201C', '\u00D3'],   // Ã“ -> Ó
  ['\u00C3\u2030', '\u00C9'],   // Ã‰ -> É
  ['\u00C3\u008D', '\u00CD'],   // Ã<ccedil-idx> -> Í
  ['\u00C3\u0161', '\u00DA'],   // Ãš -> Ú
  ['\u00C3\u00B1', '\u00F1'],   // Ã± -> ñ
  ['\u00C3\u00A1', '\u00E1'],   // Ã¡ -> á
  ['\u00C3\u00A9', '\u00E9'],   // Ã© -> é
  ['\u00C3\u00AD', '\u00ED'],   // Ã­ -> í
  ['\u00C3\u00B3', '\u00F3'],   // Ã³ -> ó
  ['\u00C3\u00BA', '\u00FA'],   // Ãº -> ú
  ['\u00E2\u20AC\u201C', '\u2013'], // â€“ -> –
  ['\u00E2\u20AC\u201D', '\u2014'], // â€” -> —
  ['\u00E2\u2020\u2019', '\u2192']  // â†’ -> →
];
let total = 0;
for (const [a, b] of reps) {
  const parts = t.split(a);
  if (parts.length > 1) { total += parts.length - 1; }
  t = parts.join(b);
}
fs.writeFileSync(f, t, 'utf8');
console.log('reemplazos:', total);

// verificar restantes
const bad = /[\u00C3][\u0080-\u00BF]|\u00E2\u20AC|\u00E2\u2020/;
let n = 0;
t.split('\n').forEach((l, i) => { if (bad.test(l)) { n++; console.log((i + 1) + ': ' + l.trim().substring(0, 100)); } });
console.log('lineas sospechosas restantes:', n);
