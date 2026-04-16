const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'client/src/i18n/locales');

// 读取英文作为参考
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));

// 递归获取所有键路径
function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key], newKey));
    } else {
      keys.push(newKey);
    }
  }
  return keys;
}

// 递归获取嵌套值
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

const enKeys = getAllKeys(en.messages).sort();

// 只检查日语文件
const file = 'ja.json';
const filePath = path.join(localesDir, file);
const lang = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const missingKeys = [];

for (const key of enKeys) {
  const value = getNestedValue(lang.messages, key);
  if (value === undefined) {
    missingKeys.push(key);
  }
}

if (missingKeys.length > 0) {
  console.log(`${file} missing ${missingKeys.length} keys:`);
  missingKeys.forEach(key => {
    const enValue = getNestedValue(en.messages, key);
    console.log(`${key}=${enValue}`);
  });
} else {
  console.log(`${file} is complete!`);
}
