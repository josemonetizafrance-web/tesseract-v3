const fs = require('fs');
const p = 'dist/content/talky/talky-panel.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('Tesseract Chat v3.1')) { console.log('ya insertado'); process.exit(0); }
const anchor = 'cursor:pointer;\">➤</button>';
const i = s.indexOf(anchor);
if (i < 0) { console.log('anchor NO encontrado'); process.exit(1); }
// fin de la fila de input: buscar los dos </div> que cierran fila y columna 360px
const endRow = s.indexOf('</button>', i) + '</button>'.length;
const close1 = s.indexOf('</div>', endRow);
const close2 = s.indexOf('</div>', close1 + 6);
const footer = '\n  <div style="text-align:center;color:#3a3a55;font-size:8px;padding:1px 0;">Tesseract Chat v3.1</div>';
s = s.slice(0, close2 + 6) + footer + s.slice(close2 + 6);
fs.writeFileSync(p, s, 'utf8');
console.log('footer insertado tras offset', close2 + 6);
