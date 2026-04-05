/**
 * 一键添加邮件解析服务
 * 提供主流邮件服务商的 DNS 记录模板
 */

export interface EmailTemplate {
  name: string;
  provider: string;
  description: string;
  records: Array<{
    name: string;
    type: 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'SPF' | 'DKIM' | 'DMARC';
    value: string;
    priority?: number;
    ttl?: number;
    remark?: string;
  }>;
  documentation?: string;
  notes?: string[];
}

/**
 * 邮件服务商模板库
 */
export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  gmail: {
    name: 'Gmail',
    provider: 'Google',
    description: 'Google Workspace / Gmail',
    records: [
      {
        name: '@',
        type: 'MX',
        value: 'aspmx.l.google.com',
        priority: 10,
        remark: 'Primary MX record',
      },
      {
        name: '@',
        type: 'MX',
        value: 'alt1.aspmx.l.google.com',
        priority: 20,
        remark: 'Secondary MX record',
      },
      {
        name: '@',
        type: 'MX',
        value: 'alt2.aspmx.l.google.com',
        priority: 30,
        remark: 'Tertiary MX record',
      },
      {
        name: '@',
        type: 'MX',
        value: 'alt3.aspmx.l.google.com',
        priority: 40,
        remark: 'Quaternary MX record',
      },
      {
        name: '@',
        type: 'MX',
        value: 'alt4.aspmx.l.google.com',
        priority: 50,
        remark: 'Quinary MX record',
      },
      {
        name: '@',
        type: 'TXT',
        value: 'v=spf1 include:_spf.google.com ~all',
        remark: 'SPF record',
      },
      {
        name: 'default._domainkey',
        type: 'CNAME',
        value: 'default.domainkey.goog',
        remark: 'DKIM record',
      },
      {
        name: '_dmarc',
        type: 'TXT',
        value: 'v=DMARC1; p=none; rua=mailto:postmaster@example.com',
        remark: 'DMARC record (customize email)',
      },
    ],
    documentation: 'https://support.google.com/a/answer/174125',
    notes: [
      'Replace example.com with your domain',
      'Customize DMARC record with your email address',
      'Wait 24-48 hours for DNS propagation',
    ],
  },
  outlook: {
    name: 'Outlook / Microsoft 365',
    provider: 'Microsoft',
    description: 'Microsoft Outlook / Microsoft 365',
    records: [
      {
        name: '@',
        type: 'MX',
        value: 'example-com.mail.protection.outlook.com',
        priority: 10,
        remark: 'MX record (replace example-com)',
      },
      {
        name: '@',
        type: 'TXT',
        value: 'v=spf1 include:outlook.com ~all',
        remark: 'SPF record',
      },
      {
        name: 'selector1._domainkey',
        type: 'CNAME',
        value: 'selector1.outlook.com',
        remark: 'DKIM record 1',
      },
      {
        name: 'selector2._domainkey',
        type: 'CNAME',
        value: 'selector2.outlook.com',
        remark: 'DKIM record 2',
      },
      {
        name: '_dmarc',
        type: 'TXT',
        value: 'v=DMARC1; p=none; rua=mailto:postmaster@example.com',
        remark: 'DMARC record (customize email)',
      },
    ],
    documentation: 'https://docs.microsoft.com/en-us/microsoft-365/admin/setup/add-domain',
    notes: [
      'Get your MX record value from Microsoft 365 admin center',
      'Replace example-com with your domain name',
      'Customize DMARC record with your email address',
    ],
  },
  zoho: {
    name: 'Zoho Mail',
    provider: 'Zoho',
    description: 'Zoho Mail',
    records: [
      {
        name: '@',
        type: 'MX',
        value: 'mx.zoho.com',
        priority: 10,
        remark: 'Primary MX record',
      },
      {
        name: '@',
        type: 'MX',
        value: 'mx2.zoho.com',
        priority: 20,
        remark: 'Secondary MX record',
      },
      {
        name: '@',
        type: 'TXT',
        value: 'v=spf1 include:zoho.com ~all',
        remark: 'SPF record',
      },
      {
        name: 'zmail._domainkey',
        type: 'TXT',
        value: 'v=DKIM1; k=rsa; p=YOUR_DKIM_KEY',
        remark: 'DKIM record (get key from Zoho)',
      },
      {
        name: '_dmarc',
        type: 'TXT',
        value: 'v=DMARC1; p=none; rua=mailto:postmaster@example.com',
        remark: 'DMARC record (customize email)',
      },
    ],
    documentation: 'https://www.zoho.com/mail/help/adminconsole/add-domain.html',
    notes: [
      'Get your DKIM key from Zoho Mail admin panel',
      'Replace YOUR_DKIM_KEY with actual key',
      'Customize DMARC record with your email address',
    ],
  },
  fastmail: {
    name: 'Fastmail',
    provider: 'Fastmail',
    description: 'Fastmail',
    records: [
      {
        name: '@',
        type: 'MX',
        value: 'in1-smtp.messagingengine.com',
        priority: 10,
        remark: 'Primary MX record',
      },
      {
        name: '@',
        type: 'MX',
        value: 'in2-smtp.messagingengine.com',
        priority: 20,
        remark: 'Secondary MX record',
      },
      {
        name: '@',
        type: 'TXT',
        value: 'v=spf1 include:messagingengine.com ~all',
        remark: 'SPF record',
      },
      {
        name: 'fm1._domainkey',
        type: 'CNAME',
        value: 'fm1.messagingengine.com',
        remark: 'DKIM record 1',
      },
      {
        name: 'fm2._domainkey',
        type: 'CNAME',
        value: 'fm2.messagingengine.com',
        remark: 'DKIM record 2',
      },
      {
        name: 'fm3._domainkey',
        type: 'CNAME',
        value: 'fm3.messagingengine.com',
        remark: 'DKIM record 3',
      },
      {
        name: '_dmarc',
        type: 'TXT',
        value: 'v=DMARC1; p=none; rua=mailto:postmaster@example.com',
        remark: 'DMARC record (customize email)',
      },
    ],
    documentation: 'https://www.fastmail.help/hc/en-us/articles/360060591453',
    notes: [
      'Customize DMARC record with your email address',
      'All DKIM records are CNAME records',
    ],
  },
  sendgrid: {
    name: 'SendGrid',
    provider: 'SendGrid',
    description: 'SendGrid Email Service',
    records: [
      {
        name: '@',
        type: 'CNAME',
        value: 'sendgrid.net',
        remark: 'SendGrid CNAME (get specific value from SendGrid)',
      },
      {
        name: 'em',
        type: 'CNAME',
        value: 'u.sendgrid.net',
        remark: 'Email link tracking',
      },
      {
        name: 's1._domainkey',
        type: 'CNAME',
        value: 's1.domainkey.sendgrid.net',
        remark: 'DKIM record',
      },
      {
        name: '@',
        type: 'TXT',
        value: 'v=spf1 sendgrid.net ~all',
        remark: 'SPF record',
      },
    ],
    documentation: 'https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication',
    notes: [
      'Get specific CNAME values from SendGrid dashboard',
      'SendGrid requires domain authentication',
    ],
  },
};

