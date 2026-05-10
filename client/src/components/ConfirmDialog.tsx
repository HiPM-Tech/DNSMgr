import { useRef, useState } from 'react';
import { Dialog } from 'tdesign-react';
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
  const [visible, setVisible] = useState(true);
  const closeReasonRef = useRef<'cancel' | null>(null);

  const requestCancel = () => {
    if (isLoading) return;
    closeReasonRef.current = 'cancel';
    setVisible(false);
  };

  return (
    <Dialog
      visible={visible}
      destroyOnClose
      placement="center"
      theme="danger"
      header={t('common.confirmAction')}
      width={420}
      dialogClassName="app-td-dialog app-confirm-dialog"
      cancelBtn={{ content: t('common.cancel'), disabled: isLoading }}
      confirmBtn={{ content: resolvedConfirmLabel, theme: 'danger', loading: isLoading }}
      onCancel={requestCancel}
      onClose={requestCancel}
      onClosed={() => {
        if (closeReasonRef.current === 'cancel') {
          onCancel();
        }
      }}
      onConfirm={onConfirm}
    >
      <p className="app-confirm-dialog__message">{message}</p>
    </Dialog>
  );
}
