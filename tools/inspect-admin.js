const fs = require('fs');
const html = fs.readFileSync('dist/pages/admin/admin.html', 'utf8');
for (const id of ['id="chat-msgs"', 'id="chat-threads"', 'id="chat-head"', 'id="chat-text"', 'id="btn-chat-send"', 'id="btn-attach"', 'id="btn-emoji"', 'id="emoji-bar-admin"', 'id="new-chat-user"', 'id="btn-new-chat"', 'id="btn-chat-refresh"', '.bubble', '.wa-t', 'data-tab="chat"']) {
  console.log(id.padEnd(24), html.split(id).length - 1);
}
console.log('--- contexto de pestanas ---');
const i = html.indexOf('data-tab');
console.log(html.substr(Math.max(0, i - 200), 700));
