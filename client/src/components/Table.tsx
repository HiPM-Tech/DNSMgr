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
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T) => string | number;
}

export function Table<T extends object>({ columns, data, loading, emptyText, rowKey }: TableProps<T>) {
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
    ellipsis: true,
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
      tableLayout="auto"
      empty={<Empty description={resolvedEmptyText} />}
    />
  );
}
