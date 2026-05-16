import { useState } from 'react';
import { Select } from 'tdesign-react';
import type { SelectValue } from 'tdesign-react/es/select';
import { useI18n } from '../contexts/I18nContext';

interface PaginatedSelectOption {
  id: number;
  name: string;
}

interface PaginatedSelectProps {
  options: PaginatedSelectOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  pageSize?: number;
  disabled?: boolean;
}

export function PaginatedSelect({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  pageSize = 20,
  disabled = false,
}: PaginatedSelectProps) {
  const { t } = useI18n();
  const [popupVisible, setPopupVisible] = useState(false);
  const selectOptions = options.map((option) => ({
    label: option.name,
    value: option.id,
  }));

  const handleChange = (nextValue: SelectValue) => {
    onChange(typeof nextValue === 'number' ? nextValue : null);
  };

  const sharedPlaceholder = popupVisible ? (t('common.search') || '搜索...') : placeholder;

  return (
    <Select
      clearable
      filterable
      disabled={disabled}
      value={value ?? undefined}
      options={selectOptions}
      placeholder={sharedPlaceholder}
      inputProps={{ placeholder: sharedPlaceholder }}
      popupVisible={popupVisible}
      scroll={{ type: 'virtual', threshold: Math.max(pageSize, 20), rowHeight: 32, bufferSize: 12 }}
      onChange={handleChange}
      onClear={() => onChange(null)}
      onPopupVisibleChange={setPopupVisible}
    />
  );
}