/**
 * 获取所有可用的邮件模板
 */
export function getAvailableTemplates(): Array<{ id: string; name: string; provider: string }> {
  return Object.entries(EMAIL_TEMPLATES).map(([id, template]) => ({
    id,
    name: template.name,
    provider: template.provider,
  }));
}

/**
 * 获取邮件模板
 */
export function getEmailTemplate(templateId: string): EmailTemplate | null {
  return EMAIL_TEMPLATES[templateId.toLowerCase()] || null;
}

/**
 * 检测记录冲突
 */
export function detectConflicts(
  existingRecords: any[],
  templateRecords: any[]
): Array<{ type: string; name: string; message: string }> {
  const conflicts: Array<{ type: string; name: string; message: string }> = [];

  for (const templateRecord of templateRecords) {
    const existing = existingRecords.find(
      (r) => (r.name || '@') === (templateRecord.name || '@') && r.type === templateRecord.type
    );

    if (existing && existing.value !== templateRecord.value) {
      conflicts.push({
        type: templateRecord.type,
        name: templateRecord.name || '@',
        message: `Conflict: existing ${templateRecord.type} record differs from template`,
      });
    }
  }

  return conflicts;
}

/**
 * 生成添加记录的预览
 */
export function generatePreview(templateId: string, domain: string): string {
  const template = getEmailTemplate(templateId);
  if (!template) {
    return 'Template not found';
  }

  let preview = `# ${template.name} Email Configuration for ${domain}\n\n`;
  preview += `Provider: ${template.provider}\n`;
  preview += `Description: ${template.description}\n\n`;

  preview += '## Records to be added:\n\n';
  for (const record of template.records) {
    const name = record.name === '@' ? domain : `${record.name}.${domain}`;
    preview += `- **${record.type}** ${name} → ${record.value}`;
    if (record.priority) {
      preview += ` (Priority: ${record.priority})`;
    }
    if (record.remark) {
      preview += ` - ${record.remark}`;
    }
    preview += '\n';
  }

  if (template.notes && template.notes.length > 0) {
    preview += '\n## Important Notes:\n\n';
    for (const note of template.notes) {
      preview += `- ${note}\n`;
    }
  }

  if (template.documentation) {
    preview += `\n## Documentation:\n${template.documentation}\n`;
  }

  return preview;
}
