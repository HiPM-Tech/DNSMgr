const fs = require('fs');
const path = require('path');

const translations = {
  'fr': {
    addDomain: "Ajouter un domaine renouvelable",
    selectProvider: "Sélectionner le fournisseur",
    selectDomains: "Sélectionner les domaines",
    addSuccess: "Ajouté avec succès",
    addFailed: "Échec de l'ajout",
    deleteConfirm: "Êtes-vous sûr de vouloir supprimer {domain} de la liste de renouvellement ?",
    deleteSuccess: "Supprimé avec succès",
    deleteFailed: "Échec de la suppression",
    noAvailableDomains: "Aucun domaine disponible",
    loadingDomains: "Chargement des domaines..."
  },
  'es': {
    addDomain: "Agregar dominio renovable",
    selectProvider: "Seleccionar proveedor",
    selectDomains: "Seleccionar dominios",
    addSuccess: "Agregado exitosamente",
    addFailed: "Error al agregar",
    deleteConfirm: "¿Está seguro de que desea eliminar {domain} de la lista de renovación?",
    deleteSuccess: "Eliminado exitosamente",
    deleteFailed: "Error al eliminar",
    noAvailableDomains: "No hay dominios disponibles",
    loadingDomains: "Cargando dominios..."
  },
  'pt': {
    addDomain: "Adicionar domínio renovável",
    selectProvider: "Selecionar provedor",
    selectDomains: "Selecionar domínios",
    addSuccess: "Adicionado com sucesso",
    addFailed: "Falha ao adicionar",
    deleteConfirm: "Tem certeza de que deseja remover {domain} da lista de renovação?",
    deleteSuccess: "Removido com sucesso",
    deleteFailed: "Falha ao remover",
    noAvailableDomains: "Nenhum domínio disponível",
    loadingDomains: "Carregando domínios..."
  },
  'ja': {
    addDomain: "更新可能ドメインを追加",
    selectProvider: "プロバイダーを選択",
    selectDomains: "ドメインを選択",
    addSuccess: "正常に追加されました",
    addFailed: "追加に失敗しました",
    deleteConfirm: "{domain} を更新リストから削除してもよろしいですか？",
    deleteSuccess: "正常に削除されました",
    deleteFailed: "削除に失敗しました",
    noAvailableDomains: "利用可能なドメインがありません",
    loadingDomains: "ドメインを読み込んでいます..."
  },
  'ko': {
    addDomain: "갱신 가능 도메인 추가",
    selectProvider: "공급자 선택",
    selectDomains: "도메인 선택",
    addSuccess: "성공적으로 추가됨",
    addFailed: "추가 실패",
    deleteConfirm: "{domain} 을(를) 갱신 목록에서 제거하시겠습니까?",
    deleteSuccess: "성공적으로 삭제됨",
    deleteFailed: "삭제 실패",
    noAvailableDomains: "사용 가능한 도메인이 없습니다",
    loadingDomains: "도메인 로딩 중..."
  },
  'ru': {
    addDomain: "Добавить продлеваемый домен",
    selectProvider: "Выбрать провайдера",
    selectDomains: "Выбрать домены",
    addSuccess: "Успешно добавлено",
    addFailed: "Не удалось добавить",
    deleteConfirm: "Вы уверены, что хотите удалить {domain} из списка продления?",
    deleteSuccess: "Успешно удалено",
    deleteFailed: "Не удалось удалить",
    noAvailableDomains: "Нет доступных доменов",
    loadingDomains: "Загрузка доменов..."
  },
  'ar': {
    addDomain: "إضافة نطاق قابل للتجديد",
    selectProvider: "اختيار المزود",
    selectDomains: "اختيار النطاقات",
    addSuccess: "تمت الإضافة بنجاح",
    addFailed: "فشل في الإضافة",
    deleteConfirm: "هل أنت متأكد من إزالة {domain} من قائمة التجديد؟",
    deleteSuccess: "تم الحذف بنجاح",
    deleteFailed: "فشل في الحذف",
    noAvailableDomains: "لا توجد نطاقات متاحة",
    loadingDomains: "جاري تحميل النطاقات..."
  },
  'zh-CN-Mesugaki': {
    addDomain: "杂鱼酱要添加可续期域名吗♡~",
    selectProvider: "选择提供商啦♡~",
    selectDomains: "选择域名哦♡~",
    addSuccess: "哼~居然添加成功了，算你有点本事呢♡~",
    addFailed: "嘻嘻~杂鱼酱连添加都失败了呢♡~真是又弱又笨诶♡~",
    deleteConfirm: "杂鱼酱确定要把 {domain} 从续期列表删掉吗♡~？",
    deleteSuccess: "删除成功啦♡~杂鱼酱还挺能干的嘛♡~",
    deleteFailed: "啊啦~杂鱼酱连删除都做不到吗♡~真是没用呢♡~",
    noAvailableDomains: "没有可用的域名哦♡~杂鱼酱好可怜呢♡~",
    loadingDomains: "正在加载域名中...杂鱼酱耐心点等啦♡~"
  }
};

const localesDir = path.join(__dirname, 'client', 'src', 'i18n', 'locales');

Object.keys(translations).forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Add new translations to domainRenewal section
    if (data.messages && data.messages.domainRenewal) {
      Object.assign(data.messages.domainRenewal, translations[lang]);
      
      // Write back
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      console.log(`✓ Updated ${lang}.json`);
    } else {
      console.log(`✗ No domainRenewal section in ${lang}.json`);
    }
  } catch (error) {
    console.error(`✗ Error processing ${lang}.json:`, error.message);
  }
});

console.log('\nDone! All language files updated.');
