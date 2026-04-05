const fs = require('fs');

function updateReadme(file, title, content) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(title)) return;
  text += `\n\n## ${title}\n\n${content}`;
  fs.writeFileSync(file, text);
}

const enContent = `DNSMgr uses \`react-i18next\` for internationalization. The current supported languages are English, Simplified Chinese, Spanish, and Japanese.

We welcome community contributions for new languages! Here's how to add one:

1. Copy an existing language file (e.g., \`client/src/i18n/locales/en.ts\`) to a new file like \`fr.ts\` (for French).
2. Translate the string values in your new file.
3. Import and add your new language to the \`resources\` object in \`client/src/i18n/index.ts\`.
4. Update the language selector in \`client/src/pages/Settings.tsx\` to include your new language option.

**Tip:** We recommend using the [i18n-ally](https://marketplace.visualstudio.com/items?itemName=Lokalise.i18n-ally) VS Code extension. The project already includes the \`.vscode/settings.json\` configuration for it, which helps you easily find missing translations and manage keys.`;

const zhContent = `DNSMgr 使用 \`react-i18next\` 进行国际化（i18n）支持。目前已支持的语言包括：英文、简体中文、西班牙语和日语。

我们非常欢迎社区参与多语言的共建！如果你想添加新的语言支持，请参考以下步骤：

1. 复制现有的语言文件（例如 \`client/src/i18n/locales/zh-CN.ts\`）并重命名为新的语言代码，如 \`fr.ts\`（法语）。
2. 将文件中的对应字符串翻译为目标语言。
3. 在 \`client/src/i18n/index.ts\` 中引入你的新文件，并添加到 \`resources\` 对象中。
4. 在 \`client/src/pages/Settings.tsx\` 中的语言选择器里添加你的新语言选项。

**提示：** 我们强烈推荐使用 VS Code 插件 [i18n-ally](https://marketplace.visualstudio.com/items?itemName=Lokalise.i18n-ally)。本项目已经内置了 \`.vscode/settings.json\` 配置，你可以利用它直接在编辑器中查看翻译缺失情况并高效管理多语言键值。`;

updateReadme('README.md', 'Internationalization (i18n) & Contribution', enContent);
updateReadme('README_zh.md', '多语言支持 (i18n) 与贡献指南', zhContent);
