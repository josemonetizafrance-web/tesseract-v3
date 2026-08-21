// Pase 3: iterativo hasta estabilizar + controles crudos 0x80-0x9F
const fs = require('fs');
const path = require('path');
const files = [
  'dist/background/background.js',
  'dist/content/talky/talky-eater.js',
  'dist/content/talky/talky-mail-cribs.js',
  'routes/ai-proxy.js'
];
const REV = {};
{
  const specials = {0x80:'€',0x82:'‚',0x83:'ƒ',0x84:'„',0x85:'…',0x86:'†',0x87:'‡',0x88:'ˆ',0x89:'‰',0x8A:'Š',0x8B:'‹',0x8C:'Œ',0x8E:'Ž',0x91:"'",0x92:"'",0x93:'"',0x94:'"',0x95:'•',0x96:'–',0x97:'—',0x98:'˜',0x99:'™',0x9A:'š',0x9B:'›',0x9C:'œ',0x9E:'ž',0x9F:'Ÿ'};
  for (const k in specials) REV[specials[k]] = parseInt(k);
}
function runBytes(run) {
  const parts = [];
  for (const ch of run) {
    const code = ch.charCodeAt(0);
    if ((code >= 0xA0 && code <= 0xFF) || (code >= 0x80 && code <= 0x9F)) parts.push(Buffer.from([code]));
    else if (REV[ch] !== undefined) parts.push(Buffer.from([REV[ch]]));
    else return null;
  }
  return Buffer.concat(parts);
}
function repairOnce(s) {
  let n = 0;
  const out = s.replace(/[^\x00-\x7F]+/g, function (run) {
    const b = runBytes(run);
    if (!b || b.length < 2) return run;
    const dec = b.toString('utf8');
    if (!Buffer.from(dec, 'utf8').equals(b) || dec.includes('\uFFFD') || dec === run) return run;
    n++;
    return dec;
  });
  return { out, n };
}
for (const f of files) {
  const p = path.join(__dirname, '..', f);
  let s = fs.readFileSync(p, 'utf8');
  let totalN = 0, pass = 0;
  for (;;) {
    const r = repairOnce(s);
    if (r.n === 0) break;
    s = r.out; totalN += r.n; pass++;
    if (pass >= 6) break;
  }
  if (totalN > 0) fs.writeFileSync(p, s, 'utf8');
  console.log(f + ': ' + totalN + ' reparadas en ' + pass + ' pases');
}
console.log('listo pase3');
