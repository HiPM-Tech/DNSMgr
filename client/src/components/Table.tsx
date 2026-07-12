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
  selectable?: boolean;
  selectedRowKeys?: (string | number)[];
  onSelectChange?: (selectedRowKeys: (string | number)[]) => void;
  /**
   * 表格内容区最大高度（数字会被当作 px）。
   * 当传入该属性时，将启用 TDesign Table 的虚拟滚动以避免大数据量场景下渲染过多 DOM。
   */
  maxHeight?: number | string;
  /**
   * 虚拟滚动触发阈值，data 长度 >= 该值时才实际启用虚拟滚动。
   * 默认 50。当 data 不足该阈值时即使传入 maxHeight 也不会启用虚拟滚动。
   */
  virtualThreshold?: number;
}

const DEFAULT_VIRTUAL_THRESHOLD = 50;
// TDesign medium size 行高约 48px，bufferSize 12 在可视区上下各预留约 12 行避免快速滚动出现空白
const VIRTUAL_ROW_HEIGHT = 48;
const VIRTUAL_BUFFER_SIZE = 12;

export function Table<T extends object>({
  columns,
  data,
  loading,
  emptyText,
  rowKey,
  selectable,
  selectedRowKeys = [],
  onSelectChange,
  maxHeight,
  virtualThreshold = DEFAULT_VIRTUAL_THRESHOLD,
}: TableProps<T>) {
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

  // 仅在数据量足够大且外部传入了 maxHeight 时启用虚拟滚动，避免对小列表造成不必要的开销
  const shouldVirtualize = Boolean(maxHeight) && tableData.length >= virtualThreshold;
  const scrollProps = shouldVirtualize
    ? {
        maxHeight,
        scroll: {
          type: 'virtual' as const,
          threshold: virtualThreshold,
          rowHeight: VIRTUAL_ROW_HEIGHT,
          bufferSize: VIRTUAL_BUFFER_SIZE,
        },
      }
    : maxHeight
      ? { maxHeight }
      : {};

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
      {...scrollProps}
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
