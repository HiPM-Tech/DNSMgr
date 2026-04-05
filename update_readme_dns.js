const fs = require('fs');

function updateReadme(file, title, content) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(title)) return;
  text += `\n\n## ${title}\n\n${content}`;
  fs.writeFileSync(file, text);
}

const enContent = `We support multiple DNS providers out of the box (Cloudflare, AliYun, TencentCloud, HuaweiCloud, DNSPod, GoDaddy). If your provider is not supported, you can easily add it:

1. **Implement the Adapter**: Create a new file in \`server/src/lib/dns/providers/\` implementing the \`DnsAdapter\` interface.
2. **Register the Adapter**: Add your adapter to the switch case in \`server/src/lib/dns/DnsHelper.ts\`.
3. **Update Frontend**: Add your provider to the \`PROVIDERS\` list in \`client/src/pages/Accounts.tsx\` with its required configuration fields.
4. **Submit a PR**: We welcome pull requests! Ensure your code follows the existing style and passes the tests.`;

const zhContent = `我们开箱即支持多个 DNS 提供商（Cloudflare, 阿里云, 腾讯云, 华为云, DNSPod, GoDaddy）。如果你使用的提供商尚未支持，你可以很方便地自行添加：

1. **实现适配器**：在 \`server/src/lib/dns/providers/\` 下创建一个新文件，实现 \`DnsAdapter\` 接口。
2. **注册适配器**：在 \`server/src/lib/dns/DnsHelper.ts\` 的工厂方法中添加你的适配器。
3. **更新前端**：在 \`client/src/pages/Accounts.tsx\` 的 \`PROVIDERS\` 列表中添加你的提供商及其所需的配置字段。
4. **提交 PR**：我们非常欢迎 Pull Requests！请确保你的代码符合现有的代码风格并能通过测试。`;

updateReadme('README.md', 'Adding New DNS Providers', enContent);
updateReadme('README_zh.md', '添加新的 DNS 提供商', zhContent);
