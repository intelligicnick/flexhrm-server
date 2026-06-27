const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const entry = path.join(dist, 'server.js');
const main = path.join(dist, 'main.js');

if (!fs.existsSync(entry) || !fs.existsSync(main)) {
  console.error('Hostinger dist check failed — run npm run build first.');
  process.exit(1);
}

console.log('Hostinger dist OK: dist/server.js and dist/main.js present');
