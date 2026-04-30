import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  confirmLabel?: string;
}

export function ConfirmDialog({ message, onConfirm, onCancel, isLoading, confirmLabel }: ConfirmDialogProps) {
  const { t } = useI18n();
  const resolvedConfirmLabel = confirmLabel ?? t('common.delete');
  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{t('common.confirmAction')}</h3>
        </div>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 line-clamp-3 break-all">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
            {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
