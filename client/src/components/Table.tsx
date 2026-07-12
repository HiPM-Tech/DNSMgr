import { useMemo } from 'react';
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

  // 缓存处理后的数据与列定义，避免每次渲染都重建数组与 cell 函数
  const tableData = useMemo(
    () => data.map((row) => ({ ...row, __rowKey: rowKey(row) })),
    [data, rowKey],
  );

  const tableColumns = useMemo<PrimaryTableCol<T & { __rowKey: string | number }>[]>(() => {
    const colDefs = columns.map((col) => ({
      colKey: col.key,
      title: col.label,
      className: col.className,
      width: col.width,
      minWidth: col.minWidth,
      ellipsis: col.ellipsis ?? true,
      cell: ({ row }: { row: T }) => {
        const originalRow = row as T;
        if (col.render) return col.render(originalRow);
        const value = (originalRow as Record<string, unknown>)[col.key];
        return value === null || value === undefined ? '' : String(value);
      },
    }));
    return colDefs;
  }, [columns]);

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
      {...(selectable && {
        rowSelection: {
          type: 'multiple' as const,
          selectedRowKeys: selectedRowKeys || [],
          onChange: (keys: (string | number)[]) => {
            onSelectChange?.(keys);
          },
          getCheckboxProps: () => ({ disabled: false }),
        },
      })}
    />
  );
}
