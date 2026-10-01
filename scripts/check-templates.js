const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const root = path.join(__dirname, '..', 'views');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let failed = false;
for (const file of walk(root).filter(file => file.endsWith('.ejs'))) {
  try {
    ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (err) {
    failed = true;
    console.error('\nTemplate error:', path.relative(root, file));
    console.error(err.message);
  }
}

if (failed) process.exit(1);
console.log('EJS templates compile successfully');
