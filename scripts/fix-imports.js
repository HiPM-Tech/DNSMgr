#!/usr/bin/env node

/**
 * 修复所有 adapter.ts 文件的导入路径
 */

const fs = require('fs');
const path = require('path');

const providersDir = path.join(__dirname, '../server/src/lib/dns/providers');

function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // 替换 logger 导入
  if (content.includes("from '../../logger'") || content.includes('from "../../logger"')) {
    content = content.replace(/from\s+['"]\.\.\/\.\.\/logger['"]/g, "from '../internal'");
    modified = true;
  }
  
  // 替换 proxy-http 导入
  if (content.includes("from '../../proxy-http'") || content.includes('from "../../proxy-http"')) {
    content = content.replace(/from\s+['"]\.\.\/\.\.\/proxy-http['"]/g, "from '../internal'");
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  }
  
  return false;
}

function main() {
  console.log('🔧 开始修复导入路径...\n');
  
  const dirs = fs.readdirSync(providersDir).filter(item => {
    const fullPath = path.join(providersDir, item);
    return fs.statSync(fullPath).isDirectory();
  });
  
  let fixedCount = 0;
  
  dirs.forEach(dir => {
    const adapterPath = path.join(providersDir, dir, 'adapter.ts');
    if (fs.existsSync(adapterPath)) {
      if (fixImports(adapterPath)) {
        console.log(`✅ ${dir}/adapter.ts`);
        fixedCount++;
      }
    }
  });
  
  console.log(`\n✨ 完成! 修复了 ${fixedCount} 个文件`);
}

main();
