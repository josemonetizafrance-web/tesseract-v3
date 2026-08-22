const fs = require('fs');
function rep(label, file, needle, around) {
  const s = fs.readFileSync(file, 'utf8');
  const i = s.indexOf(needle);
  console.log(label + ':', i < 0 ? '(NO ENCONTRADO ' + needle + ')' : JSON.stringify(s.substr(Math.max(0, i - (around || 0)), 90)));
}
rep('tab soporte', 'dist/content/talky/talky-panel.js', 'data-tab="soporte"', 40);
rep('who inicial', 'dist/content/talky/talky-panel.js', "opChatWho'", 0);
rep('emojis array', 'dist/content/talky/talky-panel.js', 'EMOJIS = [', 0);
rep('prefijo soporte', 'dist/content/talky/talky-panel.js', 'labelFor', 0);
for (const f of ['dist/content/talky/talky-panel.js', 'dist/content/talky/talky-cribs.js', 'dist/content/talky/talky-eater.js', 'dist/content/talky/talky-mail-cribs.js', 'server/routes/auth-tesseract.js', 'server/routes/chat-tesseract.js', 'server/db/tesseract.js', 'dist/pages/admin/admin.js', 'dist/pages/admin/admin.html']) {
  const s = fs.readFileSync(f, 'utf8');
  const a = (s.match(/\u00C3[\u0080-\u00FF]/g) || []).length;
  const b = (s.match(/\u00F0\u0178/g) || []).length;
  const c = (s.match(/\u00C2[\u0080-\u00FF]/g) || []).length;
  const d = (s.match(/\uFFFD/g) || []).length;
  console.log(`${f}: restos-mojibake A=${a} F0178=${b} C2=${c} FFFD=${d}`);
}
