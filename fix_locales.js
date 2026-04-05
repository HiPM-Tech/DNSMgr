const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'client/src/i18n/locales');
const langs = ['en', 'zh-CN', 'es', 'ja', 'zh-CN-Mesugaki'];

for (const lang of langs) {
  const filePath = path.join(localesDir, `${lang}.ts`);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  
  // The structure is:
  // export const en: LocaleDefinition = {
  //   code: 'en',
  //   label: 'English',
  //   messages: { ... }
  // }
  
  // My previous script appended `notifications: { ... }` at the root level instead of inside `messages: { ... }`
  
  // Let's fix this by moving `notifications` inside `messages`.
  // Wait, I appended it right before the last `};` which is the end of the `export const en: LocaleDefinition` object.
  // The last `};` is indeed the end of `export const en`.
  // Wait, no, `messages` is an object, and its closing brace is right before the `};` of `export const en`?
  // Let's check where the closing brace of `messages` is.
  const lines = content.split('\n');
  const lastLineIndex = lines.length - 1;
  // It probably looks like:
  //     },
  //   },
  //   notifications: { ... }
  // };
  
  // Let's just find `notifications:` and move it up before the closing brace of `messages`.
  
  const match = content.match(/(\n  notifications:\s*{[\s\S]*?\n  },?)/);
  if (match) {
    const notifStr = match[1];
    // Remove it from the end
    content = content.replace(notifStr, '');
    
    // Now we need to insert it at the end of `messages`.
    // The easiest way is to replace `\n  },\n};` or `\n  }\n};` with `,\n${notifStr}\n  }\n};`
    // Let's just replace the last occurrence of `\n  }\n};`
    
    // Find the last `}` that closes `messages`.
    content = content.replace(/(\n  \},?\n};?\n?)$/, `,${notifStr}$1`);
    
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${lang}.ts`);
  }
}
