const fs = require('fs');
const diff = fs.readFileSync('/workspace/diff_no_lock.txt', 'utf8');
const files = diff.split(/^diff --git a\//m).slice(1);

files.forEach(file => {
  const lines = file.split('\n');
  const filename = lines[0].split(' b/')[0];
  const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1).trim()).filter(l => l.length > 0);
  
  // Just print the filename and first 3 significant added lines
  const sigAdded = added.filter(l => !l.startsWith('//') && !l.startsWith('import ') && l.length > 10).slice(0, 5);
  console.log(`\nFile: ${filename}`);
  sigAdded.forEach(l => console.log(`  + ${l}`));
});
