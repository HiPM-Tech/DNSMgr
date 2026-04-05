const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'client/src/i18n/locales');
const langs = ['en', 'zh-CN', 'es', 'ja', 'zh-CN-Mesugaki'];

const translations = {
  'en': { auditRulesSaved: "Audit rules saved", auditRulesSaveFailed: "Failed to save audit rules" },
  'zh-CN': { auditRulesSaved: "审计规则已保存", auditRulesSaveFailed: "保存审计规则失败" },
  'es': { auditRulesSaved: "Reglas de auditoría guardadas", auditRulesSaveFailed: "Error al guardar reglas de auditoría" },
  'ja': { auditRulesSaved: "監査ルールが保存されました", auditRulesSaveFailed: "監査ルールの保存に失敗しました" },
  'zh-CN-Mesugaki': { auditRulesSaved: "规则保存啦，快夸我！", auditRulesSaveFailed: "连这都保存失败，真是个没用的大叔！" }
};

for (const lang of langs) {
  const filePath = path.join(localesDir, `${lang}.ts`);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  
  const trans = translations[lang] || translations['en'];
  
  const systemMatch = content.match(/system:\s*{([\s\S]*?)},\n\s*[a-zA-Z0-9_]+:/);
  if (systemMatch) {
    let systemBlock = systemMatch[1];
    if (!systemBlock.includes('auditRulesSaved:')) {
      systemBlock += `\n    auditRulesSaved: ${JSON.stringify(trans.auditRulesSaved)},`;
      systemBlock += `\n    auditRulesSaveFailed: ${JSON.stringify(trans.auditRulesSaveFailed)},`;
      content = content.replace(systemMatch[1], systemBlock);
    }
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${lang}.ts`);
}
