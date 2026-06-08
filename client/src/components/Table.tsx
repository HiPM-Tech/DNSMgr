import type { ReactNode } from 'react';
import { Empty, Table as TTable } from 'tdesign-react';
import type { PrimaryTableCol } from 'tdesign-react/es/table';
import { useI18n } from '../contexts/I18nContext';

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
  width?: number | string;
  minWidth?: number | string;
  ellipsis?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T) => string | number;
  selectable?: boolean;  // ← 新增：是否显示复选框
  selectedRowKeys?: (string | number)[];  // ← 新增：已选中的行 key
  onSelectChange?: (selectedRowKeys: (string | number)[]) => void;  // ← 新增：选择变化回调
}

export function Table<T extends object>({ columns, data, loading, emptyText, rowKey, selectable, selectedRowKeys = [], onSelectChange }: TableProps<T>) {
  const { t } = useI18n();
  const resolvedEmptyText = emptyText ?? t('common.noData');
  
  const tableData = data.map((row) => ({
    ...row,
    __rowKey: rowKey(row),
  }));

  const tableColumns: PrimaryTableCol<T & { __rowKey: string | number }>[] = columns.map((col) => ({
    colKey: col.key,
    title: col.label,
    className: col.className,
    width: col.width,
    minWidth: col.minWidth,
    ellipsis: col.ellipsis ?? true,
    cell: ({ row }) => {
      const originalRow = row as T;
      if (col.render) return col.render(originalRow);
      const value = (originalRow as Record<string, unknown>)[col.key];
      return value === null || value === undefined ? '' : String(value);
    },
  }));

  return (
    <TTable
      rowKey="__rowKey"
      data={tableData}
      columns={tableColumns}
      loading={loading}
      hover
      size="medium"
      tableLayout="fixed"
      empty={<Empty description={resolvedEmptyText} />}
      // ← 新增：复选框配置
      {...(selectable && {
        rowSelection: {
          type: 'multiple' as const,
          selectedRowKeys: selectedRowKeys || [],
          onChange: (keys: (string | number)[]) => {
            console.log('[Table] Selection changed:', keys);
            onSelectChange?.(keys);
          },
          getCheckboxProps: () => ({ disabled: false }),
        },
      })}
    />
  );
}
