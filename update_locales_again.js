const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'client/src/i18n/locales');
const langs = ['en', 'zh-CN', 'es', 'ja', 'zh-CN-Mesugaki'];

const newTranslations = {
  'en': {
    notifications: {
      title: "Notification Channels",
      desc: "Configure channels to receive alerts for domain expiration, failover, etc.",
      addWebhook: "+ Webhook",
      addTelegram: "+ Telegram",
      addDingtalk: "+ DingTalk",
      addEmail: "+ Email",
      empty: "No notification channels configured",
      name: "Name",
      method: "Method",
      url: "URL",
      botToken: "Bot Token",
      chatId: "Chat ID",
      webhookUrl: "Webhook URL",
      emailAddress: "Email Address",
      cancel: "Cancel",
      save: "Save",
      deleteConfirm: "Delete this channel?",
      saved: "Channels saved",
      saveFailed: "Failed to save channels"
    },
    system: {
      auditRules: "Audit Rules & Alerts",
      auditRulesDesc: "Configure thresholds for abnormal behavior alerts.",
      enableAlerts: "Enable Alerts",
      enableAlertsDesc: "Send notifications when abnormal behaviors are detected.",
      maxDeletions: "Max Deletions / Hour",
      maxDeletionsDesc: "Alert if a user deletes more than this number of records/domains in an hour.",
      maxFailedLogins: "Max Failed Logins / Hour",
      maxFailedLoginsDesc: "Alert if an identifier fails to login more than this number of times.",
      offHoursAlert: "Off-Hours Alert",
      offHoursAlertDesc: "Alert if operations are performed between these hours."
    }
  },
  'zh-CN': {
    notifications: {
      title: "通知渠道",
      desc: "配置接收域名过期、容灾切换等告警的渠道。",
      addWebhook: "+ Webhook",
      addTelegram: "+ Telegram",
      addDingtalk: "+ 钉钉",
      addEmail: "+ 邮件",
      empty: "尚未配置任何通知渠道",
      name: "名称",
      method: "请求方法",
      url: "URL",
      botToken: "机器人 Token",
      chatId: "聊天 ID",
      webhookUrl: "Webhook URL",
      emailAddress: "邮箱地址",
      cancel: "取消",
      save: "保存",
      deleteConfirm: "确定要删除此渠道吗？",
      saved: "渠道已保存",
      saveFailed: "保存渠道失败"
    },
    system: {
      auditRules: "审计规则与告警",
      auditRulesDesc: "配置异常行为的告警阈值。",
      enableAlerts: "启用告警",
      enableAlertsDesc: "检测到异常行为时发送通知。",
      maxDeletions: "最大删除量 / 小时",
      maxDeletionsDesc: "如果用户在一小时内删除超过此数量的记录/域名，则触发告警。",
      maxFailedLogins: "最大登录失败次数 / 小时",
      maxFailedLoginsDesc: "如果同一账号登录失败超过此次数，则触发告警。",
      offHoursAlert: "非工作时间告警",
      offHoursAlertDesc: "如果在以下时间段内执行敏感操作，则触发告警。"
    }
  },
  'es': {
    notifications: {
      title: "Canales de Notificación",
      desc: "Configura canales para recibir alertas de expiración de dominio, failover, etc.",
      addWebhook: "+ Webhook",
      addTelegram: "+ Telegram",
      addDingtalk: "+ DingTalk",
      addEmail: "+ Correo",
      empty: "No hay canales de notificación configurados",
      name: "Nombre",
      method: "Método",
      url: "URL",
      botToken: "Token del Bot",
      chatId: "ID del Chat",
      webhookUrl: "URL del Webhook",
      emailAddress: "Dirección de Correo",
      cancel: "Cancelar",
      save: "Guardar",
      deleteConfirm: "¿Eliminar este canal?",
      saved: "Canales guardados",
      saveFailed: "Error al guardar canales"
    },
    system: {
      auditRules: "Reglas de Auditoría y Alertas",
      auditRulesDesc: "Configura umbrales para alertas de comportamiento anormal.",
      enableAlerts: "Habilitar Alertas",
      enableAlertsDesc: "Enviar notificaciones cuando se detecten comportamientos anormales.",
      maxDeletions: "Máx Eliminaciones / Hora",
      maxDeletionsDesc: "Alerta si un usuario elimina más de este número de registros/dominios en una hora.",
      maxFailedLogins: "Máx Inicios de Sesión Fallidos / Hora",
      maxFailedLoginsDesc: "Alerta si un identificador falla al iniciar sesión más de este número de veces.",
      offHoursAlert: "Alerta Fuera de Horario",
      offHoursAlertDesc: "Alerta si se realizan operaciones entre estas horas."
    }
  },
  'ja': {
    notifications: {
      title: "通知チャンネル",
      desc: "ドメインの有効期限切れ、フェイルオーバーなどのアラートを受信するチャンネルを構成します。",
      addWebhook: "+ Webhook",
      addTelegram: "+ Telegram",
      addDingtalk: "+ DingTalk",
      addEmail: "+ メール",
      empty: "通知チャンネルが構成されていません",
      name: "名前",
      method: "メソッド",
      url: "URL",
      botToken: "ボットトークン",
      chatId: "チャットID",
      webhookUrl: "Webhook URL",
      emailAddress: "メールアドレス",
      cancel: "キャンセル",
      save: "保存",
      deleteConfirm: "このチャンネルを削除しますか？",
      saved: "チャンネルが保存されました",
      saveFailed: "チャンネルの保存に失敗しました"
    },
    system: {
      auditRules: "監査ルールとアラート",
      auditRulesDesc: "異常な動作のアラートのしきい値を構成します。",
      enableAlerts: "アラートを有効にする",
      enableAlertsDesc: "異常な動作が検出されたときに通知を送信します。",
      maxDeletions: "最大削除数 / 時",
      maxDeletionsDesc: "ユーザーが1時間にこの数以上のレコード/ドメインを削除した場合にアラートを出します。",
      maxFailedLogins: "最大ログイン失敗数 / 時",
      maxFailedLoginsDesc: "識別子がこの回数を超えてログインに失敗した場合にアラートを出します。",
      offHoursAlert: "時間外アラート",
      offHoursAlertDesc: "これらの時間帯に操作が実行された場合にアラートを出します。"
    }
  },
  'zh-CN-Mesugaki': {
    notifications: {
      title: "通知渠道？",
      desc: "连个告警都不会配，大叔真是笨手笨脚的～",
      addWebhook: "+ Webhook",
      addTelegram: "+ Telegram",
      addDingtalk: "+ 钉钉",
      addEmail: "+ 邮件",
      empty: "空空如也！大叔的系统就像大叔的脑袋一样空～",
      name: "叫什么名字啊？",
      method: "用什么方法？",
      url: "地址呢？",
      botToken: "机器人的 Token 啦！",
      chatId: "要发给谁？ID！",
      webhookUrl: "Webhook 地址填这里哦笨蛋！",
      emailAddress: "邮箱地址，别填错了大叔～",
      cancel: "不弄了！",
      save: "快点保存！",
      deleteConfirm: "真的要删掉吗？不后悔哦？",
      saved: "保存好啦，夸我！",
      saveFailed: "连保存都会失败，大叔没救了！"
    },
    system: {
      auditRules: "抓内鬼规则～",
      auditRulesDesc: "谁敢乱动大叔的东西，就发警报抓他！",
      enableAlerts: "开启警报",
      enableAlertsDesc: "有坏蛋乱搞的时候要不要大声叫？",
      maxDeletions: "一小时最多删几个？",
      maxDeletionsDesc: "删太多的话，绝对是内鬼吧！快抓起来！",
      maxFailedLogins: "密码能错几次？",
      maxFailedLoginsDesc: "连密码都记不住，真是个没用的杂鱼！",
      offHoursAlert: "半夜偷偷摸摸告警",
      offHoursAlertDesc: "大半夜不睡觉还在乱搞，肯定是变态！"
    }
  }
};

