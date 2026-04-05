import type { ReactNode } from 'react';
import { useI18n } from '../contexts/I18nContext';

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  rowKey: (row: T) => string | number;
}

export function Table<T>({ columns, data, loading, emptyText, rowKey }: TableProps<T>) {
  const { t } = useI18n();
  const resolvedEmptyText = emptyText ?? t('common.noData');
  return (
    <div className="overflow-hidden rounded-[inherit]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap ${col.className ?? ''}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-gray-400 dark:text-gray-500">
                  <div className="flex justify-center">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-gray-400 dark:text-gray-500">{resolvedEmptyText}</td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={rowKey(row)} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
