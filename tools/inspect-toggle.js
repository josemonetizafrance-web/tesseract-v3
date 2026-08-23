const fs = require('fs');
const s = fs.readFileSync('dist/content/talky/talky-panel.js', 'utf8');
const i = s.indexOf('function toggleMin');
console.log(s.substr(i, 2400));
console.log('--- llamadas a toggleMin ---');
let u = -1;
while ((u = s.indexOf('toggleMin', u + 1)) >= 0) {
  const c = s.substr(Math.max(0, u - 60), 80).replace(/\r?\n/g, ' ').trim();
  if (!c.includes('function toggleMin')) console.log(' @' + u + ':', c);
}
