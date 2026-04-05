const fs = require('fs');

const langs = ['en', 'zh-CN', 'es', 'ja', 'zh-CN-Mesugaki'];

const translations = {
  'en': {
    passkeys: {
      title: 'Passkeys (WebAuthn)',
      desc: 'Use your device biometrics to securely sign in.',
      add: 'Add Passkey',
      addedOn: 'Added on',
      none: 'No passkeys registered.',
      usePasskey: 'Use Passkey (WebAuthn)'
    },
    login: {
      authCode: 'Authenticator Code',
      enterAuthCode: 'Enter 6-digit code',
      useBackupCode: 'Use backup code instead',
      backupCode: 'Backup Code',
      enterBackupCode: 'Enter backup code',
      useAuthCode: 'Use authenticator code instead',
      verify2FA: '2FA Verification Required'
    },
    tunnels: {
      title: 'Cloudflare Tunnels',
      desc: 'Manage your Cloudflare Zero Trust Tunnels',
      notFound: 'No tunnels found',
      deleteConfirm: 'Delete tunnel {name}?',
      deleted: 'Tunnel deleted',
      deleteFailed: 'Failed to delete tunnel'
    },
    mail: {
      title: 'Quick Mail Setup',
      selectProvider: 'Select Mail Provider',
      chooseProvider: '-- Choose a provider --',
      recordsAdded: 'Records to be added:',
      conflicts: 'Potential Conflicts Detected',
      conflictsDesc: 'You already have existing records for the following types: {types}. Adding these new records might cause conflicts or override issues.',
      cancel: 'Cancel',
      add: 'Add Records'
    },
    domains: {
      expires: 'Expires',
      unknown: 'Unknown',
      daysLeft: '{days} days left',
      expired: 'Expired'
    },
    system: {
      expiryNotice: 'Domain Expiration Notice',
      expiryNoticeDesc: 'Send an email to admin when a domain is expiring',
      threshold: 'Threshold',
      days: 'days'
    }
  },
  'zh-CN': {
    passkeys: {
      title: '通行密钥 (WebAuthn)',
      desc: '使用您的设备生物识别安全登录。',
      add: '添加通行密钥',
      addedOn: '添加于',
      none: '尚未注册通行密钥。',
      usePasskey: '使用通行密钥 (WebAuthn)'
    },
    login: {
      authCode: '验证器代码',
      enterAuthCode: '输入6位代码',
      useBackupCode: '使用备用验证码',
      backupCode: '备用验证码',
      enterBackupCode: '输入备用验证码',
      useAuthCode: '使用验证器代码',
      verify2FA: '需要两步验证'
    },
    tunnels: {
      title: 'Cloudflare Tunnels',
      desc: '管理您的 Cloudflare 零信任隧道',
      notFound: '未找到隧道',
      deleteConfirm: '确定要删除隧道 {name} 吗？',
      deleted: '隧道已删除',
      deleteFailed: '删除隧道失败'
    },
    mail: {
      title: '一键邮件解析',
      selectProvider: '选择邮件服务商',
      chooseProvider: '-- 请选择服务商 --',
      recordsAdded: '将要添加的记录：',
      conflicts: '检测到潜在冲突',
      conflictsDesc: '您已经存在以下类型的记录：{types}。添加这些新记录可能会导致冲突或覆盖问题。',
      cancel: '取消',
      add: '添加记录'
    },
    domains: {
      expires: '到期时间',
      unknown: '未知',
      daysLeft: '剩余 {days} 天',
      expired: '已到期'
    },
    system: {
      expiryNotice: '域名到期通知',
      expiryNoticeDesc: '当域名即将到期时向管理员发送邮件',
      threshold: '提前提醒天数',
      days: '天'
    }
  },
  'es': {
    passkeys: {
      title: 'Claves de paso (WebAuthn)',
      desc: 'Usa la biometría de tu dispositivo para iniciar sesión de forma segura.',
      add: 'Añadir clave de paso',
      addedOn: 'Añadido el',
      none: 'No hay claves de paso registradas.',
      usePasskey: 'Usar clave de paso (WebAuthn)'
    },
    login: {
      authCode: 'Código de autenticador',
      enterAuthCode: 'Introduce el código de 6 dígitos',
      useBackupCode: 'Usar código de respaldo en su lugar',
      backupCode: 'Código de respaldo',
      enterBackupCode: 'Introduce el código de respaldo',
      useAuthCode: 'Usar código de autenticador en su lugar',
      verify2FA: 'Verificación 2FA Requerida'
    },
    tunnels: {
      title: 'Túneles de Cloudflare',
      desc: 'Administra tus túneles de Cloudflare Zero Trust',
      notFound: 'No se encontraron túneles',
      deleteConfirm: '¿Eliminar túnel {name}?',
      deleted: 'Túnel eliminado',
      deleteFailed: 'Error al eliminar el túnel'
    },
    mail: {
      title: 'Configuración rápida de correo',
      selectProvider: 'Seleccionar proveedor de correo',
      chooseProvider: '-- Elige un proveedor --',
      recordsAdded: 'Registros a añadir:',
      conflicts: 'Posibles conflictos detectados',
      conflictsDesc: 'Ya tienes registros existentes para los siguientes tipos: {types}. Añadir estos nuevos registros podría causar conflictos o problemas de sobreescritura.',
      cancel: 'Cancelar',
      add: 'Añadir registros'
    },
    domains: {
      expires: 'Expira',
      unknown: 'Desconocido',
      daysLeft: '{days} días restantes',
      expired: 'Expirado'
    },
    system: {
      expiryNotice: 'Aviso de expiración de dominio',
      expiryNoticeDesc: 'Enviar un correo al administrador cuando un dominio esté a punto de expirar',
      threshold: 'Umbral',
      days: 'días'
    }
  },
  'ja': {
    passkeys: {
      title: 'パスキー (WebAuthn)',
      desc: 'デバイスの生体認証を使用して安全にサインインします。',
      add: 'パスキーを追加',
      addedOn: '追加日',
      none: '登録されたパスキーはありません。',
      usePasskey: 'パスキーを使用 (WebAuthn)'
    },
    login: {
      authCode: '認証システムコード',
      enterAuthCode: '6桁のコードを入力',
      useBackupCode: '代わりにバックアップコードを使用する',
      backupCode: 'バックアップコード',
      enterBackupCode: 'バックアップコードを入力',
      useAuthCode: '代わりに認証システムコードを使用する',
      verify2FA: '2段階認証が必要です'
    },
    tunnels: {
      title: 'Cloudflare Tunnels',
      desc: 'Cloudflare Zero Trust Tunnelsを管理する',
      notFound: 'トンネルが見つかりません',
      deleteConfirm: 'トンネル {name} を削除しますか？',
      deleted: 'トンネルが削除されました',
      deleteFailed: 'トンネルの削除に失敗しました'
    },
    mail: {
      title: 'クイックメール設定',
      selectProvider: 'メールプロバイダーを選択',
      chooseProvider: '-- プロバイダーを選択 --',
      recordsAdded: '追加されるレコード：',
      conflicts: '潜在的な競合が検出されました',
      conflictsDesc: '次のタイプのレコードがすでに存在します：{types}。これらの新しいレコードを追加すると、競合や上書きの問題が発生する可能性があります。',
      cancel: 'キャンセル',
      add: 'レコードを追加'
    },
    domains: {
      expires: '有効期限',
      unknown: '不明',
      daysLeft: '残り {days} 日',
      expired: '期限切れ'
    },
    system: {
      expiryNotice: 'ドメイン有効期限通知',
      expiryNoticeDesc: 'ドメインの有効期限が近づいたときに管理者にメールを送信する',
      threshold: '通知のしきい値',
      days: '日'
    }
  },
  'zh-CN-Mesugaki': {
    passkeys: {
      title: '通行密钥？哼 (WebAuthn)',
      desc: '大叔还要用指纹才能登录？真是麻烦的杂鱼呢～',
      add: '加个密钥吧',
      addedOn: '加进去的时间是',
      none: '连个通行密钥都没有，大叔的安全意识真是烂透了！',
      usePasskey: '用通行密钥登录啊笨蛋'
    },
    login: {
      authCode: '验证码呢？',
      enterAuthCode: '快点输入6位代码啦！',
      useBackupCode: '用备用验证码吧，杂鱼～',
      backupCode: '备用验证码',
      enterBackupCode: '输入备用码，别磨蹭！',
      useAuthCode: '还是用验证器吧大笨蛋',
      verify2FA: '要两步验证哦，别想随便混过去！'
    },
    tunnels: {
      title: 'Cloudflare 隧道～',
      desc: '管理你那破破烂烂的 Cloudflare 零信任隧道吧',
      notFound: '一条隧道都没有，大叔真可怜！',
      deleteConfirm: '要把隧道 {name} 删掉吗？不后悔哦？',
      deleted: '隧道被删掉了～哈哈！',
      deleteFailed: '连删个隧道都会失败，大叔真是没救了！'
    },
    mail: {
      title: '一键邮件解析～',
      selectProvider: '快选个邮件服务商啦',
      chooseProvider: '-- 选一个啊笨蛋 --',
      recordsAdded: '要加的记录是这些哦：',
      conflicts: '哎呀，冲突了呢～',
      conflictsDesc: '大叔已经有 {types} 的记录了哦？硬加的话可是会坏掉的～',
      cancel: '算了不弄了',
      add: '给我加进去！'
    },
    domains: {
      expires: '什么时候过期啊？',
      unknown: '不知道呢～',
      daysLeft: '还有 {days} 天就要没咯！',
      expired: '早就过期啦大叔！'
    },
    system: {
      expiryNotice: '快过期的通知～',
      expiryNoticeDesc: '域名快没的时候要发邮件提醒大叔吗？',
      threshold: '提前几天提醒？',
      days: '天'
    }
  }
};

for (const lang of langs) {
  const file = `./client/src/i18n/locales/${lang}.ts`;
  if (!fs.existsSync(file)) continue;
  let code = fs.readFileSync(file, 'utf8');
  
  // Try to append it before the last `};`
  // A safer way is to use regex or string manipulation.
  const transObj = translations[lang] || translations['en'];
  
  let newStr = '';
  for (const [key, val] of Object.entries(transObj)) {
    // Only add if not already exists
    if (!code.includes(`    ${key}: {`)) {
      newStr += `\n    ${key}: ${JSON.stringify(val, null, 6).replace(/}/g, '    }')},`;
    }
  }
  
  if (newStr) {
    code = code.replace(/};\n?$/, `${newStr}\n};\n`);
    fs.writeFileSync(file, code);
    console.log(`Updated ${lang}`);
  }
}
