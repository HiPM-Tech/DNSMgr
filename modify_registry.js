const fs = require('fs');
const path = './server/src/lib/dns/providers/registry.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace Cloudflare capabilities
content = content.replace(
  /type: 'cloudflare',\n\s*name: 'Cloudflare',\n\s*capabilities: \{([^}]+)\},/,
  (match, caps) => {
    return match.replace('cnameFlattening: false', 'cnameFlattening: true');
  }
);

fs.writeFileSync(path, content);