for (const lang of langs) {
  const filePath = path.join(localesDir, `${lang}.ts`);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  
  const translations = newTranslations[lang] || newTranslations['en'];
  
  // Update system object
  if (translations.system) {
    const systemMatch = content.match(/system:\s*{([\s\S]*?)},\n\s*[a-zA-Z0-9_]+:/);
    if (systemMatch) {
      let systemBlock = systemMatch[1];
      for (const [k, v] of Object.entries(translations.system)) {
        if (!systemBlock.includes(`\n    ${k}:`)) {
          systemBlock += `\n    ${k}: ${JSON.stringify(v)},`;
        }
      }
      content = content.replace(systemMatch[1], systemBlock);
      
      // Add 'notifications' to system.tabs if not exists
      const tabsMatch = content.match(/tabs:\s*{([\s\S]*?)},/);
      if (tabsMatch) {
        let tabsBlock = tabsMatch[1];
        let notifTab = 'Notifications';
        if (lang === 'zh-CN') notifTab = '通知设置';
        if (lang === 'es') notifTab = 'Notificaciones';
        if (lang === 'ja') notifTab = '通知';
        if (lang === 'zh-CN-Mesugaki') notifTab = '通知啦';
        if (!tabsBlock.includes('notifications:')) {
          content = content.replace(tabsMatch[1], tabsBlock + `\n      notifications: '${notifTab}',`);
        }
      }
    }
  }

  // Add notifications object
  if (translations.notifications && !content.includes('notifications: {')) {
    const notifStr = `\n  notifications: {\n` + Object.entries(translations.notifications).map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`).join(',\n') + `\n  },`;
    content = content.replace(/};\n?$/, `${notifStr}\n};\n`);
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${lang}.ts`);
}
