const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'client/src/i18n/locales');

// 所有需要更新的翻译
const allTranslations = {
  // domainRenewal 新增的键
  domainRenewal: {
    ar: {
      back: 'رجوع',
      addSelected: 'إضافة المحدد',
      selectAll: 'تحديد الكل',
      selectDomainsToAdd: 'حدد النطاقات المراد إضافتها ({count} محدد)',
      expires: 'تنتهي'
    },
    de: {
      back: 'Zurück',
      addSelected: 'Ausgewählte hinzufügen',
      selectAll: 'Alle auswählen',
      selectDomainsToAdd: 'Domains zum Hinzufügen auswählen ({count} ausgewählt)',
      expires: 'Läuft ab'
    },
    en: {
      back: 'Back',
      addSelected: 'Add Selected',
      selectAll: 'Select All',
      selectDomainsToAdd: 'Select domains to add ({count} selected)',
      expires: 'Expires'
    },
    es: {
      back: 'Volver',
      addSelected: 'Agregar seleccionados',
      selectAll: 'Seleccionar todo',
      selectDomainsToAdd: 'Seleccionar dominios para agregar ({count} seleccionados)',
      expires: 'Expira'
    },
    fr: {
      back: 'Retour',
      addSelected: 'Ajouter la sélection',
      selectAll: 'Tout sélectionner',
      selectDomainsToAdd: 'Sélectionner les domaines à ajouter ({count} sélectionnés)',
      expires: 'Expire'
    },
    ja: {
      back: '戻る',
      addSelected: '選択したものを追加',
      selectAll: 'すべて選択',
      selectDomainsToAdd: '追加するドメインを選択（{count}個選択）',
      expires: '有効期限'
    },
    ko: {
      back: '뒤로',
      addSelected: '선택 항목 추가',
      selectAll: '모두 선택',
      selectDomainsToAdd: '추가할 도메인 선택 ({count}개 선택)',
      expires: '만료'
    },
    pt: {
      back: 'Voltar',
      addSelected: 'Adicionar selecionados',
      selectAll: 'Selecionar tudo',
      selectDomainsToAdd: 'Selecionar domínios para adicionar ({count} selecionados)',
      expires: 'Expira'
    },
    ru: {
      back: 'Назад',
      addSelected: 'Добавить выбранные',
      selectAll: 'Выбрать все',
      selectDomainsToAdd: 'Выберите домены для добавления (выбрано: {count})',
      expires: 'Истекает'
    },
    'zh-CN-Mesugaki': {
      back: '回去啦~杂鱼~❤',
      addSelected: '添加选中的杂鱼域名~({count}个)❤',
      selectAll: '全选哦~杂鱼~❤',
      selectDomainsToAdd: '选择要调教的杂鱼域名~（已经选了 {count} 个呢）❤',
      expires: '到期时间喵~杂鱼要小心哦❤'
    }
  },
  // common 新增的键
  common: {
    ar: { deselectAll: 'إلغاء التحديد' },
    de: { deselectAll: 'Auswahl aufheben' },
    en: { deselectAll: 'Deselect All' },
    es: { deselectAll: 'Deseleccionar todo' },
    fr: { deselectAll: 'Tout désélectionner' },
    ja: { deselectAll: '選択解除' },
    ko: { deselectAll: '선택 해제' },
    pt: { deselectAll: 'Desmarcar tudo' },
    ru: { deselectAll: 'Отменить выбор' },
    'zh-CN-Mesugaki': { deselectAll: '取消全选啦~杂鱼真没用❤' }
  }
};

const files = [
  'ar.json', 'de.json', 'en.json', 'es.json', 'fr.json', 
  'ja.json', 'ko.json', 'pt.json', 'ru.json', 'zh-CN-Mesugaki.json'
];

let successCount = 0;
let errorCount = 0;

files.forEach(filename => {
  const filepath = path.join(localesDir, filename);
  const lang = filename.replace('.json', '');
  
  try {
    // 读取文件
    let content = fs.readFileSync(filepath, 'utf8');
    
    // 移除 BOM
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // 解析 JSON
    const data = JSON.parse(content);
    
    // 确保 messages 存在
    if (!data.messages) {
      data.messages = {};
    }
    
    // 添加 domainRenewal 翻译
    if (!data.messages.domainRenewal) {
      data.messages.domainRenewal = {};
    }
    
    const drTrans = allTranslations.domainRenewal[lang];
    if (drTrans) {
      Object.assign(data.messages.domainRenewal, drTrans);
    }
    
    // 添加 common.deselectAll
    if (!data.messages.common) {
      data.messages.common = {};
    }
    
    const commonTrans = allTranslations.common[lang];
    if (commonTrans) {
      Object.assign(data.messages.common, commonTrans);
    }
    
    // 写回文件（保持2空格缩进）
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    
    console.log(`✓ ${filename.padEnd(25)} - Updated`);
    successCount++;
  } catch (error) {
    console.error(`✗ ${filename.padEnd(25)} - ${error.message}`);
    errorCount++;
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ Success: ${successCount} files`);
console.log(`❌ Errors: ${errorCount} files`);
console.log(`${'='.repeat(60)}`);
