const fs = require('fs');

let file = fs.readFileSync('client/src/pages/system/SecurityTab.tsx', 'utf8');
file = file.replace(/      \)}\n  \);\n\}/, '  );\n}');
fs.writeFileSync('client/src/pages/system/SecurityTab.tsx', file);
